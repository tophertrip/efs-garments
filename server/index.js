// EFS Garments Manufacturing — Express REST API
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { STAGES, STAGE_KEYS, nextStage, stageMeta } = require('./stages');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

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

// ---------------------------------------------------------------------------
// Helper: hydrate a project row with customer name + derived fields
// ---------------------------------------------------------------------------
function getProjectFull(id) {
  const project = db.prepare(`
    SELECT p.*, c.name AS customer_name, c.contact AS customer_contact,
           c.messenger_name AS customer_messenger
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.id = ?
  `).get(id);
  if (!project) return null;
  project.logs = db.prepare(`
    SELECT l.*, u.name AS changed_by_name
    FROM project_logs l
    LEFT JOIN users u ON u.id = l.changed_by
    WHERE l.project_id = ?
    ORDER BY l.created_at ASC, l.id ASC
  `).all(id);
  project.tasks = db.prepare(`
    SELECT t.*, u.name AS assigned_name, u.role AS assigned_role
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.project_id = ?
    ORDER BY t.is_done ASC, t.due_date ASC
  `).all(id);
  return project;
}

// Auto-create a task for the team that owns a given stage.
function createStageTask(project, stageKey, byUserId) {
  const meta = stageMeta(stageKey);
  if (!meta) return;
  const owner = db.prepare('SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1').get(meta.owner);
  db.prepare(`
    INSERT INTO tasks (project_id, assigned_to, title, description, due_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    project.id,
    owner ? owner.id : null,
    `${meta.label}: ${project.job_order_number}`,
    `${project.description || 'Job order'} — Qty ${project.quantity}. Advance when ${meta.label.toLowerCase()} is complete.`,
    project.target_date
  );
}

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });
  const user = db.prepare('SELECT * FROM users WHERE pin = ?').get(String(pin));
  if (!user) return res.status(401).json({ error: 'Invalid PIN' });
  res.json({
    token: makeToken(user),
    user: { id: user.id, name: user.name, role: user.role },
  });
});

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

app.get('/api/categories', (req, res) => {
  const rows = db.prepare('SELECT slug, name FROM categories ORDER BY name ASC').all();
  res.json(rows.map((r) => ({ key: r.slug, label: r.name })));
});

app.post('/api/categories', auth, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Category name required' });
  const slug = slugify(name);
  if (!slug) return res.status(400).json({ error: 'Invalid category name' });

  // If a category with this slug already exists, just return it (idempotent).
  const existing = db.prepare('SELECT slug, name FROM categories WHERE slug = ?').get(slug);
  if (existing) return res.status(200).json({ key: existing.slug, label: existing.name });

  db.prepare('INSERT INTO categories (slug, name) VALUES (?, ?)').run(slug, name);
  res.status(201).json({ key: slug, label: name });
});

// ---------------------------------------------------------------------------
// PROJECTS
// ---------------------------------------------------------------------------
app.get('/api/projects', auth, (req, res) => {
  const { status, category, from, to, search } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('p.status = ?'); params.push(status); }
  if (category) { where.push('p.category = ?'); params.push(category); }
  if (from) { where.push('p.target_date >= ?'); params.push(from); }
  if (to) { where.push('p.target_date <= ?'); params.push(to); }
  if (search) {
    where.push('(c.name LIKE ? OR p.job_order_number LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const rows = db.prepare(`
    SELECT p.*, c.name AS customer_name
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.created_at DESC
  `).all(...params);
  res.json(rows);
});

app.get('/api/projects/:id', auth, (req, res) => {
  const project = getProjectFull(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

app.post('/api/projects', auth, (req, res) => {
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
  const last = db.prepare(
    "SELECT job_order_number FROM projects WHERE job_order_number LIKE ? ORDER BY job_order_number DESC LIMIT 1"
  ).get(`${prefix}%`);
  let seq = 1;
  if (last) seq = parseInt(last.job_order_number.slice(prefix.length), 10) + 1;
  const job_order_number = `${prefix}${String(seq).padStart(3, '0')}`;

  const total_amount = (Number(unit_price) || 0) * (Number(quantity) || 0);

  const info = db.prepare(`
    INSERT INTO projects
      (job_order_number, customer_id, category, description, quantity, unit_price,
       total_amount, target_date, design_notes, remarks, design_file_url, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inquiry')
  `).run(
    job_order_number, customer_id, category, description || null, quantity,
    unit_price || null, total_amount, target_date, design_notes || null,
    remarks || null, design_file_url || null, priority || 'normal'
  );

  db.prepare(`
    INSERT INTO project_logs (project_id, from_status, to_status, changed_by, notes)
    VALUES (?, NULL, 'inquiry', ?, 'Project created')
  `).run(info.lastInsertRowid, req.user.id);

  res.status(201).json(getProjectFull(info.lastInsertRowid));
});

app.put('/api/projects/:id', auth, (req, res) => {
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  const fields = ['customer_id', 'category', 'description', 'quantity', 'unit_price',
    'target_date', 'design_notes', 'remarks', 'design_file_url', 'priority'];
  const merged = { ...existing };
  for (const f of fields) if (f in req.body) merged[f] = req.body[f];
  merged.total_amount = (Number(merged.unit_price) || 0) * (Number(merged.quantity) || 0);

  db.prepare(`
    UPDATE projects SET
      customer_id=?, category=?, description=?, quantity=?, unit_price=?,
      total_amount=?, target_date=?, design_notes=?, remarks=?, design_file_url=?,
      priority=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    merged.customer_id, merged.category, merged.description, merged.quantity,
    merged.unit_price, merged.total_amount, merged.target_date, merged.design_notes,
    merged.remarks, merged.design_file_url, merged.priority, req.params.id
  );
  res.json(getProjectFull(req.params.id));
});

// Advance to next stage (or jump to a specific status if provided)
app.put('/api/projects/:id/status', auth, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const target = req.body.status || nextStage(project.status);
  if (!target) return res.status(400).json({ error: 'Project is already at the final stage' });
  if (!STAGE_KEYS.includes(target)) return res.status(400).json({ error: 'Unknown status' });

  const from = project.status;
  db.prepare('UPDATE projects SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(target, req.params.id);
  db.prepare(`
    INSERT INTO project_logs (project_id, from_status, to_status, changed_by, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, from, target, req.user.id, req.body.notes || null);

  // Auto-create a task for the team that owns the new stage.
  createStageTask(project, target, req.user.id);

  res.json(getProjectFull(req.params.id));
});

// Delete a project (and its logs + tasks).
app.delete('/api/projects/:id', auth, (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const removeAll = db.transaction((id) => {
    db.prepare('DELETE FROM tasks WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM project_logs WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  });
  removeAll(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------------------------
app.get('/api/customers', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, COUNT(p.id) AS project_count
    FROM customers c
    LEFT JOIN projects p ON p.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all();
  res.json(rows);
});

app.post('/api/customers', auth, (req, res) => {
  const { company, name, contact, messenger_name, source } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const info = db.prepare(`
    INSERT INTO customers (company, name, contact, messenger_name, source)
    VALUES (?, ?, ?, ?, ?)
  `).run(company || null, name, contact || null, messenger_name || null, source || 'facebook');
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid));
});

// Delete a customer — blocked while they still have job orders, to avoid orphans.
app.delete('/api/customers/:id', auth, (req, res) => {
  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const count = db.prepare('SELECT COUNT(*) AS n FROM projects WHERE customer_id = ?').get(req.params.id).n;
  if (count > 0) {
    return res.status(409).json({ error: `Cannot delete: this customer has ${count} project${count !== 1 ? 's' : ''}. Delete or reassign them first.` });
  }
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// USERS (for assigning tasks)
// ---------------------------------------------------------------------------
app.get('/api/users', auth, (req, res) => {
  res.json(db.prepare('SELECT id, name, role FROM users ORDER BY name').all());
});

// ---------------------------------------------------------------------------
// TASKS
// ---------------------------------------------------------------------------
app.get('/api/tasks', auth, (req, res) => {
  const { assigned_to, project_id, done } = req.query;
  const where = [];
  const params = [];
  if (assigned_to) { where.push('t.assigned_to = ?'); params.push(assigned_to); }
  if (project_id) { where.push('t.project_id = ?'); params.push(project_id); }
  if (done === '0' || done === '1') { where.push('t.is_done = ?'); params.push(Number(done)); }
  const rows = db.prepare(`
    SELECT t.*, u.name AS assigned_name, u.role AS assigned_role,
           p.job_order_number, c.name AS customer_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN customers c ON c.id = p.customer_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.is_done ASC, t.due_date ASC, t.id DESC
  `).all(...params);
  res.json(rows);
});

app.post('/api/tasks', auth, (req, res) => {
  const { project_id, assigned_to, title, description, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const info = db.prepare(`
    INSERT INTO tasks (project_id, assigned_to, title, description, due_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(project_id || null, assigned_to || null, title, description || null, due_date || null);
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/tasks/:id/done', auth, (req, res) => {
  const done = req.body.is_done === undefined ? 1 : Number(req.body.is_done);
  db.prepare('UPDATE tasks SET is_done = ? WHERE id = ?').run(done, req.params.id);
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
app.get('/api/dashboard', auth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  // Week boundary (next 7 days)
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);
  const weekStr = weekAhead.toISOString().slice(0, 10);

  // Month boundary (first day of current month)
  const monthStart = today.slice(0, 8) + '01';

  const activeStatuses = "('inquiry','quotation','confirmed','purchasing','printing','cutting_sewing','qa','ready')";

  const totalActive = db.prepare(
    `SELECT COUNT(*) AS n FROM projects WHERE status IN ${activeStatuses}`
  ).get().n;

  const dueThisWeek = db.prepare(
    `SELECT COUNT(*) AS n FROM projects WHERE status IN ${activeStatuses}
     AND target_date >= ? AND target_date <= ?`
  ).get(today, weekStr).n;

  const overdue = db.prepare(
    `SELECT COUNT(*) AS n FROM projects WHERE status IN ${activeStatuses} AND target_date < ?`
  ).get(today).n;

  const completedThisMonth = db.prepare(
    `SELECT COUNT(*) AS n FROM projects WHERE status = 'delivered' AND updated_at >= ?`
  ).get(monthStart).n;

  const byStageRows = db.prepare('SELECT status, COUNT(*) AS n FROM projects GROUP BY status').all();
  const byStage = {};
  STAGE_KEYS.forEach((k) => { byStage[k] = 0; });
  byStageRows.forEach((r) => { byStage[r.status] = r.n; });

  res.json({ totalActive, dueThisWeek, overdue, completedThisMonth, byStage });
});

// ---------------------------------------------------------------------------
// REPORTS — flexible aggregation grouped by time period / product / customer …
//   GET /api/reports?groupBy=month&dateField=created&from=&to=&status=
//   groupBy   : year | month | week | category | customer | status | priority
//   dateField : created (order date) | target (target date)
//   status    : all | active | delivered
// ---------------------------------------------------------------------------
app.get('/api/reports', auth, (req, res) => {
  const { groupBy = 'month', dateField = 'created', from, to, status = 'all' } = req.query;

  const dateCol = dateField === 'target' ? 'p.target_date' : 'p.created_at';

  const where = [];
  const params = [];
  if (from) { where.push(`date(${dateCol}) >= date(?)`); params.push(from); }
  if (to) { where.push(`date(${dateCol}) <= date(?)`); params.push(to); }
  if (status === 'delivered') where.push(`p.status = 'delivered'`);
  else if (status === 'active') where.push(`p.status != 'delivered'`);
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  // Build the grouping key + whether it's a time series (chronological) bucket.
  let keyExpr;
  let joinSql = '';
  let chronological = false;
  switch (groupBy) {
    case 'year':     keyExpr = `strftime('%Y', ${dateCol})`;      chronological = true; break;
    case 'week':     keyExpr = `strftime('%Y-W%W', ${dateCol})`;  chronological = true; break;
    case 'category': keyExpr = `p.category`; break;
    case 'status':   keyExpr = `p.status`; break;
    case 'priority': keyExpr = `p.priority`; break;
    case 'customer':
      keyExpr = `c.name`;
      joinSql = 'LEFT JOIN customers c ON c.id = p.customer_id';
      break;
    case 'month':
    default:         keyExpr = `strftime('%Y-%m', ${dateCol})`;   chronological = true; break;
  }

  const orderSql = chronological ? 'gkey ASC' : 'revenue DESC, orders DESC';

  const rows = db.prepare(`
    SELECT ${keyExpr} AS gkey,
           COUNT(*) AS orders,
           COALESCE(SUM(p.quantity), 0) AS units,
           COALESCE(SUM(p.total_amount), 0) AS revenue
    FROM projects p
    ${joinSql}
    ${whereSql}
    GROUP BY gkey
    ORDER BY ${orderSql}
  `).all(...params).map((r) => ({ key: r.gkey ?? '—', orders: r.orders, units: r.units, revenue: r.revenue }));

  const summary = db.prepare(`
    SELECT COUNT(*) AS orders,
           COALESCE(SUM(p.quantity), 0) AS units,
           COALESCE(SUM(p.total_amount), 0) AS revenue
    FROM projects p
    ${joinSql}
    ${whereSql}
  `).get(...params);
  summary.avgOrderValue = summary.orders ? summary.revenue / summary.orders : 0;

  res.json({ groupBy, dateField, from: from || null, to: to || null, status, chronological, summary, rows });
});

// ---------------------------------------------------------------------------
// Serve built frontend in production
// ---------------------------------------------------------------------------
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).end();
  });
});

app.listen(PORT, () => {
  console.log(`EFS API listening on http://localhost:${PORT}`);
});
