const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'mmilab-secret-key-change-in-prod-2026';

// ── Auth Middleware ──
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function piOnly(req, res, next) {
  if (req.user.role !== 'pi') return res.status(403).json({ error: 'PI access only' });
  next();
}

// ── POST /api/auth/login ──
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, photo_url: user.photo_url }
  });
});

// ── POST /api/auth/change-password ──
router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  
  const valid = bcrypt.compareSync(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Password changed successfully' });
});

// ── GET /api/auth/me ──
router.get('/me', authMiddleware, (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT id, name, email, role, photo_url, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ── GET /api/auth/users (PI only) ──
router.get('/users', authMiddleware, piOnly, (req, res) => {
  const db = req.app.locals.db;
  const users = db.prepare('SELECT id, name, email, role, photo_url, created_at FROM users ORDER BY role DESC, name').all();
  res.json(users);
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
module.exports.piOnly = piOnly;
