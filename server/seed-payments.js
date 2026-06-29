// Seed sample payments across confirmed projects so collections data is
// realistic. Idempotent: clears all payments first, then re-creates samples.
require('dotenv').config();
const { pool } = require('./db');

const METHODS = ['cash', 'gcash', 'bank_transfer', 'gcash', 'cash'];
const pick = (arr, i) => arr[i % arr.length];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const adminId = (await pool.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1")).rows[0]?.id || null;
  const financeId = (await pool.query("SELECT id FROM users WHERE role='finance' ORDER BY id LIMIT 1")).rows[0]?.id || adminId;

  // Confirmed projects only (past quotation).
  const projects = (await pool.query(`
    SELECT id, job_order_number, total_amount::float AS total, status
    FROM projects WHERE status NOT IN ('inquiry','quotation') ORDER BY id
  `)).rows;

  await pool.query('DELETE FROM payments');

  let count = 0, fully = 0, partial = 0, unpaid = 0;
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const total = p.total || 0;
    if (!total) { unpaid++; continue; }

    // Paid-stage projects are fully paid; others get a realistic mix.
    let mode;
    if (p.status === 'paid') mode = 'full';
    else if (p.status === 'for_payment') mode = (i % 2 === 0) ? 'partial' : 'full';
    else mode = ['full', 'partial', 'none'][i % 3];

    const by = (i % 2 === 0) ? financeId : adminId;
    if (mode === 'full') {
      await pool.query(
        'INSERT INTO payments (project_id, amount, method, reference, paid_on, recorded_by) VALUES ($1,$2,$3,$4,$5,$6)',
        [p.id, total, pick(METHODS, i), `REF-${p.job_order_number}`, daysAgo(10 + (i % 40)), by]
      );
      count++; fully++;
    } else if (mode === 'partial') {
      // 50% down now, plus a smaller second installment for variety.
      const down = Math.round(total * 0.5);
      await pool.query(
        'INSERT INTO payments (project_id, amount, method, reference, paid_on, recorded_by) VALUES ($1,$2,$3,$4,$5,$6)',
        [p.id, down, pick(METHODS, i), `DP-${p.job_order_number}`, daysAgo(25 + (i % 30)), by]
      );
      count++;
      if (i % 3 === 0) {
        const second = Math.round(total * 0.2);
        await pool.query(
          'INSERT INTO payments (project_id, amount, method, reference, paid_on, recorded_by) VALUES ($1,$2,$3,$4,$5,$6)',
          [p.id, second, pick(METHODS, i + 1), `2ND-${p.job_order_number}`, daysAgo(8 + (i % 15)), by]
        );
        count++;
      }
      partial++;
    } else {
      unpaid++;
    }
  }

  const collected = (await pool.query('SELECT COALESCE(SUM(amount),0)::float AS n FROM payments')).rows[0].n;
  console.log(`Inserted ${count} payments across ${projects.length} confirmed projects.`);
  console.log(`  Fully paid: ${fully} · Partial: ${partial} · Unpaid: ${unpaid}`);
  console.log(`  Total collected: ₱${Number(collected).toLocaleString()}`);
  await pool.end();
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
