// Insert sample (back-dated) projects for Jan–May of the current year so the
// Owners Dashboard charts have multi-month data. Idempotent: it clears and
// re-creates only the Jan–May sample range, leaving everything else untouched.
require('dotenv').config();
const { pool } = require('./db');

const YEAR = 2026;
const CATS = ['sportswear', 'activewear', 'corporate', 'school'];
const DESCS = [
  'Basketball jersey set', 'Corporate polo shirts', 'School PE uniforms',
  'Fun-run event singlets', 'Hoodies batch', 'Volleyball uniforms',
  'Embroidered caps', 'Activewear leggings',
];
const pick = (arr, i) => arr[i % arr.length];

// Projects per month (a gentle upward trend looks good on the chart).
const PLAN = [
  { m: 1, count: 3 },
  { m: 2, count: 4 },
  { m: 3, count: 4 },
  { m: 4, count: 5 },
  { m: 5, count: 6 },
];

async function main() {
  const custs = (await pool.query('SELECT id FROM customers ORDER BY id')).rows.map((r) => r.id);
  if (!custs.length) { console.error('No customers found — run the main seed first.'); process.exit(1); }
  const adminId = (await pool.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")).rows[0]?.id || null;

  const range = [`${YEAR}-01-01`, `${YEAR}-05-31`];

  // Clear previous samples in the Jan–May window (and their logs/tasks).
  await pool.query("DELETE FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE created_at::date BETWEEN $1 AND $2)", range);
  await pool.query("DELETE FROM project_logs WHERE project_id IN (SELECT id FROM projects WHERE created_at::date BETWEEN $1 AND $2)", range);
  await pool.query("DELETE FROM projects WHERE created_at::date BETWEEN $1 AND $2", range);

  // Continue the EFS-YYYY-NNN numbering after the current max.
  const maxRow = (await pool.query(
    "SELECT job_order_number FROM projects WHERE job_order_number LIKE $1 ORDER BY job_order_number DESC LIMIT 1",
    [`EFS-${YEAR}-%`]
  )).rows[0];
  let seq = maxRow ? parseInt(maxRow.job_order_number.slice(`EFS-${YEAR}-`.length), 10) : 0;

  let n = 0;
  for (const mo of PLAN) {
    const mm = String(mo.m).padStart(2, '0');
    for (let i = 0; i < mo.count; i++) {
      seq += 1;
      const jo = `EFS-${YEAR}-${String(seq).padStart(3, '0')}`;
      const cat = pick(CATS, n);
      const qty = 30 + ((n * 41) % 220);          // ~30–250
      const price = 350 + ((n * 47) % 360);        // ~350–700
      const total = qty * price;
      const day = String(((i * 5) % 25) + 2).padStart(2, '0');
      const createdAt = `${YEAR}-${mm}-${day} 10:00:00+00`;
      const target = `${YEAR}-${mm}-28`;
      const status = (n % 4 === 0) ? 'paid' : 'delivered';

      const r = await pool.query(`
        INSERT INTO projects
          (job_order_number, customer_id, category, description, quantity, unit_price,
           total_amount, target_date, status, priority, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'normal',$10::timestamptz,$10::timestamptz)
        RETURNING id
      `, [jo, pick(custs, n), cat, `${pick(DESCS, n)} (sample)`, qty, price, total, target, status, createdAt]);

      await pool.query(
        "INSERT INTO project_logs (project_id, from_status, to_status, changed_by, notes, created_at) VALUES ($1, NULL, 'inquiry', $2, 'Created (sample)', $3::timestamptz)",
        [r.rows[0].id, adminId, createdAt]
      );
      n += 1;
    }
  }

  // Report the per-month totals.
  const rows = (await pool.query(`
    SELECT EXTRACT(MONTH FROM created_at::date)::int AS m,
           COUNT(*)::int AS projects,
           COALESCE(SUM(quantity),0)::int AS pieces,
           COALESCE(SUM(total_amount),0)::float AS sales
    FROM projects WHERE created_at::date BETWEEN $1 AND $2 GROUP BY m ORDER BY m
  `, range)).rows;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];
  console.log(`Inserted ${n} sample projects (Jan–May ${YEAR}):`);
  rows.forEach((r) => console.log(`  ${MONTHS[r.m - 1]}: ${r.projects} projects, ${r.pieces} pcs, ₱${r.sales.toLocaleString()}`));
  await pool.end();
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
