-- EFS Garments — Postgres schema (Supabase)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pin TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  company TEXT,
  name TEXT NOT NULL,
  contact TEXT,
  messenger_name TEXT,
  source TEXT DEFAULT 'facebook',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  job_order_number TEXT UNIQUE NOT NULL,
  project_name TEXT,
  customer_id INTEGER REFERENCES customers(id),
  category TEXT NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2),
  total_amount NUMERIC(10,2),
  target_date DATE NOT NULL,
  design_notes TEXT,
  remarks TEXT,
  design_file_url TEXT,
  status TEXT DEFAULT 'inquiry',
  priority TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_logs (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  assigned_to INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  is_done INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migrations for existing databases.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_name TEXT;

-- Payments (multiple per project — partials / installments).
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  amount NUMERIC(10,2) NOT NULL,
  method TEXT DEFAULT 'cash',
  reference TEXT,
  paid_on DATE,
  recorded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory items + IN/OUT stock transactions (per item, per size).
CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  tracks_size BOOLEAN DEFAULT false,
  unit TEXT DEFAULT 'pcs',
  low_stock_threshold INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_txns (
  id SERIAL PRIMARY KEY,
  item_id INTEGER REFERENCES inventory_items(id),
  size TEXT,
  qty INTEGER NOT NULL,
  type TEXT NOT NULL,            -- 'in' | 'out'
  supplier TEXT,
  project_id INTEGER REFERENCES projects(id),
  notes TEXT,
  txn_date DATE,
  recorded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Expenses (business spending — categorized for finance reporting).
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(10,2) NOT NULL,
  vendor TEXT,
  method TEXT DEFAULT 'cash',
  project_id INTEGER REFERENCES projects(id),
  staff_id INTEGER REFERENCES users(id),
  spent_on DATE,
  recorded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS staff_id INTEGER REFERENCES users(id);

-- App settings (key/value JSON) — e.g. per-role tab permissions.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Default product categories (idempotent).
INSERT INTO categories (slug, name) VALUES
  ('sportswear', 'Sportswear'),
  ('activewear', 'Activewear'),
  ('corporate', 'Corporate Uniform'),
  ('school', 'School Uniform')
ON CONFLICT (slug) DO NOTHING;
