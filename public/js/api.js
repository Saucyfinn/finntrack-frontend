/* public/js/api.js - FinnTrack API helper */
(function () {
  const API_BASE = window.FINNTRACK_API_BASE || "https://api.finntracker.org";

  async function jget(path) {
    const url = API_BASE + path;
    try {
      const r = await fetch(url, {
        headers: { "Accept": "application/json" },
        credentials: "omit",
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        const err = new Error(`GET ${url} -> ${r.status} ${t}`);
        console.error("[FinnAPI]", err.message);
        throw err;
      }
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const txt = await r.text();
        try { return JSON.parse(txt); } catch { return txt; }
      }
      return r.json();
    } catch (e) {
      console.error("[FinnAPI] Fetch error:", e.message || e);
      throw e;
    }
  }

  function normalizeRaces(payload) {
    const races = Array.isArray(payload) ? payload : (payload?.races || []);
    return races
      .map(r => {
        if (typeof r === "string") return { id: r, name: r };
        const id = r.id || r.raceId || r.slug || r.name || r.title;
        const name = r.name || r.title || id;
        return id ? { id, name } : null;
      })
      .filter(Boolean);
  }

  function normalizeBoats(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") {
      if (Array.isArray(payload.boats)) return payload.boats;
      return Object.values(payload);
    }
    return [];
  }

  window.FinnAPI = {
    apiBase: API_BASE,

    async getRaces() {
      const raw = await jget("/races");
      return normalizeRaces(raw);
    },

    async getLiveBoats(raceId, withinSeconds = 300) {
      const u = `/boats?raceId=${encodeURIComponent(raceId)}&within=${encodeURIComponent(withinSeconds)}`;
      const raw = await jget(u);
      return normalizeBoats(raw);
    },

    async listRaces() {
      return this.getRaces();
    },

    async listBoats(raceId, within = 300) {
      return this.getLiveBoats(raceId, within);
    },

    getLiveWsUrl(raceId) {
      const base = API_BASE || window.location.origin;
      const protocol = base.startsWith("https") ? "wss" : "ws";
      const host = base.replace(/^https?:\/\//, "");
      return `${protocol}://${host}/ws/live?raceId=${encodeURIComponent(raceId)}`;
    },

    async replayList(prefix) {
      const raw = await jget(`/replay/list?prefix=${encodeURIComponent(prefix)}`);
      const keys = raw?.keys || [];
      return keys.map(k => (typeof k === "string" ? k : k.key)).filter(Boolean);
    },

    async replayGet(key) {
      return jget(`/replay/get?key=${encodeURIComponent(key)}`);
    }
  };

  console.log("[FinnAPI] Initialized with apiBase:", API_BASE);
})();
