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
  staff_name TEXT,
  spent_on DATE,
  recorded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS staff_id INTEGER REFERENCES users(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS staff_name TEXT;

-- Store module — products + per-store pricing across multiple stores.
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS store_products (
  id SERIAL PRIMARY KEY,
  sku TEXT,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  uom TEXT DEFAULT 'pcs',
  status TEXT DEFAULT 'active',   -- 'active' | 'inactive'
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS store_prices (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES store_products(id) ON DELETE CASCADE,
  store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  price NUMERIC(10,2),
  UNIQUE (product_id, store_id)
);

-- POS sales (header) + line items. Sales sync into the sales report.
CREATE TABLE IF NOT EXISTS store_sales (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES stores(id),
  customer_name TEXT,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  sold_by INTEGER REFERENCES users(id),
  sold_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS store_sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES store_sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES store_products(id),
  name TEXT,
  sku TEXT,
  qty NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(10,2) NOT NULL
);

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
