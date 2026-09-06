const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  console.log('Applying schema.sql ...');
  await pool.query(schema);
  console.log('Schema applied successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
