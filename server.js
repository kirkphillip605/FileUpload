const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Server: TusServer } = require('tus-node-server');
const { FileStore } = require('@tus/file-store');
const formidable = require('formidable');

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

// Configure MinIO S3 client
const s3Client = new S3Client({
  endpoint: 'http://vps.kirknetllc.com:9000',
  region: 'us-east-1', // MinIO doesn't care about region, but AWS SDK requires it
  credentials: {
    accessKeyId: '163f0c3c496d54dcf53d98db5d6fb74acc2689e86736ae527ac4c496a85b458d',
    secretAccessKey: '3dabb8326f1941cf156185080e23280e27dc9c366d668f257d1ceaffe3651adc'
  },
  forcePathStyle: true // Required for MinIO
});

const BUCKET_NAME = 'kirknet-bucket';

// Ensure required directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const tempDir = path.join(__dirname, 'temp-uploads');
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

// Configure TUS server for resumable uploads
const tusServer = new TusServer({
  path: '/api/upload',
  datastore: new FileStore({
    directory: tempDir,
  }),
  namingFunction: (req) => {
    // Use custom naming function to preserve original filename
    const metadata = req.headers['upload-metadata'];
    if (metadata) {
      const decoded = Buffer.from(metadata.split(' ')[1] || '', 'base64').toString();
      return `${Date.now()}-${decoded}`;
    }
    return generateUUID();
  },
  onUploadFinish: async (req, res, upload) => {
    console.log('📤 Upload finished:', upload.id);
    
    try {
      // Read the completed file from temp storage
      const tempFilePath = path.join(tempDir, upload.id);
      const fileStream = fs.createReadStream(tempFilePath);
      
      // Extract metadata
      const metadata = upload.metadata || {};
      const originalName = metadata.filename || 'unknown-file';
      const fileType = metadata.filetype || 'application/octet-stream';
      
      // Generate S3 key
      const s3Key = `uploads/${Date.now()}-${originalName}`;
      
      // Upload to MinIO/S3
      const uploadCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileStream,
        ContentType: fileType,
        Metadata: {
          originalName: originalName,
          uploadDate: new Date().toISOString(),
          uploadId: upload.id
        }
      });
      
      await s3Client.send(uploadCommand);
      console.log('✅ File uploaded to MinIO:', s3Key);
      
      // Store file metadata
      const fileId = generateUUID();
      const fileMetadata = {
        id: fileId,
        originalName: originalName,
        s3Key: s3Key,
        size: upload.size,
        mimetype: fileType,
        uploadDate: new Date().toISOString(),
        bucket: BUCKET_NAME
      };
      
      // Save metadata to local storage
      const metadataMap = loadMetadata();
      metadataMap.set(fileId, fileMetadata);
      saveMetadata(metadataMap);
      
      // Clean up temp file
      try {
        fs.unlinkSync(tempFilePath);
        console.log('🧹 Cleaned up temp file:', tempFilePath);
      } catch (cleanupError) {
        console.warn('⚠️ Could not clean up temp file:', cleanupError.message);
      }
      
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
    // Get files from local metadata (which includes S3 references)
    const files = Array.from(fileMetadata.values()).map(file => ({
      id: file.id,
      name: file.originalName,
      size: file.size,
      uploadDate: file.uploadDate,
      type: file.mimetype,
      path: `/api/download/${file.id}`
    }));

    console.log(`📋 Serving ${files.length} files from metadata`);
    res.json(files);
  } catch (error) {
    console.error('❌ Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Download file from MinIO
app.get('/api/download/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const metadata = fileMetadata.get(fileId);

    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    console.log('📥 Downloading file from MinIO:', metadata.s3Key);

    // Get file from MinIO
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: metadata.s3Key
    });

    const response = await s3Client.send(getCommand);

    // Set appropriate headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
    res.setHeader('Content-Type', metadata.mimetype);
    res.setHeader('Content-Length', metadata.size);

    // Stream the file
    response.Body.pipe(res);
  } catch (error) {
    console.error('❌ Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Delete file from MinIO and metadata
app.delete('/api/files/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const metadata = fileMetadata.get(fileId);

    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    console.log('🗑️ Deleting file from MinIO:', metadata.s3Key);

    // Delete from MinIO
    const deleteCommand = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: metadata.s3Key
    });

    await s3Client.send(deleteCommand);
    console.log('✅ File deleted from MinIO');

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
    // Test MinIO connection
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 1
    });
    
    await s3Client.send(listCommand);
    
    res.json({ 
      status: 'ok', 
      message: 'File upload server is running',
      filesCount: fileMetadata.size,
      storage: 'MinIO S3-Compatible',
      bucket: BUCKET_NAME,
      resumableUploads: 'TUS Protocol Enabled'
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Storage connection failed',
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
  console.log(`📁 Temp uploads directory: ${tempDir}`);
  console.log(`🪣 MinIO bucket: ${BUCKET_NAME}`);
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