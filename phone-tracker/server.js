const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const PORT = 5000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const connectedPhones = new Map();
const connectedBoats = new Map();
const viewers = new Set();

const races = [
  { raceId: 'race-2026-1', title: 'Australian Nationals 2026 - Race 1', series: 'aus-nationals-2026' },
  { raceId: 'race-2026-2', title: 'Australian Nationals 2026 - Race 2', series: 'aus-nationals-2026' },
  { raceId: 'race-2026-3', title: 'Australian Nationals 2026 - Race 3', series: 'aus-nationals-2026' },
  { raceId: 'training', title: 'Training Session', series: 'training' }
];

const series = [
  { id: 'aus-nationals-2026', name: 'Australian Nationals 2026', raceCount: 3 },
  { id: 'training', name: 'Training', raceCount: 1 }
];

const fleet = {
  event: 'Australian Finn Nationals 2026',
  club: 'Royal Queensland Yacht Squadron',
  location: 'Manly, Brisbane',
  entries: [
    { sailNumber: 'AUS 1', skipper: 'Oliver Tweddell', country: 'AUS' },
    { sailNumber: 'AUS 21', skipper: 'Jake Lilley', country: 'AUS' },
    { sailNumber: 'AUS 41', skipper: 'Rob McMillan', country: 'AUS' },
    { sailNumber: 'AUS 110', skipper: 'Paul McKenzie', country: 'AUS' },
    { sailNumber: 'AUS 261', skipper: 'John Condie', country: 'AUS' }
  ]
};

app.get('/race/list', (req, res) => {
  res.json({ races, series });
});

app.get('/races', (req, res) => {
  res.json({ races });
});

app.get('/fleet', (req, res) => {
  res.json(fleet);
});

app.get('/data/fleet.json', (req, res) => {
  res.json(fleet);
});

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
    type: 'phone_update',
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
    type: 'phone_disconnect',
    deviceId
  });
  
  res.json({ ok: true });
});

app.post('/update', (req, res) => {
  const { raceId, boatId, name, lat, lon, sog, cog, ts } = req.body;
  
  if (!boatId || lat === undefined || lon === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const boatData = {
    boatId,
    raceId: raceId || 'training',
    name: name || boatId,
    lat,
    lon,
    sog: sog || 0,
    cog: cog || 0,
    timestamp: ts || Date.now(),
    lastUpdate: Date.now()
  };
  
  connectedBoats.set(boatId, boatData);
  
  broadcastToViewers({
    type: 'boat_update',
    boat: boatData
  });
  
  res.json({ ok: true, count: connectedBoats.size });
});

app.get('/boats', (req, res) => {
  const raceId = req.query.raceId;
  const now = Date.now();
  const within = parseInt(req.query.within) * 1000 || 300000;
  const activeBoats = [];
  
  for (const [id, boat] of connectedBoats) {
    if (now - boat.lastUpdate < within) {
      if (!raceId || boat.raceId === raceId) {
        activeBoats.push(boat);
      }
    } else {
      connectedBoats.delete(id);
    }
  }
  
  res.json({ boats: activeBoats });
});

app.delete('/boat/:boatId', (req, res) => {
  const { boatId } = req.params;
  connectedBoats.delete(boatId);
  
  broadcastToViewers({
    type: 'boat_disconnect',
    boatId
  });
  
  res.json({ ok: true });
});

const WebSocket = require('ws');
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log('Viewer connected');
  viewers.add(ws);
  
  const phones = Array.from(connectedPhones.values());
  const boats = Array.from(connectedBoats.values());
  ws.send(JSON.stringify({ type: 'init', phones, boats }));
  
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
      broadcastToViewers({ type: 'phone_disconnect', deviceId: id });
    }
  }
  for (const [id, boat] of connectedBoats) {
    if (now - boat.lastUpdate > 300000) {
      connectedBoats.delete(id);
      broadcastToViewers({ type: 'boat_disconnect', boatId: id });
    }
  }
}, 10000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FinnTrack server running at http://0.0.0.0:${PORT}`);
});
