/// <reference types="@cloudflare/workers-types" />

export interface Env {
  API_SECRET?: string;
  CORS_ORIGIN?: string;

  RACE_STATE: DurableObjectNamespace;
  RACES: R2Bucket;

  HISTORY?: KVNamespace;
  HISTORY_PREVIEW?: KVNamespace;
  DB?: D1Database;
}

type RaceDef = { raceId: string; title: string; fleets?: { id: string; name: string }[] };
type RacesJson = { races: RaceDef[] } | RaceDef[];

type FleetEntry = {
  sailNumber: string; // used as boatId matching key
  skipper: string;
  boatName?: string;
  country?: string;
  [k: string]: any;
};

type FleetJson = { event?: string; club?: string; location?: string; entries: FleetEntry[] };

type Update = {
  raceId: string;
  boatId: string;
  lat: number;
  lon: number;
  speed?: number;
  heading?: number;
  timestamp: number;
  source: string;
  raw?: any;
};

type BoatMerged = {
  raceId: string;
  boatId: string;
  sailNumber?: string;
  skipper?: string;
  boatName?: string;
  country?: string;
  lat?: number;
  lon?: number;
  speed?: number;
  heading?: number;
  timestamp?: number;
  source?: string;
  active: boolean;
};

const JSON_HEADERS: HeadersInit = { "content-type": "application/json; charset=utf-8" };

function corsHeaders(env: Env, origin: string | null): HeadersInit {
  const allow = (env.CORS_ORIGIN || "*").trim() || "*";
  const ao = allow === "*" ? (origin ?? "*") : allow;
  return {
    "access-control-allow-origin": ao,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type, x-api-key, authorization",
    "access-control-max-age": "86400",
  };
}

function json(data: any, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function withCors(resp: Response, extra: HeadersInit): Response {
  const h = new Headers(resp.headers);
  for (const [k, v] of Object.entries(extra)) h.set(k, String(v));
  return new Response(resp.body, { status: resp.status, headers: h, webSocket: (resp as any).webSocket });
}

function normalizeRaceId(v: any): string {
  const s = String(v ?? "").trim();
  return s || "training";
}

function authOk(req: Request, env: Env, url: URL): boolean {
  const secret = (env.API_SECRET || "").trim();
  if (!secret) return true;

  const provided =
    (url.searchParams.get("key") ||
      req.headers.get("x-api-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      "").trim();

  return provided === secret;
}

function hubStub(env: Env): DurableObjectStub {
  const id = env.RACE_STATE.idFromName("HUB");
  return env.RACE_STATE.get(id);
}

async function safeJson(req: Request): Promise<any | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function num(x: any): number | null {
  if (x === null || x === undefined) return null;
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : null;
}

type CacheEntry<T> = { at: number; value: T };
const CACHE_TTL_MS = 10_000;
const cache = new Map<string, CacheEntry<any>>();

function cacheGet<T>(k: string): T | null {
  const e = cache.get(k);
  if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) {
    cache.delete(k);
    return null;
  }
  return e.value as T;
}
function cacheSet<T>(k: string, v: T) {
  cache.set(k, { at: Date.now(), value: v });
}

async function r2GetJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  const txt = await obj.text();
  try {
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadRaces(env: Env): Promise<{ races: RaceDef[]; sourceKey: string }> {
  const ck = "r2:races";
  const c = cacheGet<{ races: RaceDef[]; sourceKey: string }>(ck);
  if (c) return c;

  const raw = await r2GetJson<RacesJson>(env.RACES, "races.json");
  const races: RaceDef[] = !raw ? [] : Array.isArray(raw) ? raw : (raw.races ?? []);
  const out = { races, sourceKey: "races.json" };
  cacheSet(ck, out);
  return out;
}

async function loadFleet(env: Env, raceId: string): Promise<{ fleet: FleetJson | null; sourceKey: string }> {
  // Today: you have ONE fleet.json (Aus Nats). Future: allow per-race keys fleet/<raceId>.json
  const perRaceKey = `fleet/${raceId}.json`;

  const ck = `r2:fleet:${raceId}`;
  const c = cacheGet<{ fleet: FleetJson | null; sourceKey: string }>(ck);
  if (c) return c;

  let fleet = await r2GetJson<FleetJson>(env.RACES, perRaceKey);
  let sourceKey = perRaceKey;

  if (!fleet) {
    fleet = await r2GetJson<FleetJson>(env.RACES, "fleet.json");
    sourceKey = "fleet.json";
  }

  const out = { fleet, sourceKey };
  cacheSet(ck, out);
  return out;
}

function fleetBoatId(e: FleetEntry): string {
  return (e.sailNumber || "").trim();
}

// ============================================================
// Worker
// ============================================================
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get("origin");
    const cors = corsHeaders(env, origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!authOk(request, env, url)) return json({ error: "Unauthorized" }, 401, cors);

    if (path === "/" && request.method === "GET") {
      return json(
        {
          ok: true,
          service: "finntrack-api-worker",
          endpoints: [
            "/debug/r2",
            "/races",
            "/races/:raceId/fleet",
            "/races/:raceId/boats?within=300",
            "/fleet?raceId=...",
            "/boats?raceId=...&within=300",
            "/live?raceId=...",
            "/ws/live?raceId=...",
            "/update",
            "/owntracks",
            "/traccar",
            "/ingest",
          ],
        },
        200,
        cors
      );
    }

    // debug: list R2 keys
    if (path === "/debug/r2" && request.method === "GET") {
      const prefix = url.searchParams.get("prefix") || "";
      const listed = await env.RACES.list({ prefix, limit: 200 });
      return json({ prefix, count: listed.objects.length, keys: listed.objects.map((o) => o.key) }, 200, cors);
    }

    // races from R2
    if (path === "/races" && request.method === "GET") {
      const { races, sourceKey } = await loadRaces(env);
      return json({ races, sourceKey }, 200, cors);
    }

    // /races/:raceId/fleet
    if (path.startsWith("/races/") && path.endsWith("/fleet") && request.method === "GET") {
      const raceId = normalizeRaceId(decodeURIComponent(path.slice("/races/".length, -"/fleet".length)));
      const { fleet, sourceKey } = await loadFleet(env, raceId);
      return json(
        {
          raceId,
          entries: fleet?.entries ?? [],
          meta: fleet ? { event: fleet.event, club: fleet.club, location: fleet.location } : null,
          sourceKey,
        },
        200,
        cors
      );
    }

    // legacy /fleet?raceId=...
    if (path === "/fleet" && request.method === "GET") {
      const raceId = normalizeRaceId(url.searchParams.get("raceId") || url.searchParams.get("race"));
      const { fleet, sourceKey } = await loadFleet(env, raceId);
      return json({ raceId, entries: fleet?.entries ?? [], sourceKey }, 200, cors);
    }

    // websocket live (both /live and /ws/live)
    if (path === "/live" || path === "/ws/live") {
      const raceId = normalizeRaceId(url.searchParams.get("raceId") || url.searchParams.get("race"));
      const stub = hubStub(env);
      const resp = await stub.fetch(`https://do/live?raceId=${encodeURIComponent(raceId)}`, request);
      return withCors(resp, cors);
    }

    // /races/:raceId/boats
    if (path.startsWith("/races/") && path.endsWith("/boats") && request.method === "GET") {
      const raceId = normalizeRaceId(decodeURIComponent(path.slice("/races/".length, -"/boats".length)));
      const within = parseInt(url.searchParams.get("within") || "300", 10);
      const stub = hubStub(env);
      const resp = await stub.fetch(
        `https://do/races/${encodeURIComponent(raceId)}/boats?within=${encodeURIComponent(String(within))}`,
        { method: "GET" }
      );
      return withCors(resp, cors);
    }

    // legacy /boats?raceId=...&within=...
    if (path === "/boats" && request.method === "GET") {
      const raceId = normalizeRaceId(url.searchParams.get("raceId") || url.searchParams.get("race"));
      const within = parseInt(url.searchParams.get("within") || "300", 10);
      const stub = hubStub(env);
      const resp = await stub.fetch(
        `https://do/races/${encodeURIComponent(raceId)}/boats?within=${encodeURIComponent(String(within))}`,
        { method: "GET" }
      );
      return withCors(resp, cors);
    }

    // ingest
    if (path === "/update" && request.method === "POST") {
      const upd = await parseFinnTrack(request);
      if (!upd) return json({ error: "Invalid payload" }, 400, cors);
      await persist(env, ctx, upd);
      return json({ ok: true }, 200, cors);
    }
    if (path === "/owntracks" && request.method === "POST") {
      const upd = await parseOwnTracks(request);
      if (!upd) return json({ error: "Invalid OwnTracks payload" }, 400, cors);
      await persist(env, ctx, upd);
      return json({ ok: true }, 200, cors);
    }
    if (path === "/traccar" && request.method === "POST") {
      const upd = await parseTraccar(request);
      if (!upd) return json({ error: "Invalid Traccar payload" }, 400, cors);
      await persist(env, ctx, upd);
      return json({ ok: true }, 200, cors);
    }
    if (path === "/ingest" && request.method === "POST") {
      const upd = await parseGeneric(request);
      if (!upd) return json({ error: "Invalid ingest payload" }, 400, cors);
      await persist(env, ctx, upd);
      return json({ ok: true }, 200, cors);
    }

    return json({ error: "Not found", path }, 404, cors);
  },
};

// ---------------- Parsers ----------------

async function parseFinnTrack(req: Request): Promise<Update | null> {
  const b = await safeJson(req);
  if (!b) return null;

  const u = new URL(req.url);
  const raceId = normalizeRaceId(b.raceId ?? u.searchParams.get("raceId") ?? u.searchParams.get("race"));

  const boatId = String(b.boatId ?? b.id ?? b.deviceId ?? "").trim();
  const lat = num(b.lat);
  const lon = num(b.lon);
  if (!boatId || lat === null || lon === null) return null;

  return {
    raceId,
    boatId,
    lat,
    lon,
    speed: num(b.speed) ?? undefined,
    heading: num(b.heading ?? b.cog) ?? undefined,
    timestamp: typeof b.timestamp === "number" ? b.timestamp : Date.now(),
    source: "finntrack-ios",
    raw: b,
  };
}

async function parseOwnTracks(req: Request): Promise<Update | null> {
  const b = await safeJson(req);
  if (!b) return null;

  const u = new URL(req.url);
  const raceId = normalizeRaceId(b.raceId ?? u.searchParams.get("raceId") ?? u.searchParams.get("race"));

  const boatId = String(b.boatId ?? b.deviceId ?? b.device ?? b.tid ?? b.topic ?? "").trim();
  const lat = num(b.lat);
  const lon = num(b.lon);
  if (!boatId || lat === null || lon === null) return null;

  const ts =
    typeof b.tst === "number" ? b.tst * 1000 :
    typeof b.timestamp === "number" ? b.timestamp :
    Date.now();

  return { raceId, boatId, lat, lon, speed: num(b.vel) ?? undefined, heading: num(b.cog) ?? undefined, timestamp: ts, source: "owntracks", raw: b };
}

async function parseTraccar(req: Request): Promise<Update | null> {
  let data: any = {};
  const ct = req.headers.get("content-type") || "";

  if (ct.includes("application/json")) {
    data = await safeJson(req);
    if (!data) return null;
  } else {
    try {
      const f = await req.formData();
      data = Object.fromEntries(f.entries());
    } catch {
      const u = new URL(req.url);
      data = Object.fromEntries(u.searchParams.entries());
    }
  }

  const u = new URL(req.url);
  const raceId = normalizeRaceId(data.raceId ?? u.searchParams.get("raceId") ?? u.searchParams.get("race"));

  const boatId = String(data.id ?? data.device ?? data.uniqueId ?? data.deviceId ?? "").trim();
  const lat = num(data.lat);
  const lon = num(data.lon);
  if (!boatId || lat === null || lon === null) return null;

  return { raceId, boatId, lat, lon, speed: num(data.speed) ?? undefined, heading: num(data.bearing ?? data.course ?? data.heading) ?? undefined, timestamp: Date.now(), source: "traccar", raw: data };
}

async function parseGeneric(req: Request): Promise<Update | null> {
  let data: any = await safeJson(req);
  if (!data) {
    try {
      const f = await req.formData();
      data = Object.fromEntries(f.entries());
    } catch {
      return null;
    }
  }

  const u = new URL(req.url);
  const raceId = normalizeRaceId(data.raceId ?? u.searchParams.get("raceId") ?? u.searchParams.get("race"));

  const boatId = String(data.boatId ?? data.id ?? data.deviceId ?? "").trim();
  const lat = num(data.lat);
  const lon = num(data.lon);
  if (!boatId || lat === null || lon === null) return null;

  return { raceId, boatId, lat, lon, speed: num(data.speed) ?? undefined, heading: num(data.heading ?? data.course ?? data.cog) ?? undefined, timestamp: Date.now(), source: String(data.source ?? "generic"), raw: data };
}

// --------------- Persist + DO ----------------

async function persist(env: Env, ctx: ExecutionContext, update: Update) {
  const stub = hubStub(env);

  await stub.fetch("https://do/write", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });

  if (env.HISTORY) {
    ctx.waitUntil(env.HISTORY.put(`race:${update.raceId}:boat:last:${update.boatId}`, JSON.stringify(update), { expirationTtl: 60 * 60 * 24 * 7 }));
  }
}

// Durable Object: RaceState
class HubImpl {
  private state: DurableObjectState;
  private env: Env;
  private sockets: Set<{ ws: WebSocket; raceId: string }> = new Set();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // websocket
    if (path === "/live") {
      const upgrade = request.headers.get("upgrade");
      if (!upgrade || upgrade.toLowerCase() !== "websocket") return json({ error: "Expected WebSocket upgrade" }, 426);

      const raceId = normalizeRaceId(url.searchParams.get("raceId") || url.searchParams.get("race"));

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      server.accept();
      this.sockets.add({ ws: server, raceId });

      server.send(JSON.stringify({ type: "snapshot", raceId }));

      const cleanup = () => {
        for (const entry of Array.from(this.sockets)) if (entry.ws === server) this.sockets.delete(entry);
      };
      server.addEventListener("close", cleanup);
      server.addEventListener("error", cleanup);

      return new Response(null, { status: 101, webSocket: client });
    }

    // write update
    if (path === "/write" && request.method === "POST") {
      const upd = (await request.json()) as Update;
      if (!upd?.boatId || typeof upd.lat !== "number" || typeof upd.lon !== "number") return json({ error: "Invalid update" }, 400);

      const raceId = normalizeRaceId(upd.raceId);
      const key = `race:${raceId}:boat:${upd.boatId}`;
      await this.state.storage.put(key, upd);

      const payload = JSON.stringify({ type: "update", raceId, update: upd });
      for (const entry of Array.from(this.sockets)) {
        try {
          if (entry.raceId === raceId) entry.ws.send(payload);
        } catch {
          this.sockets.delete(entry);
        }
      }
      return json({ ok: true });
    }

    // /races/:raceId/boats
    if (path.startsWith("/races/") && path.endsWith("/boats") && request.method === "GET") {
      const raceId = normalizeRaceId(decodeURIComponent(path.slice("/races/".length, -"/boats".length)));
      const withinSec = parseInt(url.searchParams.get("within") || "300", 10);

      const now = Date.now();
      const cutoff = now - withinSec * 1000;

      const { fleet } = await loadFleet(this.env, raceId);
      const entries = fleet?.entries ?? [];

      const boats: BoatMerged[] = [];

      for (const e of entries) {
        const boatId = fleetBoatId(e);
        if (!boatId) continue;

        const k = `race:${raceId}:boat:${boatId}`;
        const upd = await this.state.storage.get<Update>(k);
        const active = !!upd && (upd.timestamp ?? 0) >= cutoff;

        boats.push({
          raceId,
          boatId,
          sailNumber: e.sailNumber,
          skipper: e.skipper,
          boatName: e.boatName,
          country: e.country,
          lat: upd?.lat,
          lon: upd?.lon,
          speed: upd?.speed,
          heading: upd?.heading,
          timestamp: upd?.timestamp,
          source: upd?.source,
          active,
        });
      }

      boats.sort((a, b) => Number(b.active) - Number(a.active) || a.boatId.localeCompare(b.boatId));
      return json({ raceId, boats });
    }

    return json({ error: "Not found", path }, 404);
  }
}

export class RaceState implements DurableObject {
  private impl: HubImpl;
  constructor(state: DurableObjectState, env: Env) {
    this.impl = new HubImpl(state, env);
  }
  fetch(request: Request): Promise<Response> {
    return this.impl.fetch(request);
  }
}
