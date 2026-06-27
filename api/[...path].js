// Vercel catch-all serverless function — handles every /api/* request by
// delegating to the Express app (req.url keeps the full /api/... path).
module.exports = require('../server/app.js');
