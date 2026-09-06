-- Montra Nivesha — Table & Room Service Management
-- Postgres schema

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ========== STAFF & AUTH ==========
CREATE TABLE staff (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,       -- admin | waiter | cashier | kitchen | reservationManager |
                                      -- reservationStaff | restaurantManager | headKitchen | finance
  shift         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role     TEXT NOT NULL,
  function TEXT NOT NULL,            -- nav function id, e.g. 'floorplan', 'orders', 'users'
  PRIMARY KEY (role, function)
);

-- ========== SECTIONS & TABLES ==========
CREATE TABLE sections (
  id          TEXT PRIMARY KEY,      -- e.g. 'sk','sr','af'
  name        TEXT NOT NULL,
  description TEXT,
  open_time   TIME,
  close_time  TIME
);

CREATE TABLE tables (
  id           TEXT PRIMARY KEY,     -- e.g. 'SK-1'
  section_id   TEXT NOT NULL REFERENCES sections(id),
  capacity     INT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'available', -- available|occupied|reserved|cleaning
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY               -- room number, e.g. '101'
);

-- ========== MENU ==========
CREATE TABLE menu_categories (
  name      TEXT PRIMARY KEY,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE menu_items (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL REFERENCES menu_categories(name),
  price      NUMERIC(10,2) NOT NULL,  -- VAT & service inclusive
  cost       NUMERIC(10,2) NOT NULL DEFAULT 0,
  section_id TEXT REFERENCES sections(id), -- NULL = available everywhere
  modifiers  TEXT,
  image      TEXT,                    -- data URL or external URL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== ORDERS (restaurant & room service) ==========
CREATE TABLE orders (
  id             SERIAL PRIMARY KEY,
  target_type    TEXT NOT NULL,       -- 'table' | 'room'
  target_id      TEXT NOT NULL,       -- table id or room id
  status         TEXT NOT NULL DEFAULT 'New', -- New|Preparing|Ready|Served|paid
  note           TEXT,
  settlement_type    TEXT,            -- cash | room | ledger
  settlement_room_id TEXT REFERENCES rooms(id),
  settlement_ledger_account_id INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at        TIMESTAMPTZ
);

CREATE TABLE order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INT NOT NULL REFERENCES menu_items(id),
  qty        INT NOT NULL,
  course     TEXT NOT NULL DEFAULT 'Main',
  sort_order INT NOT NULL DEFAULT 0    -- guest-chosen serving sequence
);

-- ========== RESERVATIONS ==========
CREATE TABLE reservations (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  party      INT NOT NULL,
  table_id   TEXT NOT NULL REFERENCES tables(id),
  date       DATE NOT NULL,
  time       TIME NOT NULL,
  duration   INT NOT NULL DEFAULT 90, -- minutes
  phone      TEXT,
  occasion   TEXT,
  note       TEXT,
  status     TEXT NOT NULL DEFAULT 'confirmed', -- confirmed|cancelled
  source     TEXT NOT NULL DEFAULT 'staff',      -- staff|guest
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE waitlist (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT,
  party      INT NOT NULL,
  date       DATE NOT NULL,
  time       TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== CITY LEDGER & ROOM FOLIOS ==========
CREATE TABLE city_ledger_accounts (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  contact      TEXT,
  credit_limit NUMERIC(10,2) NOT NULL DEFAULT 0,
  balance      NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE city_ledger_transactions (
  id         SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES city_ledger_accounts(id) ON DELETE CASCADE,
  order_ref  TEXT,                   -- 'order:12' or 'event:5' or 'settlement'
  amount     NUMERIC(10,2) NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE room_folio_charges (
  id         SERIAL PRIMARY KEY,
  room_id    TEXT NOT NULL REFERENCES rooms(id),
  order_ref  TEXT,
  amount     NUMERIC(10,2) NOT NULL,
  settled    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== CATERING & EVENTS ==========
CREATE TABLE venues (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  capacity    INT NOT NULL,
  rental_fee  NUMERIC(10,2) NOT NULL DEFAULT 0 -- VAT & service inclusive
);

CREATE TABLE catering_packages (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  price_per_guest NUMERIC(10,2) NOT NULL,       -- VAT & service inclusive
  cost_per_guest  NUMERIC(10,2) NOT NULL DEFAULT 0,
  description     TEXT
);

CREATE TABLE additional_services (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  rate        NUMERIC(10,2) NOT NULL,           -- VAT & service inclusive
  cost        NUMERIC(10,2) NOT NULL DEFAULT 0,
  description TEXT
);

CREATE TABLE business_sources (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE events (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  client           TEXT,
  phone            TEXT,
  business_source  TEXT,
  travel_agency    TEXT,
  voucher_number   TEXT,
  venue_id         INT NOT NULL REFERENCES venues(id),
  date             DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  guest_count      INT NOT NULL,
  package_id       INT NOT NULL REFERENCES catering_packages(id),
  venue_rate       NUMERIC(10,2),     -- override; NULL = use venue's rate
  package_rate     NUMERIC(10,2),     -- override; NULL = use package's rate
  deposit          NUMERIC(10,2) NOT NULL DEFAULT 0,
  note             TEXT,
  status           TEXT NOT NULL DEFAULT 'Inquiry', -- Inquiry|Confirmed|Completed|Cancelled
  invoice_status   TEXT NOT NULL DEFAULT 'Unpaid',  -- Unpaid|Paid
  settlement_type       TEXT,
  settlement_room_id    TEXT REFERENCES rooms(id),
  settlement_ledger_account_id INT REFERENCES city_ledger_accounts(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_extra_services (
  id         SERIAL PRIMARY KEY,
  event_id   INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  service_id INT NOT NULL REFERENCES additional_services(id),
  qty        INT NOT NULL DEFAULT 1
);

-- ========== GUEST FEEDBACK ==========
CREATE TABLE feedback (
  id             SERIAL PRIMARY KEY,
  name           TEXT,
  contact        TEXT,
  visit_type     TEXT,          -- Dine-in | Room Service | Event / Catering
  ref            TEXT,          -- table/room/event reference
  overall_rating INT,
  food_rating    INT,
  service_rating INT,
  comment        TEXT,
  status         TEXT NOT NULL DEFAULT 'new', -- new|reviewed
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== Indexes ==========
CREATE INDEX idx_orders_target ON orders(target_type, target_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_reservations_table_date ON reservations(table_id, date);
CREATE INDEX idx_events_venue_date ON events(venue_id, date);
CREATE INDEX idx_menu_items_category ON menu_items(category);
