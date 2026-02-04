# Phone Tracker App

## Overview
A standalone phone tracking application that allows phones to share their GPS location in real-time and display them on a live map. This app works completely independently without external API dependencies.

## Project Structure
```
phone-tracker/
  server.js              # Express + WebSocket server
  public/
    index.html           # Home page with navigation
    connect.html         # Phone connection page (GPS sharing)
    map.html             # Live map view showing all connected phones

cloudflare-worker/
  index.ts               # Cloudflare Worker API with phone tracking
  raceState.ts           # Durable Object for real-time state (boats + phones)
  wrangler.toml          # Cloudflare deployment config

public/                  # Legacy FinnTrack frontend (archived)
```

## How It Works
1. **Connect Phone**: Open `/connect.html` on your phone, enter your name, tap "Start Sharing Location"
2. **View Map**: Open `/map.html` on any device to see all connected phones in real-time
3. **Real-time Updates**: Phones send GPS updates continuously, map updates via WebSocket

## API Endpoints
- `POST /api/update` - Send phone location update (used by connect page)
  - Body: `{ deviceId, name, lat, lon, speed, heading, accuracy }`
- `GET /api/phones` - Get all currently connected phones
- `DELETE /api/phone/:deviceId` - Disconnect a phone
- `WebSocket /ws` - Real-time updates for map viewers

## Running Locally
```bash
node phone-tracker/server.js
```
Server runs on port 5000.

## URL Routes
- `/` - Home page with navigation
- `/connect.html` - Connect your phone
- `/map.html` - View live map

## Features
- Real-time GPS tracking from phone browsers
- WebSocket for instant map updates
- Auto-cleanup of inactive phones (60 second timeout)
- Mobile-friendly responsive design
- Speed and heading display
- Accuracy indicators

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
