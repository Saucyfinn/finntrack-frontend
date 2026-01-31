/* public/js/api.js - FinnTrack API helper (v3 compatible) */
(function () {
  const API_BASE = window.FINNTRACK_API_BASE || "";

  async function jget(path) {
    const url = API_BASE + path;
    const r = await fetch(url, {
      headers: { "Accept": "application/json" },
      credentials: API_BASE ? "omit" : "same-origin",
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`GET ${url} -> ${r.status} ${t}`);
    }
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const txt = await r.text();
      try { return JSON.parse(txt); } catch { return txt; }
    }
    return r.json();
  }

  function normalizeRaces(payload) {
    // Accept: array of strings, array of objects, {races:[...]}
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
    // Accept: array, {boats:[...]}, {ok:true,boats:[...]}
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") {
      if (Array.isArray(payload.boats)) return payload.boats;
      // Sometimes older backends return { boatId: {...}, ... }
      return Object.values(payload);
    }
    return [];
  }

  window.FinnAPI = {
    async listRaces() {
      const raw = await jget("/races");
      return normalizeRaces(raw);
    },

    async listBoats(raceId, activeSeconds = 300) {
      // activeSeconds is optional (API may ignore). Keep for compatibility.
      const u = `/boats?raceId=${encodeURIComponent(raceId)}&activeSeconds=${encodeURIComponent(activeSeconds)}`;
      const raw = await jget(u);
      return normalizeBoats(raw);
    },

    getLiveWsUrl(raceId) {
      // WebSocket is optional; live page uses polling.
      const base = API_BASE || window.location.origin;
      const protocol = base.startsWith("https") ? "wss" : "ws";
      const host = base.replace(/^https?:\/\//, "");
      return `${protocol}://${host}/live?raceId=${encodeURIComponent(raceId)}`;
    },

    // Replay helpers for replay.html
    async replayList(prefix) {
      const raw = await jget(`/replay/list?prefix=${encodeURIComponent(prefix)}`);
      // raw.keys can be [{key,...}] or ["key",...]
      const keys = raw?.keys || [];
      return keys.map(k => (typeof k === "string" ? k : k.key)).filter(Boolean);
    },

    async replayGet(key) {
      return jget(`/replay/get?key=${encodeURIComponent(key)}`);
    }
  };
})();
