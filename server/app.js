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
app.use(express.json());

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
  admin: ['dashboard', 'projects', 'calendar', 'customers', 'reports', 'tasks'],
  marketing: ['dashboard', 'projects', 'calendar', 'customers', 'tasks'],
  finance: ['projects', 'calendar', 'customers', 'reports', 'tasks'],
  purchasing: ['calendar', 'tasks'],
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
    customer_id, category, description, quantity, unit_price,
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
      (job_order_number, customer_id, category, description, quantity, unit_price,
       total_amount, target_date, design_notes, remarks, design_file_url, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inquiry')
    RETURNING id
  `, [
    job_order_number, customer_id, category, description || null, quantity,
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

  const fields = ['customer_id', 'category', 'description', 'quantity', 'unit_price',
    'target_date', 'design_notes', 'remarks', 'design_file_url', 'priority'];
  const merged = { ...existing };
  for (const f of fields) if (f in req.body) merged[f] = req.body[f];
  merged.total_amount = (Number(merged.unit_price) || 0) * (Number(merged.quantity) || 0);

  await run(`
    UPDATE projects SET
      customer_id=?, category=?, description=?, quantity=?, unit_price=?,
      total_amount=?, target_date=?, design_notes=?, remarks=?, design_file_url=?,
      priority=?, updated_at=now()
    WHERE id=?
  `, [
    merged.customer_id, merged.category, merged.description, merged.quantity,
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

  const activeStatuses = "('inquiry','quotation','confirmed','purchasing','printing','cutting_sewing','qa','ready')";

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
    `SELECT COUNT(*)::int AS n FROM projects WHERE status IN ('delivered','paid') AND updated_at >= ?`, [monthStart]
  );

  const byStageRows = await query('SELECT status, COUNT(*)::int AS n FROM projects GROUP BY status');
  const byStage = {};
  STAGE_KEYS.forEach((k) => { byStage[k] = 0; });
  byStageRows.forEach((r) => { byStage[r.status] = r.n; });

  res.json({ totalActive, dueThisWeek, overdue, completedThisMonth, byStage });
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
  else if (status === 'paid') where.push(`p.status = 'paid'`);
  else if (status === 'active') where.push(`p.status NOT IN ('delivered','paid')`);
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
      keyExpr = `c.name`;
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
