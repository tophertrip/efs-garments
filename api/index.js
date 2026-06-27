// Vercel serverless entry — reuses the Express app as the request handler.
// All /api/* routes are directed here by vercel.json.
module.exports = require('../server/app.js');
