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

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
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
reset role; set role authenticated;

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
