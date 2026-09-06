require('dotenv').config();
require('express-async-errors'); // lets thrown errors inside async route handlers reach the error middleware below
const express = require('express');
const cors = require('cors');

const app = express();
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map((o) => o.trim()),
}));
app.use(express.json({ limit: '10mb' })); // 10mb to allow base64 menu photos

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Mounted before the broader '/api' router below (tables.js) so that
// unauthenticated guest routes never fall through to a router that
// requires a bearer token for anything under '/api'.
app.use('/api/public', require('./routes/public'));   // guest booking, QR ordering, feedback — no auth

app.use('/api/auth', require('./routes/auth'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api', require('./routes/tables'));          // /api/sections, /api/tables, /api/rooms
app.use('/api/menu', require('./routes/menu'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/catering', require('./routes/catering'));
app.use('/api/city-ledger', require('./routes/cityledger'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/reports', require('./routes/reports'));

// Centralized error handler — keeps route handlers free of try/catch boilerplate
// for anything that isn't a deliberate 4xx.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Montra Nivesha API listening on http://localhost:${port}`);
});
