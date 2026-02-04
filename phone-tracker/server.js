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
  { raceId: 'aus-nats-1', title: 'Australian Nationals 2026 - Race 1', series: 'aus-nationals-2026' },
  { raceId: 'aus-nats-2', title: 'Australian Nationals 2026 - Race 2', series: 'aus-nationals-2026' },
  { raceId: 'aus-nats-3', title: 'Australian Nationals 2026 - Race 3', series: 'aus-nationals-2026' },
  { raceId: 'gold-cup-1', title: 'Finn Gold Cup 2026 - Race 1', series: 'gold-cup-2026' },
  { raceId: 'gold-cup-2', title: 'Finn Gold Cup 2026 - Race 2', series: 'gold-cup-2026' },
  { raceId: 'gold-cup-3', title: 'Finn Gold Cup 2026 - Race 3', series: 'gold-cup-2026' },
  { raceId: 'masters-1', title: 'Finn World Masters 2026 - Race 1', series: 'masters-2026' },
  { raceId: 'masters-2', title: 'Finn World Masters 2026 - Race 2', series: 'masters-2026' },
  { raceId: 'masters-3', title: 'Finn World Masters 2026 - Race 3', series: 'masters-2026' },
  { raceId: 'training', title: 'Training Session', series: 'training' }
];

const series = [
  { id: 'aus-nationals-2026', name: 'Australian Finn Nationals 2026', raceCount: 3 },
  { id: 'gold-cup-2026', name: 'Finn Gold Cup 2026', raceCount: 3 },
  { id: 'masters-2026', name: 'Finn World Masters 2026', raceCount: 3 },
  { id: 'training', name: 'Training', raceCount: 1 }
];

const fleet = {
  event: 'Finn Championships 2026',
  club: 'Royal Queensland Yacht Squadron',
  location: 'Manly, Brisbane',
  entries: [
    { sailNumber: 'AUS 2', skipper: 'Rob McMillan', country: 'AUS', boatName: 'NB Sailsports' },
    { sailNumber: 'AUS 3', skipper: 'Larry Kleist', country: 'AUS', boatName: 'Annie' },
    { sailNumber: 'AUS 5', skipper: 'Matt Visser', country: 'AUS', boatName: 'Anika 100' },
    { sailNumber: 'AUS 6', skipper: 'Bob Buchanan', country: 'AUS', boatName: 'JojoFrog' },
    { sailNumber: 'AUS 7', skipper: 'Greg Clark', country: 'AUS', boatName: 'Gwella Magpie' },
    { sailNumber: 'AUS 8', skipper: 'Dirk Seret', country: 'AUS', boatName: 'Dark Secret' },
    { sailNumber: 'AUS 9', skipper: 'David Royle', country: 'AUS', boatName: 'Kid Dynamite' },
    { sailNumber: 'AUS 10', skipper: 'John Condie', country: 'AUS', boatName: 'Shifty' },
    { sailNumber: 'AUS 11', skipper: 'Brendan Casey', country: 'AUS', boatName: 'SEA' },
    { sailNumber: 'AUS 12', skipper: 'Roger Best', country: 'AUS', boatName: 'Kasare' },
    { sailNumber: 'AUS 13', skipper: 'Craig Weaver', country: 'AUS', boatName: 'Good Finng' },
    { sailNumber: 'AUS 14', skipper: 'David Chamtaloup', country: 'AUS', boatName: 'Zola' },
    { sailNumber: 'AUS 20', skipper: 'Tony Arnold', country: 'AUS', boatName: 'Finn & Tonic' },
    { sailNumber: 'AUS 21', skipper: 'Bucky Smith', country: 'AUS', boatName: 'Someday Somehow' },
    { sailNumber: 'AUS 24', skipper: 'Greg Solomons', country: 'AUS', boatName: 'Dinoco Blue' },
    { sailNumber: 'AUS 26', skipper: 'Ian McKillop', country: 'AUS', boatName: 'Ken' },
    { sailNumber: 'AUS 27', skipper: 'Craig Padman', country: 'AUS', boatName: 'See Saw' },
    { sailNumber: 'AUS 28', skipper: 'Robert Brown', country: 'AUS', boatName: 'Achilles' },
    { sailNumber: 'AUS 31', skipper: 'David Clayton', country: 'AUS', boatName: 'The Ducks Nuts' },
    { sailNumber: 'AUS 33', skipper: 'Stuart Skeggs', country: 'AUS', boatName: 'Cool Change' },
    { sailNumber: 'AUS 37', skipper: 'James Bevis', country: 'AUS', boatName: 'Jimmy Wong' },
    { sailNumber: 'AUS 41', skipper: 'Stuart Watson', country: 'AUS', boatName: 'AUS 41' },
    { sailNumber: 'AUS 42', skipper: 'Patrick Meehan', country: 'AUS', boatName: 'Cogito' },
    { sailNumber: 'AUS 43', skipper: 'John Croston', country: 'AUS', boatName: 'Edith' },
    { sailNumber: 'AUS 45', skipper: 'Kerry Spencer', country: 'AUS', boatName: 'Colt' },
    { sailNumber: 'AUS 50', skipper: 'Jason Passey', country: 'AUS', boatName: 'Hawaii Five-O' },
    { sailNumber: 'AUS 55', skipper: 'Lewis Davies', country: 'AUS', boatName: 'Stay Slippery' },
    { sailNumber: 'AUS 58', skipper: 'Robert Biscoe', country: 'AUS', boatName: 'AVIMM' },
    { sailNumber: 'AUS 60', skipper: 'Brad Newton', country: 'AUS', boatName: 'Fireball' },
    { sailNumber: 'AUS 66', skipper: 'Nicholas Kennedy', country: 'AUS', boatName: 'Backbeat' },
    { sailNumber: 'AUS 68', skipper: 'Robert Ugarte', country: 'AUS', boatName: 'Mocking Jay' },
    { sailNumber: 'AUS 70', skipper: 'Peter McCallum', country: 'AUS', boatName: 'Stormer' },
    { sailNumber: 'AUS 71', skipper: 'Andrew Harcourt', country: 'AUS', boatName: 'Taco' },
    { sailNumber: 'AUS 72', skipper: 'Christopher Links', country: 'AUS', boatName: 'Maggie' },
    { sailNumber: 'AUS 73', skipper: 'Kane Sinclair', country: 'AUS', boatName: 'Jazel' },
    { sailNumber: 'AUS 75', skipper: 'Phil Chadwick', country: 'AUS', boatName: 'Chaddywagon' },
    { sailNumber: 'AUS 77', skipper: 'Trevor Martin', country: 'AUS', boatName: 'Just 4 Laughs' },
    { sailNumber: 'AUS 80', skipper: 'Guy Henderson', country: 'AUS', boatName: 'Gidget' },
    { sailNumber: 'AUS 88', skipper: 'Andrew Coutts', country: 'AUS', boatName: 'Onya!' },
    { sailNumber: 'AUS 93', skipper: 'Tristan Perez', country: 'AUS', boatName: 'Lonya' },
    { sailNumber: 'AUS 94', skipper: 'Guy Maegraith', country: 'AUS', boatName: 'Adriatic' },
    { sailNumber: 'AUS 95', skipper: 'Hayden Barney', country: 'AUS', boatName: 'Original Finn' },
    { sailNumber: 'AUS 98', skipper: 'Lucas Prescott', country: 'AUS', boatName: 'Mandrill' },
    { sailNumber: 'AUS 101', skipper: 'Geoff Wood', country: 'AUS', boatName: 'Infinnity Plus One' },
    { sailNumber: 'AUS 110', skipper: 'Marcus Whitley', country: 'AUS', boatName: 'Layla' },
    { sailNumber: 'AUS 111', skipper: 'Sam Ede', country: 'AUS', boatName: 'Lads on Tour' },
    { sailNumber: 'AUS 169', skipper: 'Jason Wilson', country: 'AUS', boatName: 'Rock Solid' },
    { sailNumber: 'AUS 215', skipper: 'Paul Cornwell', country: 'AUS', boatName: '200 Degrees' },
    { sailNumber: 'AUS 221', skipper: 'Anthony Nossiter', country: 'AUS', boatName: 'Norge' },
    { sailNumber: 'AUS 222', skipper: 'Paul McKenzie', country: 'AUS', boatName: 'Superman' },
    { sailNumber: 'AUS 231', skipper: 'James Mayjor', country: 'AUS', boatName: 'James Mayjor' },
    { sailNumber: 'AUS 245', skipper: 'Gary Van Lunteren', country: 'AUS', boatName: 'Original Finn' },
    { sailNumber: 'AUS 256', skipper: 'Simon Paul', country: 'AUS', boatName: 'Colt 45' },
    { sailNumber: 'AUS 265', skipper: 'Drew Carruthers', country: 'AUS', boatName: 'Drew Carruthers' },
    { sailNumber: 'AUS 270', skipper: 'Michael Hughes', country: 'AUS', boatName: 'AUS 270' },
    { sailNumber: 'AUS 275', skipper: 'Geoffrey Findlay', country: 'AUS', boatName: 'Emergency Exit' },
    { sailNumber: 'AUS 277', skipper: 'Brett Wilkinson', country: 'AUS', boatName: 'Classic Stitch Up' },
    { sailNumber: 'AUS 292', skipper: 'Anthony Wood', country: 'AUS', boatName: 'Lonya' },
    { sailNumber: 'AUS 303', skipper: 'Darren McPherson', country: 'AUS', boatName: 'Gevar' },
    { sailNumber: 'AUS 305', skipper: 'Steven Shale', country: 'AUS', boatName: 'Side Boob' },
    { sailNumber: 'AUS 326', skipper: 'Nicholas Armstrong-Smith', country: 'AUS', boatName: 'Monsoon' },
    { sailNumber: 'AUS 333', skipper: 'David Ellis', country: 'AUS', boatName: 'AUS 333' },
    { sailNumber: 'AUS 342', skipper: 'Tim Ede', country: 'AUS', boatName: 'MB6' },
    { sailNumber: 'AUS 343', skipper: 'Edward Louis', country: 'AUS', boatName: 'InFinnCible' },
    { sailNumber: 'AUS 344', skipper: 'Michael Fairbarn', country: 'AUS', boatName: 'Saltwater Therapy' },
    { sailNumber: 'CZE 211', skipper: 'Martin Kalos', country: 'CZE', boatName: 'Lucky Loser' },
    { sailNumber: 'DEN 21', skipper: 'Otto Strandvig', country: 'DEN', boatName: 'Expand IT' },
    { sailNumber: 'DEN 117', skipper: 'Peter Sigetty Bøje', country: 'DEN', boatName: 'Aurora Windwhisperer IV' },
    { sailNumber: 'DEN 212', skipper: 'Jan Peetz', country: 'DEN', boatName: 'Black Dove' },
    { sailNumber: 'ESP 76', skipper: 'Alejandro Cardona', country: 'ESP', boatName: 'Buscastell Vins' },
    { sailNumber: 'ESP 100', skipper: 'Rafael Trujillo', country: 'ESP', boatName: 'Blas de Lezo' },
    { sailNumber: 'FRA 38', skipper: 'Audoin Michel', country: 'FRA', boatName: 'FINN' },
    { sailNumber: 'FRA 66', skipper: 'Phillippe Lobert', country: 'FRA', boatName: 'Finn' },
    { sailNumber: 'FRA 75', skipper: 'Laurent Hay', country: 'FRA', boatName: 'Centre Excellence Voile' },
    { sailNumber: 'FRA 111', skipper: 'Valerian Lebrun', country: 'FRA', boatName: 'Atlas Shrugged' },
    { sailNumber: 'GBR 4', skipper: 'Russ Ward', country: 'GBR', boatName: 'GBR 4' },
    { sailNumber: 'GBR 5', skipper: 'Jeremy White', country: 'GBR', boatName: 'GBR 5' },
    { sailNumber: 'GBR 9', skipper: 'Tim Travinor', country: 'GBR', boatName: 'Basil' },
    { sailNumber: 'GBR 13', skipper: 'Roman Khodykin', country: 'GBR', boatName: 'Fantastica' },
    { sailNumber: 'GBR 20', skipper: 'Andy Denison', country: 'GBR', boatName: 'Uncle Bill' },
    { sailNumber: 'GBR 74', skipper: 'Lawrence Crispin', country: 'GBR', boatName: 'Finn Sailing Academy' },
    { sailNumber: 'GBR 90', skipper: 'Richard Sharp', country: 'GBR', boatName: 'GBR 90' },
    { sailNumber: 'GBR 790', skipper: 'Nick Craig', country: 'GBR', boatName: 'Harken' },
    { sailNumber: 'GER 81', skipper: 'Jan-Dietmar Dellas', country: 'GER', boatName: 'Grey Cloud IX' },
    { sailNumber: 'GER 193', skipper: 'Thomas Schmid', country: 'GER', boatName: 'Back to the roots' },
    { sailNumber: 'GER 202', skipper: 'Rolf Elsaesser', country: 'GER', boatName: 'Groucho' },
    { sailNumber: 'GER 477', skipper: 'Harald Leissner', country: 'GER', boatName: 'Lukas' },
    { sailNumber: 'GER 501', skipper: 'Fabian Lemmel', country: 'GER', boatName: 'Fl!nk' },
    { sailNumber: 'ISV 11', skipper: 'John Hourihan', country: 'ISV', boatName: 'PFM5' },
    { sailNumber: 'ITA 40', skipper: 'Marko Kolic', country: 'ITA', boatName: 'Sally' },
    { sailNumber: 'ITA 706', skipper: 'Sebastian Mazzarol', country: 'ITA', boatName: 'Lucrezia' },
    { sailNumber: 'ITA 1103', skipper: 'Alessandro Marega', country: 'ITA', boatName: 'ITA 1103' },
    { sailNumber: 'MAS 188', skipper: 'Rolf Heemskerk', country: 'NED', boatName: '-' },
    { sailNumber: 'NED 29', skipper: 'Bas De Waal', country: 'NED', boatName: 'Nooit Bang III' },
    { sailNumber: 'NED 148', skipper: 'Peter Peet', country: 'NED', boatName: 'NN' },
    { sailNumber: 'NOR 1', skipper: 'Anders Østre Pedersen', country: 'NOR', boatName: 'Astrid' },
    { sailNumber: 'NOR 3', skipper: 'Arild Holt', country: 'NOR', boatName: 'Finn Funnet' },
    { sailNumber: 'NOR 55', skipper: 'Arild Heldal', country: 'NOR', boatName: 'AnneAnd' },
    { sailNumber: 'NOR 64', skipper: 'Petter Fjeld', country: 'NOR', boatName: 'Clark Kent' },
    { sailNumber: 'NOR 77', skipper: 'Peder Nergaard', country: 'NOR', boatName: 'Keiko' },
    { sailNumber: 'NZL 1', skipper: 'Raymond Hall', country: 'NZL', boatName: 'Mav' },
    { sailNumber: 'NZL 4', skipper: 'Mark Perrow', country: 'NZL', boatName: 'NZL 4' },
    { sailNumber: 'NZL 5', skipper: 'Brendon Hogg', country: 'NZL', boatName: 'Brendon Hogg' },
    { sailNumber: 'NZL 9', skipper: 'Rob Coutts', country: 'NZL', boatName: 'Beverly' },
    { sailNumber: 'NZL 19', skipper: 'Denis Mowbray', country: 'NZL', boatName: 'Gryfinn' },
    { sailNumber: 'NZL 20', skipper: 'Chris Wells', country: 'NZL', boatName: 'Infiniti' },
    { sailNumber: 'NZL 30', skipper: 'Andrew Duncan', country: 'NZL', boatName: 'Touching Cloth' },
    { sailNumber: 'NZL 54', skipper: 'Joe Spooner', country: 'NZL', boatName: 'Kenny' },
    { sailNumber: 'NZL 81', skipper: 'Paul Bamford', country: 'NZL', boatName: "Screamin' Torzini" },
    { sailNumber: 'NZL 93', skipper: 'Richard Hawkins', country: 'NZL', boatName: 'Dilligaf' },
    { sailNumber: 'NZL 94', skipper: 'Tony Bierre', country: 'NZL', boatName: 'First Cross' },
    { sailNumber: 'NZL 111', skipper: 'Karl Purdie', country: 'NZL', boatName: 'Hells Belle' },
    { sailNumber: 'POR 21', skipper: 'Felipe Silva', country: 'POR', boatName: 'Finn Sailing Academy' },
    { sailNumber: 'POR 58', skipper: 'Henrique Silva', country: 'POR', boatName: 'XALET' },
    { sailNumber: 'SUI 12', skipper: 'Franz Bürgi', country: 'SUI', boatName: 'Danouki' },
    { sailNumber: 'SUI 99', skipper: 'Laurent Chapuis', country: 'SUI', boatName: 'Angel' },
    { sailNumber: 'SWE 20', skipper: 'Gosta Eriksson', country: 'SWE', boatName: 'Karin' },
    { sailNumber: 'SWE 72', skipper: 'Peter Overup', country: 'SWE', boatName: 'SWEMAINT' },
    { sailNumber: 'USA 2', skipper: 'R. Phillip Ramming', country: 'USA', boatName: 'Free Fallin\'' },
    { sailNumber: 'USA 3', skipper: 'Robert Kinney', country: 'USA', boatName: 'White Crayon' },
    { sailNumber: 'USA 7', skipper: 'Nikita Mazin', country: 'USA', boatName: 'Finn' },
    { sailNumber: 'USA 16', skipper: 'Rodion Mazin', country: 'USA', boatName: 'Cuckoo Bus' },
    { sailNumber: 'USA 975', skipper: 'August Miller', country: 'USA', boatName: 'Grease Paint' },
    { sailNumber: 'USA 5286', skipper: 'Charlie Buckingham', country: 'USA', boatName: 'Misery Stick' }
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
