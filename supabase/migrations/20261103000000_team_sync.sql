-- Basketball MVP: cloud backup and team sharing.
--
-- Principle: every record belongs to the player who created it. A team is only a
-- sharing relationship: coaches of a team can read the training sessions of its
-- current members. Leaving the team ends that access immediately.
-- Videos never reach the server; only the training summaries already shown in the app.

create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null check (char_length(display_name) between 1 and 40),
    created_at timestamptz not null default now()
);

create table public.teams (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 60),
    invite_code text not null unique check (invite_code ~ '^[A-Z2-9]{8}$'),
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create table public.team_members (
    team_id uuid not null references public.teams(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('coach', 'player')),
    joined_at timestamptz not null default now(),
    primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members(user_id);

-- One row per practice set. Shots and motion summaries keep the same JSON shape the
-- app already exports, so a local backup and a cloud row are interchangeable.
create table public.training_sessions (
    id text primary key check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
    user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
    player_code text not null check (player_code ~ '^[A-Za-z0-9_-]{1,32}$'),
    drill text not null check (drill in ('free_throw', 'mid_range', 'three_point')),
    position text not null check (position in ('left', 'center', 'right', 'unspecified')),
    target_shots int not null check (target_shots between 1 and 200),
    note text not null default '' check (char_length(note) <= 300),
    started_at timestamptz not null,
    finished_at timestamptz check (finished_at is null or finished_at >= started_at),
    shots jsonb not null default '[]' check (jsonb_typeof(shots) = 'array' and jsonb_array_length(shots) <= 200),
    analysis_runs jsonb not null default '[]' check (jsonb_typeof(analysis_runs) = 'array' and jsonb_array_length(analysis_runs) <= 30),
    total_shots int generated always as (jsonb_array_length(shots)) stored,
    made_shots int not null default 0 check (made_shots >= 0),
    updated_at timestamptz not null default now()
);
create index training_sessions_user_started_idx on public.training_sessions(user_id, started_at desc);

-- made_shots is derived on the server so a coach view never trusts a client count.
create function public.training_sessions_derive() returns trigger
language plpgsql set search_path = '' as $$
begin
    new.made_shots := (select count(*) from jsonb_array_elements(new.shots) s where (s->>'made')::boolean);
    new.updated_at := now();
    return new;
end $$;
create trigger training_sessions_derive before insert or update on public.training_sessions
    for each row execute function public.training_sessions_derive();

-- Helpers run as definer so policies on team_members do not recurse into themselves.
create function public.is_team_member(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.team_members where team_id = t and user_id = auth.uid());
$$;
create function public.is_team_coach(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.team_members where team_id = t and user_id = auth.uid() and role = 'coach');
$$;
create function public.coaches_player(player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.team_members c join public.team_members p on p.team_id = c.team_id
        where c.user_id = auth.uid() and c.role = 'coach' and p.user_id = player);
$$;
create function public.shares_team(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.team_members a join public.team_members b on b.team_id = a.team_id
        where a.user_id = auth.uid() and b.user_id = other);
$$;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.training_sessions enable row level security;

create policy profiles_read on public.profiles for select to authenticated
    using (id = auth.uid() or public.shares_team(id));
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy teams_read on public.teams for select to authenticated using (public.is_team_member(id));
create policy teams_rename on public.teams for update to authenticated using (public.is_team_coach(id)) with check (public.is_team_coach(id));
create policy teams_delete on public.teams for delete to authenticated using (public.is_team_coach(id));
-- Teams are created only through create_team(), which also makes the creator a coach.

create policy members_read on public.team_members for select to authenticated using (public.is_team_member(team_id));
-- A member may leave; a coach may remove a player. Joining goes through join_team().
create policy members_leave on public.team_members for delete to authenticated
    using (user_id = auth.uid() or (role = 'player' and public.is_team_coach(team_id)));

create policy sessions_read on public.training_sessions for select to authenticated
    using (user_id = auth.uid() or public.coaches_player(user_id));
create policy sessions_insert on public.training_sessions for insert to authenticated with check (user_id = auth.uid());
create policy sessions_update on public.training_sessions for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sessions_delete on public.training_sessions for delete to authenticated using (user_id = auth.uid());

create function public.create_team(team_name text) returns public.teams
language plpgsql security definer set search_path = '' as $$
declare
    t public.teams;
    code text;
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
    if auth.uid() is null then raise exception 'not signed in'; end if;
    loop
        code := '';
        for i in 1..8 loop
            code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        end loop;
        exit when not exists (select 1 from public.teams where invite_code = code);
    end loop;
    insert into public.teams (name, invite_code, created_by) values (trim(team_name), code, auth.uid()) returning * into t;
    insert into public.team_members (team_id, user_id, role) values (t.id, auth.uid(), 'coach');
    return t;
end $$;

create function public.join_team(code text) returns public.teams
language plpgsql security definer set search_path = '' as $$
declare t public.teams;
begin
    if auth.uid() is null then raise exception 'not signed in'; end if;
    select * into t from public.teams where invite_code = upper(trim(code));
    if not found then raise exception 'invite code not found'; end if;
    insert into public.team_members (team_id, user_id, role) values (t.id, auth.uid(), 'player')
        on conflict (team_id, user_id) do nothing;
    return t;
end $$;

revoke all on function public.create_team(text), public.join_team(text) from public, anon;
grant execute on function public.create_team(text), public.join_team(text) to authenticated;
grant select, insert, update, delete on public.profiles, public.training_sessions to authenticated;
grant select, update, delete on public.teams to authenticated;
grant select, delete on public.team_members to authenticated;
