-- CampusFix server-side logic: role helpers, issue lifecycle, points, redemption, views.
-- Privileged operations are SECURITY DEFINER functions that check the caller's role
-- from the profiles table — the frontend can never grant itself a role.

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_role_name() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('staff', 'admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.require_staff() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Only facilities staff can perform this action' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Issue creation: force safe defaults no matter what the client sends
-- ---------------------------------------------------------------------------
create or replace function public.issues_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_campus uuid;
begin
  -- Seeds and migrations run without an auth context; only enforce for real users.
  if auth.uid() is null then
    return new;
  end if;

  select campus_id into v_campus from public.buildings where id = new.building_id and active;
  if v_campus is null then
    raise exception 'Unknown building';
  end if;

  new.reporter_id := auth.uid();
  new.campus_id := v_campus;
  new.verification_status := 'pending';
  new.repair_status := 'reported';
  new.priority := 'low';
  new.duplicate_of_issue_id := null;
  new.is_sample := false;
  new.verified_at := null;
  new.resolved_at := null;
  new.created_at := now();
  new.updated_at := now();

  if new.photo_path is not null and split_part(new.photo_path, '/', 1) <> auth.uid()::text then
    raise exception 'Photo must be uploaded by the reporter';
  end if;
  return new;
end $$;

create trigger issues_before_insert before insert on public.issues
  for each row execute function public.issues_before_insert();

-- After a user creates an issue: history entry + PENDING points (released on verification).
create or replace function public.issues_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.issue_status_history (issue_id, kind, previous_status, new_status, changed_by, note)
  values (new.id, 'repair', null, 'reported', new.reporter_id, 'Issue reported');

  if new.reporter_id is not null and not new.is_sample then
    insert into public.points_transactions (user_id, issue_id, action_type, points, status, idempotency_key)
    values (new.reporter_id, new.id, 'first_reporter', 50, 'pending', 'first_reporter:' || new.id)
    on conflict (idempotency_key) do nothing;

    if new.photo_path is not null then
      insert into public.points_transactions (user_id, issue_id, action_type, points, status, idempotency_key)
      values (new.reporter_id, new.id, 'useful_photo', 10, 'pending', 'useful_photo:' || new.id)
      on conflict (idempotency_key) do nothing;
    end if;

    insert into public.issue_followers (issue_id, user_id) values (new.id, new.reporter_id)
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger issues_after_insert after insert on public.issues
  for each row execute function public.issues_after_insert();

-- ---------------------------------------------------------------------------
-- Staff: verify or reject
-- ---------------------------------------------------------------------------
create or replace function public.verify_issue(
  p_issue_id uuid,
  p_decision public.verification_status,
  p_priority public.issue_priority default null,
  p_photo_useful boolean default true,
  p_note text default null
) returns public.issues
language plpgsql security definer set search_path = public as $$
declare
  v_issue public.issues;
  v_self_review boolean;
begin
  perform public.require_staff();
  if p_decision not in ('verified', 'rejected') then
    raise exception 'Decision must be verified or rejected';
  end if;

  select * into v_issue from public.issues where id = p_issue_id for update;
  if not found then raise exception 'Issue not found'; end if;
  -- Staff may review their own reports, but never release points to themselves.
  v_self_review := coalesce(v_issue.reporter_id = auth.uid(), false);
  if v_issue.verification_status <> 'pending' then
    raise exception 'Issue has already been reviewed';
  end if;

  update public.issues
     set verification_status = p_decision,
         priority = coalesce(p_priority, priority),
         verified_at = case when p_decision = 'verified' then now() else null end
   where id = p_issue_id
   returning * into v_issue;

  insert into public.issue_status_history (issue_id, kind, previous_status, new_status, changed_by, note)
  values (p_issue_id, 'verification', 'pending', p_decision::text, auth.uid(), p_note);

  if p_decision = 'verified' and not v_self_review then
    update public.points_transactions
       set status = 'available', settled_at = now()
     where issue_id = p_issue_id and status = 'pending' and action_type = 'first_reporter';
    update public.points_transactions
       set status = case when p_photo_useful then 'available' else 'void' end::public.points_status,
           settled_at = now()
     where issue_id = p_issue_id and status = 'pending' and action_type = 'useful_photo';
  else
    update public.points_transactions
       set status = 'void', settled_at = now()
     where issue_id = p_issue_id and status = 'pending';
  end if;

  return v_issue;
end $$;

-- ---------------------------------------------------------------------------
-- Staff: repair status, priority, notes, merge
-- ---------------------------------------------------------------------------
create or replace function public.set_repair_status(
  p_issue_id uuid,
  p_status public.repair_status,
  p_note text default null
) returns public.issues
language plpgsql security definer set search_path = public as $$
declare
  v_issue public.issues;
  v_prev public.repair_status;
begin
  perform public.require_staff();
  select * into v_issue from public.issues where id = p_issue_id for update;
  if not found then raise exception 'Issue not found'; end if;
  if v_issue.verification_status <> 'verified' then
    raise exception 'Only verified issues can change repair status';
  end if;
  v_prev := v_issue.repair_status;
  if v_prev = p_status then return v_issue; end if;

  update public.issues
     set repair_status = p_status,
         resolved_at = case when p_status = 'resolved' then now() else null end
   where id = p_issue_id
   returning * into v_issue;

  insert into public.issue_status_history (issue_id, kind, previous_status, new_status, changed_by, note)
  values (p_issue_id, 'repair', v_prev::text, p_status::text, auth.uid(), p_note);

  if p_status = 'resolved' and v_issue.reporter_id is not null and v_issue.reporter_id <> auth.uid() then
    insert into public.points_transactions (user_id, issue_id, action_type, points, status, idempotency_key, settled_at)
    values (v_issue.reporter_id, p_issue_id, 'original_resolved', 20, 'available', 'original_resolved:' || p_issue_id, now())
    on conflict (idempotency_key) do nothing;
  end if;
  return v_issue;
end $$;

create or replace function public.set_issue_priority(p_issue_id uuid, p_priority public.issue_priority)
returns public.issues
language plpgsql security definer set search_path = public as $$
declare
  v_issue public.issues;
  v_prev public.issue_priority;
begin
  perform public.require_staff();
  select priority into v_prev from public.issues where id = p_issue_id for update;
  if not found then raise exception 'Issue not found'; end if;
  update public.issues set priority = p_priority where id = p_issue_id returning * into v_issue;
  insert into public.issue_status_history (issue_id, kind, previous_status, new_status, changed_by)
  values (p_issue_id, 'priority', v_prev::text, p_priority::text, auth.uid());
  return v_issue;
end $$;

create or replace function public.add_issue_note(p_issue_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_staff();
  if p_note is null or char_length(trim(p_note)) = 0 then raise exception 'Note is empty'; end if;
  insert into public.issue_status_history (issue_id, kind, changed_by, note)
  values (p_issue_id, 'note', auth.uid(), trim(p_note));
end $$;

create or replace function public.merge_issue(p_issue_id uuid, p_target_id uuid, p_note text default null)
returns public.issues
language plpgsql security definer set search_path = public as $$
declare
  v_issue public.issues;
  v_target public.issues;
  v_prev public.verification_status;
begin
  perform public.require_staff();
  if p_issue_id = p_target_id then raise exception 'Cannot merge an issue into itself'; end if;
  select * into v_target from public.issues where id = p_target_id;
  if not found or v_target.verification_status in ('rejected', 'merged') then
    raise exception 'Target issue is not mergeable';
  end if;

  select * into v_issue from public.issues where id = p_issue_id for update;
  if not found then raise exception 'Issue not found'; end if;
  if v_issue.verification_status = 'merged' then raise exception 'Issue already merged'; end if;
  v_prev := v_issue.verification_status;

  update public.issues
     set verification_status = 'merged', duplicate_of_issue_id = p_target_id
   where id = p_issue_id
   returning * into v_issue;

  insert into public.issue_status_history (issue_id, kind, previous_status, new_status, changed_by, note)
  values (p_issue_id, 'merge', v_prev::text, 'merged', auth.uid(),
          coalesce(p_note, 'Merged into CF-' || v_target.ref_number));

  -- Duplicates never earn first-reporter points.
  update public.points_transactions set status = 'void', settled_at = now()
   where issue_id = p_issue_id and status = 'pending';

  -- The duplicate's reporter becomes a supporter of the original.
  if v_issue.reporter_id is not null and v_issue.reporter_id <> v_target.reporter_id then
    insert into public.issue_supporters (issue_id, user_id) values (p_target_id, v_issue.reporter_id)
    on conflict do nothing;
  end if;
  return v_issue;
end $$;

-- ---------------------------------------------------------------------------
-- Student: confirm a fix
-- ---------------------------------------------------------------------------
create or replace function public.confirm_resolution(p_issue_id uuid, p_is_fixed boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status public.repair_status;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select repair_status into v_status from public.issues where id = p_issue_id;
  if v_status is distinct from 'resolved' then raise exception 'Issue is not resolved yet'; end if;
  insert into public.resolution_confirmations (issue_id, user_id, is_fixed)
  values (p_issue_id, auth.uid(), p_is_fixed)
  on conflict (issue_id, user_id) do update set is_fixed = excluded.is_fixed, created_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- Rewards: atomic redemption
-- ---------------------------------------------------------------------------
create or replace function public.redeem_reward(p_reward_id uuid)
returns public.redemptions
language plpgsql security definer set search_path = public as $$
declare
  v_reward public.rewards;
  v_balance integer;
  v_redemption public.redemptions;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  -- Serialize redemptions per user so two clicks cannot double-spend.
  perform 1 from public.profiles where id = auth.uid() for update;

  select * into v_reward from public.rewards where id = p_reward_id and active;
  if not found then raise exception 'Reward unavailable'; end if;

  select coalesce(sum(points), 0) into v_balance
    from public.points_transactions where user_id = auth.uid() and status = 'available';
  if v_balance < v_reward.points_required then
    raise exception 'Not enough points (need %, have %)', v_reward.points_required, v_balance;
  end if;

  insert into public.redemptions (user_id, reward_id, points_spent)
  values (auth.uid(), p_reward_id, v_reward.points_required)
  returning * into v_redemption;

  insert into public.points_transactions (user_id, redemption_id, action_type, points, status, idempotency_key, settled_at)
  values (auth.uid(), v_redemption.id, 'redemption', -v_reward.points_required, 'available',
          'redemption:' || v_redemption.id, now());
  return v_redemption;
end $$;

-- ---------------------------------------------------------------------------
-- Read models (security_invoker → RLS of the caller applies)
-- ---------------------------------------------------------------------------
create or replace view public.issue_feed with (security_invoker = true) as
select
  i.*,
  'CF-' || i.ref_number as ref_code,
  b.name as building_name,
  p.display_name as reporter_name,
  (select count(*) from public.issue_supporters s where s.issue_id = i.id)::int as supporter_count
from public.issues i
join public.buildings b on b.id = i.building_id
left join public.profiles p on p.id = i.reporter_id;

-- Building Health Score (illustrative maintenance indicator, not a safety assessment).
-- 100 − penalties for unresolved verified issues + up to 10 recovery points
-- (+2 per verified issue resolved in the last 30 days). Merged/rejected/pending excluded.
create or replace view public.building_health with (security_invoker = true) as
with v as (
  select * from public.issues where verification_status = 'verified'
)
select
  b.id as building_id,
  b.campus_id,
  b.name,
  count(v.id) filter (where v.repair_status <> 'resolved')::int as open_issues,
  count(v.id) filter (where v.repair_status = 'resolved')::int as resolved_issues,
  count(v.id) filter (where v.repair_status <> 'resolved' and v.priority = 'critical')::int as open_critical,
  count(v.id) filter (where v.repair_status <> 'resolved' and v.priority = 'high')::int as open_high,
  count(v.id) filter (where v.repair_status <> 'resolved' and v.priority = 'medium')::int as open_medium,
  count(v.id) filter (where v.repair_status <> 'resolved' and v.priority = 'low')::int as open_low,
  case when count(v.id) = 0 then null else
    greatest(0, least(100,
      100
      - coalesce(sum(case when v.repair_status <> 'resolved' then
          case v.priority when 'critical' then 12 when 'high' then 7 when 'medium' then 4 else 2 end
        end), 0)
      + least(10, 2 * count(v.id) filter (where v.repair_status = 'resolved' and v.resolved_at > now() - interval '30 days'))
    ))::int
  end as health_score
from public.buildings b
left join v on v.building_id = b.id
where b.active
group by b.id;

create or replace view public.my_points_summary with (security_invoker = true) as
select
  user_id,
  coalesce(sum(points) filter (where status = 'available'), 0)::int as available,
  coalesce(sum(points) filter (where status = 'pending'), 0)::int as pending,
  coalesce(sum(points) filter (where status = 'available' and points > 0), 0)::int as lifetime_earned,
  coalesce(-sum(points) filter (where action_type = 'redemption' and status = 'available'), 0)::int as redeemed
from public.points_transactions
group by user_id;
