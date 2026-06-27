// Seed the database with sample users, customers, and projects.
const db = require('./db');

// Wipe existing data so re-seeding is idempotent.
db.exec(`
  DELETE FROM tasks;
  DELETE FROM project_logs;
  DELETE FROM projects;
  DELETE FROM customers;
  DELETE FROM users;
  DELETE FROM sqlite_sequence;
`);

// --- Users ---------------------------------------------------------------
const insertUser = db.prepare('INSERT INTO users (name, role, pin) VALUES (?, ?, ?)');
const users = {
  admin: insertUser.run('Maria Santos (Admin)', 'admin', '1234').lastInsertRowid,
  purchasing: insertUser.run('Jun Reyes (Purchasing)', 'purchasing', '2222').lastInsertRowid,
  printing: insertUser.run('Liza Cruz (Printing)', 'printing', '3333').lastInsertRowid,
  cutting: insertUser.run('Ramon Dela Cruz (Cutting & Sewing)', 'cutting_sewing', '5555').lastInsertRowid,
  qa: insertUser.run('Ana Villanueva (QA)', 'qa', '4444').lastInsertRowid,
};

// --- Customers -----------------------------------------------------------
const insertCustomer = db.prepare(
  'INSERT INTO customers (name, contact, messenger_name, source) VALUES (?, ?, ?, ?)'
);
const customers = [
  insertCustomer.run('Cebu City Sports Club', '0917-555-0101', 'Cebu Sports', 'facebook').lastInsertRowid,
  insertCustomer.run('St. Mary Academy', '0918-555-0202', 'St Mary Admin', 'referral').lastInsertRowid,
  insertCustomer.run('Highland Corporate Inc.', '0920-555-0303', 'Highland HR', 'instagram').lastInsertRowid,
];

// --- Projects ------------------------------------------------------------
const insertProject = db.prepare(`
  INSERT INTO projects
    (job_order_number, customer_id, category, description, quantity, unit_price,
     total_amount, target_date, design_notes, design_file_url, status, priority)
  VALUES (@job_order_number, @customer_id, @category, @description, @quantity, @unit_price,
          @total_amount, @target_date, @design_notes, @design_file_url, @status, @priority)
`);
const insertLog = db.prepare(`
  INSERT INTO project_logs (project_id, from_status, to_status, changed_by, notes)
  VALUES (?, ?, ?, ?, ?)
`);

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

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

const insertMany = db.transaction(() => {
  for (const p of sampleProjects) {
    p.total_amount = p.unit_price * p.quantity;
    const id = insertProject.run(p).lastInsertRowid;
    insertLog.run(id, null, 'inquiry', users.admin, 'Project created (seed)');
    if (p.status !== 'inquiry') {
      insertLog.run(id, 'inquiry', p.status, users.admin, 'Advanced (seed)');
    }
  }
});
insertMany();

// A couple of standalone tasks/reminders.
const insertTask = db.prepare(`
  INSERT INTO tasks (project_id, assigned_to, title, description, due_date)
  VALUES (?, ?, ?, ?, ?)
`);
insertTask.run(1, users.printing, 'Printing: EFS-2026-001', 'Sublimate 30 jersey sets. URGENT — overdue.', daysFromNow(-2));
insertTask.run(3, users.purchasing, 'Purchasing: EFS-2026-003', 'Source maroon piqué fabric + thread for 75 polos.', daysFromNow(3));
insertTask.run(null, users.admin, 'Follow up fun-run quotation', 'Call Cebu Sports Club re: EFS-2026-004 pricing.', daysFromNow(1));

console.log('Seed complete:');
console.log('  Users      :', db.prepare('SELECT COUNT(*) n FROM users').get().n);
console.log('  Customers  :', db.prepare('SELECT COUNT(*) n FROM customers').get().n);
console.log('  Projects   :', db.prepare('SELECT COUNT(*) n FROM projects').get().n);
console.log('  Tasks      :', db.prepare('SELECT COUNT(*) n FROM tasks').get().n);
console.log('\nLogins — Admin:1234  Purchasing:2222  Printing:3333  Cutting&Sewing:5555  QA:4444');
