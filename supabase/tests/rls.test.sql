\set ON_ERROR_STOP on
-- Users: C coach, P1 and P2 players, X outsider.
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000a2'),('00000000-0000-0000-0000-00000000000f');
create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAIL: %', label; end if; raise notice 'ok - %', label; end $$;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into profiles values (auth.uid(), 'Coach');
create temp table team_code on commit preserve rows as select invite_code from create_team('大同資工系隊');
grant select on team_code to authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into profiles values (auth.uid(), 'P1');
select join_team((select lower(invite_code) from team_code));
insert into training_sessions (id, player_code, drill, position, target_shots, started_at, finished_at, shots)
 values ('s-p1', 'P001', 'free_throw', 'center', 10, now() - interval '1 hour', now(),
  '[{"id":"a","made":true,"recordedAt":"2026-11-03T08:00:00Z"},{"id":"b","made":false,"recordedAt":"2026-11-03T08:00:10Z"},{"id":"c","made":true,"recordedAt":"2026-11-03T08:00:20Z"}]');
select pg_temp.check((select made_shots from training_sessions where id='s-p1') = 2, 'server derives made count from shots');
select pg_temp.check((select count(*) from teams) = 1, 'player sees the team they joined');

-- Per-shot rows are rebuilt from the set's JSON by the server.
update training_sessions set analysis_runs = '[{"id":"run1","condition":"auditory","trials":[
  {"trialOrder":1,"trialStatus":"accepted","dt":80,"dtPeak":120.5,"shotId":"a","timestamp":"2026-11-03T07:59:58Z","reasonCode":"","timestampSource":"camera-frame","measuredFps":29.8},
  {"trialOrder":2,"trialStatus":"low_quality","dt":null,"timestamp":"2026-11-03T08:00:08Z","reasonCode":"LOW_FPS"}]}]'
 where id = 's-p1';
select pg_temp.check((select count(*) from shots where session_id='s-p1') = 3, 'each shot becomes its own row');
select pg_temp.check((select string_agg(id || ':' || made::text, ',' order by shot_order) from shots where session_id='s-p1') = 'a:true,b:false,c:true', 'shot rows keep order and result');
select pg_temp.check((select dt_peak_ms from motion_trials where session_id='s-p1' and trial_order=1) = 120.5, 'motion trial keeps peak timing');
select pg_temp.check((select shot_id from motion_trials where session_id='s-p1' and trial_order=1) = 'a', 'motion trial keeps its shot link');
select pg_temp.check((select count(*) from motion_trials where session_id='s-p1') = 2, 'rejected trials are kept with their reason');
update training_sessions set shots = shots - 2 where id = 's-p1';
select pg_temp.check((select count(*) from shots where session_id='s-p1') = 2, 'a corrected set replaces its shot rows');
select pg_temp.check((select made_shots from training_sessions where id='s-p1') = 1, 'made count follows the correction');
do $$ begin
  begin insert into shots values ('x', 's-p1', auth.uid(), 9, true, 'manual', now());
        raise exception 'FAIL: direct shot insert allowed';
  exception when insufficient_privilege then raise notice 'ok - shot rows cannot be written directly'; end;
end $$;
do $$ begin
  begin update training_sessions set shots = '[{"id":"z","made":"maybe","recordedAt":"2026-11-03T08:00:00Z"}]' where id='s-p1';
        raise exception 'FAIL: malformed shot accepted';
  exception when invalid_text_representation then raise notice 'ok - malformed shot data is rejected'; end;
end $$;
select pg_temp.check((select count(*) from shots where session_id='s-p1') = 2, 'a rejected write leaves rows unchanged');

-- Teammate marking with a short code.
create temp table mark on commit preserve rows as select open_mark_code('s-p1') as code;
grant select on mark to authenticated, anon;
select pg_temp.check((select code from mark) ~ '^[A-HJ-NP-Z2-9]{6}$', 'shooter opens a 6-character mark code');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select add_shot_mark((select lower(code) from mark), true);
select pg_temp.check((select count(*) from shot_marks) = 0, 'teammate can mark but cannot read the shooter''s marks');
do $$ begin
  begin perform open_mark_code('s-p1'); raise exception 'FAIL: opened code for another user''s set';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok - cannot open a mark code for someone else''s set'; end;
end $$;
do $$ begin
  begin perform add_shot_mark('ZZZZZZ', true); raise exception 'FAIL: bad mark code accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok - unknown mark code is rejected'; end;
end $$;
insert into profiles values (auth.uid(), 'P2');
select join_team((select invite_code from team_code));
insert into training_sessions (id, player_code, drill, position, target_shots, started_at, shots)
 values ('s-p2', 'P002', 'three_point', 'left', 20, now(), '[]');
select pg_temp.check((select count(*) from training_sessions) = 1, 'player sees only own sessions, not a teammate''s');
select pg_temp.check((select count(*) from profiles) = 3, 'teammates can see each other''s display names');
select pg_temp.check((select count(*) from team_members) = 3, 'member sees the roster');

-- A player cannot write into someone else's data or promote themselves.
do $$ begin
  begin insert into training_sessions (id, user_id, player_code, drill, position, target_shots, started_at)
        values ('forged', '00000000-0000-0000-0000-0000000000a1', 'P001', 'free_throw', 'center', 10, now());
        raise exception 'FAIL: forged owner accepted';
  exception when insufficient_privilege then raise notice 'ok - cannot insert a session owned by another user'; end;
end $$;
update training_sessions set note = 'hacked' where id = 's-p1';
select pg_temp.check(not exists (select 1 from training_sessions where note='hacked'), 'cannot update another user''s session (row invisible)');
do $$ begin
  begin update team_members set role = 'coach' where user_id = auth.uid();
        raise exception 'FAIL: role change allowed';
  exception when insufficient_privilege then raise notice 'ok - cannot promote self to coach'; end;
end $$;
do $$ begin
  begin insert into team_members values ((select id from teams limit 1), auth.uid(), 'coach');
        raise exception 'FAIL: direct membership insert allowed';
  exception when insufficient_privilege then raise notice 'ok - cannot add membership except through join_team'; end;
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from training_sessions) = 2, 'coach sees every member''s sessions');
update training_sessions set note = 'coach edit' where id = 's-p1';
select pg_temp.check(not exists (select 1 from training_sessions where note='coach edit'), 'coach cannot modify player data');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.check((select count(*) from training_sessions) = 0, 'outsider sees no sessions');
select pg_temp.check((select count(*) from teams) = 0, 'outsider sees no teams');
select pg_temp.check((select count(*) from profiles) = 0, 'outsider sees no profiles');
do $$ begin
  begin perform join_team('ZZZZZZZZ'); raise exception 'FAIL: bad code accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok - unknown invite code is rejected'; end;
end $$;

-- A coach of another team sees nothing of this team.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select create_team('別隊');
select pg_temp.check((select count(*) from training_sessions) = 0, 'coach of another team cannot see these players');
select pg_temp.check((select count(*) from teams) = 1, 'coach of another team sees only their own team');

-- Signed-out visitors read nothing.
reset role; set role anon; select pg_temp.as_user('');
do $$ begin
  begin perform count(*) from training_sessions; raise exception 'FAIL: anon read';
  exception when insufficient_privilege then raise notice 'ok - signed-out visitors cannot read sessions'; end;
end $$;
select add_shot_mark((select code from mark), false);
reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select string_agg(made::text, ',' order by id) from shot_marks) = 'true,false', 'shooter reads marks from a teammate and a signed-out phone');
update training_sessions set mark_code_opened_at = now() - interval '13 hours' where id = 's-p1';
do $$ begin
  begin perform add_shot_mark((select code from mark), true); raise exception 'FAIL: expired code accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok - mark code expires after 12 hours'; end;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from shots) = 2 and (select count(*) from motion_trials) = 2, 'coach reads members'' per-shot rows');
select pg_temp.check((select count(*) from shot_marks) = 0, 'coach does not read raw teammate marks');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
select pg_temp.check((select count(*) from shots) = 0 and (select count(*) from motion_trials) = 0, 'outsider reads no per-shot rows');

-- Leaving ends coach access immediately; the player's own data stays.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
delete from team_members where user_id = auth.uid();
select pg_temp.check((select count(*) from training_sessions) = 1, 'player keeps own data after leaving');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from training_sessions) = 1, 'coach loses access once the player leaves');

-- Coach may remove a player but a player may not remove the coach.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
delete from team_members where role = 'coach';
select pg_temp.check((select count(*) from team_members where role='coach') = 1, 'player cannot remove the coach');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
delete from team_members where user_id = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.check((select count(*) from team_members) = 1, 'coach can remove a player');

select pg_temp.as_user('');
reset role;
