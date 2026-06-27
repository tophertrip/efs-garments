// Seed the Postgres database with sample users, customers, and projects.
require('dotenv').config();
const { pool } = require('./db');

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  // Reset data (keep schema + default categories). Restart identity sequences.
  await pool.query(`
    TRUNCATE tasks, project_logs, projects, customers, users RESTART IDENTITY CASCADE;
  `);

  // --- Users -------------------------------------------------------------
  const users = {};
  const userRows = [
    ['Admin Long', 'admin', '1234'],
    ['Purchasing Bee', 'purchasing', '2222'],
    ['Printing Ton', 'printing', '3333'],
    ['Ate Sew', 'cutting_sewing', '5555'],
    ['QA Ches', 'qa', '4444'],
  ];
  for (const [name, role, pin] of userRows) {
    const r = await pool.query('INSERT INTO users (name, role, pin) VALUES ($1,$2,$3) RETURNING id', [name, role, pin]);
    users[role] = r.rows[0].id;
  }

  // --- Customers ---------------------------------------------------------
  const customers = [];
  const customerRows = [
    ['Cebu City Sports Club', '0917-555-0101', 'Cebu Sports', 'facebook'],
    ['St. Mary Academy', '0918-555-0202', 'St Mary Admin', 'referral'],
    ['Highland Corporate Inc.', '0920-555-0303', 'Highland HR', 'instagram'],
  ];
  for (const [name, contact, messenger, source] of customerRows) {
    const r = await pool.query(
      'INSERT INTO customers (name, contact, messenger_name, source) VALUES ($1,$2,$3,$4) RETURNING id',
      [name, contact, messenger, source]
    );
    customers.push(r.rows[0].id);
  }

  // --- Projects ----------------------------------------------------------
  const sampleProjects = [
    {
      job_order_number: 'EFS-2026-001', customer_id: customers[0], category: 'sportswear',
      description: 'Full basketball jersey set (jersey + shorts), sublimated',
      quantity: 30, unit_price: 650, target_date: daysFromNow(-2),
      design_notes: 'Team colors navy & gold. Names + numbers at back.',
      design_file_url: 'https://drive.google.com/sample-jersey', status: 'printing', priority: 'urgent',
    },
    {
      job_order_number: 'EFS-2026-002', customer_id: customers[1], category: 'school',
      description: 'PE uniforms — shirts and jogging pants',
      quantity: 120, unit_price: 480, target_date: daysFromNow(5),
      design_notes: 'School logo embroidered on chest. Sizes XS–XL.',
      design_file_url: 'https://canva.com/sample-pe', status: 'cutting_sewing', priority: 'normal',
    },
    {
      job_order_number: 'EFS-2026-003', customer_id: customers[2], category: 'corporate',
      description: 'Corporate polo shirts with embroidered logo',
      quantity: 75, unit_price: 520, target_date: daysFromNow(12),
      design_notes: 'Maroon polos, left-chest logo, right-sleeve tagline.',
      design_file_url: 'https://drive.google.com/sample-polo', status: 'purchasing', priority: 'normal',
    },
    {
      job_order_number: 'EFS-2026-004', customer_id: customers[0], category: 'activewear',
      description: 'Running singlets for fun-run event',
      quantity: 200, unit_price: 350, target_date: daysFromNow(20),
      design_notes: 'Lightweight dri-fit. Sponsor logos front & back.',
      design_file_url: '', status: 'quotation', priority: 'normal',
    },
    {
      job_order_number: 'EFS-2026-005', customer_id: customers[1], category: 'sportswear',
      description: 'Volleyball team uniforms',
      quantity: 24, unit_price: 700, target_date: daysFromNow(-6),
      design_notes: 'Delivered last week. Sublimated set with libero contrast.',
      design_file_url: 'https://canva.com/sample-volley', status: 'delivered', priority: 'low',
    },
  ];

  for (const p of sampleProjects) {
    const total = p.unit_price * p.quantity;
    const r = await pool.query(`
      INSERT INTO projects
        (job_order_number, customer_id, category, description, quantity, unit_price,
         total_amount, target_date, design_notes, design_file_url, status, priority)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id
    `, [
      p.job_order_number, p.customer_id, p.category, p.description, p.quantity, p.unit_price,
      total, p.target_date, p.design_notes, p.design_file_url, p.status, p.priority,
    ]);
    const id = r.rows[0].id;
    await pool.query(
      "INSERT INTO project_logs (project_id, from_status, to_status, changed_by, notes) VALUES ($1, NULL, 'inquiry', $2, 'Project created (seed)')",
      [id, users.admin]
    );
    if (p.status !== 'inquiry') {
      await pool.query(
        'INSERT INTO project_logs (project_id, from_status, to_status, changed_by, notes) VALUES ($1, $2, $3, $4, $5)',
        [id, 'inquiry', p.status, users.admin, 'Advanced (seed)']
      );
    }
  }

  // --- Standalone tasks --------------------------------------------------
  await pool.query(
    'INSERT INTO tasks (project_id, assigned_to, title, description, due_date) VALUES ($1,$2,$3,$4,$5)',
    [1, users.printing, 'Printing: EFS-2026-001', 'Sublimate 30 jersey sets. URGENT — overdue.', daysFromNow(-2)]
  );
  await pool.query(
    'INSERT INTO tasks (project_id, assigned_to, title, description, due_date) VALUES ($1,$2,$3,$4,$5)',
    [3, users.purchasing, 'Purchasing: EFS-2026-003', 'Source maroon piqué fabric + thread for 75 polos.', daysFromNow(3)]
  );
  await pool.query(
    'INSERT INTO tasks (project_id, assigned_to, title, description, due_date) VALUES ($1,$2,$3,$4,$5)',
    [null, users.admin, 'Follow up fun-run quotation', 'Call Cebu Sports Club re: EFS-2026-004 pricing.', daysFromNow(1)]
  );

  const counts = {};
  for (const t of ['users', 'customers', 'projects', 'tasks']) {
    counts[t] = (await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`)).rows[0].n;
  }
  console.log('Seed complete:', counts);
  console.log('Logins — Admin:1234  Purchasing:2222  Printing:3333  Cutting&Sewing:5555  QA:4444');
  await pool.end();
}

seed().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
