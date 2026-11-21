-- Management functions. Coaches run their team (rename, rotate the invite code, delete it);
-- any user can delete their own account and everything under it. All run as the caller's
-- own identity: each one checks auth.uid() itself, because they are security definer.

create function public.rename_team(team uuid, new_name text) returns public.teams
language plpgsql security definer set search_path = '' as $$
declare t public.teams;
begin
    if auth.uid() is null then raise exception 'not signed in'; end if;
    if not public.is_team_coach(team) then raise exception 'only a coach can rename the team'; end if;
    if char_length(trim(new_name)) not between 1 and 60 then raise exception 'team name must be 1 to 60 characters'; end if;
    update public.teams set name = trim(new_name) where id = team returning * into t;
    return t;
end $$;

-- A leaked or old invite code can be replaced; players already in the team stay.
create function public.regenerate_invite_code(team uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
    code text;
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
    if auth.uid() is null then raise exception 'not signed in'; end if;
    if not public.is_team_coach(team) then raise exception 'only a coach can change the invite code'; end if;
    loop
        code := '';
        for i in 1..8 loop
            code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        end loop;
        exit when not exists (select 1 from public.teams where invite_code = code);
    end loop;
    update public.teams set invite_code = code where id = team;
    return code;
end $$;

-- Removes the team and its memberships; players keep their own accounts and sessions.
create function public.delete_team(team uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then raise exception 'not signed in'; end if;
    if not public.is_team_coach(team) then raise exception 'only a coach can delete the team'; end if;
    delete from public.teams where id = team;
end $$;

-- Deleting an account deletes the profile, sessions and memberships (cascade). A coach who
-- still has players must delete or hand over the team first, so no one else loses a team.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then raise exception 'not signed in'; end if;
    if exists (
        select 1 from public.teams t
        where t.created_by = auth.uid()
          and exists (select 1 from public.team_members m where m.team_id = t.id and m.user_id <> auth.uid())
    ) then raise exception 'delete the team or remove its players first'; end if;
    delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.rename_team(uuid, text), public.regenerate_invite_code(uuid),
    public.delete_team(uuid), public.delete_my_account() from public, anon;
grant execute on function public.rename_team(uuid, text), public.regenerate_invite_code(uuid),
    public.delete_team(uuid), public.delete_my_account() to authenticated;
