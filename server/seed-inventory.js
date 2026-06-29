// Seed sample inventory items + stock movements so the Inventory module has
// realistic data. Idempotent: skips entirely if any inventory items exist.
require('dotenv').config();
const { pool } = require('./db');

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// Items: [name, category, tracks_size, unit, low_stock_threshold]
const ITEMS = [
  ['Dri-fit Fabric (Navy)', 'Raw Materials', false, 'rolls', 5],
  ['Dri-fit Fabric (White)', 'Raw Materials', false, 'rolls', 5],
  ['Cotton Fabric (Black)', 'Raw Materials', false, 'rolls', 5],
  ['Polyester Thread (assorted)', 'Raw Materials', false, 'spools', 20],
  ['Sublimation Ink (CMYK set)', 'Raw Materials', false, 'sets', 4],
  ['Blank Round-neck Shirts', 'Blank Garments', true, 'pcs', 15],
  ['Blank Polo Shirts', 'Blank Garments', true, 'pcs', 15],
  ['Blank Shorts', 'Blank Garments', true, 'pcs', 12],
  ['YKK Zippers (#5)', 'Accessories', false, 'pcs', 50],
  ['Buttons (18L, white)', 'Accessories', false, 'pcs', 100],
  ['Poly Mailer Bags', 'Packaging', false, 'pcs', 50],
  ['Hang Tags (printed)', 'Packaging', false, 'pcs', 100],
  ['Company Uniform Polo', 'Uniforms', true, 'pcs', 10],
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Deterministic pseudo-random so re-seeds (after a manual clear) are stable.
function rng(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

async function main() {
  const existing = (await pool.query('SELECT count(*)::int AS n FROM inventory_items')).rows[0].n;
  if (existing > 0) { console.log(`Inventory already has ${existing} items — skipping seed.`); await pool.end(); return; }

  const adminId = (await pool.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1")).rows[0]?.id || null;
  const purchasingId = (await pool.query("SELECT id FROM users WHERE role='purchasing' ORDER BY id LIMIT 1")).rows[0]?.id || adminId;
  const projects = (await pool.query("SELECT id FROM projects WHERE status NOT IN ('inquiry','quotation') ORDER BY id")).rows.map((r) => r.id);
  const suppliers = ['Divisoria Textile Hub', 'Manila Trims & Supplies', 'JJ Fabrics Cebu', 'Cebu Garment Supply', 'Online — Shopee bulk'];

  const rand = rng(42);
  let txnCount = 0;

  for (let idx = 0; idx < ITEMS.length; idx++) {
    const [name, category, tracksSize, unit, threshold] = ITEMS[idx];
    const r = await pool.query(
      'INSERT INTO inventory_items (name, category, tracks_size, unit, low_stock_threshold) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, category, tracksSize, unit, threshold]
    );
    const itemId = r.rows[0].id;
    const supplier = suppliers[idx % suppliers.length];

    if (tracksSize) {
      // Receive a starting batch per common size; leave some sizes intentionally low.
      for (const size of SIZES) {
        const qtyIn = Math.round(threshold + rand() * 60);
        await pool.query(
          'INSERT INTO inventory_txns (item_id, size, qty, type, supplier, txn_date, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [itemId, size, qtyIn, 'in', supplier, daysAgo(40 - idx), purchasingId]
        );
        txnCount++;
        // Consume some toward a project.
        if (projects.length && rand() > 0.4) {
          const qtyOut = Math.round(rand() * qtyIn * 0.7);
          if (qtyOut > 0) {
            await pool.query(
              'INSERT INTO inventory_txns (item_id, size, qty, type, project_id, notes, txn_date, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
              [itemId, size, qtyOut, 'out', projects[(idx + SIZES.indexOf(size)) % projects.length], 'Consumed for production', daysAgo(15 - (idx % 10)), purchasingId]
            );
            txnCount++;
          }
        }
      }
    } else {
      const qtyIn = Math.round(threshold * 2 + rand() * 200);
      await pool.query(
        'INSERT INTO inventory_txns (item_id, size, qty, type, supplier, txn_date, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [itemId, null, qtyIn, 'in', supplier, daysAgo(40 - idx), purchasingId]
      );
      txnCount++;
      if (projects.length && rand() > 0.3) {
        const qtyOut = Math.round(rand() * qtyIn * 0.6);
        if (qtyOut > 0) {
          await pool.query(
            'INSERT INTO inventory_txns (item_id, size, qty, type, project_id, notes, txn_date, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [itemId, null, qtyOut, 'out', projects[idx % projects.length], 'Used in production', daysAgo(10 + (idx % 8)), purchasingId]
          );
          txnCount++;
        }
      }
    }
  }
  console.log(`Seeded ${ITEMS.length} inventory items and ${txnCount} stock transactions.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
