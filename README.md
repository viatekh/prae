# PRAE — Company Management

Runs a hire company end to end: quoting, kit lists, availability, warehouse
check-out and check-in, invoicing hand-off, margins and the day's to-do list.
Built to take work off staff — the system works out what needs doing and puts
one button next to it.

Built with React 19, TypeScript, Vite, Tailwind v4, TanStack Query and Supabase.

## What it automates

| | |
|---|---|
| **Today** | A to-do list derived from the jobs themselves: kit to go out, kit due or overdue back, jobs ready to invoice, unpaid invoices, quotes to chase. Nobody maintains it. |
| **Quick hire** (`/quick`) | A small job — client, dates, kit — booked as a confirmed hire on one screen, optionally checked out in the same press. |
| **Warehouse** (`/warehouse`, `/projects/:id/check`) | Phone/tablet screen for counting kit out and back, with damage notes. A barcode scanner that types works in the scan box. |
| **Emails** | Quote, confirmation, return reminder, invoice and payment reminder open as ready-written Gmail drafts (or the device's mail app). Sending is logged on the job. |
| **Invoicing** | "Copy lines & open FreeAgent" puts the invoice lines on the clipboard and opens a new FreeAgent invoice; the number and link are stored back on the job. |
| **Margins** | Cost and supplier per line (sub-hire, crew, transport) give price / cost / profit / margin per job and in Reports. Internal only — never on client paperwork. |
| **Activity log** | Status changes, check-outs and emails write their own log entries. |

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase project details
npm run dev
```

`.env.local` needs:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

### Database

Run these in the Supabase SQL editor, in order:

1. `supabase/schema.sql` — core tables
2. `supabase/setup.sql` — seed data, profiles, base RLS
3. `supabase/migrate-002.sql` — activity/crew/maintenance tables, line-item rate
   columns, role-aware RLS, and `delete_user()`
4. `supabase/migrate-003.sql` — costs and margins, itemised check-out/in counts,
   invoice and quote tracking, integration settings

`supabase/migrate.sql` holds older incremental changes and
`supabase/drop_all.sql` tears everything down.

**Do not leave any table on `using (true)`.** The anon key ships inside the
browser bundle, so `true` makes that table world-readable and world-writable.

For new users to sign in immediately, disable **Enable email confirmations**
under Authentication → Settings in the Supabase dashboard.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) then production build |
| `npm run lint` | ESLint over `src/` |
| `npm test` | Vitest over the pure logic modules |
| `npm run preview` | Serve the production build locally |

## How it fits together

```
src/
  pages/        one file per route
  components/
    shared/     Button, Input, Select, Modal, Toast, Layout, guards
    inventory/  item form, CSV import, category manager
  hooks/        one module per resource; all data access goes through TanStack Query
  lib/          supabase client, auth + toast contexts, PDF documents, CSV, maths
  types/        database row types
```

Key conventions:

- **Data access lives in `hooks/`.** Pages don't call `supabase` directly; if you
  need a new query, add it to the relevant hook module so caching and
  invalidation stay in one place.
- **Auth is a single context.** `AuthProvider` holds the only `onAuthStateChange`
  subscription; read it with `useAuth()` from `lib/auth-context`.
- **Mutations strip joined relations.** Supabase rows come back with `client`,
  `line_items`, `category` etc. attached; those must never be sent back in an
  `update`, so the update hooks destructure them off.
- **List views keep filters in the URL** (`?q=`, `?status=`, `?tab=`, `?view=`)
  so a view is shareable and survives navigating into a record and back.

### Pricing

Items carry a daily rate plus optional weekly and monthly rates. A line is
charged the cheapest way of making up its duration from whichever rates are
set — straight days, whole blocks rounded up, or blocks plus leftover days —
and the kit list and quote show which was used ("1 wk + 3 days"). A line with no
weekly or monthly rate is billed at `days x day rate`, exactly as before.

Lines snapshot all three rates when they are added, so re-pricing the catalogue
never rewrites a quote that has already gone out.

### Availability

`useItemTypeAvailability` groups inventory by item *name* to get a unit count per
type, then subtracts quantities committed to other projects whose dates overlap.
Only `sent`, `confirmed` and `invoiced` projects hold stock — drafts don't.
Comparisons are day-precision, since project dates are stored as both plain
dates and full timestamps.

### Kit list editing

Both halves of the project page autosave on a debounce: the details panel and
the kit list. Leaving while a save is pending offers "Save and leave".

### Integrations

There are no API keys or servers to run. Under **Settings → Invoicing, email &
reminders**:

- **FreeAgent** — paste the address of FreeAgent's new-invoice page.
- **Email** — choose Gmail in the browser or the device's mail app, and set the
  sign-off used on every email.
- **Reminders** — how many days before a quote or an invoice is flagged for a chase.
