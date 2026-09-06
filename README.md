# Montra Nivesha — API Backend

A Postgres + Node/Express backend for the Montra Nivesha Table & Room Service
Management console. This turns the browser-only prototype into a real
multi-user system: data lives in a proper database instead of resetting on
every page refresh, and any device can talk to the same live data through
this API.

## What's included

- **`db/schema.sql`** — full Postgres schema: staff & roles, sections/tables/
  rooms, menu, orders, reservations, city ledger & room folios, catering
  (venues/packages/services/events), guest feedback.
- **`db/seed.sql`** + **`scripts/seed.js`** — seeds the same starting data the
  prototype ships with (18 tables, 20 menu items, 9 staff roles, 3 venues,
  4 catering packages, etc.), with real bcrypt password hashes generated at
  seed time.
- **`routes/`** — the Express API, one file per resource area.
- **`middleware/auth.js`** — JWT auth + a live, database-backed permission
  check (`role_permissions` table) so changes made through the "Roles &
  Permissions" endpoints take effect immediately, with no redeploy.
- **`routes/public.js`** — the only routes that don't require a login token:
  guest availability search & booking, QR-code menu browsing & ordering,
  and guest feedback submission. Everything else requires a staff bearer
  token and checks that role's permissions.

## Prerequisites

- Node.js 18+ 
- PostgreSQL 14+ (tested against 16)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create a database and a user for it
psql -c "CREATE USER montra WITH PASSWORD 'choose-a-real-password' SUPERUSER;"
psql -c "CREATE DATABASE montra_nivesha OWNER montra;"

# 3. Configure environment
cp .env.example .env
# then edit .env: set DATABASE_URL to match what you created above,
# and set JWT_SECRET to a long random string (openssl rand -hex 32 works well)

# 4. Apply the schema
npm run migrate

# 5. Seed starting data (tables, menu, staff accounts, catalogs)
npm run seed

# 6. Start the API
npm start
# -> Montra Nivesha API listening on http://localhost:4000
```

`npm run dev` runs the same thing with `node --watch` for auto-restart while
you're developing.

## Demo staff logins (seeded by `npm run seed`)

| Username       | Password         | Role                |
|----------------|------------------|----------------------|
| admin          | admin123         | Admin / Manager      |
| waiter1        | waiter123        | Waiter               |
| cashier1       | cashier123       | Cashier              |
| kitchen1       | kitchen123       | Kitchen (KDS)        |
| resmgr1        | resmgr123        | Reservation Manager  |
| resstaff1      | resstaff123      | Reservation Staffs   |
| restmgr1       | restmgr123       | Restaurant Manager   |
| headkitchen1   | headkitchen123   | Head of Kitchen      |
| finance1       | finance123       | Finance              |

**Change these before using this anywhere but your own laptop.** You can
generate a fresh hash for any password with `node scripts/hash-password.js
yournewpassword` and update the `staff` table, or just use the
`PUT /api/staff/me` / `POST /api/staff` endpoints once logged in as admin.

## API overview

All routes are under `/api`. Authenticated routes expect
`Authorization: Bearer <token>` from `POST /api/auth/login`.

| Area | Base path | Notes |
|---|---|---|
| Auth | `/api/auth` | `POST /login`, `GET /me`, `PUT /me` |
| Staff & permissions | `/api/staff` | CRUD + `/permissions/all`, `PUT /permissions` |
| Sections, tables, rooms | `/api/sections`, `/api/tables`, `/api/rooms` | |
| Menu | `/api/menu` | items + `/categories`, `/categories/reorder` |
| Orders (restaurant & room service) | `/api/orders` | create, `/items`, `/status`, `/settle` (cash/room/ledger) |
| Reservations | `/api/reservations` | conflict + operating-hours checked server-side |
| Catering | `/api/catering` | `/venues`, `/packages`, `/services`, `/business-sources`, `/events`, `/events/:id/settle` |
| City ledger & room folios | `/api/city-ledger` | `/accounts`, `/accounts/:id/settle`, `/room-folios`, `/room-folios/:roomId/settle` |
| Guest feedback (staff view) | `/api/feedback` | list, `/summary`, `/:id/review` |
| Reports | `/api/reports` | `?period=daily\|monthly\|yearly&date=...&month=...&year=...`, `/receivables` |
| **Public (no auth)** | `/api/public` | `/availability`, `/reservations`, `/waitlist`, `/menu?table=SK-1`, `/orders`, `/feedback` |

A quick example:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# -> { token, user, permissions }

curl http://localhost:4000/api/tables \
  -H "Authorization: Bearer <token>"
```

## Business logic ported from the prototype

- **Prices are VAT & service inclusive.** `price` on a menu item, `rental_fee`
  on a venue, `price_per_guest` on a package, and `rate` on an additional
  service are all the final, all-inclusive number. The API computes a
  net/service/VAT breakdown for display (10%/10%) but never adds anything
  on top of what's already stored — `bill.total` always equals `bill.subtotal`.
- **Reservation conflicts and operating hours** are checked server-side
  (`db/availability.js`) for both the staff reservation form and the public
  guest-booking flow, so two people can't double-book the same table even if
  they hit the API at the same moment (this is enforced with a genuine SQL
  overlap check, not just client-side validation).
- **Settling a bill** (order or event) to "Room" or "City Ledger" posts a
  charge to `room_folio_charges` / `city_ledger_transactions` and bumps the
  ledger account's running balance — mirroring the City Ledger page in the
  app.
- **Role permissions are live data**, not a hardcoded list — the
  `role_permissions` table is what `middleware/auth.js` checks on every
  request, and `PUT /api/staff/permissions` edits it. Admin is hardcoded to
  always pass, so there's no way to lock the whole console out of its own
  Staff & Users page.

## Connecting the existing frontend

The frontend (`montra-nivesha-table-management.html`) is now wired up to call
this API for its core flows — see the list below. It defaults to
`http://localhost:4000/api`; to point it at a different host (e.g. once you
deploy this backend somewhere real), add this before the closing
`</body>` tag, before the main `<script>` block runs:

```html
<script>window.MONTRA_API_BASE = 'https://your-api-host.example.com/api';</script>
```

**Wired to this API and tested end-to-end:**
- Login, session token, and per-role permissions
- Sections, tables, rooms, and menu — loaded fresh after login
- Floor Plan: table status/section/capacity changes, rename, add, delete
- Orders: create (staff order builder *and* the guest QR "Send to Kitchen"
  flow), add items, advance KDS status, settle (cash/room/ledger)
- Reservations: staff create/cancel, with server-side conflict and
  operating-hours checks
- Menu Management: add/edit/delete items (including photo upload), category
  reordering
- Guest booking portal: availability search, confirm booking, waitlist,
  manage-by-phone, cancel
- Guest feedback: submission, and the staff-side Guest Feedback list/review
- Catering & Events: venues, packages, additional services, and business
  sources (full CRUD), event booking with extra services, event invoice
  settlement (cash/room/ledger)
- City Ledger: account CRUD, statements (fetched fresh when opened), account
  settlement, room folio settlement
- Staff & Users: account CRUD, the live Roles & Permissions editor (grants
  take effect on that role's next login), and self-service "My Profile"
- Reports & Analytics: daily/monthly/yearly figures are computed from the
  same `state.orders`/`state.events` the API populated, so they reflect real
  history — not just "today" — the moment you load the page
- Light polling (every 6s) on Floor Plan and Orders so a second browser tab
  reflects changes made elsewhere

**Still local-only:** CSV import/export for events. Everything else in the
app now reads and writes through this API.

## Deploying somewhere real

This API and a Postgres database can run on almost any Node-friendly host:

- **Render / Railway / Fly.io** — all offer a managed Postgres add-on plus a
  Node web service; point `DATABASE_URL` at the managed database and deploy
  this folder.
- **A VPS** — install Postgres and Node, `git clone` this folder, run the
  setup steps above, and put it behind a reverse proxy (nginx/Caddy) with
  HTTPS.
- **Docker** — not included here, but this project has no filesystem
  dependencies beyond Postgres, so a standard `node:20-slim` image plus the
  official `postgres` image in a `docker-compose.yml` would work with no
  code changes.

Wherever it lands, update `CORS_ORIGIN` in `.env` to the real origin the
frontend will be served from (or a comma-separated list), rather than leaving
it as `*`, once you're past local testing.
