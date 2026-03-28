const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('./auth');

const router = express.Router();

// Gallery uploads directory
const GALLERY_DIR = path.join('/app/uploads/gallery');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(GALLERY_DIR)) fs.mkdirSync(GALLERY_DIR, { recursive: true });
    cb(null, GALLERY_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
  }
});

// GET /api/gallery — list all images (public, no auth required)
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const images = db.prepare(`
    SELECT g.*, u.name as uploaded_by_name
    FROM gallery_images g
    LEFT JOIN users u ON g.uploaded_by = u.id
    ORDER BY g.uploaded_at DESC
  `).all();
  res.json(images);
});

// GET /api/gallery/image/:filename — serve image file
router.get('/image/:filename', (req, res) => {
  const filePath = path.join(GALLERY_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Image not found' });
  res.sendFile(filePath);
});

// POST /api/gallery — upload new image (auth required)
router.post('/', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  const { title, category } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });

  const validCategories = ['lab', 'fieldwork', 'events', 'team'];
  const cat = validCategories.includes(category) ? category : 'team';

  const db = req.app.locals.db;
  const result = db.prepare(`
    INSERT INTO gallery_images (filename, original_name, title, category, uploaded_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.file.filename, req.file.originalname, title.trim(), cat, req.user.id);

  res.json({ id: result.lastInsertRowid, message: 'Image uploaded successfully' });
});

// DELETE /api/gallery/:id — delete image (creator or PI)
router.delete('/:id', authMiddleware, (req, res) => {
  const db = req.app.locals.db;
  const image = db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(req.params.id);
  if (!image) return res.status(404).json({ error: 'Image not found' });

  // Only creator or PI can delete
  if (req.user.role !== 'pi' && image.uploaded_by !== req.user.id) {
    return res.status(403).json({ error: 'Only the uploader or PI can delete this image' });
  }

  // Delete file from disk
  const filePath = path.join(GALLERY_DIR, image.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM gallery_images WHERE id = ?').run(req.params.id);
  res.json({ message: 'Image deleted' });
});

module.exports = router;
