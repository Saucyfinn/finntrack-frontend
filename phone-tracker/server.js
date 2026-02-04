const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

const PORT = 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const connectedPhones = new Map();

const viewers = new Set();

app.post('/api/update', (req, res) => {
  const { deviceId, name, lat, lon, speed, heading, accuracy } = req.body;
  
  if (!deviceId || lat === undefined || lon === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const phoneData = {
    deviceId,
    name: name || deviceId,
    lat,
    lon,
    speed: speed || 0,
    heading: heading || 0,
    accuracy: accuracy || 0,
    lastUpdate: Date.now()
  };
  
  connectedPhones.set(deviceId, phoneData);
  
  broadcastToViewers({
    type: 'update',
    phone: phoneData
  });
  
  res.json({ ok: true, count: connectedPhones.size });
});

app.get('/api/phones', (req, res) => {
  const now = Date.now();
  const activePhones = [];
  
  for (const [id, phone] of connectedPhones) {
    if (now - phone.lastUpdate < 60000) {
      activePhones.push(phone);
    } else {
      connectedPhones.delete(id);
    }
  }
  
  res.json({ phones: activePhones });
});

app.delete('/api/phone/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  connectedPhones.delete(deviceId);
  
  broadcastToViewers({
    type: 'disconnect',
    deviceId
  });
  
  res.json({ ok: true });
});

const WebSocket = require('ws');
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('Viewer connected');
  viewers.add(ws);
  
  const phones = Array.from(connectedPhones.values());
  ws.send(JSON.stringify({ type: 'init', phones }));
  
  ws.on('close', () => {
    viewers.delete(ws);
    console.log('Viewer disconnected');
  });
});

function broadcastToViewers(message) {
  const data = JSON.stringify(message);
  for (const ws of viewers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [id, phone] of connectedPhones) {
    if (now - phone.lastUpdate > 60000) {
      connectedPhones.delete(id);
      broadcastToViewers({ type: 'disconnect', deviceId: id });
    }
  }
}, 10000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Phone Tracker server running at http://0.0.0.0:${PORT}`);
});
