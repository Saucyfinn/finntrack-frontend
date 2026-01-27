import { kmeansTwo, clusterPoints, convexHull, type LatLng } from "./utils";

type BoatFrame = {
  raceId: string;
  boatId: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  timestamp: number;  // ALWAYS in milliseconds
};

type BoatFrameWithActive = BoatFrame & { active: boolean };

type FullMsg = { type: "full"; boats: Record<string, BoatFrameWithActive> };
type UpdateMsg = { type: "update"; boat: string; data: BoatFrameWithActive };

// Store last N ingests for debugging
type IngestLog = {
  boatId: string;
  lat: number;
  lng: number;
  timestamp: number;
  receivedAt: number;
};

const MAX_INGEST_LOG = 20;

export class RaceState implements DurableObject {
  private state: DurableObjectState;
  private env: any;
  private raceId: string | null = null;

  private boats: Map<string, BoatFrame> = new Map();
  private sockets: Set<WebSocket> = new Set();
  private ingestLog: IngestLog[] = [];

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.headers.get("Upgrade") === "websocket" && (path === "/live" || path === "/ws/live")) {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.handleSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && path === "/update") return this.handleUpdate(request);
    if (request.method === "POST" && path === "/clear") return this.handleClear();
    if (request.method === "GET" && path === "/boats") {
      // Default to 300 seconds (5 min) TTL if not specified
      const activeSeconds = parseInt(url.searchParams.get("activeSeconds") || "300", 10);
      return this.json(await this.getBoatsSnapshot(activeSeconds));
    }
    if (request.method === "GET" && path === "/debug/last") {
      return this.json({ lastIngests: this.ingestLog.slice(-5) });
    }
    if (request.method === "GET" && path === "/replay-multi") return this.json(await this.replayMulti());
    if (request.method === "GET" && path === "/autocourse") return this.json(await this.autoDetectCourse());
    if (request.method === "GET" && path === "/export/gpx") return this.exportGPX();
    if (request.method === "GET" && path === "/export/kml") return this.exportKML();
    if (request.method === "POST" && path === "/archive/save") return this.saveArchive();
    if (request.method === "GET" && path === "/archive/load") return this.loadArchive(request);

    return new Response("Not found", { status: 404 });
  }

  private handleSocket(ws: WebSocket) {
    ws.accept();
    this.sockets.add(ws);
    ws.addEventListener("close", () => this.sockets.delete(ws));
    ws.addEventListener("error", () => this.sockets.delete(ws));

    this.getBoatsSnapshot(0).then((boats) => {
      const msg: FullMsg = { type: "full", boats };
      try { ws.send(JSON.stringify(msg)); } catch {}
    });
  }

  private broadcast(obj: FullMsg | UpdateMsg) {
    const txt = JSON.stringify(obj);
    for (const ws of this.sockets) { try { ws.send(txt); } catch {} }
  }

  private async ensureRaceId(raceId: string) {
    if (this.raceId) return;
    this.raceId = raceId;
    await this.state.storage.put("raceId", raceId);
  }

  private async loadRaceIdIfNeeded() {
    if (this.raceId) return;
    const stored = (await this.state.storage.get<string>("raceId")) || null;
    this.raceId = stored;
  }

  private async getBoatIds(): Promise<string[]> {
    return (await this.state.storage.get<string[]>("boatIds")) || [];
  }

  private async addBoatId(boatId: string) {
    const ids = new Set(await this.getBoatIds());
    if (!ids.has(boatId)) {
      ids.add(boatId);
      await this.state.storage.put("boatIds", [...ids]);
    }
  }

  private kvKey(boatId: string, ts: number) {
    return `race:${this.raceId}:boat:${boatId}:ts:${ts}`;
  }

  private async hydrateBoatsFromStorageIfEmpty() {
    if (this.boats.size > 0) return;
    await this.loadRaceIdIfNeeded();
    const ids = await this.getBoatIds();
    for (const boatId of ids) {
      const last = await this.state.storage.get<BoatFrame>(`boat:${boatId}:latest`);
      if (last) this.boats.set(boatId, last);
    }
  }

  /**
   * Get boats snapshot with activity filtering.
   * @param activeSeconds Filter to boats updated within this many seconds. 0 = no filter (all boats).
   * Each boat includes an "active" field (true if within 300 seconds).
   */
  private async getBoatsSnapshot(activeSeconds: number = 300): Promise<Record<string, BoatFrameWithActive>> {
    await this.hydrateBoatsFromStorageIfEmpty();
    const out: Record<string, BoatFrameWithActive> = {};
    const nowMs = Date.now();
    const ttlMs = activeSeconds > 0 ? activeSeconds * 1000 : 0;
    const activeFlagCutoff = nowMs - (300 * 1000); // 5 min for "active" flag

    console.log(`[RaceState] getBoatsSnapshot: now=${nowMs} activeSeconds=${activeSeconds} boats=${this.boats.size}`);

    for (const [k, v] of this.boats.entries()) {
      const age = nowMs - v.timestamp;

      // If activeSeconds > 0, filter by TTL
      if (activeSeconds > 0 && age > ttlMs) {
        console.log(`[RaceState] Skipping ${k}: age=${age}ms > ttl=${ttlMs}ms`);
        continue;
      }

      out[k] = {
        ...v,
        active: v.timestamp >= activeFlagCutoff,
      };
      console.log(`[RaceState] Including ${k}: age=${age}ms active=${out[k].active}`);
    }

    console.log(`[RaceState] Returning ${Object.keys(out).length} boats`);
    return out;
  }

  private async handleUpdate(request: Request): Promise<Response> {
    const data = (await request.json()) as Record<string, unknown>;

    const raceId = String(data.raceId || "");
    const boatId = String(data.boatId || "");
    const lat = Number(data.lat);
    const lng = Number(data.lng ?? data.lon);
    const speed = Number(data.speed ?? data.sog ?? data.vel ?? 0);
    const heading = Number(data.heading ?? data.cog ?? 0);

    // Handle timestamp - could be in ms or seconds
    let timestamp: number;
    const rawTs = data.timestamp ?? data.ts ?? data.tst;
    if (typeof rawTs === "number") {
      // If timestamp looks like seconds (before year 2100 in seconds), convert to ms
      // Year 2100 in seconds = 4102444800
      // Year 2000 in ms = 946684800000
      if (rawTs < 4102444800) {
        // It's in seconds, convert to ms
        timestamp = rawTs * 1000;
      } else {
        // It's already in ms
        timestamp = rawTs;
      }
    } else {
      timestamp = Date.now();
    }

    if (!raceId || !boatId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response("Invalid payload", { status: 400 });
    }

    await this.ensureRaceId(raceId);
    await this.addBoatId(boatId);

    const frame: BoatFrame = { raceId, boatId, lat, lng, speed, heading, timestamp };

    this.boats.set(boatId, frame);
    await this.state.storage.put(`boat:${boatId}:latest`, frame);

    // Log ingestion for debugging
    this.ingestLog.push({
      boatId,
      lat,
      lng,
      timestamp,
      receivedAt: Date.now(),
    });
    if (this.ingestLog.length > MAX_INGEST_LOG) {
      this.ingestLog = this.ingestLog.slice(-MAX_INGEST_LOG);
    }

    // Store in KV history
    const key = this.kvKey(boatId, timestamp);
    await this.env.HISTORY.put(key, JSON.stringify(frame));

    // Broadcast with active flag
    const nowMs = Date.now();
    const activeCutoffMs = nowMs - (120 * 1000);
    const frameWithActive: BoatFrameWithActive = {
      ...frame,
      active: frame.timestamp >= activeCutoffMs,
    };
    this.broadcast({ type: "update", boat: boatId, data: frameWithActive });

    console.log(`[RaceState] Updated boat: ${boatId} at ${lat},${lng} ts=${timestamp}`);

    return new Response("OK");
  }

  private async handleClear(): Promise<Response> {
    const boatIds = await this.getBoatIds();
    this.boats.clear();
    this.ingestLog = [];
    await this.state.storage.delete("boatIds");
    for (const boatId of boatIds) {
      await this.state.storage.delete(`boat:${boatId}:latest`);
    }
    this.broadcast({ type: "full", boats: {} });
    return new Response(`Cleared ${boatIds.length} boats`);
  }

  private async replayMulti(): Promise<{ raceId: string | null; boats: Record<string, BoatFrame[]> }> {
    await this.loadRaceIdIfNeeded();
    const out: Record<string, BoatFrame[]> = {};
    if (!this.raceId) return { raceId: null, boats: out };

    const ids = await this.getBoatIds();
    for (const boatId of ids) {
      const prefix = `race:${this.raceId}:boat:${boatId}:ts:`;
      const list = await this.env.HISTORY.list({ prefix });

      const frames: BoatFrame[] = [];
      for (const k of list.keys) {
        const v = await this.env.HISTORY.get(k.name, "json");
        if (v) frames.push(v as BoatFrame);
      }
      frames.sort((a, b) => a.timestamp - b.timestamp);
      out[boatId] = frames;
    }

    return { raceId: this.raceId, boats: out };
  }

  private async autoDetectCourse() {
    const multi = await this.replayMulti();
    const boatsData = multi.boats;

    const startTime = this.detectStartTime(boatsData);
    const startLine = startTime ? this.detectStartLine(boatsData, startTime) : null;
    const marks = this.detectMarks(boatsData);
    const windDirection = startTime ? this.estimateWind(boatsData, startTime) : null;
    const coursePolygon = this.computeCoursePolygon(boatsData);
    const finishLine = this.detectFinishLine(boatsData);

    return { startTime, startLine, marks, windDirection, coursePolygon, finishLine };
  }

  private detectStartTime(boatsData: Record<string, BoatFrame[]>): number | null {
    const moves: number[] = [];
    for (const frames of Object.values(boatsData)) {
      for (let i = 1; i < frames.length; i++) {
        if ((frames[i].speed ?? 0) > 2.5) { moves.push(frames[i].timestamp); break; }
      }
    }
    if (!moves.length) return null;
    moves.sort((a, b) => a - b);
    return moves[Math.floor(moves.length / 2)];
  }

  private detectStartLine(boatsData: Record<string, BoatFrame[]>, startTime: number) {
    const points: LatLng[] = [];
    for (const frames of Object.values(boatsData)) {
      const target = startTime - 20000;  // 20 seconds before in ms
      const f = frames.find(x => x.timestamp >= target);
      if (f) points.push([f.lat, f.lng]);
    }
    if (points.length < 4) return null;
    const [A, B] = kmeansTwo(points);
    return { A, B };
  }

  private estimateWind(boatsData: Record<string, BoatFrame[]>, startTime: number) {
    const headings: number[] = [];
    for (const frames of Object.values(boatsData)) {
      for (const f of frames) {
        if (f.timestamp > startTime && f.timestamp < startTime + 150000) {  // 150 seconds in ms
          if ((f.speed ?? 0) > 2) headings.push(f.heading ?? 0);
        }
      }
    }
    if (!headings.length) return null;
    return headings.reduce((a, b) => a + b, 0) / headings.length;
  }

  private detectMarks(boatsData: Record<string, BoatFrame[]>) {
    const turnPoints: LatLng[] = [];
    for (const frames of Object.values(boatsData)) {
      for (let i = 2; i < frames.length; i++) {
        const h1 = frames[i - 1].heading ?? 0;
        const h2 = frames[i].heading ?? 0;
        if (Math.abs(h1 - h2) > 60) turnPoints.push([frames[i].lat, frames[i].lng]);
      }
    }
    return clusterPoints(turnPoints, 40);
  }

  private detectFinishLine(boatsData: Record<string, BoatFrame[]>) {
    const points: LatLng[] = [];
    for (const frames of Object.values(boatsData)) {
      if (frames.length > 0) {
        const f = frames[frames.length - 1];
        points.push([f.lat, f.lng]);
      }
    }
    if (points.length < 4) return null;
    const [A, B] = kmeansTwo(points);
    return { A, B };
  }

  private computeCoursePolygon(boatsData: Record<string, BoatFrame[]>) {
    const pts: LatLng[] = [];
    for (const frames of Object.values(boatsData)) for (const f of frames) pts.push([f.lat, f.lng]);
    if (pts.length < 3) return [];
    return convexHull(pts);
  }

  private async exportGPX(): Promise<Response> {
    const multi = await this.replayMulti();
    const boats = multi.boats;

    let gpx = `<?xml version="1.0"?>\n<gpx version="1.1" creator="FinnTrack">\n`;
    for (const id of Object.keys(boats)) {
      gpx += `<trk><name>${id}</name><trkseg>\n`;
      for (const f of boats[id]) {
        gpx += `<trkpt lat="${f.lat}" lon="${f.lng}"><time>${new Date(f.timestamp).toISOString()}</time></trkpt>\n`;
      }
      gpx += `</trkseg></trk>\n`;
    }
    gpx += `</gpx>\n`;
    return new Response(gpx, { headers: { "Content-Type": "application/gpx+xml" } });
  }

  private async exportKML(): Promise<Response> {
    const multi = await this.replayMulti();
    const boats = multi.boats;

    let kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n`;
    for (const id of Object.keys(boats)) {
      kml += `<Placemark><name>${id}</name><LineString><coordinates>\n`;
      for (const f of boats[id]) kml += `${f.lng},${f.lat},0 `;
      kml += `</coordinates></LineString></Placemark>\n`;
    }
    kml += `</Document></kml>\n`;
    return new Response(kml, { headers: { "Content-Type": "application/vnd.google-earth.kml+xml" } });
  }

  private async saveArchive(): Promise<Response> {
    await this.loadRaceIdIfNeeded();
    if (!this.raceId) return new Response("No raceId yet", { status: 400 });

    const multi = await this.replayMulti();
    const meta = { boats: Object.keys(multi.boats), savedAt: Date.now() };

    await this.env.RACES.put(`races/${this.raceId}/meta.json`, JSON.stringify(meta));
    for (const boatId of Object.keys(multi.boats)) {
      await this.env.RACES.put(`races/${this.raceId}/boats/${boatId}.json`, JSON.stringify(multi.boats[boatId]));
    }
    return new Response("Archive saved");
  }

  private async loadArchive(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const qRace = url.searchParams.get("raceId");

    await this.loadRaceIdIfNeeded();
    const rid = qRace || this.raceId;
    if (!rid) return new Response("No raceId", { status: 400 });

    const metaObj = await this.env.RACES.get(`races/${rid}/meta.json`);
    if (!metaObj) return new Response("No archive found", { status: 404 });

    const meta = JSON.parse(await metaObj.text());
    const boats: Record<string, BoatFrame[]> = {};

    for (const boatId of meta.boats || []) {
      const obj = await this.env.RACES.get(`races/${rid}/boats/${boatId}.json`);
      if (!obj) continue;
      boats[boatId] = JSON.parse(await obj.text());
    }

    return this.json({ raceId: rid, meta, boats });
  }

  private json(obj: unknown, init: ResponseInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(obj), { ...init, headers });
  }
}
