const express = require('express');
const QRCode = require('qrcode');
const { authMiddleware } = require('./auth');
const router = express.Router();

// All routes require auth
router.use(authMiddleware);

// ── GET /api/strains — List all inventory (with filters & search) ──
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { search, organism, stockType, status, sort } = req.query;
  
  let query = `SELECT b.*, u.name as added_by_name FROM bacterial_inventory b LEFT JOIN users u ON b.added_by = u.id`;
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push(`(b.Phenotype_Notes LIKE ? OR b.Vial_ID LIKE ? OR b.Freezer_Location LIKE ?)`);
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (organism && organism !== 'all') {
    conditions.push(`b.Organism = ?`);
    params.push(organism);
  }
  if (stockType && stockType !== 'all') {
    conditions.push(`b.Stock_Type = ?`);
    params.push(stockType);
  }
  if (status && status !== 'all') {
    conditions.push(`b.Status = ?`);
    params.push(status);
  }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');

  const orderMap = { 'newest': 'b.Date_Frozen DESC', 'oldest': 'b.Date_Frozen ASC', 'organism': 'b.Organism ASC', 'id': 'b.Vial_ID ASC' };
  query += ` ORDER BY ${orderMap[sort] || 'b.Vial_ID ASC'}`;

  const inventory = db.prepare(query).all(...params);
  res.json(inventory);
});

// ── GET /api/strains/organisms — Get unique organism names for dropdown ──
router.get('/organisms', (req, res) => {
  const db = req.app.locals.db;
  const organisms = db.prepare(`SELECT DISTINCT Organism FROM bacterial_inventory ORDER BY Organism ASC`).all();
  res.json(organisms.map(o => o.Organism));
});

// ── GET /api/strains/:id — Single vial detail ──
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const vial = db.prepare(`SELECT b.*, u.name as added_by_name FROM bacterial_inventory b LEFT JOIN users u ON b.added_by = u.id WHERE b.Vial_ID = ?`).get(req.params.id);
  if (!vial) return res.status(404).json({ error: 'Vial not found' });
  res.json(vial);
});

// ── POST /api/strains — Add new vial ──
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { Vial_ID, Organism, Phenotype_Notes, Stock_Type, Freezer_Location, notes } = req.body;
  if (!Vial_ID || !Organism || !Stock_Type) return res.status(400).json({ error: 'Vial ID, Organism, and Stock Type are required' });

  // Check if exist
  const existing = db.prepare(`SELECT * FROM bacterial_inventory WHERE Vial_ID = ?`).get(Vial_ID);
  if (existing) return res.status(400).json({ error: `Vial ID ${Vial_ID} already exists.` });

  db.prepare(`INSERT INTO bacterial_inventory (Vial_ID, Organism, Phenotype_Notes, Stock_Type, Freezer_Location, added_by) VALUES (?, ?, ?, ?, ?, ?)`).run(Vial_ID, Organism, Phenotype_Notes || '', Stock_Type, Freezer_Location || '', req.user.id);

  // Log the addition
  db.prepare('INSERT INTO stock_log (vial_id, user_id, action, notes) VALUES (?, ?, ?, ?)').run(Vial_ID, req.user.id, 'added', notes || 'Initial stock entry');

  const vial = db.prepare('SELECT * FROM bacterial_inventory WHERE Vial_ID = ?').get(Vial_ID);
  res.status(201).json(vial);
});

// ── PUT /api/strains/:id — Edit vial ──
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { Organism, Phenotype_Notes, Stock_Type, Freezer_Location } = req.body;

  db.prepare(`UPDATE bacterial_inventory SET Organism = COALESCE(?, Organism), Phenotype_Notes = COALESCE(?, Phenotype_Notes), Stock_Type = COALESCE(?, Stock_Type), Freezer_Location = COALESCE(?, Freezer_Location) WHERE Vial_ID = ?`).run(Organism, Phenotype_Notes, Stock_Type, Freezer_Location, req.params.id);

  const vial = db.prepare('SELECT * FROM bacterial_inventory WHERE Vial_ID = ?').get(req.params.id);
  res.json(vial);
});

// ── POST /api/strains/:id/checkout — Check out a vial ──
router.post('/:id/checkout', (req, res) => {
  const db = req.app.locals.db;
  const vial = db.prepare('SELECT * FROM bacterial_inventory WHERE Vial_ID = ?').get(req.params.id);
  if (!vial) return res.status(404).json({ error: 'Vial not found' });
  if (vial.Status === 'In Use') return res.status(400).json({ error: 'Vial is already checked out' });
  if (vial.Status === 'Depleted') return res.status(400).json({ error: 'Vial is depleted' });

  db.prepare('UPDATE bacterial_inventory SET Status = ? WHERE Vial_ID = ?').run('In Use', req.params.id);
  db.prepare('INSERT INTO stock_log (vial_id, user_id, action, notes) VALUES (?, ?, ?, ?)').run(req.params.id, req.user.id, 'checkout', req.body.notes || '');

  res.json({ message: 'Vial checked out successfully' });
});

// ── POST /api/strains/:id/checkin — Check in a vial ──
router.post('/:id/checkin', (req, res) => {
  const db = req.app.locals.db;
  const { notes } = req.body;

  db.prepare('UPDATE bacterial_inventory SET Status = ? WHERE Vial_ID = ?').run('Available', req.params.id);
  db.prepare('INSERT INTO stock_log (vial_id, user_id, action, notes) VALUES (?, ?, ?, ?)').run(req.params.id, req.user.id, 'checkin', notes || '');

  res.json({ message: 'Vial checked in successfully' });
});

// ── POST /api/strains/:id/deplete — Mark vial as depleted ──
router.post('/:id/deplete', (req, res) => {
  const db = req.app.locals.db;
  db.prepare('UPDATE bacterial_inventory SET Status = ? WHERE Vial_ID = ?').run('Depleted', req.params.id);
  db.prepare('INSERT INTO stock_log (vial_id, user_id, action, notes) VALUES (?, ?, ?, ?)').run(req.params.id, req.user.id, 'depleted', req.body.notes || '');
  res.json({ message: 'Vial marked as depleted' });
});

// ── GET /api/strains/:id/history — Audit trail ──
router.get('/:id/history', (req, res) => {
  const db = req.app.locals.db;
  const logs = db.prepare(`SELECT sl.*, u.name as user_name FROM stock_log sl LEFT JOIN users u ON sl.user_id = u.id WHERE sl.vial_id = ? ORDER BY sl.timestamp DESC`).all(req.params.id);
  res.json(logs);
});

// ── GET /api/strains/:id/qrcode — Generate QR code ──
router.get('/:id/qrcode', async (req, res) => {
  const db = req.app.locals.db;
  const vial = db.prepare('SELECT * FROM bacterial_inventory WHERE Vial_ID = ?').get(req.params.id);
  if (!vial) return res.status(404).json({ error: 'Vial not found' });

  const host = req.headers.host || 'localhost';
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const url = `${protocol}://${host}/dashboard.html#stock/${encodeURIComponent(vial.Vial_ID)}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#1A1A1A', light: '#FAF8F5' } });
    res.json({ qr: qrDataUrl, strain_id: vial.Vial_ID, organism: vial.Organism, url });
  } catch (err) {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

// ── DELETE /api/strains/:id ──
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const vial = db.prepare('SELECT * FROM bacterial_inventory WHERE Vial_ID = ?').get(req.params.id);
  
  if (!vial) return res.status(404).json({ error: 'Vial not found' });
  
  // Only PI or the person who added it can delete
  if (req.user.role !== 'pi' && vial.added_by !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized to delete this strain' });
  }

  db.prepare('DELETE FROM stock_log WHERE vial_id = ?').run(req.params.id);
  db.prepare('DELETE FROM bacterial_inventory WHERE Vial_ID = ?').run(req.params.id);

  res.json({ message: 'Strain deleted successfully' });
});

module.exports = router;
