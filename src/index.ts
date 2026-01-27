// src/index.ts
import { RaceState } from "./raceState";
export { RaceState };

type Env = {
  RACE_STATE: DurableObjectNamespace;
  HISTORY: KVNamespace;
  RACES: R2Bucket;
  DB: D1Database;
  OWNTRACKS_KEY?: string; // Optional: if set, require this as basic auth password
};

/**
 * OwnTracks location payload
 * See: https://owntracks.org/booklet/tech/json/
 */
type OwnTracksPayload = {
  _type?: string;      // "location", "lwt", "transition", etc.
  lat?: number;
  lon?: number;
  tst?: number;        // Unix timestamp (seconds)
  vel?: number;        // velocity in km/h
  cog?: number;        // course over ground (degrees)
  tid?: string;        // Tracker ID (2-char or longer, set in OwnTracks app)
  topic?: string;      // MQTT topic (usually not present in HTTP mode)
  acc?: number;        // accuracy in meters
  alt?: number;        // altitude
  batt?: number;       // battery percentage
  bs?: number;         // battery status
  conn?: string;       // connection type (w/m/o)
  created_at?: number;
  m?: number;          // monitoring mode
  t?: string;          // trigger type
  vac?: number;        // vertical accuracy
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function corsResponse(body: string | null, status: number, contentType = "application/json"): Response {
  return new Response(body, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": contentType,
    },
  });
}

function jsonOk(data: object): Response {
  return corsResponse(JSON.stringify(data), 200);
}

function jsonError(message: string, status: number): Response {
  return corsResponse(JSON.stringify({ error: message }), status);
}

/**
 * Parse HTTP Basic Auth header
 * Returns { username, password } or null
 */
function parseBasicAuth(request: Request): { username: string; password: string } | null {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = atob(auth.slice(6));
    const idx = decoded.indexOf(":");
    if (idx === -1) return { username: decoded, password: "" };
    return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

/**
 * Derive boatId from available sources (priority order):
 * 1. OwnTracks "tid" field (TrackerID set in app)
 * 2. HTTP Basic Auth username (OwnTracks UserID field)
 * 3. Query param ?boatId= (fallback for manual testing)
 */
function deriveBoatId(
  url: URL,
  body: OwnTracksPayload,
  basicAuth: { username: string; password: string } | null
): string | null {
  // 1. OwnTracks tid (preferred - set in app's TrackerID field)
  if (body.tid && body.tid.trim()) {
    return body.tid.trim();
  }

  // 2. Basic Auth username (OwnTracks UserID field)
  if (basicAuth?.username && basicAuth.username.trim()) {
    return basicAuth.username.trim();
  }

  // 3. Query param fallback (for curl testing)
  const qBoatId = url.searchParams.get("boatId");
  if (qBoatId && qBoatId.trim()) {
    return qBoatId.trim();
  }

  return null;
}

function stubForRace(env: Env, raceId: string) {
  const id = env.RACE_STATE.idFromName(raceId);
  return env.RACE_STATE.get(id);
}

// ===== RACES =====
function listPredefinedRaces() {
  const mk = (series: string, prefix: string, count: number) =>
    Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      return {
        raceId: `${prefix}-2026-R${String(n).padStart(2, "0")}`,
        title: `${series} - Race ${n}`,
        series,
        raceNo: n,
      };
    });

  const ausNats = mk("Australian Nationals 2026", "AUSNATS", 6);
  const goldCup = mk("Gold Cup 2026", "GOLDCUP", 10);
  const masters = mk("Finn World Masters 2026", "MASTERS", 8);
  const training = mk("Training/Undefined", "TRAINING", 10);

  return {
    races: [...ausNats, ...goldCup, ...masters, ...training],
    series: [
      { id: "AUSNATS", name: "Australian Nationals 2026", raceCount: 6 },
      { id: "GOLDCUP", name: "Gold Cup 2026", raceCount: 10 },
      { id: "MASTERS", name: "Finn World Masters 2026", raceCount: 8 },
      { id: "TRAINING", name: "Training/Undefined", raceCount: 10 },
    ],
  };
}

/**
 * Handle OwnTracks ingestion endpoint
 * Accepts: POST /ingest/owntracks?raceId=XXX
 * Also handles GET for connectivity verification
 */
async function handleOwnTracks(request: Request, url: URL, env: Env): Promise<Response> {
  const method = request.method.toUpperCase();

  // OPTIONS - CORS preflight
  if (method === "OPTIONS") {
    return corsResponse(null, 204);
  }

  // GET - connectivity check (OwnTracks may ping this)
  if (method === "GET") {
    return jsonOk({
      status: "ok",
      service: "FinnTrack OwnTracks Ingestion",
      usage: "POST location JSON to this endpoint with ?raceId=YOUR_RACE_ID",
    });
  }

  // Only POST from here
  if (method !== "POST") {
    return jsonError("Method not allowed. Use POST.", 405);
  }

  // Parse basic auth (OwnTracks sends UserID:Password as basic auth)
  const basicAuth = parseBasicAuth(request);

  // Optional auth check: if OWNTRACKS_KEY is set, require it as password
  if (env.OWNTRACKS_KEY && env.OWNTRACKS_KEY.length > 0) {
    if (!basicAuth || basicAuth.password !== env.OWNTRACKS_KEY) {
      return jsonError("Unauthorized: invalid password", 401);
    }
  }

  // Get raceId from query string (required)
  const raceId = url.searchParams.get("raceId");
  if (!raceId || !raceId.trim()) {
    return jsonError("Missing raceId query parameter. Use ?raceId=YOUR_RACE_ID", 400);
  }

  // Parse JSON body
  let body: OwnTracksPayload;
  try {
    const text = await request.text();
    if (!text || !text.trim()) {
      return jsonError("Empty request body", 400);
    }
    body = JSON.parse(text);
  } catch (e) {
    return jsonError("Invalid JSON in request body", 400);
  }

  // Handle non-location messages gracefully
  if (body._type && body._type !== "location") {
    // OwnTracks sends "lwt" (last will testament), "transition", etc.
    // Acknowledge them without processing
    return jsonOk({ result: "ignored", _type: body._type });
  }

  // Validate coordinates
  const lat = body.lat;
  const lon = body.lon;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return jsonError("Invalid or missing lat/lon coordinates", 400);
  }

  // Derive boatId
  const boatId = deriveBoatId(url, body, basicAuth);
  if (!boatId) {
    return jsonError(
      "Cannot determine boatId. Set TrackerID (tid) in OwnTracks app, or use UserID field, or add ?boatId= to URL",
      400
    );
  }

  // Timestamp: OwnTracks sends Unix seconds
  const timestamp = typeof body.tst === "number" ? body.tst : Math.floor(Date.now() / 1000);
  const speed = typeof body.vel === "number" ? body.vel : 0;
  const heading = typeof body.cog === "number" ? body.cog : 0;

  // Forward to Durable Object
  const stub = stubForRace(env, raceId.trim());
  const update = {
    raceId: raceId.trim(),
    boatId,
    lat,
    lng: lon,
    speed,
    heading,
    timestamp,
  };

  try {
    await stub.fetch("https://do/update", {
      method: "POST",
      body: JSON.stringify(update),
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("DO update failed:", e);
    return jsonError("Internal error storing location", 500);
  }

  // Return success response (OwnTracks expects JSON)
  return jsonOk({
    result: "ok",
    boatId,
    raceId: raceId.trim(),
    lat,
    lon,
    tst: timestamp,
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight for any path
    if (request.method === "OPTIONS") {
      return corsResponse(null, 204);
    }

    // Redirect root and /finntrack to /finntrack.html
    if (request.method === "GET" || request.method === "HEAD") {
      if (path === "/" || path === "/index.html" || path === "/finntrack") {
        const redirectUrl = new URL(request.url);
        redirectUrl.pathname = "/finntrack.html";
        return Response.redirect(redirectUrl.toString(), 302);
      }
    }

    // Race list
    if (request.method === "GET" && path === "/race/list") {
      return jsonOk(listPredefinedRaces());
    }

    // ===== OwnTracks Ingestion =====
    // Handle with and without trailing slash
    if (path === "/ingest/owntracks" || path === "/ingest/owntracks/") {
      return handleOwnTracks(request, url, env);
    }

    // ===== WebSocket live feed =====
    if (path === "/ws/live") {
      const raceId = url.searchParams.get("raceId");
      if (!raceId) return jsonError("Missing raceId", 400);
      return stubForRace(env, raceId).fetch(request);
    }

    // ===== /boats endpoint =====
    if (path === "/boats" && request.method === "GET") {
      const raceId = url.searchParams.get("raceId");
      if (!raceId) return jsonError("Missing raceId", 400);

      const doUrl = new URL("https://do/boats");
      const activeSeconds = url.searchParams.get("activeSeconds");
      if (activeSeconds) doUrl.searchParams.set("activeSeconds", activeSeconds);

      const resp = await stubForRace(env, raceId).fetch(new Request(doUrl.toString()));
      const data = await resp.json();
      return jsonOk(data as object);
    }

    // ===== Other read-only DO endpoints =====
    if (
      request.method === "GET" &&
      (path === "/replay-multi" || path === "/autocourse" || path === "/export/gpx" || path === "/export/kml")
    ) {
      const raceId = url.searchParams.get("raceId");
      if (!raceId) return jsonError("Missing raceId", 400);

      const doUrl = new URL(request.url);
      doUrl.protocol = "https:";
      doUrl.host = "do";
      doUrl.pathname = path;

      const resp = await stubForRace(env, raceId).fetch(new Request(doUrl.toString(), request));
      // Pass through response with CORS
      const body = await resp.text();
      return corsResponse(body, resp.status, resp.headers.get("Content-Type") || "application/json");
    }

    // ===== Generic /update endpoint =====
    if (request.method === "POST" && path === "/update") {
      let parsed: Record<string, unknown>;
      try {
        parsed = await request.json() as Record<string, unknown>;
      } catch {
        return jsonError("Invalid JSON", 400);
      }

      const raceId = String(parsed?.raceId || "");
      if (!raceId) return jsonError("Missing raceId", 400);

      const resp = await stubForRace(env, raceId).fetch("https://do/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });

      return corsResponse(await resp.text(), resp.status);
    }

    // ===== Admin: clear boat data =====
    if (request.method === "POST" && path === "/admin/clear") {
      const key = url.searchParams.get("key");
      if (key !== "finntrack123") {
        return jsonError("Forbidden", 403);
      }

      const raceId = url.searchParams.get("raceId");
      if (!raceId) return jsonError("Missing raceId", 400);

      const resp = await stubForRace(env, raceId).fetch("https://do/clear", { method: "POST" });
      return corsResponse(await resp.text(), resp.status);
    }

    // ===== Health check =====
    if (request.method === "GET" && path === "/health") {
      return jsonOk({ status: "ok" });
    }

    // 404 for everything else
    return jsonError("Not found", 404);
  },
};
