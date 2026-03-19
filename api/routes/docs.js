const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join('/app/uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB limit

// Helper to extract text
async function extractText(filePath, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else if (mimetype === 'text/plain') {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch (err) {
    console.error(`Error parsing ${filePath}:`, err);
  }
  return '';
}

// ── GET /api/docs ── List & Search
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { search, tag, project_id, folder } = req.query;

  let query = `
    SELECT d.*, u.name as uploader_name, p.title as project_title
    FROM documents d
    LEFT JOIN users u ON d.uploader_id = u.id
    LEFT JOIN projects p ON d.project_id = p.id
  `;
  const conditions = [];
  const params = [];

  if (tag && tag !== 'all') {
    conditions.push('d.tag = ?');
    params.push(tag);
  }

  if (project_id && project_id !== 'all') {
    conditions.push('d.project_id = ?');
    params.push(parseInt(project_id));
  }

  if (folder && folder !== 'all') {
    conditions.push('d.folder = ?');
    params.push(folder);
  }

  if (search) {
    const searchCondition = `d.id IN (SELECT document_id FROM document_search WHERE document_search MATCH ?)`;
    if (conditions.length) {
      query += ` WHERE ${conditions.join(' AND ')} AND ${searchCondition}`;
    } else {
      query += ` WHERE ${searchCondition}`;
    }
    const safeSearch = search.replace(/"/g, '""');
    params.push(`"${safeSearch}"*`);
  } else if (conditions.length) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY d.upload_date DESC`;

  const docs = db.prepare(query).all(...params);
  res.json(docs);
});

// ── GET /api/docs/folders ── Get folder/category summary with counts
router.get('/folders', (req, res) => {
  const db = req.app.locals.db;

  // Get counts by tag
  const tagCounts = db.prepare(`
    SELECT tag, COUNT(*) as count FROM documents GROUP BY tag ORDER BY tag
  `).all();

  // Get counts by project
  const projectCounts = db.prepare(`
    SELECT d.project_id, p.title as project_title, COUNT(*) as count
    FROM documents d
    LEFT JOIN projects p ON d.project_id = p.id
    WHERE d.project_id IS NOT NULL
    GROUP BY d.project_id
    ORDER BY p.title
  `).all();

  // Get counts by folder
  const folderCounts = db.prepare(`
    SELECT folder, COUNT(*) as count FROM documents WHERE folder != '' AND folder IS NOT NULL GROUP BY folder ORDER BY folder
  `).all();

  const total = db.prepare('SELECT COUNT(*) as count FROM documents').get().count;

  res.json({ total, tagCounts, projectCounts, folderCounts });
});

// ── POST /api/docs ── Upload new document
router.post('/', upload.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const db = req.app.locals.db;

  const { tag, isPublic, project_id, folder } = req.body;
  const finalTag = tag || 'Uncategorized';
  const finalIsPublic = isPublic === 'true' || isPublic === true ? 1 : 0;
  const finalProjectId = project_id && project_id !== '' ? parseInt(project_id) : null;
  const finalFolder = folder || '';

  // 1. Insert into main table
  const result = db.prepare(`
    INSERT INTO documents (filename, original_name, mimetype, size, uploader_id, tag, is_public, project_id, folder)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id, finalTag, finalIsPublic, finalProjectId, finalFolder);

  const docId = result.lastInsertRowid;

  // 2. Extract text and index FTS5
  let textContent = await extractText(req.file.path, req.file.mimetype);

  // Also index the filename, tag, and folder so they are searchable
  textContent = `${req.file.originalname} \n ${finalTag} \n ${finalFolder} \n ${textContent}`;

  db.prepare(`INSERT INTO document_search (document_id, content) VALUES (?, ?)`).run(docId, textContent);

  const newDoc = db.prepare(`SELECT d.*, u.name as uploader_name, p.title as project_title FROM documents d LEFT JOIN users u ON d.uploader_id = u.id LEFT JOIN projects p ON d.project_id = p.id WHERE d.id = ?`).get(docId);
  res.status(201).json(newDoc);
});

// ── GET /api/docs/:id/download ──
router.get('/:id/download', (req, res) => {
  const db = req.app.locals.db;
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const file = path.join('/app/uploads', doc.filename);
  res.download(file, doc.original_name);
});

// ── DELETE /api/docs/:id ──
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Access control: only uploader or PI can delete
  if (doc.uploader_id !== req.user.id && req.user.role !== 'pi') {
    return res.status(403).json({ error: 'Unauthorized to delete this document' });
  }

  // Delete from DB and FTS
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM document_search WHERE document_id = ?').run(req.params.id);

  // Delete physical file
  const file = path.join('/app/uploads', doc.filename);
  if (fs.existsSync(file)) fs.unlinkSync(file);

  res.json({ message: 'Document deleted' });
});

module.exports = router;
