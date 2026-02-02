const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5000;
const HOST = '0.0.0.0';

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

function findFile(urlPath) {
  const publicDir = path.join(__dirname, 'public');
  
  let filePath = path.join(publicDir, urlPath);
  
  try {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    } else if (stats.isFile()) {
      return filePath;
    }
  } catch (e) {
    const indexPath = path.join(filePath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }
  
  return null;
}

const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  let urlPath = req.url.split('?')[0];
  
  if (urlPath === '/') {
    urlPath = '/index.html';
  }

  const filePath = findFile(urlPath);
  
  if (!filePath) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error('Error reading file:', filePath, err);
      res.writeHead(500);
      res.end('Server Error');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Static server running at http://${HOST}:${PORT}/`);
});
