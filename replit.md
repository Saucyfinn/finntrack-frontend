# FinnTrack - Standalone Sailing Tracker

## Overview
A complete sailing race tracking application that supports GPS tracking from phones, smartwatches, and other devices. This standalone version works independently without external API dependencies.

## Project Structure
```
phone-tracker/
  server.js              # Express + WebSocket server with unified device tracking
  data/
    history.json         # Persistent history storage (saved every 30s)
  public/
    index.html           # Home page with navigation
    join.html            # Unified race join page (phone/smartwatch)
    map.html             # Live map showing all devices
    replay.html          # Track replay with time controls
    analytics.html       # Performance statistics

cloudflare-worker/       # Cloudflare Worker integration (optional)
```

## How It Works
1. **Join Race**: Open `/join.html`, select device type (Phone/Smartwatch), pick races, enter sail number
2. **View Map**: Open `/map.html` to see all devices with real-time WebSocket updates
3. **Replay**: Open `/replay.html` to playback recorded tracks
4. **Analytics**: Open `/analytics.html` for speed/distance statistics

## API Endpoints

### Unified Device Tracking
- `POST /api/update` - Send device location update
  - Body: `{ deviceId, name, lat, lon, speed, heading, accuracy, raceId, deviceType }`
- `GET /api/devices` - Get all connected devices (filter: `?type=phone&raceId=...`)
- `DELETE /api/device/:deviceId` - Disconnect device

### Legacy Endpoints (backward compatible)
- `POST /update` - Boat-style update
- `GET /boats` - Get connected boats
- `GET /api/phones` - Get connected phones

### Race/Fleet Management
- `GET /race/list` - Get all races and series
- `GET /fleet` - Get fleet entries (120+ sailors)

### History & Analytics
- `GET /api/history/devices` - Get device history
- `GET /api/analytics/devices` - Get analytics data

### WebSocket
- `/ws` - Real-time updates for all devices

## Features
- Unified device tracking (phone, smartwatch - same system)
- 34 races across 4 series (Australian Nationals, Gold Cup, World Masters, Training)
- 120+ fleet entries from championship events
- Race and fleet selection with multi-race support
- Live map with real-time WebSocket updates
- Auto-cleanup: phones 60s timeout, other devices 5min timeout
- Mobile-friendly responsive design
- Speed (knots) and heading display

## Replay Feature
- `/replay.html` - Playback recorded tracks with time slider
- Play/Pause/Reset controls with 1x/2x/5x/10x speed options
- **Data persisted indefinitely** - survives server restarts
- History saved to `data/history.json` every 30 seconds

## Analytics Feature
- `/analytics.html` - View performance statistics
- Per-device stats: avg speed, max speed, distance, duration
- Speed charts over time using Chart.js

## Data Persistence
- Position history saved to file every 30 seconds
- History persists across server restarts
- No time-based cleanup - replays kept indefinitely

## Cloudflare Worker Integration

The phone tracking is also integrated into the FinnTrack Cloudflare Worker at `api.finntracker.org`.

### Phone Tracking Endpoints (Cloudflare)
- `POST /api/phone/update` - Send phone location update
  - Body: `{ deviceId, name, lat, lon, speed, heading, accuracy }`
- `GET /api/phones` - Get all currently connected phones
- `DELETE /api/phone/:deviceId` - Disconnect a phone
- `WebSocket /ws/phones` - Real-time phone updates only

### Deploying to Cloudflare
```bash
cd cloudflare-worker
npx wrangler deploy
```

The worker uses a Durable Object (`RaceStateDO`) to manage real-time state for both boats and phones with WebSocket broadcasting.
