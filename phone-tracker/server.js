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

let boatHistory = new Map();
let phoneHistory = new Map();
const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      boatHistory = new Map(Object.entries(data.boats || {}));
      phoneHistory = new Map(Object.entries(data.phones || {}));
      console.log(`Loaded history: ${boatHistory.size} boats, ${phoneHistory.size} phones`);
    }
  } catch (e) {
    console.log('No existing history file or error loading:', e.message);
  }
}

function saveHistory() {
  try {
    const dir = path.dirname(HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {
      boats: Object.fromEntries(boatHistory),
      phones: Object.fromEntries(phoneHistory),
      savedAt: Date.now()
    };
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving history:', e.message);
  }
}

loadHistory();

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

function addBoatHistoryPoint(boatId, point) {
  if (!boatHistory.has(boatId)) {
    boatHistory.set(boatId, []);
  }
  boatHistory.get(boatId).push(point);
}

function addPhoneHistoryPoint(deviceId, point) {
  if (!phoneHistory.has(deviceId)) {
    phoneHistory.set(deviceId, []);
  }
  phoneHistory.get(deviceId).push(point);
}

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
  
  const timestamp = Date.now();
  const phoneData = {
    deviceId,
    name: name || deviceId,
    lat,
    lon,
    speed: speed || 0,
    heading: heading || 0,
    accuracy: accuracy || 0,
    lastUpdate: timestamp
  };
  
  connectedPhones.set(deviceId, phoneData);
  
  addPhoneHistoryPoint(deviceId, {
    lat, lon, speed: speed || 0, heading: heading || 0, ts: timestamp, name: phoneData.name
  });
  
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
  
  const timestamp = ts || Date.now();
  const boatData = {
    boatId,
    raceId: raceId || 'training',
    name: name || boatId,
    lat,
    lon,
    sog: sog || 0,
    cog: cog || 0,
    timestamp,
    lastUpdate: Date.now()
  };
  
  connectedBoats.set(boatId, boatData);
  
  addBoatHistoryPoint(boatId, {
    lat, lon, sog: sog || 0, cog: cog || 0, ts: timestamp, raceId: boatData.raceId, name: boatData.name
  });
  
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

app.get('/api/history/boats', (req, res) => {
  const raceId = req.query.raceId;
  const since = parseInt(req.query.since) || 0;
  const result = {};
  
  for (const [boatId, history] of boatHistory) {
    const filtered = history.filter(p => {
      if (raceId && p.raceId !== raceId) return false;
      if (since && p.ts < since) return false;
      return true;
    });
    if (filtered.length > 0) {
      result[boatId] = filtered;
    }
  }
  
  res.json({ history: result });
});

app.get('/api/history/phones', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const result = {};
  
  for (const [deviceId, history] of phoneHistory) {
    const filtered = history.filter(p => !since || p.ts >= since);
    if (filtered.length > 0) {
      result[deviceId] = filtered;
    }
  }
  
  res.json({ history: result });
});

app.get('/api/analytics/boats', (req, res) => {
  const raceId = req.query.raceId;
  const analytics = [];
  
  for (const [boatId, history] of boatHistory) {
    const filtered = raceId ? history.filter(p => p.raceId === raceId) : history;
    if (filtered.length < 2) continue;
    
    const speeds = filtered.map(p => p.sog).filter(s => s > 0);
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a,b) => a+b, 0) / speeds.length : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    
    let totalDistance = 0;
    for (let i = 1; i < filtered.length; i++) {
      totalDistance += haversine(
        filtered[i-1].lat, filtered[i-1].lon,
        filtered[i].lat, filtered[i].lon
      );
    }
    
    const duration = (filtered[filtered.length-1].ts - filtered[0].ts) / 1000;
    
    analytics.push({
      boatId,
      name: filtered[0].name || boatId,
      points: filtered.length,
      avgSpeed: Math.round(avgSpeed * 10) / 10,
      maxSpeed: Math.round(maxSpeed * 10) / 10,
      distance: Math.round(totalDistance * 100) / 100,
      duration: Math.round(duration),
      speedHistory: filtered.map(p => ({ ts: p.ts, sog: p.sog }))
    });
  }
  
  res.json({ analytics });
});

app.get('/api/analytics/phones', (req, res) => {
  const analytics = [];
  
  for (const [deviceId, history] of phoneHistory) {
    if (history.length < 2) continue;
    
    const speeds = history.map(p => p.speed).filter(s => s > 0);
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a,b) => a+b, 0) / speeds.length : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    
    let totalDistance = 0;
    for (let i = 1; i < history.length; i++) {
      totalDistance += haversine(
        history[i-1].lat, history[i-1].lon,
        history[i].lat, history[i].lon
      );
    }
    
    const duration = (history[history.length-1].ts - history[0].ts) / 1000;
    
    analytics.push({
      deviceId,
      name: history[0].name || deviceId,
      points: history.length,
      avgSpeed: Math.round(avgSpeed * 100) / 100,
      maxSpeed: Math.round(maxSpeed * 100) / 100,
      distance: Math.round(totalDistance * 100) / 100,
      duration: Math.round(duration),
      speedHistory: history.map(p => ({ ts: p.ts, speed: p.speed }))
    });
  }
  
  res.json({ analytics });
});

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

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

setInterval(saveHistory, 30000);

process.on('SIGTERM', () => {
  saveHistory();
  process.exit(0);
});
process.on('SIGINT', () => {
  saveHistory();
  process.exit(0);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FinnTrack server running at http://0.0.0.0:${PORT}`);
});
