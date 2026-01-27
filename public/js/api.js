/* public/js/api.js */

(function () {
  async function jget(url) {
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
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
      return jget("/races");
    },

    // active boats for a race
    listBoats(raceId, activeSeconds = 300) {
      const u = `/boats?raceId=${encodeURIComponent(raceId)}&activeSeconds=${encodeURIComponent(activeSeconds)}`;
      return jget(u);
    }
  };
})();
