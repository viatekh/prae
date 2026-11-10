-- ============================================================================
-- migrate-003: company-management additions
--   costs & margins, itemised check-out / check-in, invoicing, email settings
-- Run after schema.sql, setup.sql and migrate-002.sql. Safe to re-run.
-- ============================================================================

-- Line items: what a line costs us, and warehouse counts -----------------------
alter table project_line_items
  add column if not exists unit_cost   numeric not null default 0,
  add column if not exists supplier    text,
  add column if not exists out_qty     integer not null default 0,
  add column if not exists in_qty      integer not null default 0,
  add column if not exists damaged_qty integer not null default 0,
  add column if not exists return_note text,
  add column if not exists area         text,
  add column if not exists order_status text;

-- Jobs already checked out / in before this migration get matching counts, so
-- they don't show as "0 of N out".
update project_line_items l
   set out_qty = l.quantity
  from projects p
 where p.id = l.project_id and p.check_out_at is not null
   and l.line_type = 'rental' and l.out_qty = 0;

update project_line_items l
   set in_qty = l.quantity
  from projects p
 where p.id = l.project_id and p.check_in_at is not null
   and l.line_type = 'rental' and l.in_qty = 0;

-- Items: what sub-hired kit costs us per day ----------------------------------
alter table items add column if not exists subhire_cost numeric;

-- Projects: invoicing and quote tracking --------------------------------------
alter table projects
  add column if not exists quote_sent_at  timestamptz,
  add column if not exists invoice_number text,
  add column if not exists invoice_url    text,
  add column if not exists invoiced_at    timestamptz,
  add column if not exists paid_at        timestamptz;

create index if not exists projects_status_idx on projects (status);

-- Settings defaults -----------------------------------------------------------
insert into settings (key, value) values
  ('freeagent_url', ''),
  ('email_via', 'gmail'),
  ('chase_quote_days', '3'),
  ('payment_days', '14'),
  ('email_signature', ''),
  ('email_templates', '{}')
on conflict (key) do nothing;
