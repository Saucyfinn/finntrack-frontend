// src/index.ts
import { RaceState } from "./raceState";
export { RaceState };
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
};
function corsResponse(body, status, contentType = "application/json") {
    return new Response(body, {
        status,
        headers: {
            ...CORS_HEADERS,
            "Content-Type": contentType,
        },
    });
}
function jsonOk(data) {
    return corsResponse(JSON.stringify(data), 200);
}
function jsonError(message, status) {
    return corsResponse(JSON.stringify({ error: message }), status);
}
function stubForRace(env, raceId) {
    const id = env.RACE_STATE.idFromName(raceId);
    return env.RACE_STATE.get(id);
}
// ===== RACES =====
function listPredefinedRaces() {
    const mk = (series, prefix, count) => Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        return {
            raceId: `${prefix}-2026-R${String(n).padStart(2, "0")}`,
            title: `${series} - Race ${n}`,
            series,
            raceNo: n,
        };
    });
    // LIVE is the default race for all OwnTracks users
    const live = [{ raceId: "LIVE", title: "Live Tracking (All Boats)", series: "Live", raceNo: 0 }];
    const ausNats = mk("Australian Nationals 2026", "AUSNATS", 6);
    const goldCup = mk("Gold Cup 2026", "GOLDCUP", 10);
    const masters = mk("Finn World Masters 2026", "MASTERS", 8);
    const training = mk("Training/Undefined", "TRAINING", 10);
    return {
        races: [...live, ...ausNats, ...goldCup, ...masters, ...training],
        series: [
            { id: "LIVE", name: "Live", raceCount: 1 },
            { id: "AUSNATS", name: "Australian Nationals 2026", raceCount: 6 },
            { id: "GOLDCUP", name: "Gold Cup 2026", raceCount: 10 },
            { id: "MASTERS", name: "Finn World Masters 2026", raceCount: 8 },
            { id: "TRAINING", name: "Training/Undefined", raceCount: 10 },
        ],
    };
}
/**
 * Parse HTTP Basic Auth header (OwnTracks sends UserID:Password)
 */
function parseBasicAuth(request) {
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.toLowerCase().startsWith("basic "))
        return null;
    try {
        const decoded = atob(auth.slice(6));
        const idx = decoded.indexOf(":");
        if (idx === -1)
            return { username: decoded, password: "" };
        return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
    }
    catch {
        return null;
    }
}
/**
 * Handle OwnTracks ingestion via PATH-based routing
 * POST /ingest/owntracks/:raceId/:boatId - boatId in path
 * POST /ingest/owntracks/:raceId - boatId from tid, UserID, or TrackerID
 *
 * This is the PRIMARY endpoint for OwnTracks iOS HTTP mode.
 */
async function handleOwnTracksPath(request, raceId, pathBoatId, env) {
    // Parse basic auth (OwnTracks sends UserID:Password)
    const basicAuth = parseBasicAuth(request);
    // Parse JSON body
    let body;
    try {
        const text = await request.text();
        if (!text || !text.trim()) {
            return jsonError("Empty request body", 400);
        }
        body = JSON.parse(text);
    }
    catch {
        return jsonError("Invalid JSON in request body", 400);
    }
    // Handle non-location messages gracefully
    if (body._type && body._type !== "location") {
        return jsonOk({ ok: true, ignored: true, _type: body._type });
    }
    // Derive boatId (priority: path > tid > UserID from basic auth)
    let boatId = pathBoatId;
    if (!boatId && body.tid) {
        boatId = body.tid;
    }
    if (!boatId && basicAuth?.username) {
        boatId = basicAuth.username;
    }
    if (!boatId) {
        return jsonError("Cannot determine boatId. Set TrackerID in app, or use URL /ingest/owntracks/RACE/BOATID", 400);
    }
    // Validate coordinates
    const lat = body.lat;
    const lon = body.lon;
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return jsonError("Invalid or missing lat/lon coordinates", 400);
    }
    // IMPORTANT: OwnTracks tst is Unix SECONDS - convert to MILLISECONDS for internal storage
    const tstSeconds = typeof body.tst === "number" ? body.tst : Math.floor(Date.now() / 1000);
    const timestampMs = tstSeconds * 1000;
    const speed = typeof body.vel === "number" ? body.vel : 0;
    const heading = typeof body.cog === "number" ? body.cog : 0;
    // Forward to Durable Object
    const stub = stubForRace(env, raceId);
    const update = {
        raceId,
        boatId,
        lat,
        lng: lon,
        speed,
        heading,
        timestamp: timestampMs,
    };
    try {
        await stub.fetch("https://do/update", {
            method: "POST",
            body: JSON.stringify(update),
            headers: { "Content-Type": "application/json" },
        });
    }
    catch (e) {
        console.error("DO update failed:", e);
        return jsonError("Internal error storing location", 500);
    }
    console.log(`[OwnTracks] Ingested: raceId=${raceId} boatId=${boatId} lat=${lat} lon=${lon} tst=${tstSeconds}`);
    return jsonOk({
        ok: true,
        raceId,
        boatId,
        lat,
        lon,
        tst: tstSeconds,
        timestampMs,
    });
}
/**
 * Parse path-based OwnTracks URL
 * Supports:
 *   /ingest/owntracks/:raceId/:boatId - boatId in path
 *   /ingest/owntracks/:raceId - boatId from payload tid or basic auth
 */
function parseOwnTracksPath(path) {
    // Match /ingest/owntracks/RACEID/BOATID
    const matchFull = path.match(/^\/ingest\/owntracks\/([^/]+)\/([^/]+)/);
    if (matchFull) {
        return { raceId: decodeURIComponent(matchFull[1]), boatId: decodeURIComponent(matchFull[2]) };
    }
    // Match /ingest/owntracks/RACEID (boatId will come from payload or auth)
    const matchRaceOnly = path.match(/^\/ingest\/owntracks\/([^/]+)\/?$/);
    if (matchRaceOnly) {
        return { raceId: decodeURIComponent(matchRaceOnly[1]), boatId: null };
    }
    return null;
}
export default {
    async fetch(request, env, _ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        // CORS preflight for any path
        if (request.method === "OPTIONS") {
            return corsResponse(null, 204);
        }
        // Redirect root to /live.html
        if (request.method === "GET" || request.method === "HEAD") {
            if (path === "/" || path === "/index.html" || path === "/finntrack") {
                const redirectUrl = new URL(request.url);
                redirectUrl.pathname = "/live.html";
                return Response.redirect(redirectUrl.toString(), 302);
            }
        }
        // Race list
        if (request.method === "GET" && path === "/race/list") {
            return jsonOk(listPredefinedRaces());
        }
        // ===== OwnTracks Ingestion =====
        // SIMPLE: POST /ingest/owntracks - boatId from UserID/TrackerID, goes to "LIVE" race
        // Also supports: /ingest/owntracks/:raceId or ?raceId=...
        if ((path === "/ingest/owntracks" || path === "/ingest/owntracks/" || path.startsWith("/ingest/owntracks/")) && request.method === "POST") {
            // Default race for all live tracking
            const DEFAULT_RACE = "LIVE";
            // Try path-based with raceId
            if (path.startsWith("/ingest/owntracks/")) {
                const parsed = parseOwnTracksPath(path);
                if (parsed) {
                    return handleOwnTracksPath(request, parsed.raceId, parsed.boatId, env);
                }
            }
            // Check for query-param raceId, otherwise use default
            const raceId = url.searchParams.get("raceId") || DEFAULT_RACE;
            const boatId = url.searchParams.get("boatId") || null;
            return handleOwnTracksPath(request, raceId, boatId, env);
        }
        // GET /ingest/owntracks - connectivity check
        if (path.startsWith("/ingest/owntracks") && request.method === "GET") {
            return jsonOk({
                status: "ok",
                service: "FinnTrack OwnTracks Ingestion",
                usage: "Just POST to /ingest/owntracks - set UserID to your sail number",
            });
        }
        // ===== Debug endpoint =====
        // GET /debug/last?raceId=...
        if (path === "/debug/last" && request.method === "GET") {
            const raceId = url.searchParams.get("raceId");
            if (!raceId)
                return jsonError("Missing raceId", 400);
            const doUrl = new URL("https://do/debug/last");
            const resp = await stubForRace(env, raceId).fetch(doUrl.toString());
            const data = await resp.json();
            return jsonOk(data);
        }
        // ===== WebSocket live feed =====
        if (path === "/ws/live") {
            const raceId = url.searchParams.get("raceId");
            if (!raceId)
                return jsonError("Missing raceId", 400);
            return stubForRace(env, raceId).fetch(request);
        }
        // ===== /boats endpoint =====
        if (path === "/boats" && request.method === "GET") {
            const raceId = url.searchParams.get("raceId");
            if (!raceId)
                return jsonError("Missing raceId", 400);
            const doUrl = new URL("https://do/boats");
            const activeSeconds = url.searchParams.get("activeSeconds");
            if (activeSeconds)
                doUrl.searchParams.set("activeSeconds", activeSeconds);
            const resp = await stubForRace(env, raceId).fetch(new Request(doUrl.toString()));
            const data = await resp.json();
            return jsonOk(data);
        }
        // ===== Other read-only DO endpoints =====
        if (request.method === "GET" &&
            (path === "/replay-multi" || path === "/autocourse" || path === "/export/gpx" || path === "/export/kml")) {
            const raceId = url.searchParams.get("raceId");
            if (!raceId)
                return jsonError("Missing raceId", 400);
            const doUrl = new URL(request.url);
            doUrl.protocol = "https:";
            doUrl.host = "do";
            doUrl.pathname = path;
            const resp = await stubForRace(env, raceId).fetch(new Request(doUrl.toString(), request));
            const body = await resp.text();
            return corsResponse(body, resp.status, resp.headers.get("Content-Type") || "application/json");
        }
        // ===== Generic /update endpoint =====
        if (request.method === "POST" && path === "/update") {
            let parsed;
            try {
                parsed = await request.json();
            }
            catch {
                return jsonError("Invalid JSON", 400);
            }
            const raceId = String(parsed?.raceId || "");
            if (!raceId)
                return jsonError("Missing raceId", 400);
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
            const adminKey = env.ADMIN_KEY || "finn123";
            if (key !== adminKey) {
                return jsonError("Forbidden", 403);
            }
            const raceId = url.searchParams.get("raceId");
            if (!raceId)
                return jsonError("Missing raceId", 400);
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
