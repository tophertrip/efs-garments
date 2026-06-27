// Postgres (Supabase) data layer for EFS Garments.
// Provides small async helpers (query/get/run) and a `?`→`$n` placeholder
// shim so the route SQL can stay close to its original form.
const { Pool, types } = require('pg');

// Return DATE columns (oid 1082) as 'YYYY-MM-DD' strings instead of JS Dates,
// so the frontend's date math keeps working unchanged.
types.setTypeParser(1082, (v) => v);

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL is not set — database calls will fail.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10000,
  keepAlive: true,
});

// CRITICAL: without this handler, an error on an idle client (e.g. Supabase's
// pooler closing an idle connection) is thrown as an uncaught exception and
// crashes the whole process. Swallow it — pg will reconnect on the next query.
pool.on('error', (err) => {
  console.error('pg idle-client error (ignored):', err.message);
});

// Convert "?" placeholders into Postgres "$1, $2, …".
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function query(sql, params = []) {
  const res = await pool.query(toPg(sql), params);
  return res.rows;
}

async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// For INSERT/UPDATE/DELETE. Use a `RETURNING` clause to read back rows/ids.
async function run(sql, params = []) {
  return pool.query(toPg(sql), params);
}

module.exports = { pool, query, get, run, toPg };
