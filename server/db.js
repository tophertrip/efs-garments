// SQLite database setup for EFS Garments Manufacturing
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'efs.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL, -- 'admin', 'purchasing', 'printing', 'cutting_sewing', 'qa'
    pin TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT,
    name TEXT NOT NULL,
    contact TEXT,
    messenger_name TEXT,
    source TEXT DEFAULT 'facebook',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_order_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id),
    category TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2),
    total_amount DECIMAL(10,2),
    target_date DATE NOT NULL,
    design_notes TEXT,
    remarks TEXT,
    design_file_url TEXT,
    status TEXT DEFAULT 'inquiry',
    priority TEXT DEFAULT 'normal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS project_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id),
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id),
    assigned_to INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    is_done INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Lightweight migrations: add columns to existing tables if missing.
const projectCols = db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);
if (!projectCols.includes('remarks')) {
  db.exec('ALTER TABLE projects ADD COLUMN remarks TEXT');
}
const customerCols = db.prepare("PRAGMA table_info(customers)").all().map((c) => c.name);
if (!customerCols.includes('company')) {
  db.exec('ALTER TABLE customers ADD COLUMN company TEXT');
}

// Ensure the default product categories always exist (idempotent).
const insertDefaultCategory = db.prepare('INSERT OR IGNORE INTO categories (slug, name) VALUES (?, ?)');
[
  ['sportswear', 'Sportswear'],
  ['activewear', 'Activewear'],
  ['corporate', 'Corporate Uniform'],
  ['school', 'School Uniform'],
].forEach(([slug, name]) => insertDefaultCategory.run(slug, name));

module.exports = db;
