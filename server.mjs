// Ejari — real backend entry point.
// Starts an HTTP server that serves the static frontend (website / dashboard / app)
// AND a JSON REST API backed by a real, persistent SQLite database (data/ejari.db).
// Zero external dependencies — only Node's standard library (http, node:sqlite, crypto).
import { createServer } from './server/http.mjs';
import './server/db.mjs'; // opens (and seeds, on first run) the database

const port = Number(process.argv[2] || process.env.PORT || 4000);
createServer().listen(port, () => {
  console.log(`\n  Ejari server running → http://localhost:${port}`);
  console.log(`  Website    → http://localhost:${port}/website.html`);
  console.log(`  Dashboard  → http://localhost:${port}/dashboard.html`);
  console.log(`  Mobile app → http://localhost:${port}/app.html\n`);
});
