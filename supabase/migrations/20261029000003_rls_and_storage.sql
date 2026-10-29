-- Row Level Security, privileges and photo storage.

alter table public.profiles enable row level security;
alter table public.campuses enable row level security;
alter table public.buildings enable row level security;
alter table public.issues enable row level security;
alter table public.issue_supporters enable row level security;
alter table public.issue_followers enable row level security;
alter table public.issue_status_history enable row level security;
alter table public.resolution_confirmations enable row level security;
alter table public.points_transactions enable row level security;
alter table public.rewards enable row level security;
alter table public.redemptions enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles: everyone signed in can see display names; users can only rename themselves.
-- Column-level privilege makes `role` impossible to change from the client.
-- ---------------------------------------------------------------------------
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Campuses & buildings: public read, admin write
-- ---------------------------------------------------------------------------
create policy campuses_read on public.campuses for select to anon, authenticated using (true);
create policy campuses_admin on public.campuses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy buildings_read on public.buildings for select to anon, authenticated using (true);
create policy buildings_admin on public.buildings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Issues
--   read:   all non-rejected issues; rejected ones only by their reporter or staff
--   insert: signed-in users, as themselves (trigger forces safe defaults)
--   update/delete: never directly — staff use the SECURITY DEFINER functions
-- ---------------------------------------------------------------------------
create policy issues_read on public.issues for select to authenticated
  using (verification_status <> 'rejected' or reporter_id = auth.uid() or public.is_staff());
create policy issues_insert on public.issues for insert to authenticated
  with check (reporter_id = auth.uid() and verification_status = 'pending' and repair_status = 'reported');
revoke update, delete on public.issues from authenticated, anon;

-- Supporters: one row per user per issue (unique constraint); cannot support your own report.
create policy supporters_read on public.issue_supporters for select to authenticated using (true);
create policy supporters_insert on public.issue_supporters for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (select 1 from public.issues i where i.id = issue_id and i.reporter_id = auth.uid())
  );
create policy supporters_delete on public.issue_supporters for delete to authenticated
  using (user_id = auth.uid());

create policy followers_own on public.issue_followers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy history_read on public.issue_status_history for select to authenticated
  using (exists (select 1 from public.issues i where i.id = issue_id));
-- no insert policy: only SECURITY DEFINER functions write history

create policy confirmations_read on public.resolution_confirmations for select to authenticated using (true);
-- writes go through confirm_resolution()

-- ---------------------------------------------------------------------------
-- Points & rewards: users read their own ledger; nobody writes it directly.
-- ---------------------------------------------------------------------------
create policy points_read_own on public.points_transactions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.points_transactions from authenticated, anon;

create policy rewards_read on public.rewards for select to authenticated using (active or public.is_admin());
create policy rewards_admin on public.rewards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy redemptions_read_own on public.redemptions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.redemptions from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.verify_issue(uuid, public.verification_status, public.issue_priority, boolean, text) from public, anon;
revoke execute on function public.set_repair_status(uuid, public.repair_status, text) from public, anon;
revoke execute on function public.set_issue_priority(uuid, public.issue_priority) from public, anon;
revoke execute on function public.add_issue_note(uuid, text) from public, anon;
revoke execute on function public.merge_issue(uuid, uuid, text) from public, anon;
revoke execute on function public.confirm_resolution(uuid, boolean) from public, anon;
revoke execute on function public.redeem_reward(uuid) from public, anon;
grant execute on function public.verify_issue(uuid, public.verification_status, public.issue_priority, boolean, text) to authenticated;
grant execute on function public.set_repair_status(uuid, public.repair_status, text) to authenticated;
grant execute on function public.set_issue_priority(uuid, public.issue_priority) to authenticated;
grant execute on function public.add_issue_note(uuid, text) to authenticated;
grant execute on function public.merge_issue(uuid, uuid, text) to authenticated;
grant execute on function public.confirm_resolution(uuid, boolean) to authenticated;
grant execute on function public.redeem_reward(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for issue photos.
-- Path convention: <uploader uid>/<random>.jpg — users may only upload into their own folder.
-- Any signed-in user may view photos (via signed URLs); only staff may delete.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('issue-photos', 'issue-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy issue_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy issue_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'issue-photos');
create policy issue_photos_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'issue-photos' and public.is_staff());
