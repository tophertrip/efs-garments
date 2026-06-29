// Backfill sample project names + details on existing projects so the UI
// shows realistic data. Only fills EMPTY fields — never overwrites real data.
require('dotenv').config();
const { pool } = require('./db');

const PREFIX = ['2026', 'Summer', 'Fiesta', 'Anniversary', 'Christmas', 'Intramurals', 'Founding Day', 'Reunion', 'Season', 'Championship'];
const ITEMS = {
  sportswear: ['Basketball Jersey Set', 'Volleyball Uniforms', 'Football Kit', 'Esports Jerseys', 'Track Suits'],
  activewear: ['Running Singlets', 'Gym Leggings', 'Dri-Fit Shirts', 'Cycling Jersey Set', 'Yoga Wear'],
  corporate: ['Corporate Polo Shirts', 'Office Uniforms', 'Company Jackets', 'Staff Vests', 'Event Shirts'],
  school: ['PE Uniforms', 'School Polos', 'Graduation Shirts', 'Org T-Shirts', 'Intrams Jerseys'],
  _default: ['Custom Apparel Order', 'Printed Shirts', 'Uniform Batch', 'Merch Set', 'Team Wear'],
};
const REMARKS = [
  '50% downpayment received; balance on delivery.',
  'Rush order — prioritize production.',
  'Repeat client — use previous design as reference.',
  'For pickup at the Cebu branch.',
  'Client to confirm final colors before printing.',
  'Includes free sample piece for approval.',
];
const FABRICS = ['Dri-Fit', 'Cotton', 'Piqué', 'Sublimation polyester', 'CVC blend'];

const pick = (arr, i) => arr[i % arr.length];

function sizesLine(qty, seed) {
  // Split quantity into a plausible size run.
  const sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL'];
  let left = qty;
  const parts = [];
  sizes.forEach((s, idx) => {
    if (left <= 0) return;
    const take = idx === sizes.length - 1 ? left : Math.max(1, Math.round(qty / (4 + ((seed + idx) % 3))));
    const n = Math.min(take, left);
    if (n > 0) { parts.push(`${s}-${n}`); left -= n; }
  });
  if (left > 0 && parts.length) parts[parts.length - 1] = parts[parts.length - 1].replace(/-(\d+)$/, (m, x) => `-${Number(x) + left}`);
  return parts.join(', ');
}

async function main() {
  const projects = (await pool.query('SELECT * FROM projects ORDER BY id')).rows;
  let updated = 0;
  for (const p of projects) {
    const i = p.id;
    const items = ITEMS[p.category] || ITEMS._default;
    const item = pick(items, i);
    const projectName = `${pick(PREFIX, i)} ${item}`;
    const description = `${pick(FABRICS, i)} ${item.toLowerCase()}, ${p.quantity} pcs`;
    const designNotes = `Sizes: ${sizesLine(p.quantity, i)}. Colors per brand kit, logo on left chest, names/numbers at back.`;
    const remarks = pick(REMARKS, i);
    const fileUrl = `https://drive.google.com/efs-design/${p.job_order_number}`;

    const next = {
      project_name: (p.project_name && p.project_name.trim()) ? p.project_name : projectName,
      description: (p.description && p.description.trim()) ? p.description : description,
      design_notes: (p.design_notes && p.design_notes.trim()) ? p.design_notes : designNotes,
      remarks: (p.remarks && p.remarks.trim()) ? p.remarks : remarks,
      design_file_url: (p.design_file_url && p.design_file_url.trim()) ? p.design_file_url : fileUrl,
    };

    await pool.query(
      'UPDATE projects SET project_name=$1, description=$2, design_notes=$3, remarks=$4, design_file_url=$5 WHERE id=$6',
      [next.project_name, next.description, next.design_notes, next.remarks, next.design_file_url, p.id]
    );
    updated += 1;
  }
  console.log(`Backfilled details on ${updated} projects.`);
  const sample = (await pool.query('SELECT job_order_number, project_name FROM projects ORDER BY id LIMIT 8')).rows;
  sample.forEach((s) => console.log(`  ${s.job_order_number}: ${s.project_name}`));
  await pool.end();
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
