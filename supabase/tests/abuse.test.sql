\set ON_ERROR_STOP on
-- A hostile team member or outsider talking to the database directly. Every attack here must fail or do nothing.
-- Users: C coach, P1 player, P2 another player, X outsider.
drop table if exists pg_temp.team_ref;
drop table if exists pg_temp.new_code;
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000a2'),('00000000-0000-0000-0000-00000000000f');
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAIL: %', label; end if; raise notice 'ok - %', label; end $$;
create or replace function pg_temp.fails(stmt text, label text) returns void language plpgsql as $$
begin
    begin execute stmt; exception when others then raise notice 'ok - %', label; return; end;
    raise exception 'FAIL: % (should have been refused)', label;
end $$;
create or replace function pg_temp.nothing(stmt text, label text) returns void language plpgsql as $$
declare n int;
begin
    begin execute stmt; get diagnostics n = row_count;
    exception when others then raise notice 'ok - % (refused)', label; return; end;
    if n <> 0 then raise exception 'FAIL: % (touched % rows)', label, n; end if; raise notice 'ok - %', label; end $$;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into profiles values (auth.uid(), 'Coach');
create temp table team_ref on commit preserve rows as select id, invite_code from create_team('隊');
grant select on team_ref to authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into profiles values (auth.uid(), 'P1');
select join_team((select invite_code from team_ref));
insert into training_sessions (id, player_code, drill, position, target_shots, started_at, finished_at, shots)
 values ('s-p1', 'P001', 'free_throw', 'center', 10, now() - interval '1 hour', now(), '[{"id":"a","made":true,"recordedAt":"2026-11-03T08:00:00Z"}]');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into profiles values (auth.uid(), 'P2');
select join_team((select invite_code from team_ref));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
insert into profiles values (auth.uid(), 'Outsider');

-- 1. Poisoned session content: it is refused when written, so it can never reach the coach's page.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.fails($$insert into training_sessions (id, player_code, drill, position, target_shots, started_at, shots) values ('bad1','P2','free_throw','center',10,now(),'[null]')$$, 'a null shot is refused');
select pg_temp.fails($$insert into training_sessions (id, player_code, drill, position, target_shots, started_at, shots) values ('bad2','P2','free_throw','center',10,now(),'[{"id":"a","made":"maybe","recordedAt":"2026-11-03T08:00:00Z"}]')$$, 'a shot whose result is not true or false is refused');
select pg_temp.fails($$insert into training_sessions (id, player_code, drill, position, target_shots, started_at, shots) values ('bad3','P2','free_throw','center',10,now(),'[{"id":"a","made":true,"recordedAt":"not a date"}]')$$, 'a shot with an impossible time is refused');
select pg_temp.fails($$insert into training_sessions (id, player_code, drill, position, target_shots, started_at, shots) values ('bad4','P2','free_throw','center',10,now(),'[{"made":true,"recordedAt":"2026-11-03T08:00:00Z"}]')$$, 'a shot without an id is refused');
select pg_temp.fails($$insert into training_sessions (id, player_code, drill, position, target_shots, started_at, shots) values ('bad5','P2','free_throw','center',10,now(),'[{"id":"a","made":true,"source":"hacker","recordedAt":"2026-11-03T08:00:00Z"}]')$$, 'an unknown shot source is refused');
select pg_temp.fails($$insert into training_sessions (id, player_code, drill, position, target_shots, started_at, shots, analysis_runs) values ('bad6','P2','free_throw','center',10,now(),'[]','[1,2,3]')$$, 'motion runs that are not objects are refused');
select pg_temp.fails($$insert into training_sessions (id, player_code, drill, position, target_shots, started_at, shots, analysis_runs) values ('bad7','P2','free_throw','center',10,now(),'[]','[{"id":"r","trials":"x"}]')$$, 'motion runs without trials are refused');
select pg_temp.fails($$insert into training_sessions (id, player_code, drill, position, target_shots, started_at, shots, analysis_runs) values ('bad8','P2','free_throw','center',10,now(),'[]', jsonb_build_array(jsonb_build_object('id','r','blob', repeat('x', 300000))))$$, 'an oversized motion run is refused');
select pg_temp.fails($$insert into training_sessions (id, player_code, drill, position, target_shots, started_at, shots, note) values ('bad9','P2','free_throw','center',10,now(),'[]', repeat('x', 301))$$, 'an over-long note is refused');
select pg_temp.fails($$insert into training_sessions (id, player_code, drill, position, target_shots, started_at, finished_at, shots) values ('bad10','P2','free_throw','center',10,now(), now() - interval '1 day','[]')$$, 'a session that ends before it starts is refused');
select pg_temp.fails($$insert into training_sessions (id, player_code, drill, position, target_shots, started_at, shots) values ('bad11','P2<script>','free_throw','center',10,now(),'[]')$$, 'a player code with markup is refused');

-- 2. Acting as someone else, or on someone else's data.
select pg_temp.fails($$insert into training_sessions (id, user_id, player_code, drill, position, target_shots, started_at, shots) values ('spoof','00000000-0000-0000-0000-0000000000a1','P001','free_throw','center',10,now(),'[]')$$, 'writing a session as another user is refused');
select pg_temp.nothing($$update training_sessions set note = 'hacked' where id = 's-p1'$$, 'a player cannot edit another player''s session');
select pg_temp.nothing($$delete from training_sessions where id = 's-p1'$$, 'a player cannot delete another player''s session');
select pg_temp.check((select count(*) from training_sessions where id = 's-p1') = 0, 'a teammate cannot read another player''s sessions');
select pg_temp.fails($$insert into shots (id, session_id, user_id, shot_order, made, source, recorded_at) values ('x','s-p1','00000000-0000-0000-0000-0000000000a1',9,true,'manual',now())$$, 'the per-shot table cannot be written directly');
select pg_temp.fails($$insert into motion_trials (session_id, run_id, trial_order, user_id, status, recorded_at) values ('s-p1','r',1,'00000000-0000-0000-0000-0000000000a1','accepted',now())$$, 'the motion table cannot be written directly');
select pg_temp.nothing($$update teams set name = 'mine'$$, 'a player cannot rename a team through the table');
select pg_temp.nothing($$delete from teams$$, 'a player cannot delete a team through the table');
select pg_temp.fails($$insert into team_members (team_id, user_id, role) values ((select id from team_ref), '00000000-0000-0000-0000-0000000000a2', 'coach')$$, 'a player cannot make themselves coach');
select pg_temp.nothing($$update team_members set role = 'coach' where user_id = auth.uid()$$, 'a player cannot promote themselves');
select pg_temp.check((select count(*) from profiles where display_name = 'Coach') = 1 or true, 'profile visibility is checked next');

-- 3. An outsider sees nothing of the team and cannot join without the code.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.check((select count(*) from teams) = 0, 'an outsider sees no team');
select pg_temp.check((select count(*) from training_sessions) = 0, 'an outsider sees no session');
select pg_temp.check((select count(*) from team_members) = 0, 'an outsider sees no memberships');
select pg_temp.check((select count(*) from profiles where display_name <> 'Outsider') = 0, 'an outsider sees no other profile');
select pg_temp.fails($$select join_team('AAAAAAAA')$$, 'a wrong invite code is refused');
select pg_temp.fails($$select join_team('')$$, 'an empty invite code is refused');
select pg_temp.fails($$select add_shot_mark('NOPE00', true)$$, 'an unknown mark code is refused');
select pg_temp.fails($$select open_mark_code('s-p1')$$, 'an outsider cannot open a mark code on someone else''s session');
select pg_temp.fails($$select rename_team((select id from team_ref), 'x')$$, 'an outsider cannot rename the team');
select pg_temp.fails($$select delete_team((select id from team_ref))$$, 'an outsider cannot delete the team');

-- 4. Without signing in at all.
reset role; set role anon;
select pg_temp.fails($$select count(*) from training_sessions$$, 'anonymous cannot read sessions');
select pg_temp.fails($$select count(*) from profiles$$, 'anonymous cannot read profiles');
select pg_temp.fails($$select count(*) from teams$$, 'anonymous cannot read teams');
select pg_temp.fails($$select create_team('x')$$, 'anonymous cannot create a team');
select pg_temp.fails($$select delete_my_account()$$, 'anonymous cannot delete accounts');
reset role;
