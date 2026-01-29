/* public/js/api.js */

(function () {
  // API base URL - use relative paths if same origin, or absolute for cross-origin
  // For local dev: "" (relative)
  // For production with api subdomain: "https://api.finntracker.org"
  const API_BASE = window.FINNTRACK_API_BASE || "";

  async function jget(path) {
    const url = API_BASE + path;
    const r = await fetch(url, {
      headers: { "Accept": "application/json" },
      // Include credentials if same origin, omit for cross-origin
      credentials: API_BASE ? "omit" : "same-origin",
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`GET ${url} -> ${r.status} ${t}`);
    }
    // Some endpoints may return "" or text; guard
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const txt = await r.text();
      try { return JSON.parse(txt); } catch { return txt; }
    }
    return r.json();
  }

  window.FinnAPI = {
    // races list used for dropdown
    listRaces() {
      return jget("/race/list");
    },

    // active boats for a race
    listBoats(raceId, activeSeconds = 300) {
      const u = `/boats?raceId=${encodeURIComponent(raceId)}&activeSeconds=${encodeURIComponent(activeSeconds)}`;
      return jget(u);
    },

    // Get WebSocket URL for live updates
    getLiveWsUrl(raceId) {
      const base = API_BASE || window.location.origin;
      const protocol = base.startsWith("https") ? "wss" : "ws";
      const host = base.replace(/^https?:\/\//, "");
      return `${protocol}://${host}/live?raceId=${encodeURIComponent(raceId)}`;
    }
  };
})();
