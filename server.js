const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3011;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename while preserving extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 * 1024 // 50GB limit (effectively unlimited for most use cases)
  }
});

// File metadata storage (in production, use a database)
const fileMetadata = new Map();

// Load existing file metadata on startup
const metadataFile = path.join(__dirname, 'file-metadata.json');
if (fs.existsSync(metadataFile)) {
  try {
    const data = fs.readFileSync(metadataFile, 'utf8');
    const metadata = JSON.parse(data);
    Object.entries(metadata).forEach(([key, value]) => {
      fileMetadata.set(key, value);
    });
    console.log(`Loaded metadata for ${fileMetadata.size} files`);
  } catch (error) {
    console.error('Error loading file metadata:', error);
  }
}

// Save metadata to file
const saveMetadata = () => {
  try {
    const metadata = Object.fromEntries(fileMetadata);
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error('Error saving file metadata:', error);
  }
};

// API Routes

// Upload file
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = uuidv4();
    const metadata = {
      id: fileId,
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadDate: new Date().toISOString(),
      path: req.file.path
    };

    fileMetadata.set(fileId, metadata);
    saveMetadata();

    console.log(`File uploaded: ${req.file.originalname} (${req.file.size} bytes)`);

    res.json({
      success: true,
      file: {
        id: fileId,
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get all files
app.get('/api/files', (req, res) => {
  try {
    const files = Array.from(fileMetadata.values()).map(file => ({
      id: file.id,
      name: file.originalName,
      size: file.size,
      uploadDate: file.uploadDate,
      type: file.mimetype,
      path: `/api/download/${file.id}`
    }));

    res.json(files);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Download file
app.get('/api/download/:fileId', (req, res) => {
  try {
    const fileId = req.params.fileId;
    const metadata = fileMetadata.get(fileId);

    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = metadata.path;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Set appropriate headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
    res.setHeader('Content-Type', metadata.mimetype);

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Delete file
app.delete('/api/files/:fileId', (req, res) => {
  try {
    const fileId = req.params.fileId;
    const metadata = fileMetadata.get(fileId);

    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete file from disk
    if (fs.existsSync(metadata.path)) {
      fs.unlinkSync(metadata.path);
    }

    // Remove from metadata
    fileMetadata.delete(fileId);
    saveMetadata();

    console.log(`File deleted: ${metadata.originalName}`);

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'File upload server is running',
    filesCount: fileMetadata.size
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ File upload server running on port ${PORT}`);
  console.log(`Uploads directory: ${uploadsDir}`);
  console.log(`Loaded ${fileMetadata.size} existing files`);
  console.log(`API available at: http://localhost:${PORT}/api/`);
});

// Handle server startup errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Please close other applications using this port.`);
  } else {
    console.error('❌ Server error:', error);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down file upload server...');
  server.close(() => {
    console.log('✅ File upload server closed');
    process.exit(0);
  });
});