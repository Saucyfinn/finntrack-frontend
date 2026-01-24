// src/index.ts
import { RaceState } from "./raceState";
export { RaceState };

type Env = {
  RACE_STATE: DurableObjectNamespace;
  HISTORY: KVNamespace;
  RACES: R2Bucket;
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

// Pretty, manual races for dropdown.
// (This does NOT create data; it just offers IDs + labels the UI can load.)
function listRacesPretty() {
  const mk = (series: string, year: number, count: number, prefix: string) =>
    Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      return {
        raceId: `${prefix}-${year}-R${String(n).padStart(2, "0")}`,
        title: `${series} ${year} — Race ${n}`,
        series,
        year,
        raceNo: n,
      };
    });

  const ausNats = mk("Australian Finn Nationals", 2026, 6, "AUSNATS");
  const goldCup = mk("Finn Gold Cup", 2026, 10, "GOLDCUP");
  const masters = mk("Finn World Masters", 2026, 8, "MASTERS");
  const undefinedRaces = mk("Undefined Race", 2026, 10, "UNDEF");

  const races = [...ausNats, ...goldCup, ...masters, ...undefinedRaces];
  return { races };
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

    // Static assets from /public are served automatically by the assets binding
    // No need to handle them here - they're served before the worker runs

    // Pretty race list used by the dropdown
    if (request.method === "GET" && path === "/race/list") {
      return withCors(Response.json(listRacesPretty()));
    }

    // WebSocket live feed for a race (DO handles upgrade)
    if (path === "/live") {
      const raceId = getRaceIdFromUrl(url);
      if (!raceId) return withCors(new Response("Missing raceId", { status: 400 }));
      return withCors(await stubForRace(env, raceId).fetch(request));
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

      // Route inside DO while preserving original path/query
      const doUrl = new URL(request.url);
      doUrl.protocol = "https:";
      doUrl.host = "do";
      doUrl.pathname = path;

      return withCors(await stubForRace(env, raceId).fetch(new Request(doUrl.toString(), request)));
    }

    // Update endpoint: POST body forwarded into DO
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

