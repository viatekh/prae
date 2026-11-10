-- ============================================================
-- PRAE — Full Setup / Upgrade Script
-- Run this in Supabase SQL Editor.
-- Safe to run on a fresh DB or an existing one with data.
-- ============================================================

-- ── Categories ───────────────────────────────────────────────
create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order int  default 0
);

insert into categories (name, sort_order) values
  ('Speakers',            1),
  ('DJ',                  2),
  ('Backline',            3),
  ('Lighting',            4),
  ('Accessories / Misc',  5),
  ('Crewing and Services',6)
on conflict do nothing;

-- ── Items ────────────────────────────────────────────────────
create table if not exists items (
  id                    uuid primary key default gen_random_uuid(),
  item_id               text unique not null,
  name                  text not null,
  category_id           uuid references categories(id),
  serial_number         text,
  day_price             numeric(10,2) not null default 0,
  week_price            numeric(10,2),
  month_price           numeric(10,2),
  purchase_price        numeric(10,2),
  replacement_value     numeric(10,2),
  out_of_service        boolean not null default false,
  out_of_service_reason text,
  is_subhire            boolean not null default false,
  subhire_owner         text,
  notes                 text,
  created_at            timestamptz not null default now()
);

-- Add any columns that might be missing (upgrade path)
alter table items add column if not exists serial_number         text;
alter table items add column if not exists purchase_price        numeric(10,2);
alter table items add column if not exists replacement_value     numeric(10,2);
alter table items add column if not exists out_of_service        boolean not null default false;
alter table items add column if not exists out_of_service_reason text;

-- ── Item components ──────────────────────────────────────────
create table if not exists item_components (
  id       uuid primary key default gen_random_uuid(),
  item_id  uuid not null references items(id) on delete cascade,
  name     text not null,
  quantity int  not null default 1
);

-- ── Packages ─────────────────────────────────────────────────
create table if not exists packages (
  id          uuid primary key default gen_random_uuid(),
  package_id  text unique not null,
  name        text not null,
  category_id uuid references categories(id),
  day_price   numeric(10,2) not null default 0,
  week_price  numeric(10,2),
  month_price numeric(10,2),
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists package_items (
  id         uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  item_id    uuid not null references items(id),
  quantity   int  not null default 1
);

-- ── Clients ──────────────────────────────────────────────────
create table if not exists clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  company         text,
  email           text,
  phone           text,
  address         text,
  billing_address text,
  credit_terms    text,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table clients add column if not exists billing_address text;
alter table clients add column if not exists credit_terms    text;

-- ── Projects ─────────────────────────────────────────────────
create table if not exists projects (
  id                   uuid primary key default gen_random_uuid(),
  project_number       text unique not null,
  name                 text not null,
  client_id            uuid references clients(id),
  status               text not null default 'draft',
  location             text,
  delivery_address     text,
  event_date           timestamptz,
  delivery_date        timestamptz,
  collection_date      timestamptz,
  client_collects      boolean not null default false,
  client_returns       boolean not null default false,
  expiry_date          date,
  po_number            text,
  deposit_amount       numeric(10,2),
  deposit_paid         boolean not null default false,
  overall_discount_pct numeric(5,2) not null default 0,
  check_out_at         timestamptz,
  check_in_at          timestamptz,
  damage_notes         text,
  notes                text,
  client_notes         text,
  created_at           timestamptz not null default now(),
  constraint status_check check (status in ('draft','sent','confirmed','invoiced','completed'))
);

-- Rename charging_start → event_date if upgrading from old schema
do $$ begin
  if exists (select 1 from information_schema.columns where table_name='projects' and column_name='charging_start') then
    alter table projects rename column charging_start to event_date;
  end if;
  if exists (select 1 from information_schema.columns where table_name='projects' and column_name='charging_end') then
    alter table projects drop column charging_end;
  end if;
end $$;

-- Add new project columns (upgrade path)
alter table projects add column if not exists client_collects      boolean not null default false;
alter table projects add column if not exists client_returns       boolean not null default false;
alter table projects add column if not exists expiry_date          date;
alter table projects add column if not exists po_number            text;
alter table projects add column if not exists deposit_amount       numeric(10,2);
alter table projects add column if not exists deposit_paid         boolean not null default false;
alter table projects add column if not exists overall_discount_pct numeric(5,2) not null default 0;
alter table projects add column if not exists check_out_at         timestamptz;
alter table projects add column if not exists check_in_at          timestamptz;
alter table projects add column if not exists damage_notes         text;

-- ── Project line items ───────────────────────────────────────
create table if not exists project_line_items (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  item_id       uuid references items(id),
  package_id    uuid references packages(id),
  description   text not null,
  line_type     text not null default 'rental',
  category      text not null default '',
  quantity      int  not null default 1,
  days          int  not null default 1,
  unit_price    numeric(10,2) not null default 0,
  discount_pct  numeric(5,2)  not null default 0,
  sort_order    int  not null default 0,
  is_component  boolean not null default false,
  parent_line_id uuid references project_line_items(id),
  constraint line_type_check check (line_type in ('rental','service'))
);

-- ── Settings ─────────────────────────────────────────────────
create table if not exists settings (
  key   text primary key,
  value text
);

insert into settings (key, value) values
  ('company_name',       'Your Company Ltd'),
  ('company_address',    ''),
  ('company_email',      ''),
  ('company_phone',      ''),
  ('company_website',    ''),
  ('company_reg',        ''),
  ('vat_enabled',        'false'),
  ('vat_rate',           '20'),
  ('quote_prefix',       'QUOTE'),
  ('quote_next_number',  '1'),
  ('payment_terms',      'Payment is due in full prior to the hire date.'),
  ('tc_text',            '')
on conflict (key) do nothing;

-- ── User profiles ─────────────────────────────────────────────
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'staff',
  created_at timestamptz not null default now(),
  constraint role_check check (role in ('admin','staff'))
);

-- NOTE: No trigger on auth.users — profile rows are created by the
-- app on first login (see useAuth.ts). This avoids "Database error
-- creating new user" issues with Supabase's dashboard user creation.

-- ── Row Level Security ────────────────────────────────────────
alter table categories          enable row level security;
alter table items               enable row level security;
alter table item_components     enable row level security;
alter table packages            enable row level security;
alter table package_items       enable row level security;
alter table clients             enable row level security;
alter table projects            enable row level security;
alter table project_line_items  enable row level security;
alter table settings            enable row level security;
alter table profiles            enable row level security;

-- Drop any old open policies, replace with auth-required ones
do $$ declare tbl text; begin
  foreach tbl in array array[
    'categories','items','item_components','packages','package_items',
    'clients','projects','project_line_items','settings'
  ] loop
    execute format('drop policy if exists "allow all"      on %I', tbl);
    execute format('drop policy if exists "auth required"  on %I', tbl);
    execute format(
      'create policy "auth required" on %I for all
       using (auth.uid() is not null)
       with check (auth.uid() is not null)', tbl);
  end loop;
end $$;

-- Profile policies
drop policy if exists "authenticated read profiles" on profiles;
drop policy if exists "own profile update"          on profiles;
drop policy if exists "admin full access"           on profiles;

create policy "authenticated read profiles"
  on profiles for select using (auth.uid() is not null);

create policy "own profile update"
  on profiles for update using (auth.uid() = id);

create policy "admin full access"
  on profiles for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- ── Done ─────────────────────────────────────────────────────
-- After running this, set your first user as admin:
--   update profiles set role = 'admin' where email = 'you@example.com';
--
-- Optionally disable email confirmation in:
--   Supabase Dashboard → Authentication → Settings → Email Auth
