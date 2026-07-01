// EFS Garments Manufacturing — Express REST API (Postgres / Supabase).
// Exports the configured app; `index.js` runs it locally and `api/index.js`
// uses it as a Vercel serverless function.
const express = require('express');
const cors = require('cors');
const path = require('path');
const { query, get, run, pool } = require('./db');
const { STAGES, STAGE_KEYS, nextStage, stageMeta } = require('./stages');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // large enough for full-database restores

// ---------------------------------------------------------------------------
// Auth helpers (simple token = base64(JSON) — fine for an in-house MVP)
// ---------------------------------------------------------------------------
function makeToken(user) {
  return Buffer.from(JSON.stringify({ id: user.id, role: user.role, name: user.name })).toString('base64');
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Wrap async route handlers so rejected promises become 500s instead of hangs.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Admin-only guard.
function admin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// Default per-role tab visibility (used until an admin customizes it).
const DEFAULT_TAB_PERMS = {
  admin: ['dashboard', 'projects', 'calendar', 'customers', 'reports', 'payments', 'finance', 'inventory', 'tasks'],
  marketing: ['dashboard', 'projects', 'calendar', 'customers', 'tasks'],
  finance: ['projects', 'calendar', 'customers', 'reports', 'payments', 'finance', 'tasks'],
  purchasing: ['calendar', 'inventory', 'tasks'],
  printing: ['calendar', 'tasks'],
  cutting_sewing: ['calendar', 'tasks'],
  qa: ['calendar', 'tasks'],
  graphic_artist: ['calendar', 'tasks'],
};

async function getPermissions() {
  let stored = {};
  try {
    const row = await get("SELECT value FROM app_settings WHERE key = 'role_tabs'");
    if (row) stored = JSON.parse(row.value);
  } catch { /* table may not exist yet — fall back to defaults */ }
  return { ...DEFAULT_TAB_PERMS, ...stored };
}

// ---------------------------------------------------------------------------
// Helper: hydrate a project row with customer name + logs + tasks
// ---------------------------------------------------------------------------
async function getProjectFull(id) {
  const project = await get(`
    SELECT p.*, c.name AS customer_name, c.contact AS customer_contact,
           c.messenger_name AS customer_messenger
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.id = ?
  `, [id]);
  if (!project) return null;
  project.logs = await query(`
    SELECT l.*, u.name AS changed_by_name
    FROM project_logs l
    LEFT JOIN users u ON u.id = l.changed_by
    WHERE l.project_id = ?
    ORDER BY l.created_at ASC, l.id ASC
  `, [id]);
  project.tasks = await query(`
    SELECT t.*, u.name AS assigned_name, u.role AS assigned_role
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.project_id = ?
    ORDER BY t.is_done ASC, t.due_date ASC
  `, [id]);
  project.payments = await query(`
    SELECT pay.id, pay.amount::float AS amount, pay.method, pay.reference, pay.paid_on,
           pay.created_at, u.name AS recorded_by_name
    FROM payments pay
    LEFT JOIN users u ON u.id = pay.recorded_by
    WHERE pay.project_id = ?
    ORDER BY pay.paid_on DESC NULLS LAST, pay.id DESC
  `, [id]);
  project.total_paid = project.payments.reduce((a, p) => a + (p.amount || 0), 0);
  project.balance = (Number(project.total_amount) || 0) - project.total_paid;
  return project;
}

// Auto-create a task for the team that owns a given stage.
async function createStageTask(project, stageKey) {
  const meta = stageMeta(stageKey);
  if (!meta) return;
  const owner = await get('SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1', [meta.owner]);
  await run(`
    INSERT INTO tasks (project_id, assigned_to, title, description, due_date)
    VALUES (?, ?, ?, ?, ?)
  `, [
    project.id,
    owner ? owner.id : null,
    `${meta.label}: ${project.job_order_number}`,
    `${project.description || 'Job order'} — Qty ${project.quantity}. Advance when ${meta.label.toLowerCase()} is complete.`,
    project.target_date,
  ]);
}

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
app.post('/api/auth/login', wrap(async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });
  const user = await get('SELECT * FROM users WHERE pin = ?', [String(pin)]);
  if (!user) return res.status(401).json({ error: 'Invalid PIN' });
  res.json({
    token: makeToken(user),
    user: { id: user.id, name: user.name, role: user.role },
  });
}));

// ---------------------------------------------------------------------------
// META (stage definitions for the frontend)
// ---------------------------------------------------------------------------
app.get('/api/stages', (req, res) => res.json(STAGES));

// ---------------------------------------------------------------------------
// CATEGORIES (product types) — GET is public reference data, POST adds new
// ---------------------------------------------------------------------------
function slugify(name) {
  return String(name).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

app.get('/api/categories', wrap(async (req, res) => {
  const rows = await query('SELECT slug, name FROM categories ORDER BY name ASC');
  res.json(rows.map((r) => ({ key: r.slug, label: r.name })));
}));

app.post('/api/categories', auth, wrap(async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Category name required' });
  const slug = slugify(name);
  if (!slug) return res.status(400).json({ error: 'Invalid category name' });

  const existing = await get('SELECT slug, name FROM categories WHERE slug = ?', [slug]);
  if (existing) return res.status(200).json({ key: existing.slug, label: existing.name });

  await run('INSERT INTO categories (slug, name) VALUES (?, ?)', [slug, name]);
  res.status(201).json({ key: slug, label: name });
}));

// ---------------------------------------------------------------------------
// PROJECTS
// ---------------------------------------------------------------------------
app.get('/api/projects', auth, wrap(async (req, res) => {
  const { status, category, from, to, search } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('p.status = ?'); params.push(status); }
  if (category) { where.push('p.category = ?'); params.push(category); }
  if (from) { where.push('p.target_date >= ?'); params.push(from); }
  if (to) { where.push('p.target_date <= ?'); params.push(to); }
  if (search) {
    where.push('(c.name ILIKE ? OR p.job_order_number ILIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const rows = await query(`
    SELECT p.*, c.name AS customer_name, c.company AS customer_company
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.created_at DESC
  `, params);
  res.json(rows);
}));

app.get('/api/projects/:id', auth, wrap(async (req, res) => {
  const project = await getProjectFull(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
}));

app.post('/api/projects', auth, wrap(async (req, res) => {
  const {
    project_name, customer_id, category, description, quantity, unit_price,
    target_date, design_notes, remarks, design_file_url, priority,
  } = req.body;

  if (!customer_id || !category || !quantity || !target_date) {
    return res.status(400).json({ error: 'customer_id, category, quantity and target_date are required' });
  }

  // Generate next job order number: EFS-YYYY-NNN
  const year = new Date().getFullYear();
  const prefix = `EFS-${year}-`;
  const last = await get(
    'SELECT job_order_number FROM projects WHERE job_order_number LIKE ? ORDER BY job_order_number DESC LIMIT 1',
    [`${prefix}%`]
  );
  let seq = 1;
  if (last) seq = parseInt(last.job_order_number.slice(prefix.length), 10) + 1;
  const job_order_number = `${prefix}${String(seq).padStart(3, '0')}`;

  const total_amount = (Number(unit_price) || 0) * (Number(quantity) || 0);

  const inserted = await run(`
    INSERT INTO projects
      (job_order_number, project_name, customer_id, category, description, quantity, unit_price,
       total_amount, target_date, design_notes, remarks, design_file_url, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inquiry')
    RETURNING id
  `, [
    job_order_number, project_name || null, customer_id, category, description || null, quantity,
    unit_price || null, total_amount, target_date, design_notes || null,
    remarks || null, design_file_url || null, priority || 'normal',
  ]);
  const newId = inserted.rows[0].id;

  await run(`
    INSERT INTO project_logs (project_id, from_status, to_status, changed_by, notes)
    VALUES (?, NULL, 'inquiry', ?, 'Project created')
  `, [newId, req.user.id]);

  res.status(201).json(await getProjectFull(newId));
}));

app.put('/api/projects/:id', auth, wrap(async (req, res) => {
  const existing = await get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  const fields = ['project_name', 'customer_id', 'category', 'description', 'quantity', 'unit_price',
    'target_date', 'design_notes', 'remarks', 'design_file_url', 'priority'];
  const merged = { ...existing };
  for (const f of fields) if (f in req.body) merged[f] = req.body[f];
  merged.total_amount = (Number(merged.unit_price) || 0) * (Number(merged.quantity) || 0);

  await run(`
    UPDATE projects SET
      project_name=?, customer_id=?, category=?, description=?, quantity=?, unit_price=?,
      total_amount=?, target_date=?, design_notes=?, remarks=?, design_file_url=?,
      priority=?, updated_at=now()
    WHERE id=?
  `, [
    merged.project_name || null, merged.customer_id, merged.category, merged.description, merged.quantity,
    merged.unit_price, merged.total_amount, merged.target_date, merged.design_notes,
    merged.remarks, merged.design_file_url, merged.priority, req.params.id,
  ]);
  res.json(await getProjectFull(req.params.id));
}));

// Advance to next stage (or jump to a specific status if provided)
app.put('/api/projects/:id/status', auth, wrap(async (req, res) => {
  const project = await get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const target = req.body.status || nextStage(project.status);
  if (!target) return res.status(400).json({ error: 'Project is already at the final stage' });
  if (!STAGE_KEYS.includes(target)) return res.status(400).json({ error: 'Unknown status' });

  const from = project.status;
  await run('UPDATE projects SET status=?, updated_at=now() WHERE id=?', [target, req.params.id]);
  await run(`
    INSERT INTO project_logs (project_id, from_status, to_status, changed_by, notes)
    VALUES (?, ?, ?, ?, ?)
  `, [req.params.id, from, target, req.user.id, req.body.notes || null]);

  // Skip auto-task creation when this is a "return to previous stage" (an undo).
  if (!req.body.skipTask) await createStageTask(project, target);

  res.json(await getProjectFull(req.params.id));
}));

// Delete a project (and its logs + tasks) atomically.
app.delete('/api/projects/:id', auth, wrap(async (req, res) => {
  const project = await get('SELECT id FROM projects WHERE id = ?', [req.params.id]);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM tasks WHERE project_id = $1', [req.params.id]);
    await client.query('DELETE FROM project_logs WHERE project_id = $1', [req.params.id]);
    await client.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------------------------
app.get('/api/customers', auth, wrap(async (req, res) => {
  const rows = await query(`
    SELECT c.*, COUNT(p.id)::int AS project_count
    FROM customers c
    LEFT JOIN projects p ON p.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.name ASC
  `);
  res.json(rows);
}));

app.post('/api/customers', auth, wrap(async (req, res) => {
  const { company, name, contact, messenger_name, source } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const inserted = await run(`
    INSERT INTO customers (company, name, contact, messenger_name, source)
    VALUES (?, ?, ?, ?, ?)
    RETURNING *
  `, [company || null, name, contact || null, messenger_name || null, source || 'facebook']);
  res.status(201).json(inserted.rows[0]);
}));

// Update an existing customer.
app.put('/api/customers/:id', auth, wrap(async (req, res) => {
  const existing = await get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  if ('name' in req.body && !String(req.body.name || '').trim()) {
    return res.status(400).json({ error: 'Name required' });
  }
  const merged = { ...existing };
  for (const f of ['company', 'name', 'contact', 'messenger_name', 'source']) {
    if (f in req.body) merged[f] = req.body[f];
  }
  await run(
    'UPDATE customers SET company=?, name=?, contact=?, messenger_name=?, source=? WHERE id=?',
    [merged.company || null, merged.name, merged.contact || null, merged.messenger_name || null, merged.source || 'facebook', req.params.id]
  );
  res.json(await get('SELECT * FROM customers WHERE id = ?', [req.params.id]));
}));

// Delete a customer — blocked while they still have job orders, to avoid orphans.
app.delete('/api/customers/:id', auth, wrap(async (req, res) => {
  const customer = await get('SELECT id FROM customers WHERE id = ?', [req.params.id]);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const { count } = await get('SELECT COUNT(*)::int AS count FROM projects WHERE customer_id = ?', [req.params.id]);
  if (count > 0) {
    return res.status(409).json({ error: `Cannot delete: this customer has ${count} project${count !== 1 ? 's' : ''}. Delete or reassign them first.` });
  }
  await run('DELETE FROM customers WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// USERS (for assigning tasks)
// ---------------------------------------------------------------------------
app.get('/api/users', auth, wrap(async (req, res) => {
  res.json(await query('SELECT id, name, role FROM users ORDER BY name'));
}));

// ---------------------------------------------------------------------------
// ADMIN — user management (includes PINs) + per-role tab permissions
// ---------------------------------------------------------------------------
app.get('/api/admin/users', auth, admin, wrap(async (req, res) => {
  res.json(await query('SELECT id, name, role, pin, created_at FROM users ORDER BY id'));
}));

app.post('/api/admin/users', auth, admin, wrap(async (req, res) => {
  const name = (req.body.name || '').trim();
  const role = (req.body.role || '').trim();
  const pin = String(req.body.pin || '').trim();
  if (!name || !role || !pin) return res.status(400).json({ error: 'Name, role and PIN are required' });
  const clash = await get('SELECT id FROM users WHERE pin = ?', [pin]);
  if (clash) return res.status(409).json({ error: 'That PIN is already used by another user' });
  const r = await run('INSERT INTO users (name, role, pin) VALUES (?, ?, ?) RETURNING id, name, role, pin', [name, role, pin]);
  res.status(201).json(r.rows[0]);
}));

app.put('/api/admin/users/:id', auth, admin, wrap(async (req, res) => {
  const existing = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const merged = { ...existing };
  for (const f of ['name', 'role', 'pin']) if (f in req.body) merged[f] = String(req.body[f]).trim();
  if (!merged.name || !merged.role || !merged.pin) return res.status(400).json({ error: 'Name, role and PIN are required' });

  // PIN must stay unique across users.
  const clash = await get('SELECT id FROM users WHERE pin = ? AND id <> ?', [merged.pin, req.params.id]);
  if (clash) return res.status(409).json({ error: 'That PIN is already used by another user' });

  // Don't allow demoting the last remaining admin.
  if (existing.role === 'admin' && merged.role !== 'admin') {
    const { n } = await get("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'");
    if (n <= 1) return res.status(400).json({ error: 'Cannot change the role of the only admin' });
  }

  await run('UPDATE users SET name = ?, role = ?, pin = ? WHERE id = ?', [merged.name, merged.role, merged.pin, req.params.id]);
  res.json(await get('SELECT id, name, role, pin FROM users WHERE id = ?', [req.params.id]));
}));

app.delete('/api/admin/users/:id', auth, admin, wrap(async (req, res) => {
  const existing = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  if (existing.role === 'admin') {
    const { n } = await get("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'");
    if (n <= 1) return res.status(400).json({ error: 'Cannot delete the only admin' });
  }
  // Keep referential history intact: null out this user's task/log references.
  await run('UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ?', [req.params.id]);
  await run('UPDATE project_logs SET changed_by = NULL WHERE changed_by = ?', [req.params.id]);
  await run('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// Per-role tab visibility — public reference data used to build each nav.
app.get('/api/permissions', wrap(async (req, res) => {
  res.json(await getPermissions());
}));

app.put('/api/permissions', auth, admin, wrap(async (req, res) => {
  const map = req.body && typeof req.body === 'object' ? req.body : {};
  // Admin always retains every tab.
  map.admin = DEFAULT_TAB_PERMS.admin;
  await run(
    `INSERT INTO app_settings (key, value) VALUES ('role_tabs', ?)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(map)]
  );
  res.json(await getPermissions());
}));

// ---------------------------------------------------------------------------
// TASKS
// ---------------------------------------------------------------------------
app.get('/api/tasks', auth, wrap(async (req, res) => {
  const { assigned_to, project_id, done } = req.query;
  const where = [];
  const params = [];
  if (assigned_to) { where.push('t.assigned_to = ?'); params.push(assigned_to); }
  if (project_id) { where.push('t.project_id = ?'); params.push(project_id); }
  if (done === '0' || done === '1') { where.push('t.is_done = ?'); params.push(Number(done)); }
  const rows = await query(`
    SELECT t.*, u.name AS assigned_name, u.role AS assigned_role,
           p.job_order_number, c.name AS customer_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN customers c ON c.id = p.customer_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.is_done ASC, t.due_date ASC, t.id DESC
  `, params);
  res.json(rows);
}));

app.post('/api/tasks', auth, wrap(async (req, res) => {
  const { project_id, assigned_to, title, description, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const inserted = await run(`
    INSERT INTO tasks (project_id, assigned_to, title, description, due_date)
    VALUES (?, ?, ?, ?, ?)
    RETURNING *
  `, [project_id || null, assigned_to || null, title, description || null, due_date || null]);
  res.status(201).json(inserted.rows[0]);
}));

app.put('/api/tasks/:id/done', auth, wrap(async (req, res) => {
  const done = req.body.is_done === undefined ? 1 : Number(req.body.is_done);
  const updated = await run('UPDATE tasks SET is_done = ? WHERE id = ? RETURNING *', [done, req.params.id]);
  res.json(updated.rows[0]);
}));

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
app.get('/api/dashboard', auth, wrap(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);
  const weekStr = weekAhead.toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  // Rolling 30-day window for "due this month" so it always covers "due this week".
  const monthAhead = new Date();
  monthAhead.setDate(monthAhead.getDate() + 30);
  const monthStr = monthAhead.toISOString().slice(0, 10);

  const activeStatuses = "('inquiry','quotation','confirmed','layout_pattern','purchasing','printing','cutting_sewing','qa','ready')";

  const { n: totalActive } = await get(
    `SELECT COUNT(*)::int AS n FROM projects WHERE status IN ${activeStatuses}`
  );
  const { n: dueThisWeek } = await get(
    `SELECT COUNT(*)::int AS n FROM projects WHERE status IN ${activeStatuses}
     AND target_date >= ? AND target_date <= ?`, [today, weekStr]
  );
  const { n: overdue } = await get(
    `SELECT COUNT(*)::int AS n FROM projects WHERE status IN ${activeStatuses} AND target_date < ?`, [today]
  );
  const { n: completedThisMonth } = await get(
    `SELECT COUNT(*)::int AS n FROM projects WHERE status IN ('delivered','for_payment','paid') AND updated_at >= ?`, [monthStart]
  );

  // Total pieces / units due (sum of quantity) among active orders.
  const { n: unitsDueThisWeek } = await get(
    `SELECT COALESCE(SUM(quantity), 0)::int AS n FROM projects
     WHERE status IN ${activeStatuses} AND target_date >= ? AND target_date <= ?`, [today, weekStr]
  );
  const { n: unitsDueThisMonth } = await get(
    `SELECT COALESCE(SUM(quantity), 0)::int AS n FROM projects
     WHERE status IN ${activeStatuses} AND target_date >= ? AND target_date <= ?`, [today, monthStr]
  );

  const byStageRows = await query('SELECT status, COUNT(*)::int AS n FROM projects GROUP BY status');
  const byStage = {};
  STAGE_KEYS.forEach((k) => { byStage[k] = 0; });
  byStageRows.forEach((r) => { byStage[r.status] = r.n; });

  res.json({ totalActive, dueThisWeek, overdue, completedThisMonth, unitsDueThisWeek, unitsDueThisMonth, byStage });
}));

// ---------------------------------------------------------------------------
// OWNER DASHBOARD — executive year/month totals + monthly series (by order date)
// ---------------------------------------------------------------------------
app.get('/api/owner-dashboard', auth, admin, wrap(async (req, res) => {
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // One pass: per-month sales (revenue), project count, and pieces (units).
  const rows = await query(`
    SELECT EXTRACT(MONTH FROM created_at::date)::int AS m,
           COUNT(*)::int AS projects,
           COALESCE(SUM(quantity), 0)::int AS pieces,
           COALESCE(SUM(total_amount), 0)::float AS sales
    FROM projects
    WHERE created_at::date >= ?::date AND created_at::date <= ?::date
    GROUP BY m
  `, [yearStart, yearEnd]);

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const byMonth = {};
  rows.forEach((r) => { byMonth[r.m] = r; });
  const monthly = MONTHS.map((label, i) => {
    const r = byMonth[i + 1] || {};
    return { month: i + 1, label, sales: r.sales || 0, projects: r.projects || 0, pieces: r.pieces || 0 };
  });

  const sum = (key) => monthly.reduce((a, m) => a + m[key], 0);
  const cur = monthly[currentMonth - 1] || { sales: 0, projects: 0, pieces: 0 };

  // Money actually collected (sum of payments) vs outstanding balance.
  const { n: totalCollected } = await get('SELECT COALESCE(SUM(amount),0)::float AS n FROM payments');
  const { n: confirmedSales } = await get(
    `SELECT COALESCE(SUM(total_amount),0)::float AS n FROM projects WHERE status NOT IN ('inquiry','quotation')`
  );
  const outstanding = confirmedSales - totalCollected;

  // Sales (revenue) by product category — this year.
  const byCategory = await query(`
    SELECT category,
           COUNT(*)::int AS projects,
           COALESCE(SUM(total_amount),0)::float AS sales,
           COALESCE(SUM(quantity),0)::int AS pieces
    FROM projects
    WHERE created_at::date >= ?::date AND created_at::date <= ?::date
    GROUP BY category
    ORDER BY sales DESC
  `, [yearStart, yearEnd]);

  res.json({
    year,
    summary: {
      salesYear: sum('sales'),
      salesMonth: cur.sales,
      totalCollected,
      outstanding,
      confirmedSales,
      projectsYear: sum('projects'),
      projectsMonth: cur.projects,
      piecesYear: sum('pieces'),
      piecesMonth: cur.pieces,
    },
    monthly,
    byCategory,
  });
}));

// ---------------------------------------------------------------------------
// REPORTS — flexible aggregation grouped by time period / product / customer …
// ---------------------------------------------------------------------------
app.get('/api/reports', auth, wrap(async (req, res) => {
  const { groupBy = 'month', dateField = 'created', from, to, status = 'all' } = req.query;

  const dateCol = dateField === 'target' ? 'p.target_date' : 'p.created_at';

  const where = [];
  const params = [];
  if (from) { where.push(`${dateCol}::date >= ?::date`); params.push(from); }
  if (to) { where.push(`${dateCol}::date <= ?::date`); params.push(to); }
  if (status === 'delivered') where.push(`p.status = 'delivered'`);
  else if (status === 'for_payment') where.push(`p.status = 'for_payment'`);
  else if (status === 'paid') where.push(`p.status = 'paid'`);
  else if (status === 'active') where.push(`p.status NOT IN ('delivered','for_payment','paid')`);
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  let keyExpr;
  let joinSql = '';
  let chronological = false;
  switch (groupBy) {
    case 'year':     keyExpr = `to_char(${dateCol}, 'YYYY')`;          chronological = true; break;
    case 'week':     keyExpr = `to_char(${dateCol}, 'IYYY-"W"IW')`;    chronological = true; break;
    case 'category': keyExpr = `p.category`; break;
    case 'status':   keyExpr = `p.status`; break;
    case 'priority': keyExpr = `p.priority`; break;
    case 'customer':
      keyExpr = `COALESCE(NULLIF(c.company, ''), c.name)`;
      joinSql = 'LEFT JOIN customers c ON c.id = p.customer_id';
      break;
    case 'month':
    default:         keyExpr = `to_char(${dateCol}, 'YYYY-MM')`;       chronological = true; break;
  }

  const orderSql = chronological ? 'gkey ASC' : 'revenue DESC, orders DESC';

  const rows = (await query(`
    SELECT ${keyExpr} AS gkey,
           COUNT(*)::int AS orders,
           COALESCE(SUM(p.quantity), 0)::int AS units,
           COALESCE(SUM(p.total_amount), 0)::float AS revenue
    FROM projects p
    ${joinSql}
    ${whereSql}
    GROUP BY gkey
    ORDER BY ${orderSql}
  `, params)).map((r) => ({ key: r.gkey ?? '—', orders: r.orders, units: r.units, revenue: r.revenue }));

  const summary = await get(`
    SELECT COUNT(*)::int AS orders,
           COALESCE(SUM(p.quantity), 0)::int AS units,
           COALESCE(SUM(p.total_amount), 0)::float AS revenue
    FROM projects p
    ${joinSql}
    ${whereSql}
  `, params);
  summary.avgOrderValue = summary.orders ? summary.revenue / summary.orders : 0;

  res.json({ groupBy, dateField, from: from || null, to: to || null, status, chronological, summary, rows });
}));

// ---------------------------------------------------------------------------
// PAYMENTS — partials/installments per project; balances & collection summary
// ---------------------------------------------------------------------------
// "Confirmed" sales = orders past the quotation stage.
const NOT_CONFIRMED = "('inquiry','quotation')";

function paymentStatus(total, paid) {
  if (paid <= 0) return 'unpaid';
  if (total - paid > 0.009) return 'partial';
  return 'paid';
}

async function projectBalances() {
  const rows = await query(`
    SELECT p.id, p.job_order_number, p.project_name,
           p.total_amount::float AS total_amount, p.status,
           c.name AS customer_name, c.company AS customer_company,
           COALESCE(pay.paid, 0)::float AS total_paid
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN (SELECT project_id, SUM(amount) AS paid FROM payments GROUP BY project_id) pay ON pay.project_id = p.id
    WHERE p.status NOT IN ${NOT_CONFIRMED}
    ORDER BY p.job_order_number DESC
  `);
  return rows.map((r) => {
    const balance = (r.total_amount || 0) - (r.total_paid || 0);
    return { ...r, balance, payment_status: paymentStatus(r.total_amount || 0, r.total_paid || 0) };
  });
}

// Per-project balance table.
app.get('/api/payments/projects', auth, wrap(async (req, res) => {
  res.json(await projectBalances());
}));

// Sales / collection summary.
app.get('/api/payments/summary', auth, wrap(async (req, res) => {
  const bal = await projectBalances();
  const totalSales = bal.reduce((a, p) => a + (p.total_amount || 0), 0);
  const totalCollected = bal.reduce((a, p) => a + (p.total_paid || 0), 0);
  const counts = { paid: 0, partial: 0, unpaid: 0 };
  bal.forEach((p) => { counts[p.payment_status] += 1; });
  res.json({
    totalSales,
    totalCollected,
    totalOutstanding: totalSales - totalCollected,
    fullyPaid: counts.paid,
    partiallyPaid: counts.partial,
    unpaid: counts.unpaid,
  });
}));

// Transaction history (filters: from, to, method, project_id, status).
app.get('/api/payments', auth, wrap(async (req, res) => {
  const { from, to, method, project_id, status } = req.query;
  const where = [];
  const params = [];
  if (from) { where.push('pay.paid_on >= ?'); params.push(from); }
  if (to) { where.push('pay.paid_on <= ?'); params.push(to); }
  if (method) { where.push('pay.method = ?'); params.push(method); }
  if (project_id) { where.push('pay.project_id = ?'); params.push(project_id); }

  let rows = await query(`
    SELECT pay.id, pay.paid_on, pay.amount::float AS amount, pay.method, pay.reference, pay.created_at,
           p.id AS project_id, p.job_order_number, p.project_name,
           c.name AS customer_name, c.company AS customer_company,
           u.name AS recorded_by_name
    FROM payments pay
    LEFT JOIN projects p ON p.id = pay.project_id
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN users u ON u.id = pay.recorded_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY pay.paid_on DESC NULLS LAST, pay.id DESC
  `, params);

  // Filter by the project's payment status, if requested.
  if (status && ['unpaid', 'partial', 'paid'].includes(status)) {
    const bal = await projectBalances();
    const ok = new Set(bal.filter((b) => b.payment_status === status).map((b) => b.id));
    rows = rows.filter((r) => ok.has(r.project_id));
  }
  res.json(rows);
}));

// Record a payment.
app.post('/api/payments', auth, wrap(async (req, res) => {
  const { project_id, amount, method, reference, paid_on } = req.body;
  const amt = Number(amount);
  if (!project_id) return res.status(400).json({ error: 'Project is required' });
  if (!amt || amt <= 0) return res.status(400).json({ error: 'A positive amount is required' });
  const project = await get('SELECT id FROM projects WHERE id = ?', [project_id]);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const today = new Date().toISOString().slice(0, 10);
  const inserted = await run(`
    INSERT INTO payments (project_id, amount, method, reference, paid_on, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?) RETURNING id
  `, [project_id, amt, method || 'cash', reference || null, paid_on || today, req.user.id]);
  res.status(201).json({ id: inserted.rows[0].id });
}));

// Delete a payment (admin/finance — correction).
app.delete('/api/payments/:id', auth, wrap(async (req, res) => {
  if (!['admin', 'finance'].includes(req.user.role)) return res.status(403).json({ error: 'Only admin or finance can delete payments' });
  await run('DELETE FROM payments WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// EXPENSES — categorized business spending + finance summary/reporting
// ---------------------------------------------------------------------------
// Only admin/finance may add, edit or delete expenses.
function finGuard(req, res, next) {
  if (!['admin', 'finance'].includes(req.user?.role)) return res.status(403).json({ error: 'Only admin or finance can manage expenses' });
  next();
}

// Default expense categories (mirrors the frontend). Custom ones added in the
// form are persisted in app_settings so they show up next time.
const EXPENSE_DEFAULT_CATEGORIES = [
  'Fabric & Materials', 'Labor & Wages', 'Utilities', 'Rent', 'Equipment & Machine',
  'Delivery & Transport', 'Supplies', 'Marketing', 'Taxes & Fees', 'Miscellaneous',
];
async function readCustomCategories() {
  const row = await get("SELECT value FROM app_settings WHERE key='expense_categories'");
  try { return row ? JSON.parse(row.value) : []; } catch { return []; }
}
// Merged list: defaults, then saved custom, then any category already in use.
async function listExpenseCategories() {
  const custom = await readCustomCategories();
  const used = (await query('SELECT DISTINCT category FROM expenses WHERE category IS NOT NULL')).map((r) => r.category);
  const seen = new Set();
  const out = [];
  for (const c of [...EXPENSE_DEFAULT_CATEGORIES, ...custom, ...used]) {
    const name = (c || '').trim();
    if (name && !seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}
// Remember a newly-used category so it appears in the dropdown next time.
async function rememberCategory(name) {
  name = String(name || '').trim();
  if (!name || EXPENSE_DEFAULT_CATEGORIES.includes(name)) return;
  const custom = await readCustomCategories();
  if (custom.includes(name)) return;
  custom.push(name);
  const val = JSON.stringify(custom);
  const row = await get("SELECT value FROM app_settings WHERE key='expense_categories'");
  if (row) await run("UPDATE app_settings SET value=? WHERE key='expense_categories'", [val]);
  else await run("INSERT INTO app_settings (key, value) VALUES ('expense_categories', ?)", [val]);
}

// Category list for the expense form.
app.get('/api/expenses/categories', auth, wrap(async (req, res) => {
  res.json(await listExpenseCategories());
}));

// Add a custom category up-front (also happens automatically on save).
app.post('/api/expenses/categories', auth, finGuard, wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  await rememberCategory(name);
  res.status(201).json({ ok: true, categories: await listExpenseCategories() });
}));

// Staff names for the "Staff assigned" field — free-text names (not limited to
// app user accounts). Merges saved user names, custom names, and names in use.
async function readCustomStaff() {
  const row = await get("SELECT value FROM app_settings WHERE key='expense_staff'");
  try { return row ? JSON.parse(row.value) : []; } catch { return []; }
}
async function listExpenseStaff() {
  const [users, custom, used] = await Promise.all([
    query('SELECT name FROM users'),
    readCustomStaff(),
    query("SELECT DISTINCT staff_name FROM expenses WHERE staff_name IS NOT NULL AND staff_name <> ''"),
  ]);
  const seen = new Set();
  const out = [];
  for (const c of [...users.map((u) => u.name), ...custom, ...used.map((r) => r.staff_name)]) {
    const name = (c || '').trim();
    if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); out.push(name); }
  }
  return out.sort((a, b) => a.localeCompare(b));
}
async function rememberStaff(name) {
  name = String(name || '').trim();
  if (!name) return;
  const existing = await listExpenseStaff();
  if (existing.some((n) => n.toLowerCase() === name.toLowerCase())) return;
  const custom = await readCustomStaff();
  custom.push(name);
  const val = JSON.stringify(custom);
  const row = await get("SELECT value FROM app_settings WHERE key='expense_staff'");
  if (row) await run("UPDATE app_settings SET value=? WHERE key='expense_staff'", [val]);
  else await run("INSERT INTO app_settings (key, value) VALUES ('expense_staff', ?)", [val]);
}

// Staff name list for the expense form.
app.get('/api/expenses/staff', auth, wrap(async (req, res) => {
  res.json(await listExpenseStaff());
}));

// Add a staff name up-front (also happens automatically on save).
app.post('/api/expenses/staff', auth, finGuard, wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Staff name is required' });
  await rememberStaff(name);
  res.status(201).json({ ok: true, staff: await listExpenseStaff() });
}));

// Summary: totals, by-category, monthly trend, and net vs. collected income.
app.get('/api/expenses/summary', auth, wrap(async (req, res) => {
  const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [tot, month, byCat, byMonth] = await Promise.all([
    get('SELECT COALESCE(SUM(amount),0)::float AS total, COUNT(*)::int AS count FROM expenses'),
    get("SELECT COALESCE(SUM(amount),0)::float AS total FROM expenses WHERE to_char(spent_on,'YYYY-MM') = ?", [ym]),
    query('SELECT category, SUM(amount)::float AS total, COUNT(*)::int AS count FROM expenses GROUP BY category ORDER BY total DESC'),
    query("SELECT to_char(spent_on,'YYYY-MM') AS month, SUM(amount)::float AS total FROM expenses WHERE spent_on IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 6"),
  ]);
  // Income = payments collected (so finance can see net cash flow).
  const inc = await get('SELECT COALESCE(SUM(amount),0)::float AS total FROM payments');
  res.json({
    total: tot.total,
    count: tot.count,
    thisMonth: month.total,
    income: inc.total,
    net: inc.total - tot.total,
    byCategory: byCat,
    byMonth: byMonth.reverse(),
  });
}));

// List expenses (filters: from, to, category, method, project_id, staff_id).
app.get('/api/expenses', auth, wrap(async (req, res) => {
  const { from, to, category, method, project_id, staff } = req.query;
  const where = [];
  const params = [];
  if (from) { where.push('e.spent_on >= ?'); params.push(from); }
  if (to) { where.push('e.spent_on <= ?'); params.push(to); }
  if (category) { where.push('e.category = ?'); params.push(category); }
  if (method) { where.push('e.method = ?'); params.push(method); }
  if (project_id) { where.push('e.project_id = ?'); params.push(project_id); }
  if (staff) { where.push('COALESCE(e.staff_name, s.name) = ?'); params.push(staff); }
  const rows = await query(`
    SELECT e.id, e.category, e.description, e.amount::float AS amount, e.vendor, e.method,
           e.spent_on, e.created_at, e.project_id, p.job_order_number, p.project_name,
           COALESCE(e.staff_name, s.name) AS staff_name,
           u.name AS recorded_by_name
    FROM expenses e
    LEFT JOIN projects p ON p.id = e.project_id
    LEFT JOIN users s ON s.id = e.staff_id
    LEFT JOIN users u ON u.id = e.recorded_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY e.spent_on DESC NULLS LAST, e.id DESC
  `, params);
  res.json(rows);
}));

// Record an expense.
app.post('/api/expenses', auth, finGuard, wrap(async (req, res) => {
  const { category, description, amount, vendor, method, project_id, staff_name, spent_on } = req.body;
  const cat = String(category || '').trim();
  const staff = String(staff_name || '').trim() || null;
  const amt = Number(amount);
  if (!cat) return res.status(400).json({ error: 'Category is required' });
  if (!amt || amt <= 0) return res.status(400).json({ error: 'A positive amount is required' });
  const today = new Date().toISOString().slice(0, 10);
  const inserted = await run(`
    INSERT INTO expenses (category, description, amount, vendor, method, project_id, staff_name, spent_on, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
  `, [cat, description || null, amt, vendor || null, method || 'cash', project_id || null, staff, spent_on || today, req.user.id]);
  await rememberCategory(cat);
  if (staff) await rememberStaff(staff);
  res.status(201).json({ id: inserted.rows[0].id });
}));

// Edit an expense.
app.put('/api/expenses/:id', auth, finGuard, wrap(async (req, res) => {
  const { category, description, amount, vendor, method, project_id, staff_name, spent_on } = req.body;
  const cat = String(category || '').trim();
  const staff = String(staff_name || '').trim() || null;
  const amt = Number(amount);
  if (!cat) return res.status(400).json({ error: 'Category is required' });
  if (!amt || amt <= 0) return res.status(400).json({ error: 'A positive amount is required' });
  await run(`
    UPDATE expenses SET category=?, description=?, amount=?, vendor=?, method=?, project_id=?, staff_name=?, staff_id=NULL, spent_on=?
    WHERE id=?
  `, [cat, description || null, amt, vendor || null, method || 'cash', project_id || null, staff, spent_on || null, req.params.id]);
  await rememberCategory(cat);
  if (staff) await rememberStaff(staff);
  res.json({ ok: true });
}));

// Delete an expense.
app.delete('/api/expenses/:id', auth, finGuard, wrap(async (req, res) => {
  await run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// INVENTORY — items + IN/OUT stock transactions (per item, per size)
// ---------------------------------------------------------------------------
function invManage(req, res, next) {
  if (!['admin', 'purchasing'].includes(req.user.role)) return res.status(403).json({ error: 'Only admin or purchasing can manage inventory' });
  next();
}

app.get('/api/inventory/items', auth, wrap(async (req, res) => {
  res.json(await query('SELECT * FROM inventory_items ORDER BY category, name'));
}));

app.post('/api/inventory/items', auth, invManage, wrap(async (req, res) => {
  const { name, category, tracks_size, unit, low_stock_threshold } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'Name and category are required' });
  const r = await run(`
    INSERT INTO inventory_items (name, category, tracks_size, unit, low_stock_threshold)
    VALUES (?, ?, ?, ?, ?) RETURNING *
  `, [name.trim(), category, !!tracks_size, unit || 'pcs', Number(low_stock_threshold) || 10]);
  res.status(201).json(r.rows[0]);
}));

app.put('/api/inventory/items/:id', auth, invManage, wrap(async (req, res) => {
  const existing = await get('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const m = { ...existing };
  for (const f of ['name', 'category', 'tracks_size', 'unit', 'low_stock_threshold']) if (f in req.body) m[f] = req.body[f];
  await run('UPDATE inventory_items SET name=?, category=?, tracks_size=?, unit=?, low_stock_threshold=? WHERE id=?',
    [m.name, m.category, !!m.tracks_size, m.unit || 'pcs', Number(m.low_stock_threshold) || 10, req.params.id]);
  res.json(await get('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]));
}));

app.delete('/api/inventory/items/:id', auth, invManage, wrap(async (req, res) => {
  await run('DELETE FROM inventory_txns WHERE item_id = ?', [req.params.id]);
  await run('DELETE FROM inventory_items WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// Current stock per item per size (+ totals & low-stock flag).
app.get('/api/inventory/summary', auth, wrap(async (req, res) => {
  const items = await query('SELECT * FROM inventory_items ORDER BY category, name');
  const stockRows = await query(`
    SELECT item_id, COALESCE(size, '') AS size,
           SUM(CASE WHEN type = 'in' THEN qty ELSE -qty END)::int AS stock
    FROM inventory_txns GROUP BY item_id, COALESCE(size, '')
  `);
  const byItem = {};
  stockRows.forEach((r) => { (byItem[r.item_id] = byItem[r.item_id] || {})[r.size] = r.stock; });
  const out = items.map((it) => {
    const sizes = byItem[it.id] || {};
    const total = Object.values(sizes).reduce((a, b) => a + b, 0);
    return { ...it, sizes, total };
  });
  res.json(out);
}));

// Transaction history (filters: from, to, item_id, type, category).
app.get('/api/inventory/txns', auth, wrap(async (req, res) => {
  const { from, to, item_id, type, category } = req.query;
  const where = [];
  const params = [];
  if (from) { where.push('t.txn_date >= ?'); params.push(from); }
  if (to) { where.push('t.txn_date <= ?'); params.push(to); }
  if (item_id) { where.push('t.item_id = ?'); params.push(item_id); }
  if (type) { where.push('t.type = ?'); params.push(type); }
  if (category) { where.push('i.category = ?'); params.push(category); }
  const rows = await query(`
    SELECT t.id, t.size, t.qty, t.type, t.supplier, t.notes, t.txn_date, t.created_at,
           i.name AS item_name, i.category, i.unit,
           p.job_order_number, u.name AS recorded_by_name
    FROM inventory_txns t
    LEFT JOIN inventory_items i ON i.id = t.item_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.recorded_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.txn_date DESC NULLS LAST, t.id DESC
  `, params);
  res.json(rows);
}));

// Log a stock movement.
app.post('/api/inventory/txns', auth, wrap(async (req, res) => {
  const { item_id, size, qty, type, supplier, project_id, notes, txn_date } = req.body;
  const q = Number(qty);
  if (!item_id || !q || q <= 0) return res.status(400).json({ error: 'Item and a positive quantity are required' });
  if (!['in', 'out'].includes(type)) return res.status(400).json({ error: 'Type must be in or out' });
  const item = await get('SELECT * FROM inventory_items WHERE id = ?', [item_id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const today = new Date().toISOString().slice(0, 10);
  const r = await run(`
    INSERT INTO inventory_txns (item_id, size, qty, type, supplier, project_id, notes, txn_date, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
  `, [item_id, item.tracks_size ? (size || null) : null, q, type, supplier || null, project_id || null, notes || null, txn_date || today, req.user.id]);
  res.status(201).json({ id: r.rows[0].id });
}));

app.delete('/api/inventory/txns/:id', auth, invManage, wrap(async (req, res) => {
  await run('DELETE FROM inventory_txns WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Full-database backup / restore / reset (admin only).
// Backup is a JSON snapshot of every table; restore replaces all data with a
// snapshot; reset clears operational data but keeps user accounts + settings.
// ---------------------------------------------------------------------------
// Tables in foreign-key dependency order (parents first). Insert in this order
// on restore; delete in reverse.
const BACKUP_TABLES = [
  'users', 'customers', 'categories', 'projects',
  'project_logs', 'tasks', 'payments', 'expenses', 'inventory_items', 'inventory_txns', 'app_settings',
];
// Tables whose id sequence must be re-synced after a restore.
const SERIAL_TABLES = [
  'users', 'customers', 'categories', 'projects',
  'project_logs', 'tasks', 'payments', 'expenses', 'inventory_items', 'inventory_txns',
];
// Operational data cleared by a reset (reverse dependency order). Users,
// app_settings and categories are intentionally preserved so login + role
// permissions keep working after a reset.
const RESET_TABLES = [
  'inventory_txns', 'inventory_items', 'expenses', 'payments', 'tasks', 'project_logs', 'projects', 'customers',
];

// Download a full snapshot of the database.
app.get('/api/admin/backup', auth, admin, wrap(async (req, res) => {
  const tables = {};
  for (const t of BACKUP_TABLES) {
    tables[t] = await query(`SELECT * FROM ${t} ORDER BY ${t === 'app_settings' ? 'key' : 'id'}`);
  }
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  res.json({ app: 'efs-garments', version: 1, exported_at: new Date().toISOString(), counts, tables });
}));

// Replace ALL data with the contents of a backup file.
app.post('/api/admin/restore', auth, admin, wrap(async (req, res) => {
  const backup = req.body;
  if (!backup || typeof backup !== 'object' || !backup.tables || typeof backup.tables !== 'object') {
    return res.status(400).json({ error: 'Invalid backup file (missing "tables").' });
  }
  const data = backup.tables;
  // Only accept tables we know about; ignore anything unexpected.
  const unknown = Object.keys(data).filter((t) => !BACKUP_TABLES.includes(t));
  if (unknown.length) return res.status(400).json({ error: `Unknown table(s) in backup: ${unknown.join(', ')}` });

  const client = await pool.connect();
  const counts = {};
  try {
    await client.query('BEGIN');
    // Clear everything (reverse dependency order).
    for (const t of [...BACKUP_TABLES].reverse()) await client.query(`DELETE FROM ${t}`);
    // Re-insert (dependency order).
    for (const t of BACKUP_TABLES) {
      const rows = Array.isArray(data[t]) ? data[t] : [];
      counts[t] = rows.length;
      for (const row of rows) {
        const cols = Object.keys(row);
        if (!cols.length) continue;
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
          cols.map((c) => row[c])
        );
      }
    }
    // Re-sync id sequences so future inserts don't collide.
    for (const t of SERIAL_TABLES) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${t}), 1))`
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Restore failed:', e);
    return res.status(500).json({ error: `Restore failed: ${e.message}` });
  } finally {
    client.release();
  }
  res.json({ ok: true, restored: counts });
}));

// Wipe operational data to start fresh (keeps users + settings + categories).
app.post('/api/admin/reset', auth, admin, wrap(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of RESET_TABLES) await client.query(`DELETE FROM ${t}`);
    for (const t of RESET_TABLES) {
      await client.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), 1, false)`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Reset failed:', e);
    return res.status(500).json({ error: `Reset failed: ${e.message}` });
  } finally {
    client.release();
  }
  res.json({ ok: true, cleared: RESET_TABLES });
}));

// ---------------------------------------------------------------------------
// Serve built frontend (used when running locally; on Vercel the static
// files are served by the platform and only /api/* reaches this function).
// ---------------------------------------------------------------------------
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).end();
  });
});

// JSON error handler.
app.use((err, req, res, next) => {
  console.error('API error:', err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;
