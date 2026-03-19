const express = require('express');
const { authMiddleware, piOnly } = require('./auth');
const router = express.Router();

router.use(authMiddleware);

// ── GET /api/dashboard/:userId — Get scholar dashboard ──
router.get('/:userId', (req, res) => {
  const db = req.app.locals.db;
  const userId = parseInt(req.params.userId);

  // Scholars can only view their own dashboard, PI can view any
  if (req.user.role !== 'pi' && req.user.id !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const user = db.prepare('SELECT id, name, email, role, photo_url, created_at FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const profile = db.prepare('SELECT * FROM scholar_profiles WHERE user_id = ?').get(userId);

  // Get recent stock activity
  const stockActivity = db.prepare(`
    SELECT sl.*, s.Vial_ID as strain_id, s.Organism as organism, u.name as user_name 
    FROM stock_log sl 
    LEFT JOIN bacterial_inventory s ON sl.vial_id = s.Vial_ID 
    LEFT JOIN users u ON sl.user_id = u.id 
    WHERE sl.user_id = ? 
    ORDER BY sl.timestamp DESC LIMIT 20
  `).all(userId);

  // Get currently checked out strains
  const checkedOut = db.prepare(`
    SELECT s.* FROM bacterial_inventory s 
    INNER JOIN stock_log sl ON s.Vial_ID = sl.vial_id 
    WHERE sl.user_id = ? AND sl.action = 'checkout' 
    AND s.Status = 'In Use'
    AND sl.id = (SELECT MAX(id) FROM stock_log WHERE vial_id = s.Vial_ID)
  `).all(userId);

  // Get projects
  const projects = db.prepare(`
    SELECT p.*, pm.role_in_project 
    FROM projects p 
    INNER JOIN project_members pm ON p.id = pm.project_id 
    WHERE pm.user_id = ?
  `).all(userId);

  res.json({ user, profile, stockActivity, checkedOut, projects });
});

// ── PUT /api/dashboard/:userId — Update own dashboard ──
router.put('/:userId', (req, res) => {
  const db = req.app.locals.db;
  const userId = parseInt(req.params.userId);

  // Scholars can only edit their own, PI can edit any
  if (req.user.role !== 'pi' && req.user.id !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { enrollment_date, research_topic, milestones, current_experiments, notes } = req.body;

  const existing = db.prepare('SELECT * FROM scholar_profiles WHERE user_id = ?').get(userId);
  if (existing) {
    db.prepare(`UPDATE scholar_profiles SET 
      enrollment_date = COALESCE(?, enrollment_date),
      research_topic = COALESCE(?, research_topic),
      milestones = COALESCE(?, milestones),
      current_experiments = COALESCE(?, current_experiments),
      notes = COALESCE(?, notes)
      WHERE user_id = ?`).run(enrollment_date, research_topic, milestones, current_experiments, notes, userId);
  } else {
    db.prepare(`INSERT INTO scholar_profiles (user_id, enrollment_date, research_topic, milestones, current_experiments, notes) VALUES (?, ?, ?, ?, ?, ?)`).run(userId, enrollment_date || '', research_topic || '', milestones || '[]', current_experiments || '', notes || '');
  }

  res.json({ message: 'Dashboard updated' });
});

// ── GET /api/dashboard/pi/overview — PI overview (PI only) ──
router.get('/pi/overview', piOnly, (req, res) => {
  const db = req.app.locals.db;

  const scholars = db.prepare(`SELECT u.id, u.name, u.email, u.photo_url, sp.research_topic, sp.enrollment_date 
    FROM users u 
    LEFT JOIN scholar_profiles sp ON u.id = sp.user_id 
    WHERE u.role = 'scholar' 
    ORDER BY u.name`).all();

  const totalStrains = db.prepare('SELECT COUNT(*) as c FROM bacterial_inventory').get().c;
  const availableStrains = db.prepare("SELECT COUNT(*) as c FROM bacterial_inventory WHERE Status = 'Available'").get().c;
  const inUseStrains = db.prepare("SELECT COUNT(*) as c FROM bacterial_inventory WHERE Status = 'In Use'").get().c;
  const depletedStrains = db.prepare("SELECT COUNT(*) as c FROM bacterial_inventory WHERE Status = 'Depleted'").get().c;

  const activeProjects = db.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'active'").get().c;

  const recentActivity = db.prepare(`
    SELECT sl.*, s.Vial_ID as strain_id, s.Organism as organism, u.name as user_name 
    FROM stock_log sl 
    LEFT JOIN bacterial_inventory s ON sl.vial_id = s.Vial_ID 
    LEFT JOIN users u ON sl.user_id = u.id 
    ORDER BY sl.timestamp DESC LIMIT 20
  `).all();

  res.json({
    scholars,
    stats: { totalStrains, availableStrains, inUseStrains, depletedStrains, activeProjects, totalScholars: scholars.length },
    recentActivity
  });
});

module.exports = router;
