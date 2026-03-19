const express = require('express');
const { authMiddleware, piOnly } = require('./auth');
const router = express.Router();

router.use(authMiddleware);

// ── GET /api/projects — List all projects ──
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const projects = db.prepare(`SELECT p.*, GROUP_CONCAT(u.name) as member_names 
    FROM projects p 
    LEFT JOIN project_members pm ON p.id = pm.project_id 
    LEFT JOIN users u ON pm.user_id = u.id 
    GROUP BY p.id 
    ORDER BY p.status ASC, p.start_date DESC`).all();
  res.json(projects);
});

// ── GET /api/projects/:id — Single project ──
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const members = db.prepare(`SELECT u.id, u.name, u.email, u.photo_url, pm.role_in_project 
    FROM project_members pm 
    INNER JOIN users u ON pm.user_id = u.id 
    WHERE pm.project_id = ?`).all(req.params.id);

  res.json({ ...project, members });
});

// ── POST /api/projects — Create project (PI only) ──
router.post('/', piOnly, (req, res) => {
  const db = req.app.locals.db;
  const { title, funding_agency, start_date, end_date, status, description, member_ids } = req.body;
  if (!title) return res.status(400).json({ error: 'Project title is required' });

  const result = db.prepare(`INSERT INTO projects (title, funding_agency, start_date, end_date, status, description) VALUES (?, ?, ?, ?, ?, ?)`).run(title, funding_agency || '', start_date || '', end_date || '', status || 'active', description || '');

  if (member_ids && member_ids.length) {
    const insertMember = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?)');
    for (const uid of member_ids) {
      insertMember.run(result.lastInsertRowid, uid, 'member');
    }
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(project);
});

// ── PUT /api/projects/:id — Update project (PI only) ──
router.put('/:id', piOnly, (req, res) => {
  const db = req.app.locals.db;
  const { title, funding_agency, start_date, end_date, status, description, member_ids } = req.body;

  db.prepare(`UPDATE projects SET 
    title = COALESCE(?, title), funding_agency = COALESCE(?, funding_agency),
    start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date),
    status = COALESCE(?, status), description = COALESCE(?, description)
    WHERE id = ?`).run(title, funding_agency, start_date, end_date, status, description, req.params.id);

  if (member_ids) {
    db.prepare('DELETE FROM project_members WHERE project_id = ?').run(req.params.id);
    const insertMember = db.prepare('INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?)');
    for (const uid of member_ids) {
      insertMember.run(req.params.id, uid, 'member');
    }
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json(project);
});

module.exports = router;
