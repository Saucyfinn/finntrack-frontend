# FinnTrack Frontend

## Overview
FinnTrack is a live fleet tracking application for sailing races. This repository contains the static frontend that connects to the FinnTrack API (Cloudflare Workers backend).

## Project Structure
- `public/` - Static web assets (HTML, CSS, JS, data files)
  - `index.html` - Main landing page
  - `live.html` - Live race tracking view
  - `replay.html` - Replay stored race tracks
  - `join.html` - Device join page for boat tracking
  - `select.html` - Race selection page
  - `analytics.html` - Speed/VMG analytics
  - `assets/` - Images and icons
  - `css/` - Stylesheets
  - `js/` - JavaScript files
  - `data/` - Static data files (fleet.json, races.json)
- `spectator.html` - Standalone spectator race view
- `server.js` - Simple Node.js static file server

## Running the Application
The server runs on port 5000 and serves static files from both the root directory and `public/` folder.

```bash
node server.js
```

## API Backend
The frontend connects to the FinnTrack API at:
- Production: `https://finntrack-api.hvrdfbj65m.workers.dev`

## Key Features
- Live WebSocket-based boat tracking
- Race replay functionality
- GPX/KML export
- Multi-boat tracking with color-coded trails
- Mobile device GPS tracking support
