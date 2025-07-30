import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import formidable from 'formidable';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3011;

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
const tempDir = path.join(__dirname, 'temp');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['Upload-Offset', 'Location', 'Upload-Length', 'Tus-Version', 'Tus-Resumable', 'Tus-Max-Size', 'Tus-Extension', 'Upload-Metadata']
}));

app.use(express.json({ limit: '25gb' }));
app.use(express.urlencoded({ extended: true, limit: '25gb' }));

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

// Upload tracking for resumable uploads
const uploads = new Map();

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

// TUS Protocol Headers for resumable uploads
app.options('/api/upload', (req, res) => {
  res.setHeader('Tus-Resumable', '1.0.0');
  res.setHeader('Tus-Version', '1.0.0');
  res.setHeader('Tus-Max-Size', '26843545600'); // 25GB
  res.setHeader('Tus-Extension', 'creation,expiration');
  res.setHeader('Access-Control-Allow-Methods', 'POST, HEAD, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Upload-Length, Upload-Metadata, Tus-Resumable, Upload-Offset, Content-Type');
  res.status(200).end();
});

// Create upload session (TUS creation)
app.post('/api/upload', (req, res) => {
  try {
    const uploadLength = parseInt(req.headers['upload-length']);
    const uploadMetadata = req.headers['upload-metadata'] || '';
    
    if (!uploadLength || uploadLength > 26843545600) { // 25GB limit
      return res.status(413).json({ error: 'File too large. Maximum size is 25GB.' });
    }

    const uploadId = generateUUID();
    const tempFilePath = path.join(tempDir, uploadId);
    
    // Parse metadata
    let filename = 'unknown';
    let filetype = 'application/octet-stream';
    
    if (uploadMetadata) {
      const metadata = uploadMetadata.split(',').map(item => {
        const [key, value] = item.trim().split(' ');
        return { key, value: Buffer.from(value || '', 'base64').toString() };
      });
      
      const filenameItem = metadata.find(m => m.key === 'filename');
      if (filenameItem) filename = filenameItem.value;
      
      const filetypeItem = metadata.find(m => m.key === 'filetype');
      if (filetypeItem) filetype = filetypeItem.value;
    }

    // Create empty temporary file
    fs.writeFileSync(tempFilePath, '');

    // Store upload session
    uploads.set(uploadId, {
      id: uploadId,
      length: uploadLength,
      offset: 0,
      filename,
      filetype,
      tempPath: tempFilePath,
      created: new Date().toISOString()
    });

    console.log(`🆕 Upload session created: ${filename} (${uploadLength} bytes)`);

    res.setHeader('Tus-Resumable', '1.0.0');
    res.setHeader('Location', `/api/upload/${uploadId}`);
    res.status(201).end();
  } catch (error) {
    console.error('❌ Create upload error:', error);
    res.status(500).json({ error: 'Failed to create upload session' });
  }
});

// Get upload offset (TUS head)
app.head('/api/upload/:id', (req, res) => {
  try {
    const uploadId = req.params.id;
    const upload = uploads.get(uploadId);

    if (!upload) {
      return res.status(404).end();
    }

    res.setHeader('Tus-Resumable', '1.0.0');
    res.setHeader('Upload-Offset', upload.offset.toString());
    res.setHeader('Upload-Length', upload.length.toString());
    res.status(200).end();
  } catch (error) {
    console.error('❌ Head upload error:', error);
    res.status(500).end();
  }
});

// Resume/continue upload (TUS patch)
app.patch('/api/upload/:id', (req, res) => {
  try {
    const uploadId = req.params.id;
    const upload = uploads.get(uploadId);

    if (!upload) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    const uploadOffset = parseInt(req.headers['upload-offset']);
    
    if (uploadOffset !== upload.offset) {
      return res.status(409).json({ error: 'Offset mismatch' });
    }

    // Write chunk to temporary file
    const writeStream = fs.createWriteStream(upload.tempPath, { 
      flags: 'r+', 
      start: uploadOffset 
    });

    let bytesWritten = 0;

    req.on('data', (chunk) => {
      writeStream.write(chunk);
      bytesWritten += chunk.length;
    });

    req.on('end', async () => {
      writeStream.end();
      
      // Update upload progress
      upload.offset += bytesWritten;
      uploads.set(uploadId, upload);

      console.log(`📊 Upload progress: ${upload.filename} - ${upload.offset}/${upload.length} bytes (${Math.round((upload.offset/upload.length)*100)}%)`);

      // Check if upload is complete
      if (upload.offset >= upload.length) {
        try {
          // Move file to final destination
          const finalPath = path.join(uploadsDir, `${Date.now()}-${upload.filename}`);
          fs.renameSync(upload.tempPath, finalPath);

          // Save file metadata
          const fileId = generateUUID();
          const fileMetadataEntry = {
            id: fileId,
            originalName: upload.filename,
            fileName: path.basename(finalPath),
            size: upload.length,
            mimetype: upload.filetype,
            uploadDate: new Date().toISOString(),
            filePath: finalPath
          };

          fileMetadata.set(fileId, fileMetadataEntry);
          saveMetadata(fileMetadata);

          // Cleanup upload session
          uploads.delete(uploadId);

          console.log(`✅ Upload completed: ${upload.filename}`);
        } catch (error) {
          console.error('❌ Error finalizing upload:', error);
        }
      }

      res.setHeader('Tus-Resumable', '1.0.0');
      res.setHeader('Upload-Offset', upload.offset.toString());
      res.status(204).end();
    });

    req.on('error', (error) => {
      console.error('❌ Upload stream error:', error);
      writeStream.destroy();
      res.status(500).json({ error: 'Upload failed' });
    });

  } catch (error) {
    console.error('❌ Patch upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Simple upload endpoint (fallback)
app.post('/api/upload/simple', (req, res) => {
  const form = formidable({
    uploadDir: uploadsDir,
    keepExtensions: true,
    maxFileSize: 26843545600, // 25GB
    filename: (name, ext, part) => {
      return `${Date.now()}-${part.originalFilename}`;
    }
  });

  form.parse(req, (err, fields, files) => {
    if (err) {
      console.error('❌ Simple upload error:', err);
      return res.status(500).json({ error: 'Upload failed' });
    }

    try {
      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Save file metadata
      const fileId = generateUUID();
      const fileMetadataEntry = {
        id: fileId,
        originalName: file.originalFilename || 'unknown',
        fileName: path.basename(file.filepath),
        size: file.size,
        mimetype: file.mimetype || 'application/octet-stream',
        uploadDate: new Date().toISOString(),
        filePath: file.filepath
      };

      fileMetadata.set(fileId, fileMetadataEntry);
      saveMetadata(fileMetadata);

      console.log(`✅ Simple upload completed: ${file.originalFilename}`);
      res.json({ success: true, fileId, filename: file.originalFilename });
    } catch (error) {
      console.error('❌ Error processing simple upload:', error);
      res.status(500).json({ error: 'Failed to process upload' });
    }
  });
});

// Get all files
app.get('/api/files', async (req, res) => {
  try {
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

    const filePath = metadata.filePath;
    
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

    const filePath = metadata.filePath;
    
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
      activeUploads: uploads.size,
      storage: 'Local File System',
      uploadsDirectory: uploadsDir,
      resumableUploads: 'Custom TUS Implementation'
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
  console.log(`🔄 Custom resumable uploads enabled`);
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

// Cleanup temporary files on startup
const cleanupTempFiles = () => {
  try {
    const tempFiles = fs.readdirSync(tempDir);
    tempFiles.forEach(file => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      
      // Delete temp files older than 24 hours
      if (ageHours > 24) {
        fs.unlinkSync(filePath);
        console.log(`🧹 Cleaned up old temp file: ${file}`);
      }
    });
  } catch (error) {
    console.error('❌ Error cleaning temp files:', error);
  }
};

cleanupTempFiles();