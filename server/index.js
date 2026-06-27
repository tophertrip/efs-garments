// Local dev entry point — runs the Express app with a normal HTTP listener.
// (On Vercel, api/index.js imports the same app as a serverless function.)
require('dotenv').config();
const app = require('./app');

// Last-resort guards so a stray error never takes the whole service down.
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));
process.on('uncaughtException', (err) => console.error('uncaughtException:', err));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`EFS API listening on http://localhost:${PORT}`);
});
