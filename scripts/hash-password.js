// Usage: node scripts/hash-password.js <plaintext-password>
// Prints a bcrypt hash suitable for the staff.password_hash column.
const bcrypt = require('bcryptjs');

const plain = process.argv[2];
if (!plain) {
  console.error('Usage: node scripts/hash-password.js <password>');
  process.exit(1);
}
bcrypt.hash(plain, 10).then((hash) => console.log(hash));
