// src/index.ts
import { RaceState } from "./raceState";
export { RaceState };

type Env = {
  RACE_STATE: DurableObjectNamespace;
  HISTORY: KVNamespace;
  RACES: R2Bucket;
  DB: D1Database;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function withCors(resp: Response): Response {
  const h = new Headers(resp.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) h.set(k, v);
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: h,
  });
}

function getRaceIdFromUrl(url: URL): string | null {
  return url.searchParams.get("raceId");
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

// ===== OWNTRACKS INGEST =====
const SHARED_SECRET = "finntrack123";

type OwnTracksLocation = {
  _type?: string;       // "location"
  lat?: number;
  lon?: number;
  tst?: number;         // seconds since epoch
  t?: string;           // trigger, e.g. "u"
  vel?: number;         // speed (often km/h)
  cog?: number;         // course degrees
  acc?: number;         // accuracy meters
  alt?: number;
  batt?: number;        // battery %
  tid?: string;         // 2-char tracker id (optional)
  topic?: string;       // owntracks/user/device (optional)
  [k: string]: any;
};

function pickBoatId(url: URL, ot: OwnTracksLocation): string {
  // Prefer explicit boatId from query
  const q = (url.searchParams.get("boatId") || "").trim();
  if (q) return q;

  // Next: OwnTracks tid (often 2 letters)
  const tid = (ot.tid || "").trim();
  if (tid) return tid;

  // Next: last segment of topic (device)
  const topic = (ot.topic || "").trim();
  if (topic.includes("/")) return topic.split("/").pop() || "UNKNOWN";

  return "UNKNOWN";
}

function validateSecret(request: Request, url: URL): boolean {
  const key = url.searchParams.get("key") || "";
  if (key && key === SHARED_SECRET) return true;

  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ") && auth.slice(7) === SHARED_SECRET) return true;

  return false;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));

    // Redirect root and /finntrack to /finntrack.html
    if (request.method === "GET" || request.method === "HEAD") {
      if (path === "/" || path === "/index.html" || path === "/finntrack") {
        const redirectUrl = new URL(request.url);
        redirectUrl.pathname = "/finntrack.html";
        return Response.redirect(redirectUrl.toString(), 302);
      }
    }

    // Race list - predefined series
    if (request.method === "GET" && path === "/race/list") {
      return withCors(Response.json(listPredefinedRaces()));
    }

    // ---- OwnTracks HTTP ingest ----
    // POST /ingest/owntracks?raceId=TRAINING-2026-R01&boatId=NZL5&key=finntrack123
    if (request.method === "POST" && path === "/ingest/owntracks") {
      if (!validateSecret(request, url)) {
        return withCors(new Response("Unauthorized", { status: 401 }));
      }

      const raceId = getRaceIdFromUrl(url);
      if (!raceId) return withCors(new Response("Missing raceId", { status: 400 }));

      let ot: OwnTracksLocation;
      try {
        ot = await request.json<OwnTracksLocation>();
      } catch {
        return withCors(new Response("Bad JSON", { status: 400 }));
      }

      const lat = Number(ot.lat);
      const lon = Number(ot.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return withCors(new Response("Missing lat/lon", { status: 400 }));
      }

      const boatId = pickBoatId(url, ot);

      // OwnTracks uses tst in seconds; FinnTrack uses ms
      const tMs =
        Number.isFinite(Number(ot.tst)) ? Math.round(Number(ot.tst) * 1000) : Date.now();

      const update = {
        raceId,
        boatId,
        name: boatId,
        lat,
        lon,
        sog: Number.isFinite(Number(ot.vel)) ? Number(ot.vel) : undefined,
        cog: Number.isFinite(Number(ot.cog)) ? Number(ot.cog) : undefined,
        t: tMs,
        // keep a couple extras if you want later
        acc: Number.isFinite(Number(ot.acc)) ? Number(ot.acc) : undefined,
        batt: Number.isFinite(Number(ot.batt)) ? Number(ot.batt) : undefined,
      };

      const doUrl = new URL(request.url);
      doUrl.protocol = "https:";
      doUrl.host = "do";
      doUrl.pathname = "/update";

      const fwd = new Request(doUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });

      const resp = await stubForRace(env, raceId).fetch(fwd);
      return withCors(resp);
    }

    // WebSocket live feed for a race (DO handles upgrade)
    if (path === "/ws/live") {
      const raceId = getRaceIdFromUrl(url);
      if (!raceId) return withCors(new Response("Missing raceId", { status: 400 }));
      return stubForRace(env, raceId).fetch(request);
    }

    // Read-only endpoints served by DO
    if (
      path === "/boats" ||
      path === "/replay-multi" ||
      path === "/autocourse" ||
      path === "/export/gpx" ||
      path === "/export/kml"
    ) {
      const raceId = getRaceIdFromUrl(url);
      if (!raceId) return withCors(new Response("Missing raceId", { status: 400 }));

      const doUrl = new URL(request.url);
      doUrl.protocol = "https:";
      doUrl.host = "do";
      doUrl.pathname = path;

      return withCors(await stubForRace(env, raceId).fetch(new Request(doUrl.toString(), request)));
    }

    // Existing JSON update endpoint
    if (request.method === "POST" && path === "/update") {
      const bodyText = await request.text();
      let parsed: any;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        return withCors(new Response("Bad JSON", { status: 400 }));
      }

      const raceId = String(parsed?.raceId || "");
      if (!raceId) return withCors(new Response("Missing raceId", { status: 400 }));

      const doUrl = new URL(request.url);
      doUrl.protocol = "https:";
      doUrl.host = "do";
      doUrl.pathname = "/update";

      const fwd = new Request(doUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyText,
      });

      return withCors(await stubForRace(env, raceId).fetch(fwd));
    }

    // Helpful ping
    if (request.method === "GET" && path === "/health") {
      return withCors(new Response("ok", { status: 200 }));
    }

    return withCors(new Response("Not found", { status: 404 }));
  },
};
