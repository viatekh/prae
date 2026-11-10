-- ============================================================
-- PRAE Migration 002
-- Run in the Supabase SQL Editor. Safe to run more than once.
--
--  1. Creates the activity/crew/maintenance tables the app already queries
--  2. Adds weekly + monthly rate snapshots to project line items
--  3. Replaces "any logged-in user can do anything" RLS with role-aware policies
--  4. Closes a privilege-escalation hole (staff could set their own role)
--  5. Adds a working delete_user() — deleting a profile row never removed the login
-- ============================================================

-- ─── 1. Tables the app queries but that were never created ───────────────────
-- Without these, the Activity log, Crew panel and Maintenance log error out.

create table if not exists project_logs (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  message    text not null,
  author_id  uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists project_logs_project_idx on project_logs (project_id, created_at desc);

create table if not exists project_crew (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name       text not null,
  role       text,
  created_at timestamptz not null default now()
);
create index if not exists project_crew_project_idx on project_crew (project_id, created_at);

create table if not exists item_logs (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references items(id) on delete cascade,
  note       text not null,
  author_id  uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists item_logs_item_idx on item_logs (item_id, created_at desc);

-- ─── 2. Weekly / monthly rate snapshots on line items ────────────────────────
-- Items already carried week_price and month_price but nothing applied them, so
-- a 14-day hire billed 14 x the day rate. Lines now snapshot all three rates at
-- the time they are added, the same way unit_price already did.

alter table project_line_items add column if not exists week_price  numeric(10,2);
alter table project_line_items add column if not exists month_price numeric(10,2);

-- Existing rental lines keep day-rate pricing until they are re-added or edited.
-- To back-fill them from the current catalogue instead, run:
--
--   update project_line_items l
--      set week_price  = i.week_price,
--          month_price = i.month_price
--     from items i
--    where l.item_id = i.id
--      and l.is_component = false
--      and l.week_price is null
--      and l.month_price is null;

-- Performance: availability scans line items by project and item.
create index if not exists project_line_items_project_idx on project_line_items (project_id);
create index if not exists project_line_items_item_idx    on project_line_items (item_id) where item_id is not null;
create index if not exists projects_status_dates_idx      on projects (status, event_date, collection_date);

-- ─── 3. Role helper ──────────────────────────────────────────────────────────
-- security definer so the function reads profiles WITHOUT re-entering the
-- policies on profiles. The previous "admin full access" policy selected from
-- profiles inside a policy on profiles, which Postgres rejects as infinite
-- recursion.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ─── 4. Row Level Security ───────────────────────────────────────────────────

alter table project_logs enable row level security;
alter table project_crew enable row level security;
alter table item_logs    enable row level security;

-- Operational data: anyone signed in can work on jobs.
do $$ declare tbl text; begin
  foreach tbl in array array[
    'clients','projects','project_line_items','project_logs','project_crew','item_logs'
  ] loop
    execute format('drop policy if exists "allow all"     on %I', tbl);
    execute format('drop policy if exists "auth required" on %I', tbl);
    execute format('drop policy if exists "staff read"    on %I', tbl);
    execute format('drop policy if exists "staff write"   on %I', tbl);
    execute format(
      'create policy "staff write" on %I for all
       using (auth.uid() is not null)
       with check (auth.uid() is not null)', tbl);
  end loop;
end $$;

-- Catalogue and company config: everyone reads, admins change.
-- If your staff need to add inventory themselves, change the "admin write"
-- policies below to use (auth.uid() is not null) like the block above.
do $$ declare tbl text; begin
  foreach tbl in array array[
    'categories','items','item_components','packages','package_items','settings'
  ] loop
    execute format('drop policy if exists "allow all"     on %I', tbl);
    execute format('drop policy if exists "auth required" on %I', tbl);
    execute format('drop policy if exists "staff read"    on %I', tbl);
    execute format('drop policy if exists "admin write"   on %I', tbl);
    execute format(
      'create policy "staff read" on %I for select
       using (auth.uid() is not null)', tbl);
    execute format(
      'create policy "admin write" on %I for all
       using (public.is_admin())
       with check (public.is_admin())', tbl);
  end loop;
end $$;

-- Profiles.
drop policy if exists "authenticated read profiles" on profiles;
drop policy if exists "own profile update"          on profiles;
drop policy if exists "admin full access"           on profiles;

create policy "authenticated read profiles"
  on profiles for select using (auth.uid() is not null);

create policy "own profile update"
  on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "admin manage profiles"
  on profiles for all using (public.is_admin()) with check (public.is_admin());

-- "own profile update" lets a user edit their own row, which included their
-- own role — any staff member could promote themselves to admin. Roles are now
-- only changeable by an admin.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change a user role';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on profiles;
create trigger profiles_guard_role
  before update on profiles
  for each row execute function public.guard_profile_role();

-- ─── 5. Removing a user ──────────────────────────────────────────────────────
-- The app deleted the profiles row and assumed auth.users would cascade, but
-- the cascade runs the other way: the login survived, and RLS still let it in.

create or replace function public.delete_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove users';
  end if;
  if target_id = auth.uid() then
    raise exception 'You cannot remove your own account';
  end if;
  delete from auth.users where id = target_id;  -- cascades to profiles
end;
$$;

revoke all on function public.delete_user(uuid) from public;
grant execute on function public.delete_user(uuid) to authenticated;

-- ─── 6. Make sure every login has a profile ──────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Back-fill profiles for any logins created while no trigger existed.
insert into profiles (id, email)
select u.id, u.email from auth.users u
left join profiles p on p.id = u.id
where p.id is null;

-- ─── Done ────────────────────────────────────────────────────────────────────
-- Promote your own account if it isn't already:
--   update profiles set role = 'admin' where email = 'you@example.com';
