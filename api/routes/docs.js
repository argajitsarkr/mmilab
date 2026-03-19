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

// Helper to extract text from uploaded files (with timeout protection)
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Text extraction timed out')), ms))
  ]);
}

async function extractText(filePath, mimetype, originalName) {
  const name = originalName || path.basename(filePath);
  const ext = path.extname(name).toLowerCase();
  console.log(`[DOC INDEX] Extracting text from: ${name} (mimetype: ${mimetype}, ext: ${ext})`);
  console.log(`[DOC INDEX] File path: ${filePath}, exists: ${fs.existsSync(filePath)}, size: ${fs.existsSync(filePath) ? fs.statSync(filePath).size : 'N/A'} bytes`);

  try {
    // PDF files
    if (mimetype === 'application/pdf' || ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await withTimeout(pdfParse(dataBuffer), 30000);
      console.log(`[DOC INDEX] PDF extracted: ${data.text.length} chars`);
      return data.text;
    }

    // DOCX files (mammoth only supports .docx, NOT legacy .doc)
    if (ext === '.docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await withTimeout(mammoth.extractRawText({ path: filePath }), 30000);
      console.log(`[DOC INDEX] DOCX extracted: ${result.value.length} chars`);
      if (result.messages && result.messages.length) {
        console.log(`[DOC INDEX] Mammoth warnings:`, JSON.stringify(result.messages));
      }
      return result.value;
    }

    // Legacy .doc — mammoth cannot read these; try reading raw text as fallback
    if (ext === '.doc' || mimetype === 'application/msword') {
      console.log(`[DOC INDEX] WARNING: Legacy .doc format detected. Attempting raw text extraction (limited).`);
      try {
        const result = await withTimeout(mammoth.extractRawText({ path: filePath }), 15000);
        if (result.value && result.value.length > 0) {
          console.log(`[DOC INDEX] .doc fallback extracted: ${result.value.length} chars`);
          return result.value;
        }
      } catch (e) {
        console.log(`[DOC INDEX] Mammoth cannot read .doc: ${e.message}`);
      }
      // Last resort: read raw binary and strip non-printable chars
      const raw = fs.readFileSync(filePath, 'latin1');
      const text = raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, ' ').trim();
      const cleaned = text.length > 100 ? text : '';
      console.log(`[DOC INDEX] .doc raw fallback: ${cleaned.length} chars`);
      return cleaned;
    }

    // Plain text / CSV
    if (mimetype === 'text/plain' || ext === '.txt' || ext === '.csv' || ext === '.tsv') {
      const text = fs.readFileSync(filePath, 'utf8');
      console.log(`[DOC INDEX] Text file read: ${text.length} chars`);
      return text;
    }

    console.log(`[DOC INDEX] Unsupported format for text extraction: ${mimetype} / ${ext}`);
  } catch (err) {
    console.error(`[DOC INDEX] ERROR extracting text from ${name}:`, err.message);
    console.error(err.stack);
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

  try {
    const db = req.app.locals.db;

    const { tag, isPublic, project_id, folder } = req.body;
    const finalTag = tag || 'Uncategorized';
    const finalIsPublic = isPublic === 'true' || isPublic === true ? 1 : 0;
    const finalProjectId = project_id && project_id !== '' ? parseInt(project_id) : null;
    const finalFolder = folder || '';

    console.log(`[UPLOAD] File: ${req.file.originalname}, mimetype: ${req.file.mimetype}, size: ${req.file.size}, path: ${req.file.path}`);

    // 1. Insert into main table
    const result = db.prepare(`
      INSERT INTO documents (filename, original_name, mimetype, size, uploader_id, tag, is_public, project_id, folder)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id, finalTag, finalIsPublic, finalProjectId, finalFolder);

    const docId = result.lastInsertRowid;

    // 2. Extract text and index FTS5
    let textContent = '';
    try {
      textContent = await extractText(req.file.path, req.file.mimetype, req.file.originalname);
    } catch (extractErr) {
      console.error(`[UPLOAD] Text extraction failed (non-fatal):`, extractErr.message);
    }

    // Also index the filename, tag, and folder so they are searchable
    const indexContent = `${req.file.originalname} \n ${finalTag} \n ${finalFolder} \n ${textContent}`;
    console.log(`[UPLOAD] Indexing ${indexContent.length} chars for doc #${docId} (extracted: ${textContent.length} chars)`);

    db.prepare(`INSERT INTO document_search (document_id, content) VALUES (?, ?)`).run(docId, indexContent);

    const newDoc = db.prepare(`SELECT d.*, u.name as uploader_name, p.title as project_title FROM documents d LEFT JOIN users u ON d.uploader_id = u.id LEFT JOIN projects p ON d.project_id = p.id WHERE d.id = ?`).get(docId);
    newDoc.indexed_chars = textContent.length;
    res.status(201).json(newDoc);
  } catch (err) {
    console.error(`[UPLOAD] Fatal error:`, err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
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
