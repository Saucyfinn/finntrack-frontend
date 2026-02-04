# FinnTrack - Standalone Sailing Tracker

## Overview
A complete sailing race tracking application that supports both boat and phone GPS tracking. This standalone version mimics the core functionality of the Cloudflare-hosted FinnTrack, working independently without external API dependencies.

## Project Structure
```
phone-tracker/
  server.js              # Express + WebSocket server with boat + phone tracking
  public/
    index.html           # Home page with navigation
    connect.html         # Phone GPS connection page
    join.html            # Boat race join page with fleet selection
    map.html             # Live map showing boats and phones

cloudflare-worker/
  index.ts               # Cloudflare Worker API with phone tracking
  raceState.ts           # Durable Object for real-time state (boats + phones)
  wrangler.toml          # Cloudflare deployment config

public/                  # Legacy FinnTrack frontend (archived)
```

## How It Works
1. **Phone Tracking**: Open `/connect.html`, enter name, tap "Start Sharing Location"
2. **Boat Tracking**: Open `/join.html`, select race/fleet, enter sail number, tap "Start Tracking"
3. **View Map**: Open `/map.html` to see all boats and phones with real-time WebSocket updates

## API Endpoints

### Phone Tracking
- `POST /api/update` - Send phone location update
  - Body: `{ deviceId, name, lat, lon, speed, heading, accuracy }`
- `GET /api/phones` - Get all connected phones
- `DELETE /api/phone/:deviceId` - Disconnect phone

### Boat Tracking
- `POST /update` - Send boat location update
  - Body: `{ raceId, boatId, name, lat, lon, sog, cog, ts }`
- `GET /boats` - Get all connected boats (with optional `?raceId=` filter)
- `DELETE /boat/:boatId` - Disconnect boat

### Race/Fleet Management
- `GET /race/list` - Get all races and series
- `GET /races` - Get races only
- `GET /fleet` - Get fleet entries

### WebSocket
- `/ws` - Real-time updates for both boats and phones

## Features
- Real-time GPS tracking from phones and boats
- Race and fleet selection with multi-race support
- Live map with tabs for All/Boats/Phones
- WebSocket for instant updates
- Auto-cleanup: phones 60s timeout, boats 5min timeout
- Mobile-friendly responsive design
- Speed (knots for boats, km/h for phones) and heading display

## Current Limitations
- In-memory storage (data not persisted between restarts)
- Replay and Analytics features not yet implemented
- Static race/fleet data (not loaded from external sources)

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
