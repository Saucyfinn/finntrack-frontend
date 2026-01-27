// public/js/live.js
(() => {
  const $ = (id) => document.getElementById(id);

  const raceSelect = $("raceSelect");
  const loadRaceBtn = $("loadRaceBtn");
  const followSelect = $("followSelect");
  const followBtn = $("followBtn");
  const resetViewBtn = $("resetViewBtn");
  const boatList = $("boatList"); // DIV where boats list is rendered (corrected ID)
  const wsStatus = $("wsStatus"); // Status indicator in sidebar

  // ---- config ----
  const POLL_MS = 1500;           // Poll every 1.5 seconds
  const ACTIVE_SECONDS = 120;     // Only show boats active within 120 seconds

  let currentRaceId = null;
  let pollTimer = null;
  let firstFix = true;
  let followingBoatId = null;

  function setStatus(ok, text) {
    if (wsStatus) {
      wsStatus.innerHTML = ok
        ? '<span style="color:green">●</span> ' + (text || "Connected")
        : '<span style="color:red">●</span> ' + (text || "Disconnected");
    }
  }

  function normalizeBoats(payload) {
    // Accept either: { BOATID: {lat,lng,...}, ... } or [ {boatId,lat,lng,...}, ... ]
    if (!payload) return [];

    if (Array.isArray(payload)) return payload;

    if (typeof payload === "object") {
      return Object.entries(payload).map(([boatId, v]) => ({
        boatId,
        ...v,
      }));
    }
    return [];
  }

  function boatLabel(b) {
    // Prefer "boatName" or "name" if present, otherwise boatId
    return b.name || b.boatName || b.boatId;
  }

  function renderBoatsList(boats) {
    if (!boatList) return;

    if (boats.length === 0) {
      boatList.innerHTML = "(no boats connected yet)";
      return;
    }

    // Simple list with last-seen info
    boatList.innerHTML = "";
    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.padding = "0";
    ul.style.margin = "0";

    const nowSec = Math.floor(Date.now() / 1000);

    boats
      .slice()
      .sort((a, b) => String(a.boatId).localeCompare(String(b.boatId)))
      .forEach((b) => {
        const li = document.createElement("li");
        const ageSec = nowSec - (b.timestamp || 0);
        const ageStr = ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`;
        li.innerHTML = `<strong>${boatLabel(b)}</strong> <span style="color:#888; font-size:12px;">${ageStr}</span>`;
        li.style.padding = "6px 0";
        li.style.borderBottom = "1px solid #eee";
        ul.appendChild(li);
      });

    boatList.appendChild(ul);
  }

  function renderFollowDropdown(boats) {
    if (!followSelect) return;

    // Preserve current selection if possible
    const prev = followSelect.value;

    followSelect.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = "-- All boats --";
    followSelect.appendChild(optAll);

    boats
      .slice()
      .sort((a, b) => String(a.boatId).localeCompare(String(b.boatId)))
      .forEach((b) => {
        const opt = document.createElement("option");
        opt.value = b.boatId;
        opt.textContent = boatLabel(b);
        followSelect.appendChild(opt);
      });

    // Restore if still present
    if ([...followSelect.options].some((o) => o.value === prev)) {
      followSelect.value = prev;
    }
  }

  async function fetchBoatsOnce() {
    if (!currentRaceId) return [];

    const url = `/boats?raceId=${encodeURIComponent(currentRaceId)}&activeSeconds=${ACTIVE_SECONDS}`;
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`boats fetch failed: ${resp.status}`);
    const json = await resp.json();
    return normalizeBoats(json);
  }

  function updateMap(boats) {
    if (!window.FinnMap) {
      console.error("FinnMap not available. Ensure public/js/map.js loads before live.js");
      return;
    }

    // Don’t clear the map every tick; just update/add markers
    boats.forEach((b) => {
      const lat = Number(b.lat);
      const lng = Number(b.lng ?? b.lon); // some payloads use lon
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      window.FinnMap.setBoat(b.boatId, lat, lng, boatLabel(b));
    });

    // First time: fit bounds if we have boats
    if (firstFix && boats.length > 0) {
      firstFix = false;
      window.FinnMap.fitToBoats();
    }

    // Follow mode
    if (followingBoatId) {
      const b = boats.find((x) => x.boatId === followingBoatId);
      if (b && Number.isFinite(b.lat) && Number.isFinite(b.lng ?? b.lon)) {
        const lng = Number(b.lng ?? b.lon);
        window.FinnMap.map.panTo([Number(b.lat), lng], { animate: true });
      }
    }
  }

  async function pollLoop() {
    try {
      const boats = await fetchBoatsOnce();
      setStatus(true, "Connected");
      renderBoatsList(boats);
      renderFollowDropdown(boats);
      updateMap(boats);
    } catch (e) {
      console.warn(e);
      setStatus(false, "Disconnected");
      // don’t wipe UI/map on transient errors
    }
  }

  function startPolling() {
    stopPolling();
    pollLoop(); // immediate
    pollTimer = setInterval(pollLoop, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function onLoadRace() {
    const raceId = raceSelect ? raceSelect.value : null;
    if (!raceId) return;

    currentRaceId = raceId;
    firstFix = true;
    followingBoatId = null;
    if (followSelect) followSelect.value = "";

    // CRITICAL: if the map is inside a flex layout, Leaflet often needs this
    // after UI changes (like the race dropdown updates / sidebar reflow).
    if (window.FinnMap) {
      window.FinnMap.forceResize();
      setTimeout(() => window.FinnMap.forceResize(), 150);
    }

    startPolling();
  }

  function onFollow() {
    followingBoatId = followSelect ? followSelect.value : null;
    if (!followingBoatId) {
      // follow "all" means no panning lock
      followingBoatId = null;
    }
  }

  function onResetView() {
    followingBoatId = null;
    if (followSelect) followSelect.value = "";
    if (window.FinnMap) window.FinnMap.fitToBoats();
  }

  // Wire up events
  if (loadRaceBtn) loadRaceBtn.addEventListener("click", onLoadRace);
  if (followBtn) followBtn.addEventListener("click", onFollow);
  if (resetViewBtn) resetViewBtn.addEventListener("click", onResetView);

  // ---- Initialize: fetch race list and populate dropdown ----
  async function initRaceDropdown() {
    if (!raceSelect) return;

    try {
      const resp = await fetch("/race/list");
      if (!resp.ok) throw new Error("Failed to load race list");
      const data = await resp.json();
      const races = data.races || [];

      raceSelect.innerHTML = "";

      // Add placeholder
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "-- Select a race --";
      placeholder.disabled = true;
      placeholder.selected = true;
      raceSelect.appendChild(placeholder);

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
        raceSelect.appendChild(optgroup);
      }
    } catch (e) {
      console.error("Failed to load races:", e);
      raceSelect.innerHTML = '<option value="">Error loading races</option>';
    }
  }

  // Initialize on page load
  setStatus(false, "Select a race");
  initRaceDropdown();

  // Ensure map is sized correctly after DOM is ready
  window.addEventListener("load", () => {
    if (window.FinnMap) {
      window.FinnMap.forceResize();
      setTimeout(() => window.FinnMap.forceResize(), 200);
    }
  });
})();
