const express = require('express');
const { authMiddleware } = require('./auth');
const router = express.Router();

router.use(authMiddleware);

// Item types are now dynamic — stored in consumable_types table
function getItemTypes(db) {
  return db.prepare('SELECT name FROM consumable_types ORDER BY name ASC').all().map(r => r.name);
}

// IST timestamp helper (UTC+5:30)
function istNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 330); // UTC + 5:30
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

// Argajit's user ID (looked up on first request and cached)
let argajitId = null;
function getArgajitId(db) {
  if (argajitId !== null) return argajitId;
  const row = db.prepare("SELECT id FROM users WHERE email = 'argajit05@gmail.com'").get();
  argajitId = row ? row.id : -1;
  return argajitId;
}

function canManageBoxes(user, db) {
  return user.role === 'pi' || user.id === getArgajitId(db);
}

// ── GET /api/consumables — List all boxes with FIFO ordering ──
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { item_type } = req.query;

  let query = `SELECT cb.*, u.name as added_by_name FROM consumable_boxes cb
    LEFT JOIN users u ON cb.added_by = u.id`;
  const params = [];

  if (item_type && item_type !== 'all') {
    query += ` WHERE cb.item_type = ?`;
    params.push(item_type);
  }

  // FIFO: active first (oldest first), then locked, then empty
  query += ` ORDER BY
    CASE cb.status WHEN 'active' THEN 0 WHEN 'locked' THEN 1 WHEN 'empty' THEN 2 END,
    cb.added_at ASC`;

  const boxes = db.prepare(query).all(...params);
  res.json(boxes);
});

// ── GET /api/consumables/types — Item types list (from DB) ──
router.get('/types', (req, res) => {
  const db = req.app.locals.db;
  const types = db.prepare('SELECT * FROM consumable_types ORDER BY name ASC').all();
  res.json(types);
});

// ── POST /api/consumables/types — Add a new item type (Argajit + PI only) ──
router.post('/types', (req, res) => {
  const db = req.app.locals.db;
  if (!canManageBoxes(req.user, db)) {
    return res.status(403).json({ error: 'Only Argajit Sarkar or the PI can manage item types.' });
  }
  const { name, unit } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Item type name is required.' });

  const existing = db.prepare('SELECT id FROM consumable_types WHERE name = ?').get(name.trim());
  if (existing) return res.status(400).json({ error: `"${name.trim()}" already exists.` });

  db.prepare('INSERT INTO consumable_types (name, unit) VALUES (?, ?)').run(name.trim(), (unit || 'pcs').trim());
  res.status(201).json({ message: `Item type "${name.trim()}" added.` });
});

// ── DELETE /api/consumables/types/:id — Remove an item type (Argajit + PI only) ──
router.delete('/types/:id', (req, res) => {
  const db = req.app.locals.db;
  if (!canManageBoxes(req.user, db)) {
    return res.status(403).json({ error: 'Only Argajit Sarkar or the PI can manage item types.' });
  }
  const type = db.prepare('SELECT * FROM consumable_types WHERE id = ?').get(req.params.id);
  if (!type) return res.status(404).json({ error: 'Item type not found.' });

  // Check if any boxes use this type
  const boxCount = db.prepare('SELECT COUNT(*) as c FROM consumable_boxes WHERE item_type = ?').get(type.name).c;
  if (boxCount > 0) {
    return res.status(400).json({ error: `Cannot delete — ${boxCount} box(es) use this type. Delete the boxes first.` });
  }

  db.prepare('DELETE FROM consumable_types WHERE id = ?').run(req.params.id);
  res.json({ message: `Item type "${type.name}" deleted.` });
});

// ── GET /api/consumables/summary — Quick counts per item type ──
router.get('/summary', (req, res) => {
  const db = req.app.locals.db;
  const summary = db.prepare(`
    SELECT item_type,
      SUM(CASE WHEN status != 'empty' THEN current_qty ELSE 0 END) as total_qty,
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_boxes,
      COUNT(CASE WHEN status = 'empty' THEN 1 END) as empty_boxes
    FROM consumable_boxes GROUP BY item_type
  `).all();
  res.json(summary);
});

// ── GET /api/consumables/ledger/all — Full ledger across all boxes ──
// NOTE: This route MUST come before /:id/ledger to avoid Express matching "ledger" as :id
router.get('/ledger/all', (req, res) => {
  const db = req.app.locals.db;
  const { item_type, user_id } = req.query;

  let query = `SELECT cl.*, u.name as user_name, cb.box_label, cb.item_type
    FROM consumable_ledger cl
    LEFT JOIN users u ON cl.user_id = u.id
    LEFT JOIN consumable_boxes cb ON cl.box_id = cb.id
    WHERE 1=1`;
  const params = [];

  if (item_type && item_type !== 'all') {
    query += ` AND cb.item_type = ?`;
    params.push(item_type);
  }
  if (user_id && user_id !== 'all') {
    query += ` AND cl.user_id = ?`;
    params.push(parseInt(user_id));
  }

  query += ` ORDER BY cl.timestamp DESC LIMIT 200`;
  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

// ── GET /api/consumables/:id/ledger — Full audit trail for a box ──
router.get('/:id/ledger', (req, res) => {
  const db = req.app.locals.db;
  const logs = db.prepare(`
    SELECT cl.*, u.name as user_name FROM consumable_ledger cl
    LEFT JOIN users u ON cl.user_id = u.id
    WHERE cl.box_id = ? ORDER BY cl.timestamp DESC
  `).all(req.params.id);
  res.json(logs);
});

// ── POST /api/consumables/boxes — Add a new box (Argajit + PI only) ──
router.post('/boxes', (req, res) => {
  const db = req.app.locals.db;
  if (!canManageBoxes(req.user, db)) {
    return res.status(403).json({ error: 'Only Argajit Sarkar or the PI can add new boxes.' });
  }

  const { item_type, box_label, initial_qty } = req.body;
  if (!item_type || !box_label || !initial_qty) {
    return res.status(400).json({ error: 'Item type, box label, and initial quantity are required.' });
  }
  // Validate item type exists in DB
  const validType = db.prepare('SELECT id FROM consumable_types WHERE name = ?').get(item_type);
  if (!validType) {
    return res.status(400).json({ error: `Invalid item type "${item_type}". Add it from Manage Types first.` });
  }
  const qty = parseInt(initial_qty);
  if (qty <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0.' });

  // New boxes start locked — manager activates them manually when needed
  const status = 'locked';
  const now = istNow();

  const result = db.prepare(
    `INSERT INTO consumable_boxes (item_type, box_label, initial_qty, current_qty, status, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(item_type, box_label.trim(), qty, qty, status, req.user.id, now);

  // Log the addition
  db.prepare(
    `INSERT INTO consumable_ledger (box_id, user_id, action, qty, qty_after, notes, timestamp) VALUES (?, ?, 'box_added', ?, ?, ?, ?)`
  ).run(result.lastInsertRowid, req.user.id, qty, qty, `New box added: ${box_label.trim()}`, now);

  const box = db.prepare('SELECT * FROM consumable_boxes WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(box);
});

// ── POST /api/consumables/:id/withdraw — Scholar withdraws items ──
router.post('/:id/withdraw', (req, res) => {
  const db = req.app.locals.db;
  const box = db.prepare('SELECT * FROM consumable_boxes WHERE id = ?').get(req.params.id);
  if (!box) return res.status(404).json({ error: 'Box not found.' });
  if (box.status === 'empty') return res.status(400).json({ error: 'This box is empty.' });

  const qty = parseInt(req.body.qty);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'Quantity must be greater than 0.' });
  if (qty > box.current_qty) return res.status(400).json({ error: `Only ${box.current_qty} left in this box.` });

  const newQty = box.current_qty - qty;
  const now = istNow();

  const updateBox = db.transaction(() => {
    db.prepare('UPDATE consumable_boxes SET current_qty = ? WHERE id = ?').run(newQty, box.id);

    db.prepare(
      `INSERT INTO consumable_ledger (box_id, user_id, action, qty, qty_after, notes, timestamp) VALUES (?, ?, 'withdraw', ?, ?, ?, ?)`
    ).run(box.id, req.user.id, qty, newQty, req.body.notes || '', now);

    // If box is now empty, mark it
    if (newQty === 0) {
      db.prepare("UPDATE consumable_boxes SET status = 'empty', current_qty = 0, emptied_at = ? WHERE id = ?").run(now, box.id);
      db.prepare(
        `INSERT INTO consumable_ledger (box_id, user_id, action, qty, qty_after, notes, timestamp) VALUES (?, ?, 'box_emptied', 0, 0, 'Box fully consumed', ?)`
      ).run(box.id, req.user.id, now);
    }
  });

  updateBox();
  res.json({ message: `Withdrew ${qty} units. ${newQty} remaining.`, qty_after: newQty });
});

// ── POST /api/consumables/:id/toggle — Activate or Lock a box (Argajit + PI only) ──
router.post('/:id/toggle', (req, res) => {
  const db = req.app.locals.db;
  if (!canManageBoxes(req.user, db)) {
    return res.status(403).json({ error: 'Only Argajit Sarkar or the PI can activate/lock boxes.' });
  }
  const box = db.prepare('SELECT * FROM consumable_boxes WHERE id = ?').get(req.params.id);
  if (!box) return res.status(404).json({ error: 'Box not found.' });
  if (box.status === 'empty') return res.status(400).json({ error: 'Cannot toggle an empty box.' });

  const newStatus = box.status === 'active' ? 'locked' : 'active';
  db.prepare('UPDATE consumable_boxes SET status = ? WHERE id = ?').run(newStatus, box.id);
  res.json({ message: `Box "${box.box_label}" is now ${newStatus}.`, status: newStatus });
});

// ── POST /api/consumables/:id/correction — Correction entry (append-only fix) ──
router.post('/:id/correction', (req, res) => {
  const db = req.app.locals.db;
  const box = db.prepare('SELECT * FROM consumable_boxes WHERE id = ?').get(req.params.id);
  if (!box) return res.status(404).json({ error: 'Box not found.' });
  if (box.status === 'empty') return res.status(400).json({ error: 'Cannot correct an empty box.' });

  const { qty, notes } = req.body;
  const correctionQty = parseInt(qty);
  if (!correctionQty || correctionQty === 0) return res.status(400).json({ error: 'Correction quantity cannot be 0.' });
  if (!notes || !notes.trim()) return res.status(400).json({ error: 'Correction reason is required.' });

  const newQty = box.current_qty + correctionQty; // positive = return, negative = remove more
  if (newQty < 0) return res.status(400).json({ error: `Correction would make quantity negative (current: ${box.current_qty}).` });

  const action = correctionQty > 0 ? 'return' : 'correction';
  const now = istNow();

  db.prepare('UPDATE consumable_boxes SET current_qty = ? WHERE id = ?').run(newQty, box.id);
  db.prepare(
    `INSERT INTO consumable_ledger (box_id, user_id, action, qty, qty_after, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(box.id, req.user.id, action, Math.abs(correctionQty), newQty, notes.trim(), now);

  res.json({ message: 'Correction recorded.', qty_after: newQty });
});

// ── POST /api/consumables/:id/mark-empty — Force mark box as empty (Argajit + PI) ──
router.post('/:id/mark-empty', (req, res) => {
  const db = req.app.locals.db;
  if (!canManageBoxes(req.user, db)) {
    return res.status(403).json({ error: 'Only Argajit Sarkar or the PI can mark boxes as empty.' });
  }

  const box = db.prepare('SELECT * FROM consumable_boxes WHERE id = ?').get(req.params.id);
  if (!box) return res.status(404).json({ error: 'Box not found.' });
  if (box.status === 'empty') return res.status(400).json({ error: 'Box is already empty.' });

  const now = istNow();
  const markEmpty = db.transaction(() => {
    db.prepare("UPDATE consumable_boxes SET status = 'empty', current_qty = 0, emptied_at = ? WHERE id = ?").run(now, box.id);
    db.prepare(
      `INSERT INTO consumable_ledger (box_id, user_id, action, qty, qty_after, notes, timestamp) VALUES (?, ?, 'box_emptied', 0, 0, ?, ?)`
    ).run(box.id, req.user.id, req.body.notes || 'Manually marked as empty', now);
  });

  markEmpty();
  res.json({ message: 'Box marked as empty.' });
});

// ── DELETE /api/consumables/:id — Delete box and its ledger (Argajit + PI only) ──
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  if (!canManageBoxes(req.user, db)) {
    return res.status(403).json({ error: 'Only Argajit Sarkar or the PI can delete boxes.' });
  }

  const box = db.prepare('SELECT * FROM consumable_boxes WHERE id = ?').get(req.params.id);
  if (!box) return res.status(404).json({ error: 'Box not found.' });

  const deleteBox = db.transaction(() => {
    db.prepare('DELETE FROM consumable_ledger WHERE box_id = ?').run(box.id);
    db.prepare('DELETE FROM consumable_boxes WHERE id = ?').run(box.id);
  });

  deleteBox();
  res.json({ message: `Box "${box.box_label}" deleted.` });
});

module.exports = router;
