# FinnTrack Frontend

## Overview
FinnTrack is a live fleet tracking application for sailing races. This frontend connects to the FinnTrack API at `https://api.finntracker.org`.

## Project Structure
```
public/
  index.html           # Home page (/)
  live/index.html      # Live tracking (/live)
  replay/index.html    # Replay viewer (/replay)
  select/index.html    # Boat/race selection (/select)
  spectator/index.html # Spectator view (/spectator)
  join.html            # Device join page
  analytics.html       # Analytics page
  assets/              # Images and icons
  css/                 # Stylesheets
  js/
    config.js          # API configuration (FINNTRACK_API_BASE)
    api.js             # FinnAPI object with getRaces(), getLiveBoats()
    map.js             # Leaflet map helper (FinnMap)
    live.js            # Live page logic
    replay.js          # Replay page logic
    analytics.js       # Analytics logic
  data/                # Static data files (fleet.json, races.json)
server.js              # Node.js static file server
```

## API Endpoints
The frontend uses these API endpoints at `https://api.finntracker.org`:
- `GET /races` - List available races
- `GET /boats?raceId=<ID>&within=<SECONDS>` - Get live boat positions
- `POST /update?key=<KEY>` - Send boat position update (used by join page)
- `GET /ws/live?raceId=<ID>` - WebSocket live feed (optional)

## FinnAPI Object
All pages include `/js/config.js` and `/js/api.js` which provide:
```javascript
FinnAPI.apiBase           // "https://api.finntracker.org"
FinnAPI.getRaces()        // Returns array of {id, name}
FinnAPI.getLiveBoats(raceId, withinSeconds) // Returns array of boats
FinnAPI.listRaces()       // Alias for getRaces()
FinnAPI.listBoats(raceId, within) // Alias for getLiveBoats()
```

## URL Routes
- `/` - Home page
- `/live` - Live tracking view
- `/replay` - Replay stored tracks
- `/select` - Select boat and race
- `/spectator` - Spectator view with share codes

## Running Locally
```bash
node server.js
```
Server runs on port 5000 and serves static files from `public/`.

## Deployment
Deployed to Cloudflare Workers Assets at `https://finntracker.org`.
