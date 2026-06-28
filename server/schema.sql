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
