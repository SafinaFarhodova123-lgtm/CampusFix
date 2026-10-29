-- CampusFix core schema
-- Multi-campus ready: every building and issue belongs to a campus.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('student', 'faculty', 'staff', 'admin');
create type public.issue_category as enum (
  'plumbing', 'electrical', 'furniture', 'heating_cooling',
  'cleaning', 'building_damage', 'safety', 'other'
);
create type public.verification_status as enum ('pending', 'verified', 'rejected', 'merged');
create type public.repair_status as enum ('reported', 'in_progress', 'resolved');
create type public.issue_priority as enum ('low', 'medium', 'high', 'critical');
create type public.points_status as enum ('pending', 'available', 'void');
create type public.points_action as enum (
  'first_reporter', 'useful_photo', 'verified_support',
  'original_resolved', 'resolution_confirmed', 'redemption', 'adjustment'
);
create type public.redemption_status as enum ('requested', 'fulfilled', 'cancelled');
create type public.history_kind as enum ('verification', 'repair', 'priority', 'note', 'merge');

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users). Role is NEVER settable by the user.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  role public.user_role not null default 'student',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Campuses and buildings
-- ---------------------------------------------------------------------------
create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  center_latitude double precision not null check (center_latitude between -90 and 90),
  center_longitude double precision not null check (center_longitude between -180 and 180),
  default_zoom real not null default 16,
  created_at timestamptz not null default now()
);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete restrict,
  slug text not null,
  name text not null,
  short_name text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  -- GeoJSON Polygon/MultiPolygon geometry from a public source (e.g. OpenStreetMap).
  footprint_geojson jsonb,
  -- Where the geometry came from, e.g. 'osm:way/123456' or 'approximate'.
  geo_source text not null default 'schematic',
  height_m real not null default 10 check (height_m > 0 and height_m < 200),
  floors text[] not null default array['Ground Floor', 'First Floor', 'Second Floor'],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (campus_id, slug)
);
create index buildings_campus_idx on public.buildings (campus_id);

-- ---------------------------------------------------------------------------
-- Issues
-- ---------------------------------------------------------------------------
create table public.issues (
  id uuid primary key default gen_random_uuid(),
  ref_number bigint generated always as identity (start with 1001) unique,
  reporter_id uuid references public.profiles (id) on delete set null,
  campus_id uuid not null references public.campuses (id) on delete restrict,
  building_id uuid not null references public.buildings (id) on delete restrict,
  floor text check (char_length(floor) <= 40),
  room text check (char_length(room) <= 80),
  location_note text check (char_length(location_note) <= 200),
  title text not null check (char_length(title) between 4 and 120),
  description text not null check (char_length(description) between 10 and 2000),
  category public.issue_category not null,
  photo_path text,
  marker_latitude double precision check (marker_latitude between -90 and 90),
  marker_longitude double precision check (marker_longitude between -180 and 180),
  verification_status public.verification_status not null default 'pending',
  repair_status public.repair_status not null default 'reported',
  priority public.issue_priority not null default 'low',
  duplicate_of_issue_id uuid references public.issues (id) on delete set null,
  -- Synthetic demo records are flagged so they are never mistaken for real conditions.
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz,
  resolved_at timestamptz,
  constraint issues_not_self_duplicate check (duplicate_of_issue_id is null or duplicate_of_issue_id <> id),
  constraint issues_merged_needs_target check (verification_status <> 'merged' or duplicate_of_issue_id is not null),
  constraint issues_resolved_has_time check (repair_status <> 'resolved' or resolved_at is not null)
);
create index issues_building_idx on public.issues (building_id);
create index issues_campus_idx on public.issues (campus_id);
create index issues_reporter_idx on public.issues (reporter_id);
create index issues_status_idx on public.issues (verification_status, repair_status);
create index issues_created_idx on public.issues (created_at desc);

create table public.issue_supporters (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (issue_id, user_id)
);
create index issue_supporters_user_idx on public.issue_supporters (user_id);

create table public.issue_followers (
  issue_id uuid not null references public.issues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (issue_id, user_id)
);

create table public.issue_status_history (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues (id) on delete cascade,
  kind public.history_kind not null,
  previous_status text,
  new_status text,
  changed_by uuid references public.profiles (id) on delete set null,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index issue_status_history_issue_idx on public.issue_status_history (issue_id, created_at);

-- Reporter feedback after a fix ("does it look fixed?")
create table public.resolution_confirmations (
  issue_id uuid not null references public.issues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_fixed boolean not null,
  created_at timestamptz not null default now(),
  primary key (issue_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Points ledger, rewards, redemptions
-- ---------------------------------------------------------------------------
create table public.points_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  issue_id uuid references public.issues (id) on delete set null,
  redemption_id uuid,
  action_type public.points_action not null,
  points integer not null check (points <> 0),
  status public.points_status not null default 'pending',
  -- Guarantees an action can only ever be awarded once, e.g. 'first_reporter:<issue_id>'.
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index points_transactions_user_idx on public.points_transactions (user_id, status);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  points_required integer not null check (points_required > 0),
  image_key text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reward_id uuid not null references public.rewards (id) on delete restrict,
  points_spent integer not null check (points_spent > 0),
  status public.redemption_status not null default 'requested',
  created_at timestamptz not null default now()
);
create index redemptions_user_idx on public.redemptions (user_id);

alter table public.points_transactions
  add constraint points_transactions_redemption_fk
  foreign key (redemption_id) references public.redemptions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Housekeeping triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger issues_touch before update on public.issues
  for each row execute function public.touch_updated_at();

-- New auth user → profile, always as 'student'. Display name is fictional/demo-friendly.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(left(new.raw_user_meta_data ->> 'display_name', 60), ''), split_part(new.email, '@', 1))
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
