-- ============================================================
-- PRAE - Equipment Rental Management System
-- Run this in the Supabase SQL Editor to set up the database
-- ============================================================

-- Categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int default 0
);

insert into categories (name, sort_order) values
  ('Speakers', 1),
  ('DJ', 2),
  ('Backline', 3),
  ('Lighting', 4),
  ('Accessories / Misc', 5),
  ('Crewing and Services', 6)
on conflict do nothing;

-- Items — one row per physical item (CDJ3000-001, CDJ3000-002 are separate rows)
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  item_id text unique not null,
  name text not null,
  category_id uuid references categories(id),
  serial_number text,
  day_price numeric(10,2) not null default 0,
  week_price numeric(10,2),
  month_price numeric(10,2),
  purchase_price numeric(10,2),
  replacement_value numeric(10,2),
  out_of_service boolean not null default false,
  out_of_service_reason text,
  is_subhire boolean not null default false,
  subhire_owner text,
  notes text,
  created_at timestamptz not null default now()
);

-- Components that travel with an item
create table if not exists item_components (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  name text not null,
  quantity int not null default 1
);

-- Packages
create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  package_id text unique not null,
  name text not null,
  category_id uuid references categories(id),
  day_price numeric(10,2) not null default 0,
  week_price numeric(10,2),
  month_price numeric(10,2),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  item_id uuid not null references items(id),
  quantity int not null default 1
);

-- Clients
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text,
  phone text,
  address text,
  billing_address text,
  credit_terms text,
  notes text,
  created_at timestamptz not null default now()
);

-- Projects
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  project_number text unique not null,
  name text not null,
  client_id uuid references clients(id),
  status text not null default 'draft',
  location text,
  delivery_address text,
  event_date timestamptz,
  delivery_date timestamptz,
  collection_date timestamptz,
  client_collects boolean not null default false,
  client_returns boolean not null default false,
  expiry_date date,
  po_number text,
  deposit_amount numeric(10,2),
  deposit_paid boolean not null default false,
  overall_discount_pct numeric(5,2) not null default 0,
  check_out_at timestamptz,
  check_in_at timestamptz,
  damage_notes text,
  notes text,
  client_notes text,
  created_at timestamptz not null default now(),
  constraint status_check check (status in ('draft','sent','confirmed','invoiced','completed'))
);

-- Project line items
create table if not exists project_line_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  item_id uuid references items(id),
  package_id uuid references packages(id),
  description text not null,
  line_type text not null default 'rental',
  category text not null default '',
  quantity int not null default 1,
  days int not null default 1,
  unit_price numeric(10,2) not null default 0,
  discount_pct numeric(5,2) not null default 0,
  sort_order int not null default 0,
  is_component boolean not null default false,
  parent_line_id uuid references project_line_items(id),
  constraint line_type_check check (line_type in ('rental','service'))
);

-- App settings
create table if not exists settings (
  key text primary key,
  value text
);

insert into settings (key, value) values
  ('company_name', 'Your Company Ltd'),
  ('company_address', ''),
  ('company_email', ''),
  ('company_phone', ''),
  ('company_website', ''),
  ('company_reg', ''),
  ('vat_enabled', 'false'),
  ('vat_rate', '20'),
  ('quote_prefix', 'QUOTE'),
  ('quote_next_number', '1'),
  ('payment_terms', 'Payment is due in full prior to the hire date.'),
  ('tc_text', '')
on conflict (key) do nothing;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table categories enable row level security;
alter table items enable row level security;
alter table item_components enable row level security;
alter table packages enable row level security;
alter table package_items enable row level security;
alter table clients enable row level security;
alter table projects enable row level security;
alter table project_line_items enable row level security;
alter table settings enable row level security;

-- NOTE: these policies only require a logged-in user. Run setup.sql (or
-- migrate-002.sql) afterwards to replace them with role-aware policies.
-- Never leave a table on `using (true)`: the anon key ships in the browser
-- bundle, so `true` means the whole table is world-readable and world-writable.
do $$ declare tbl text; begin
  foreach tbl in array array[
    'categories','items','item_components','packages','package_items',
    'clients','projects','project_line_items','settings'
  ] loop
    execute format('drop policy if exists "allow all" on %I', tbl);
    execute format(
      'create policy "auth required" on %I for all
       using (auth.uid() is not null)
       with check (auth.uid() is not null)', tbl);
  end loop;
end $$;

-- ============================================================
-- Migration (run if upgrading from a previous schema version)
-- ============================================================
-- alter table items add column if not exists purchase_price numeric(10,2);
-- alter table items add column if not exists replacement_value numeric(10,2);
-- alter table items add column if not exists out_of_service boolean not null default false;
-- alter table items add column if not exists out_of_service_reason text;
-- alter table clients add column if not exists billing_address text;
-- alter table clients add column if not exists credit_terms text;
-- alter table projects add column if not exists expiry_date date;
-- alter table projects add column if not exists po_number text;
-- alter table projects add column if not exists deposit_amount numeric(10,2);
-- alter table projects add column if not exists deposit_paid boolean not null default false;
-- alter table projects add column if not exists overall_discount_pct numeric(5,2) not null default 0;
-- alter table projects add column if not exists check_out_at timestamptz;
-- alter table projects add column if not exists check_in_at timestamptz;
-- alter table projects add column if not exists damage_notes text;
-- insert into settings (key, value) values ('payment_terms', 'Payment is due in full prior to the hire date.'), ('tc_text', '') on conflict do nothing;
