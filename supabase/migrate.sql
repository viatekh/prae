-- ============================================================
-- PRAE Migration — run this in the Supabase SQL Editor
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- Items: new columns
alter table items add column if not exists purchase_price     numeric(10,2);
alter table items add column if not exists replacement_value  numeric(10,2);
alter table items add column if not exists out_of_service     boolean not null default false;
alter table items add column if not exists out_of_service_reason text;

-- Clients: new columns
alter table clients add column if not exists billing_address text;
alter table clients add column if not exists credit_terms    text;

-- Projects: rename charging_start -> event_date, drop charging_end
do $$
begin
  -- Rename charging_start to event_date if it still exists under the old name
  if exists (
    select 1 from information_schema.columns
    where table_name = 'projects' and column_name = 'charging_start'
  ) then
    alter table projects rename column charging_start to event_date;
  end if;

  -- Drop charging_end (no longer used; collection_date is the end date)
  if exists (
    select 1 from information_schema.columns
    where table_name = 'projects' and column_name = 'charging_end'
  ) then
    alter table projects drop column charging_end;
  end if;
end $$;

-- Projects: new columns
alter table projects add column if not exists client_collects     boolean not null default false;
alter table projects add column if not exists client_returns      boolean not null default false;
alter table projects add column if not exists expiry_date         date;
alter table projects add column if not exists po_number           text;
alter table projects add column if not exists deposit_amount      numeric(10,2);
alter table projects add column if not exists deposit_paid        boolean not null default false;
alter table projects add column if not exists overall_discount_pct numeric(5,2) not null default 0;
alter table projects add column if not exists check_out_at        timestamptz;
alter table projects add column if not exists check_in_at         timestamptz;
alter table projects add column if not exists damage_notes        text;

-- Settings: new keys
insert into settings (key, value) values
  ('payment_terms', 'Payment is due in full prior to the hire date. A minimum deposit of £100 or 25% of the total (whichever is greater) is required to secure the booking.'),
  ('tc_text', '')
on conflict (key) do nothing;

-- ============================================================
-- Verify
-- ============================================================
select column_name from information_schema.columns where table_name = 'items'    order by ordinal_position;
select column_name from information_schema.columns where table_name = 'clients'  order by ordinal_position;
select column_name from information_schema.columns where table_name = 'projects' order by ordinal_position;

-- ============================================================
-- Auth & Profiles
-- ============================================================

-- User profiles (role + display name)
create table if not exists profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  full_name text,
  role      text not null default 'staff',
  created_at timestamptz not null default now(),
  constraint role_check check (role in ('admin', 'staff'))
);

-- Auto-create a profile row when a new auth user is created
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

alter table profiles enable row level security;
create policy "authenticated read profiles"  on profiles for select  using (auth.uid() is not null);
create policy "own profile update"           on profiles for update  using (auth.uid() = id);
create policy "admin full access"            on profiles for all     using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- ============================================================
-- Update all table policies to require authentication
-- (drop the old open policies, add auth-required ones)
-- ============================================================
do $$ declare
  tbl text;
begin
  foreach tbl in array array['categories','items','item_components','packages','package_items','clients','projects','project_line_items','settings'] loop
    execute format('drop policy if exists "allow all" on %I', tbl);
    execute format('create policy "auth required" on %I for all using (auth.uid() is not null) with check (auth.uid() is not null)', tbl);
  end loop;
end $$;

-- Make the first registered user an admin automatically
-- (run manually if needed: update profiles set role = 'admin' where email = 'your@email.com';)
