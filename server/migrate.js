// Apply schema.sql to the database in DATABASE_URL.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema applied.');
  await pool.end();
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
