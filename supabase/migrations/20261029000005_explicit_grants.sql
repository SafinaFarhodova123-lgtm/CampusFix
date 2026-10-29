-- Explicit table privileges, so the app works even on projects where new tables are NOT
-- automatically exposed to the API roles. Row Level Security still decides which rows each
-- user can see or change; anything revoked in earlier migrations stays revoked.

grant usage on schema public to anon, authenticated;

-- reference data
grant select on public.campuses, public.buildings to anon, authenticated;
grant insert, update, delete on public.campuses, public.buildings to authenticated; -- admin-only via RLS

-- profiles: read all, rename self only (role column is not updatable)
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- issues: read + create; never update/delete directly
grant select, insert on public.issues to authenticated;

grant select, insert, delete on public.issue_supporters to authenticated;
grant select, insert, delete on public.issue_followers to authenticated;
grant select on public.issue_status_history to authenticated;
grant select on public.resolution_confirmations to authenticated;

-- points & rewards: read-only for clients; writes go through SECURITY DEFINER functions
grant select on public.points_transactions to authenticated;
grant select on public.redemptions to authenticated;
grant select on public.rewards to authenticated;
grant insert, update, delete on public.rewards to authenticated; -- admin-only via RLS

-- read models
grant select on public.issue_feed, public.building_health, public.my_points_summary, public.my_notifications to authenticated;
