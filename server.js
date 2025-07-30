// server.js
// Express-based file upload server with TUS resumable protocol and simple uploads

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import formidable from 'formidable';
import { pipeline } from 'stream/promises';

// Constants
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3011;
const MAX_FILE_SIZE = 25 * 1024 * 1024 * 1024; // 25GB
const TUS_VERSION = '1.0.0';
const METADATA_FILE = path.join(__dirname, 'file-metadata.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TEMP_DIR = path.join(__dirname, 'temp');

// Ensure directories exist
async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    console.error(`Failed to create directory ${dir}:`, err);
    process.exit(1);
  }
}

// Generate a UUID (no external dependency)
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Metadata store abstraction for persistent file info
class MetadataStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.map = new Map();
  }

  async load() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      const obj = JSON.parse(data);
      this.map = new Map(Object.entries(obj));
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Error loading metadata:', err);
    }
  }

  async save() {
    try {
      await fs.writeFile(this.filePath, JSON.stringify(Object.fromEntries(this.map), null, 2));
    } catch (err) {
      console.error('Error saving metadata:', err);
    }
  }

  get(id) { return this.map.get(id); }
  set(id, entry) { this.map.set(id, entry); }
  delete(id) { this.map.delete(id); }
  entries() { return Array.from(this.map.values()); }
  count() { return this.map.size; }
}

const metadataStore = new MetadataStore(METADATA_FILE);

// Cleanup old temporary files older than 24h
async function cleanupTempFiles() {
  try {
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = await fs.stat(filePath);
      const ageHours = (now - stats.mtimeMs) / (1000 * 60 * 60);
      if (ageHours > 24) {
        await fs.unlink(filePath);
        console.log(`🧹 Cleaned up old temp file: ${file}`);
      }
    }
  } catch (err) {
    console.error('Error cleaning temp files:', err);
  }
}

// Startup initialization
(async () => {
  await Promise.all([ensureDir(UPLOADS_DIR), ensureDir(TEMP_DIR)]);
  await metadataStore.load();
  cleanupTempFiles();
  setInterval(cleanupTempFiles, 60 * 60 * 1000); // Hourly cleanup

  const app = express();

  // Global middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(helmet());
  app.use(morgan('combined'));
  app.use(express.json({ limit: MAX_FILE_SIZE }));
  app.use(express.urlencoded({ extended: true, limit: MAX_FILE_SIZE }));

  // Rate limiting for upload endpoints
  const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, message: 'Too many requests, please try again later.' });
  app.use(['/api/upload', '/api/upload/simple'], uploadLimiter);

  // Serve React app in production
  if (process.env.NODE_ENV === 'production') {
    const DIST = path.join(__dirname, 'dist');
    app.use(express.static(DIST));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
      res.sendFile(path.join(DIST, 'index.html'));
    });
  }

  // In-memory resumable uploads tracking
  const uploads = new Map();

  // TUS protocol support
  app.options('/api/upload', (_req, res) => {
    res.set({
      'Tus-Resumable': TUS_VERSION,
      'Tus-Version': TUS_VERSION,
      'Tus-Max-Size': MAX_FILE_SIZE.toString(),
      'Tus-Extension': 'creation,expiration',
      'Access-Control-Allow-Methods': 'POST, HEAD, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Upload-Length, Upload-Metadata, Tus-Resumable, Upload-Offset, Content-Type'
    }).sendStatus(200);
  });

  app.post('/api/upload', async (req, res) => {
    try {
      const length = Number(req.headers['upload-length']);
      if (!length || length > MAX_FILE_SIZE) return res.status(413).json({ error: 'File too large. Maximum is 25GB.' });

      const rawMeta = String(req.headers['upload-metadata'] || '');
      const meta = Object.fromEntries(rawMeta.split(',').map(part => {
        const [key, base64] = part.trim().split(' ');
        return [key, base64 ? Buffer.from(base64, 'base64').toString() : ''];
      }));
      const filename = path.basename(meta.filename || 'unknown');
      const filetype = meta.filetype || 'application/octet-stream';

      const uploadId = generateUUID();
      const tempPath = path.join(TEMP_DIR, uploadId);
      await fs.writeFile(tempPath, '');

      uploads.set(uploadId, { id: uploadId, length, offset: 0, filename, filetype, tempPath, created: new Date().toISOString() });
      res.set({'Tus-Resumable': TUS_VERSION, 'Location': `/api/upload/${uploadId}`}).status(201).end();
    } catch (err) {
      console.error('Error creating upload session:', err);
      res.status(500).json({ error: 'Failed to create upload session' });
    }
  });

  app.head('/api/upload/:id', (req, res) => {
    const upload = uploads.get(req.params.id);
    if (!upload) return res.sendStatus(404);
    res.set({'Tus-Resumable': TUS_VERSION, 'Upload-Offset': upload.offset, 'Upload-Length': upload.length}).sendStatus(200);
  });

  app.patch('/api/upload/:id', async (req, res) => {
    const upload = uploads.get(req.params.id);
    if (!upload) return res.status(404).json({ error: 'Upload session not found' });

    const offsetHeader = Number(req.headers['upload-offset']);
    if (offsetHeader !== upload.offset) return res.status(409).json({ error: 'Offset mismatch' });

    try {
      const writeStream = fs.createWriteStream(upload.tempPath, { flags: 'r+', start: upload.offset });
      await pipeline(req, writeStream);

      const stats = await fs.stat(upload.tempPath);
      upload.offset = stats.size;

      if (upload.offset >= upload.length) {
        const finalName = `${Date.now()}-${path.basename(upload.filename)}`;
        const finalPath = path.join(UPLOADS_DIR, finalName);
        await fs.rename(upload.tempPath, finalPath);

        const fileId = generateUUID();
        const entry = {
          id: fileId,
          originalName: upload.filename,
          fileName: finalName,
          size: upload.length,
          mimetype: upload.filetype,
          uploadDate: new Date().toISOString(),
          filePath: finalPath
        };
        metadataStore.set(fileId, entry);
        await metadataStore.save();
        uploads.delete(upload.id);
        console.log(`✅ Upload completed: ${entry.originalName}`);
      }

      res.set({'Tus-Resumable': TUS_VERSION, 'Upload-Offset': upload.offset}).sendStatus(204);
    } catch (err) {
      console.error('Error during upload:', err);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Fallback simple upload
  app.post('/api/upload/simple', (req, res) => {
    const form = formidable({
      uploadDir: UPLOADS_DIR,
      keepExtensions: true,
      maxFileSize: MAX_FILE_SIZE,
      filename: (_name, _ext, part) => `${Date.now()}-${path.basename(part.originalFilename || '')}`
    });

    form.parse(req, async (err, _fields, files) => {
      if (err) {
        console.error('Simple upload error:', err);
        return res.status(500).json({ error: 'Upload failed' });
      }
      try {
        const file = Array.isArray(files.file) ? files.file[0] : files.file;
        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        const fileId = generateUUID();
        const entry = {
          id: fileId,
          originalName: file.originalFilename || 'unknown',
          fileName: path.basename(file.filepath),
          size: file.size,
          mimetype: file.mimetype || 'application/octet-stream',
          uploadDate: new Date().toISOString(),
          filePath: file.filepath
        };
        metadataStore.set(fileId, entry);
        await metadataStore.save();
        console.log(`✅ Simple upload completed: ${entry.originalName}`);
        res.json({ success: true, fileId, filename: entry.originalName });
      } catch (err) {
        console.error('Error processing simple upload:', err);
        res.status(500).json({ error: 'Failed to process upload' });
      }
    });
  });

  // List all files
  app.get('/api/files', (req, res) => {
    const files = metadataStore.entries().map(f => ({
      id: f.id,
      name: f.originalName,
      size: f.size,
      uploadDate: f.uploadDate,
      type: f.mimetype,
      path: `/api/download/${f.id}`
    }));
    res.json(files);
  });

  // Download a file
  app.get('/api/download/:fileId', async (req, res) => {
    try {
      const metadata = metadataStore.get(req.params.fileId);
      if (!metadata) return res.status(404).json({ error: 'File not found' });

      const stat = await fs.stat(metadata.filePath);
      res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
      res.setHeader('Content-Type', metadata.mimetype);
      res.setHeader('Content-Length', stat.size);
      await pipeline(fs.createReadStream(metadata.filePath), res);
    } catch (err) {
      console.error('Download error:', err);
      res.status(500).json({ error: 'Download failed' });
    }
  });

  // Delete a file
  app.delete('/api/files/:fileId', async (req, res) => {
    try {
      const metadata = metadataStore.get(req.params.fileId);
      if (!metadata) return res.status(404).json({ error: 'File not found' });

      try { await fs.unlink(metadata.filePath); console.log(`🗑️ Deleted file: ${metadata.originalName}`); } catch {}

      metadataStore.delete(metadata.id);
      await metadataStore.save();
      res.json({ success: true, message: 'File deleted successfully' });
    } catch (err) {
      console.error('Delete error:', err);
      res.status(500).json({ error: 'Delete failed' });
    }
  });

  // Health check
  app.get('/api/health', async (req, res) => {
    try {
      await fs.access(UPLOADS_DIR);
      res.json({
        status: 'ok',
        message: 'File upload server is running',
        filesCount: metadataStore.count(),
        activeUploads: uploads.size,
        storage: 'Local File System',
        resumableUploads: 'Custom TUS Implementation'
      });
    } catch (err) {
      console.error('Health check failed:', err);
      res.status(500).json({ status: 'error', message: 'Local storage check failed', error: err.message });
    }
  });

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start server
  const server = app.listen(PORT, '10.10.0.251', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Available at: http://10.10.0.251:${PORT}`);
    console.log(`🔗 Public URL: https://files.kirknetllc.com`);
    console.log(`📁 Uploads dir: ${UPLOADS_DIR}`);
    console.log(`📊 Loaded ${metadataStore.count()} files`);
    console.log(`🔄 Resumable uploads enabled`);
    console.log(`🏥 Health check: https://files.kirknetllc.com/api/health`);
  });

  // Handle startup errors
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') console.error(`❌ Port ${PORT} in use`);
    else console.error('Server error:', err);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Shutting down...');
    server.close(() => {
      console.log('✅ Closed');
      process.exit(0);
    });
  });
})();