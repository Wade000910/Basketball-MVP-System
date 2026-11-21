\set ON_ERROR_STOP on
-- Management functions: coaches run their team, players control their own account.
-- Users: C coach, P1 and P2 players.
drop table if exists pg_temp.team_ref;
drop table if exists pg_temp.new_code;
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000a2');
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAIL: %', label; end if; raise notice 'ok - %', label; end $$;
create or replace function pg_temp.fails(stmt text, label text) returns void language plpgsql as $$
begin
    begin execute stmt; exception when others then raise notice 'ok - %', label; return; end;
    raise exception 'FAIL: % (should have been refused)', label;
end $$;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into profiles values (auth.uid(), 'Coach');
create temp table team_ref on commit preserve rows as select id, invite_code from create_team('大同資工系隊');
grant select on team_ref to authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into profiles values (auth.uid(), 'P1');
select join_team((select invite_code from team_ref));
insert into training_sessions (id, player_code, drill, position, target_shots, started_at, finished_at, shots)
 values ('s-p1', 'P001', 'free_throw', 'center', 10, now() - interval '1 hour', now(), '[{"id":"a","made":true,"recordedAt":"2026-11-03T08:00:00Z"}]');
insert into training_sessions (id, player_code, drill, position, target_shots, started_at, finished_at, shots)
 values ('s-cam', 'P001', 'free_throw', 'center', 10, now() - interval '2 hours', now() - interval '1 hour',
  '[{"id":"c1","made":true,"source":"camera","recordedAt":"2026-11-03T09:00:00Z"}]');
select pg_temp.check((select count(*) from shots where session_id = 's-cam' and source = 'camera') = 1, 'a camera-detected shot is stored with its source');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into profiles values (auth.uid(), 'P2');
select join_team((select invite_code from team_ref));

-- Rename.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.fails($$select rename_team((select id from team_ref), 'hacked')$$, 'player cannot rename the team');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails($$select rename_team((select id from team_ref), '   ')$$, 'empty team name is refused');
select rename_team((select id from team_ref), '  資工系籃  ');
select pg_temp.check((select name from teams) = '資工系籃', 'coach renames the team (trimmed)');

-- Invite code rotation.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.fails($$select regenerate_invite_code((select id from team_ref))$$, 'player cannot rotate the invite code');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
create temp table new_code on commit preserve rows as select regenerate_invite_code((select id from team_ref)) as code;
grant select on new_code to authenticated;
select pg_temp.check((select code from new_code) ~ '^[A-Z2-9]{8}$' and (select code from new_code) <> (select invite_code from team_ref), 'new invite code is valid and different');
select pg_temp.check((select invite_code from teams) = (select code from new_code), 'team stores the new code');
select pg_temp.fails($$select join_team((select invite_code from team_ref))$$, 'old invite code no longer joins');

-- Account deletion.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.fails($$select delete_my_account()$$, 'coach with members must hand over or delete the team first');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select delete_my_account();
reset role;
select pg_temp.check((select count(*) from auth.users where id = '00000000-0000-0000-0000-0000000000a1') = 0, 'player account is deleted');
select pg_temp.check((select count(*) from training_sessions) = 0 and (select count(*) from profiles where display_name = 'P1') = 0, 'player data is deleted with the account');
select pg_temp.check((select count(*) from team_members) = 2, 'team keeps the other members');
set role authenticated;

-- Team deletion.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.fails($$select delete_team((select id from team_ref))$$, 'player cannot delete the team');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select delete_team((select id from team_ref));
select pg_temp.check((select count(*) from teams) = 0 and (select count(*) from team_members) = 0, 'coach deletes the team and its memberships');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.check((select count(*) from profiles where display_name = 'P2') = 1, 'other players keep their own accounts');

-- A coach with no members left can delete the account.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select delete_my_account();
reset role;
select pg_temp.check((select count(*) from auth.users where id = '00000000-0000-0000-0000-00000000000c') = 0, 'coach with no team members can delete the account');
select pg_temp.check(not has_function_privilege('anon', 'public.is_team_coach(uuid)', 'execute') and has_function_privilege('authenticated', 'public.is_team_coach(uuid)', 'execute'), 'helper functions are for signed-in users only');
select pg_temp.check(has_function_privilege('anon', 'public.add_shot_mark(text, boolean)', 'execute'), 'a teammate can still mark a shot without an account');
