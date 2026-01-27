// public/js/live.js
// FinnTrack Live page — ONLY shows boats that are actively connected (recent updates).
(() => {
  const ACTIVE_SECONDS = 300;  // 5 minutes TTL for testing
  const POLL_MS = 2000;

  const el = (id) => document.getElementById(id);

  const wsStatusEl = el("wsStatus");
  const raceSelectEl = el("raceSelect");
  const loadRaceBtn = el("loadRaceBtn");
  const followSelectEl = el("followSelect");
  const followBtn = el("followBtn");
  const resetViewBtn = el("resetViewBtn");
  const boatListEl = el("boatList");

  let raceId = "";
  let followBoatId = "";
  let pollInterval = null;

  function nowMs() {
    return Date.now();
  }

  // Backend now stores timestamp in MILLISECONDS
  function getBoatTimestampMs(b) {
    if (!b) return 0;
    if (typeof b.timestamp === "number") return b.timestamp;
    if (typeof b.tst === "number") return b.tst * 1000; // tst is seconds
    return 0;
  }

  function isActiveBoat(b) {
    // If backend provides "active" flag, use it
    if (typeof b.active === "boolean") return b.active;
    // Otherwise compute from timestamp
    const t = getBoatTimestampMs(b);
    if (!t) return false;
    return (nowMs() - t) <= (ACTIVE_SECONDS * 1000);
  }

  function setWsStatus(text, ok) {
    if (!wsStatusEl) return;
    wsStatusEl.innerHTML = ok
      ? `<span style="color:green">●</span> ${text}`
      : `<span style="color:red">●</span> ${text}`;
  }

  async function loadRaceOptions() {
    console.log("[live.js] Loading race options...");
    try {
      const resp = await fetch("/race/list");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const races = data.races || [];
      console.log(`[live.js] Loaded ${races.length} races`);

      raceSelectEl.innerHTML = "";

      // Placeholder
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "-- Select a race --";
      placeholder.disabled = true;
      placeholder.selected = true;
      raceSelectEl.appendChild(placeholder);

      // Group by series
      const grouped = {};
      races.forEach((r) => {
        if (!grouped[r.series]) grouped[r.series] = [];
        grouped[r.series].push(r);
      });

      for (const [series, seriesRaces] of Object.entries(grouped)) {
        const optgroup = document.createElement("optgroup");
        optgroup.label = series;
        seriesRaces.forEach((r) => {
          const opt = document.createElement("option");
          opt.value = r.raceId;
          opt.textContent = r.title;
          optgroup.appendChild(opt);
        });
        raceSelectEl.appendChild(optgroup);
      }
    } catch (e) {
      console.error("[live.js] Failed to load races:", e);
      raceSelectEl.innerHTML = '<option value="">Error loading races</option>';
    }
  }

  async function fetchConnectedBoats() {
    if (!raceId) {
      console.log("[live.js] No raceId set, skipping fetch");
      return {};
    }

    const url = `/boats?raceId=${encodeURIComponent(raceId)}&activeSeconds=${ACTIVE_SECONDS}`;
    console.log(`[live.js] Fetching: ${url}`);

    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) {
      console.error(`[live.js] Fetch failed: ${resp.status}`);
      return {};
    }

    const data = await resp.json();
    console.log("[live.js] Boats response:", data);
    return data || {};
  }

  function renderBoatList(activeBoats) {
    const ids = Object.keys(activeBoats);
    console.log(`[live.js] renderBoatList: ${ids.length} active boats`);

    if (!boatListEl) return;

    if (ids.length === 0) {
      boatListEl.textContent = "(no boats connected yet)";
      return;
    }

    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.padding = "0";
    ul.style.margin = "0";

    for (const id of ids.sort()) {
      const b = activeBoats[id];
      const li = document.createElement("li");
      li.style.padding = "6px 0";
      li.style.borderBottom = "1px solid #eee";

      const t = getBoatTimestampMs(b);
      const ageMs = t ? (nowMs() - t) : null;
      const ageSec = ageMs ? Math.floor(ageMs / 1000) : null;
      const ageStr = ageSec != null ? (ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`) : "";

      li.innerHTML = `<strong>${id}</strong> <span style="color:#888; font-size:12px;">${ageStr}</span>`;
      ul.appendChild(li);
    }

    boatListEl.innerHTML = "";
    boatListEl.appendChild(ul);
  }

  function renderFollowDropdown(activeBoats) {
    if (!followSelectEl) return;

    const current = followSelectEl.value || "";
    followSelectEl.innerHTML = "";

    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = "-- All boats --";
    followSelectEl.appendChild(optAll);

    const ids = Object.keys(activeBoats).sort();
    for (const id of ids) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      followSelectEl.appendChild(opt);
    }

    if (current && activeBoats[current]) {
      followSelectEl.value = current;
    } else {
      followSelectEl.value = "";
    }
  }

  function updateMap(activeBoats) {
    // Use FinnMap from map.js
    if (!window.FinnMap) {
      console.warn("[live.js] FinnMap not available");
      return;
    }

    const ids = Object.keys(activeBoats);
    console.log(`[live.js] updateMap: ${ids.length} boats`);

    for (const id of ids) {
      const b = activeBoats[id];
      const lat = Number(b.lat);
      const lng = Number(b.lng ?? b.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        console.warn(`[live.js] Invalid coords for ${id}: lat=${b.lat} lng=${b.lng}`);
        continue;
      }

      console.log(`[live.js] setBoat: ${id} at ${lat}, ${lng}`);
      window.FinnMap.setBoat(id, lat, lng, id);
    }

    // Follow mode
    if (followBoatId && activeBoats[followBoatId]) {
      const fb = activeBoats[followBoatId];
      const lat = Number(fb.lat);
      const lng = Number(fb.lng ?? fb.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        window.FinnMap.map.panTo([lat, lng], { animate: true });
      }
    }
  }

  async function tick() {
    try {
      const boats = await fetchConnectedBoats();

      // Filter to ACTIVE only (backend should already filter, but double-check)
      const activeBoats = {};
      for (const [id, b] of Object.entries(boats)) {
        if (isActiveBoat(b)) {
          activeBoats[id] = b;
        }
      }

      const count = Object.keys(activeBoats).length;
      renderBoatList(activeBoats);
      renderFollowDropdown(activeBoats);
      updateMap(activeBoats);

      setWsStatus(count > 0 ? `${count} boat(s) active` : "No boats yet", true);
    } catch (e) {
      console.error("[live.js] tick error:", e);
      setWsStatus("Error", false);
    }
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    console.log(`[live.js] Starting polling for race: ${raceId}`);
    tick(); // immediate
    pollInterval = setInterval(tick, POLL_MS);
  }

  function wireUI() {
    loadRaceBtn?.addEventListener("click", async () => {
      raceId = raceSelectEl?.value || "";
      if (!raceId) {
        alert("Please select a race first");
        return;
      }
      console.log(`[live.js] Load Race clicked: ${raceId}`);
      followBoatId = "";
      if (followSelectEl) followSelectEl.value = "";

      // Clear map and resize
      if (window.FinnMap) {
        window.FinnMap.clearBoats();
        window.FinnMap.forceResize();
      }

      startPolling();
    });

    followBtn?.addEventListener("click", () => {
      followBoatId = followSelectEl?.value || "";
      console.log(`[live.js] Follow: ${followBoatId || "(all)"}`);
    });

    resetViewBtn?.addEventListener("click", () => {
      followBoatId = "";
      if (followSelectEl) followSelectEl.value = "";
      if (window.FinnMap) window.FinnMap.fitToBoats();
    });
  }

  async function init() {
    console.log("[live.js] Initializing...");
    try {
      await loadRaceOptions();
      wireUI();
      setWsStatus("Select a race", false);

      // Ensure map is sized
      if (window.FinnMap) {
        window.FinnMap.forceResize();
        setTimeout(() => window.FinnMap.forceResize(), 200);
      }

      console.log("[live.js] Ready");
    } catch (e) {
      console.error("[live.js] init error:", e);
      setWsStatus("Error", false);
    }
  }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
