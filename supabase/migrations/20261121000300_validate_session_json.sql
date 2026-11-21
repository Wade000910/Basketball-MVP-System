-- Any team member can write to the database directly, so the JSON inside a session is checked here and not
-- only in the app: what the coach's page reads must have the shape the app expects, and a single row cannot
-- be made huge. Shots and motion runs that do not pass are refused when written.

create function public.valid_shots(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
    select jsonb_typeof(j) = 'array'
       and pg_column_size(j) <= 100000
       and not exists (
            select 1 from jsonb_array_elements(j) s
            where jsonb_typeof(s) <> 'object'
               or jsonb_typeof(s->'id') <> 'string'
               or jsonb_typeof(s->'made') <> 'boolean')
$$;

create function public.valid_runs(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
    select jsonb_typeof(j) = 'array'
       and pg_column_size(j) <= 200000
       and not exists (
            select 1 from jsonb_array_elements(j) r
            where jsonb_typeof(r) <> 'object'
               or jsonb_typeof(r->'id') <> 'string'
               or jsonb_typeof(r->'trials') <> 'array'
               or jsonb_array_length(r->'trials') > 200
               or exists (select 1 from jsonb_array_elements(r->'trials') t where jsonb_typeof(t) <> 'object'))
$$;

alter table public.training_sessions
    add constraint training_sessions_shots_valid check (public.valid_shots(shots)),
    add constraint training_sessions_runs_valid check (public.valid_runs(analysis_runs));

revoke execute on function public.valid_shots(jsonb), public.valid_runs(jsonb) from public, anon;
grant execute on function public.valid_shots(jsonb), public.valid_runs(jsonb) to authenticated;
