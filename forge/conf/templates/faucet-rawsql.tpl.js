// PocketForge: enable raw_sql on all faucet services (ADR-0004 agent DDL channel)
// Runs with bundled node (>=22.5 has node:sqlite). Idempotent.
const { DatabaseSync } = require('node:sqlite');
const path = process.argv[2];
const db = new DatabaseSync(path);
db.exec("UPDATE services SET raw_sql_allowed = 1");
const n = db.prepare("SELECT count(*) c FROM services WHERE raw_sql_allowed = 1").get().c;
console.log('raw_sql enabled on', n, 'services');
