-- Per-shot rows: every shot and every motion trial becomes its own database row.
--
-- The app still writes one row per practice set (training_sessions) after each shot.
-- A trigger then rebuilds that set's rows in shots and motion_trials from the set's
-- JSON, inside the same transaction, so the per-shot tables can never disagree with
-- what the player recorded. Clients cannot write these tables directly.
-- A teammate can record make/miss for someone else's set with a short mark code.

create table public.shots (
    id text not null,
    session_id text not null references public.training_sessions(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    shot_order int not null check (shot_order >= 1),
    made boolean not null,
    source text not null check (source in ('manual', 'voice', 'teammate', 'corrected')),
    recorded_at timestamptz not null,
    primary key (session_id, id)
);
create index shots_user_time_idx on public.shots(user_id, recorded_at desc);

create table public.motion_trials (
    session_id text not null references public.training_sessions(id) on delete cascade,
    run_id text not null,
    trial_order int not null check (trial_order >= 1),
    user_id uuid not null references auth.users(id) on delete cascade,
    shot_id text,
    status text not null check (status in ('accepted', 'low_quality', 'invalid', 'aborted')),
    reason_code text not null default '',
    feedback_mode text not null,
    dt_onset_ms double precision,
    dt_peak_ms double precision,
    timestamp_source text,
    measured_fps double precision,
    recorded_at timestamptz not null,
    primary key (session_id, run_id, trial_order)
);
create index motion_trials_user_time_idx on public.motion_trials(user_id, recorded_at desc);

create function public.training_sessions_normalize() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    delete from public.shots where session_id = new.id;
    insert into public.shots (id, session_id, user_id, shot_order, made, source, recorded_at)
    select s.value->>'id', new.id, new.user_id, s.ordinality::int, (s.value->>'made')::boolean,
           coalesce(nullif(s.value->>'source', ''), 'manual'), (s.value->>'recordedAt')::timestamptz
    from jsonb_array_elements(new.shots) with ordinality as s(value, ordinality);

    delete from public.motion_trials where session_id = new.id;
    insert into public.motion_trials (session_id, run_id, trial_order, user_id, shot_id, status, reason_code,
        feedback_mode, dt_onset_ms, dt_peak_ms, timestamp_source, measured_fps, recorded_at)
    select new.id, r.value->>'id', (t.value->>'trialOrder')::int, new.user_id, nullif(t.value->>'shotId', ''),
           t.value->>'trialStatus', coalesce(t.value->>'reasonCode', ''), r.value->>'condition',
           (t.value->>'dt')::double precision, (t.value->>'dtPeak')::double precision,
           t.value->>'timestampSource', (t.value->>'measuredFps')::double precision, (t.value->>'timestamp')::timestamptz
    from jsonb_array_elements(new.analysis_runs) as r(value),
         jsonb_array_elements(r.value->'trials') as t(value);
    return null;
end $$;
create trigger training_sessions_normalize after insert or update of shots, analysis_runs on public.training_sessions
    for each row execute function public.training_sessions_normalize();

alter table public.shots enable row level security;
alter table public.motion_trials enable row level security;
create policy shots_read on public.shots for select to authenticated
    using (user_id = auth.uid() or public.coaches_player(user_id));
create policy motion_trials_read on public.motion_trials for select to authenticated
    using (user_id = auth.uid() or public.coaches_player(user_id));
grant select on public.shots, public.motion_trials to authenticated;

-- Teammate marks. The shooter opens a 6-character code for one set; anyone holding the
-- code can add make/miss marks to that set for 12 hours. Only the shooter reads them.
alter table public.training_sessions add column mark_code text unique check (mark_code ~ '^[A-HJ-NP-Z2-9]{6}$');
alter table public.training_sessions add column mark_code_opened_at timestamptz;

create table public.shot_marks (
    id bigint generated always as identity primary key,
    session_id text not null references public.training_sessions(id) on delete cascade,
    made boolean not null,
    created_at timestamptz not null default now()
);
create index shot_marks_session_idx on public.shot_marks(session_id, id);
alter table public.shot_marks enable row level security;
create policy shot_marks_read on public.shot_marks for select to authenticated
    using (exists (select 1 from public.training_sessions s where s.id = session_id and s.user_id = auth.uid()));
grant select on public.shot_marks to authenticated;

create function public.open_mark_code(session text) returns text
language plpgsql security definer set search_path = '' as $$
declare code text; alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
    if auth.uid() is null then raise exception 'not signed in'; end if;
    if not exists (select 1 from public.training_sessions where id = session and user_id = auth.uid()) then
        raise exception 'session not found';
    end if;
    loop
        code := '';
        for i in 1..6 loop code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
        exit when not exists (select 1 from public.training_sessions where mark_code = code);
    end loop;
    update public.training_sessions set mark_code = code, mark_code_opened_at = now() where id = session;
    return code;
end $$;

create function public.add_shot_mark(code text, made boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare target text;
begin
    select id into target from public.training_sessions
        where mark_code = upper(trim(code)) and mark_code_opened_at > now() - interval '12 hours';
    if target is null then raise exception 'mark code not found'; end if;
    if (select count(*) from public.shot_marks where session_id = target) >= 300 then
        raise exception 'too many marks';
    end if;
    insert into public.shot_marks (session_id, made) values (target, made);
end $$;

revoke all on function public.open_mark_code(text), public.add_shot_mark(text, boolean) from public;
grant execute on function public.open_mark_code(text) to authenticated;
grant execute on function public.add_shot_mark(text, boolean) to anon, authenticated;
