-- The helper functions used by the row-level-security policies are only for signed-in users.
-- Without this, anyone with the public key could call them through the REST interface.
-- add_shot_mark stays open on purpose: a teammate marks a shot with a code and no account.
revoke execute on function public.is_team_member(uuid), public.is_team_coach(uuid), public.coaches_player(uuid), public.shares_team(uuid),
    public.training_sessions_normalize(), public.training_sessions_derive() from public, anon;
grant execute on function public.is_team_member(uuid), public.is_team_coach(uuid), public.coaches_player(uuid), public.shares_team(uuid) to authenticated;
