-- Phase 3: support / confirmation points, admin operations, notifications feed.

-- ---------------------------------------------------------------------------
-- Verified support: +5 once per (issue, supporter), never to the reporter or the reviewing staff.
-- ---------------------------------------------------------------------------
create or replace function public.award_support_points(p_issue_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_issue public.issues;
begin
  select * into v_issue from public.issues where id = p_issue_id;
  if v_issue.verification_status <> 'verified' or v_issue.repair_status = 'resolved' then return; end if;
  if p_user_id = v_issue.reporter_id then return; end if;
  insert into public.points_transactions (user_id, issue_id, action_type, points, status, idempotency_key, settled_at)
  values (p_user_id, p_issue_id, 'verified_support', 5, 'available', 'verified_support:' || p_issue_id || ':' || p_user_id, now())
  on conflict (idempotency_key) do nothing;
end $$;
revoke execute on function public.award_support_points(uuid, uuid) from public, anon, authenticated;

-- Supporting an already-verified issue
create or replace function public.supporters_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.award_support_points(new.issue_id, new.user_id);
  return new;
end $$;
create trigger supporters_after_insert after insert on public.issue_supporters
  for each row execute function public.supporters_after_insert();

-- Issue becomes verified → existing supporters earn their points (except the reviewer)
create or replace function public.issues_after_verify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if old.verification_status = 'pending' and new.verification_status = 'verified' then
    for r in select user_id from public.issue_supporters where issue_id = new.id loop
      if r.user_id is distinct from auth.uid() then
        perform public.award_support_points(new.id, r.user_id);
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger issues_after_verify after update of verification_status on public.issues
  for each row execute function public.issues_after_verify();

-- ---------------------------------------------------------------------------
-- Resolution confirmation: reporter or supporters may confirm; +10 once per person per issue.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_resolution(p_issue_id uuid, p_is_fixed boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_issue public.issues;
  v_involved boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into v_issue from public.issues where id = p_issue_id;
  if v_issue.repair_status is distinct from 'resolved' then raise exception 'Issue is not resolved yet'; end if;

  insert into public.resolution_confirmations (issue_id, user_id, is_fixed)
  values (p_issue_id, auth.uid(), p_is_fixed)
  on conflict (issue_id, user_id) do update set is_fixed = excluded.is_fixed, created_at = now();

  v_involved := v_issue.reporter_id = auth.uid()
    or exists (select 1 from public.issue_supporters where issue_id = p_issue_id and user_id = auth.uid());
  if v_involved then
    insert into public.points_transactions (user_id, issue_id, action_type, points, status, idempotency_key, settled_at)
    values (auth.uid(), p_issue_id, 'resolution_confirmed', 10, 'available', 'resolution_confirmed:' || p_issue_id || ':' || auth.uid(), now())
    on conflict (idempotency_key) do nothing;
  end if;

  if not p_is_fixed then
    insert into public.issue_status_history (issue_id, kind, changed_by, note)
    values (p_issue_id, 'note', auth.uid(), 'A community member reports this still isn''t fixed.');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Admin: redemption status (cancel refunds the points, once)
-- ---------------------------------------------------------------------------
create or replace function public.set_redemption_status(p_redemption_id uuid, p_status public.redemption_status)
returns public.redemptions
language plpgsql security definer set search_path = public as $$
declare
  v public.redemptions;
begin
  if not public.is_admin() then raise exception 'Only administrators can do this' using errcode = '42501'; end if;
  select * into v from public.redemptions where id = p_redemption_id for update;
  if not found then raise exception 'Redemption not found'; end if;
  if v.status <> 'requested' then raise exception 'This redemption is already %', v.status; end if;
  update public.redemptions set status = p_status where id = p_redemption_id returning * into v;
  if p_status = 'cancelled' then
    insert into public.points_transactions (user_id, redemption_id, action_type, points, status, idempotency_key, settled_at)
    values (v.user_id, v.id, 'adjustment', v.points_spent, 'available', 'refund:' || v.id, now())
    on conflict (idempotency_key) do nothing;
  end if;
  return v;
end $$;
revoke execute on function public.set_redemption_status(uuid, public.redemption_status) from public, anon;
grant execute on function public.set_redemption_status(uuid, public.redemption_status) to authenticated;

-- Admins manage buildings (floors, active flag) through the existing buildings_admin policy.

-- ---------------------------------------------------------------------------
-- Notifications: updates on issues you follow, made by someone else.
-- ---------------------------------------------------------------------------
create or replace view public.my_notifications with (security_invoker = true) as
select
  h.id,
  h.issue_id,
  'CF-' || i.ref_number as ref_code,
  i.title as issue_title,
  h.kind,
  h.new_status,
  h.note,
  h.created_at
from public.issue_status_history h
join public.issue_followers f on f.issue_id = h.issue_id and f.user_id = auth.uid()
join public.issues i on i.id = h.issue_id
where h.changed_by is distinct from auth.uid();
