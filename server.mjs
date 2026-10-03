// Ejari — real backend entry point.
// Starts an HTTP server that serves the static frontend (website / dashboard / app)
// AND a JSON REST API backed by a real, persistent SQLite database (data/ejari.db).
// Zero external dependencies — only Node's standard library (http, node:sqlite, crypto).
import { assertCryptoReady } from './server/gateways.mjs';

// Fail fast before anything touches the database or binds the port: production needs a real
// encryption key for stored provider credentials. A clear boot error beats silently encrypting
// with a public default. gateways.mjs has no side effects, so this runs before seeding.
assertCryptoReady();

const { createServer } = await import('./server/http.mjs');
await import('./server/db.mjs'); // opens (and seeds, on first run) the database

const port = Number(process.argv[2] || process.env.PORT || 4000);
createServer().listen(port, () => {
  console.log(`\n  Ejari server running → http://localhost:${port}`);
  console.log(`  Website    → http://localhost:${port}/website.html`);
  console.log(`  Dashboard  → http://localhost:${port}/dashboard.html`);
  console.log(`  Mobile app → http://localhost:${port}/app.html\n`);
});
