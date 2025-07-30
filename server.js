const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Server: TusServer } = require('tus-node-server');
const { FileStore } = require('@tus/file-store');

const app = express();
const PORT = process.env.PORT || 3010;

// Generate UUID without external dependency
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Ensure required directories exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['Upload-Offset', 'Location', 'Upload-Length', 'Tus-Version', 'Tus-Resumable', 'Tus-Max-Size', 'Tus-Extension', 'Upload-Metadata']
}));

// Configure TUS server for resumable uploads
const tusServer = new TusServer({
  path: '/api/upload',
  datastore: new FileStore({
    directory: uploadsDir,
  }),
  namingFunction: (req) => {
    // Use custom naming function to preserve original filename
    const metadata = req.headers['upload-metadata'];
    if (metadata) {
      const decoded = Buffer.from(metadata.split(' ')[1] || '', 'base64').toString();
      const sanitizedName = decoded.replace(/[^a-zA-Z0-9.-]/g, '_');
      return `${Date.now()}-${sanitizedName}`;
    }
    return generateUUID();
  },
  onUploadFinish: async (req, res, upload) => {
    console.log('📤 Upload finished to local storage:', upload.id);
    
    try {
      // File is already in the uploads directory, just need to save metadata
      const filePath = path.join(uploadsDir, upload.id);
      
      // Extract metadata
      const metadata = upload.metadata || {};
      const originalName = metadata.filename || 'unknown-file';
      const fileType = metadata.filetype || 'application/octet-stream';
      
      // Get file size
      const stats = fs.statSync(filePath);
      
      // Store file metadata
      const fileId = generateUUID();
      const fileMetadata = {
        id: fileId,
        originalName: originalName,
        fileName: upload.id, // The actual filename on disk
        size: stats.size,
        mimetype: fileType,
        uploadDate: new Date().toISOString(),
        filePath: filePath
      };
      
      // Save metadata
      const metadataMap = loadMetadata();
      metadataMap.set(fileId, fileMetadata);
      saveMetadata(metadataMap);
      
      console.log('✅ File saved to local storage:', originalName);
      
    } catch (error) {
      console.error('❌ Error processing completed upload:', error);
    }
  },
  onUploadCreate: (req, res, upload) => {
    console.log('🆕 Upload created:', upload.id);
    return res;
  }
});

// File metadata storage
let fileMetadata = new Map();

// Load existing file metadata on startup
const metadataFile = path.join(__dirname, 'file-metadata.json');

const loadMetadata = () => {
  if (fs.existsSync(metadataFile)) {
    try {
      const data = fs.readFileSync(metadataFile, 'utf8');
      const metadata = JSON.parse(data);
      const metadataMap = new Map();
      Object.entries(metadata).forEach(([key, value]) => {
        metadataMap.set(key, value);
      });
      return metadataMap;
    } catch (error) {
      console.error('Error loading file metadata:', error);
      return new Map();
    }
  }
  return new Map();
};

const saveMetadata = (metadataMap) => {
  try {
    const metadata = Object.fromEntries(metadataMap);
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error('Error saving file metadata:', error);
  }
};

// Load metadata on startup
fileMetadata = loadMetadata();

// Serve built React app in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  
  // Serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Handle TUS resumable uploads
app.all('/api/upload', (req, res) => {
  console.log(`📡 TUS request: ${req.method} ${req.url}`);
  tusServer.handle(req, res);
});

app.all('/api/upload/*', (req, res) => {
  console.log(`📡 TUS request: ${req.method} ${req.url}`);
  tusServer.handle(req, res);
});

// Get all files
app.get('/api/files', async (req, res) => {
  try {
    // Get files from local metadata
    const files = Array.from(fileMetadata.values()).map(file => ({
      id: file.id,
      name: file.originalName,
      size: file.size,
      uploadDate: file.uploadDate,
      type: file.mimetype,
      path: `/api/download/${file.id}`
    }));

    console.log(`📋 Serving ${files.length} files from local storage`);
    res.json(files);
  } catch (error) {
    console.error('❌ Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Download file from local storage
app.get('/api/download/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const metadata = fileMetadata.get(fileId);

    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(uploadsDir, metadata.fileName);
    
    // Check if file exists on disk
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    console.log('📥 Downloading file from local storage:', metadata.originalName);

    // Get file stats
    const stats = fs.statSync(filePath);

    // Set appropriate headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
    res.setHeader('Content-Type', metadata.mimetype);
    res.setHeader('Content-Length', stats.size);

    // Stream the file from disk
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('❌ Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Delete file from local storage and metadata
app.delete('/api/files/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const metadata = fileMetadata.get(fileId);

    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(uploadsDir, metadata.fileName);
    
    console.log('🗑️ Deleting file from local storage:', metadata.originalName);

    // Delete from local storage
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('✅ File deleted from local storage');
    }

    // Remove from local metadata
    fileMetadata.delete(fileId);
    saveMetadata(fileMetadata);

    console.log(`🗑️ File deleted: ${metadata.originalName}`);

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    // Check if uploads directory exists and is writable
    if (!fs.existsSync(uploadsDir)) {
      throw new Error('Uploads directory does not exist');
    }
    
    res.json({ 
      status: 'ok', 
      message: 'File upload server is running',
      filesCount: fileMetadata.size,
      storage: 'Local File System',
      uploadsDirectory: uploadsDir,
      resumableUploads: 'TUS Protocol Enabled'
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Local storage check failed',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ File upload server running on port ${PORT}`);
  console.log(`📁 Local uploads directory: ${uploadsDir}`);
  console.log(`📊 Loaded ${fileMetadata.size} existing files`);
  console.log(`🔄 Resumable uploads enabled (TUS protocol)`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
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