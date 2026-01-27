// public/js/live.js
(() => {
  const $ = (id) => document.getElementById(id);

  const raceSelect = $("raceSelect");
  const loadRaceBtn = $("loadRaceBtn");
  const followSelect = $("followSelect");
  const followBtn = $("followBtn");
  const resetViewBtn = $("resetViewBtn");
  const boatsList = $("boatsList"); // UL or DIV where boats list is rendered
  const statusDot = $("connDot");   // optional
  const statusText = $("connText"); // optional

  // ---- config ----
  const POLL_MS = 1000;

  let currentRaceId = null;
  let pollTimer = null;
  let firstFix = true;
  let followingBoatId = null;

  function setStatus(ok, text) {
    if (statusDot) statusDot.style.background = ok ? "green" : "red";
    if (statusText) statusText.textContent = text || (ok ? "Connected" : "Disconnected");
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
    if (!boatsList) return;

    if (boats.length === 0) {
      boatsList.innerHTML = "(no boats connected yet)";
      return;
    }

    // Simple list
    boatsList.innerHTML = "";
    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.padding = "0";
    ul.style.margin = "0";

    boats
      .slice()
      .sort((a, b) => String(a.boatId).localeCompare(String(b.boatId)))
      .forEach((b) => {
        const li = document.createElement("li");
        li.textContent = boatLabel(b);
        li.style.padding = "6px 0";
        ul.appendChild(li);
      });

    boatsList.appendChild(ul);
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

    const url = `/boats?raceId=${encodeURIComponent(currentRaceId)}`;
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

  // Optional: auto-load first race value if you want
  // if (raceSelect && raceSelect.value) onLoadRace();
})();
