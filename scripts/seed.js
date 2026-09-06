const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

// username -> [display name, role, shift, demo password]
const STAFF = [
  ['Admin User', 'admin', 'admin', 'Mon–Fri, 08:00–17:00', 'admin123'],
  ['Front Waiter', 'waiter1', 'waiter', 'Daily, 11:00–22:00', 'waiter123'],
  ['Cashier', 'cashier1', 'cashier', 'Daily, 11:00–22:00', 'cashier123'],
  ['Kitchen Staff', 'kitchen1', 'kitchen', 'Daily, 10:00–22:00', 'kitchen123'],
  ['Reservation Manager', 'resmgr1', 'reservationManager', 'Mon–Sat, 09:00–18:00', 'resmgr123'],
  ['Reservation Staff', 'resstaff1', 'reservationStaff', 'Daily, 09:00–18:00', 'resstaff123'],
  ['Restaurant Manager', 'restmgr1', 'restaurantManager', 'Mon–Sat, 10:00–19:00', 'restmgr123'],
  ['Head of Kitchen', 'headkitchen1', 'headKitchen', 'Daily, 09:00–21:00', 'headkitchen123'],
  ['Finance Officer', 'finance1', 'finance', 'Mon–Fri, 08:00–17:00', 'finance123'],
];

async function main() {
  const seedSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.sql'), 'utf8');
  console.log('Loading seed.sql (sections, tables, menu, catalogs) ...');
  await pool.query(seedSql);

  console.log('Creating staff accounts with hashed passwords ...');
  for (const [name, username, role, shift, plainPassword] of STAFF) {
    const hash = await bcrypt.hash(plainPassword, 10);
    await pool.query(
      `INSERT INTO staff (name, username, password_hash, role, shift)
       VALUES ($1,$2,$3,$4,$5)`,
      [name, username, hash, role, shift]
    );
    console.log(`  ${username} / ${plainPassword}  (${role})`);
  }

  console.log('\nSeed complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
