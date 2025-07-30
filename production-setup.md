# Production Deployment Guide

## 1. Build the Application

First, build the React frontend for production:

```bash
npm run build
```

This creates a `dist/` folder with optimized production files.

## 2. Simple Production Start

For a quick production start:

```bash
npm run start:prod
```

This builds the app and starts the server on port 3010.

## 3. Production Deployment with PM2 (Recommended)

### Install PM2 globally:
```bash
npm install -g pm2
```

### Start the application:
```bash
pm2 start ecosystem.config.js
```

### Useful PM2 commands:
```bash
pm2 status                 # Check app status
pm2 logs file-upload-server # View logs
pm2 restart file-upload-server # Restart app
pm2 stop file-upload-server   # Stop app
pm2 delete file-upload-server # Remove app from PM2
```

### Setup PM2 to start on system boot:
```bash
pm2 startup
pm2 save
```

## 4. Nginx Configuration (Optional)

If you want to serve on port 80/443, configure Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name files.kirknetllc.com;
    
    location / {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Handle large file uploads (25GB limit)
        client_max_body_size 25G;
        proxy_connect_timeout 1800s;      # 30 minutes
        proxy_send_timeout 1800s;         # 30 minutes
        proxy_read_timeout 1800s;         # 30 minutes
        proxy_request_buffering off;      # Don't buffer large uploads
    }
}
```

## 5. SSL Certificate (HTTPS)

For production, set up SSL with Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d files.kirknetllc.com
```

## 6. File Structure

Your production server should have:
```
/your-app-directory/
├── server.js              # Main server file
├── package.json           # Dependencies
├── ecosystem.config.js    # PM2 configuration
├── dist/                  # Built React app
├── uploads/               # Uploaded files storage
├── file-metadata.json     # File metadata
└── logs/                  # Application logs
```

## 7. Environment Variables

Set production environment:
```bash
export NODE_ENV=production
export PORT=3010
```

## 8. Server Requirements

- Node.js 16+ installed
- Sufficient disk space for file uploads
- Proper firewall configuration for port 3010 (or 80/443 with Nginx)

## 9. Monitoring

Check application health:
- Health check endpoint: `http://files.kirknetllc.com:3010/api/health`
- PM2 monitoring: `pm2 monit`
- Log files in `./logs/` directory

## 10. Backup

Regularly backup:
- `uploads/` directory (contains all uploaded files)
- `file-metadata.json` (contains file metadata)