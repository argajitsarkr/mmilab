const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./lib/init');

const app = express();
const PORT = process.env.PORT || 3500;

// ── Middleware ──
app.use(cors());
app.use(express.json());

// ── Initialize Database ──
const db = initDB();
app.locals.db = db;

// ── Routes ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/strains', require('./routes/strains'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/docs', require('./routes/docs'));

// ── Health Check ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Start Server ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MMI Lab API running on port ${PORT}`);
});
