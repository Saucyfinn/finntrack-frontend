/* public/js/replay.js - Simple replay viewer for API v3 (R2-backed) */
(function () {
  const statusEl = document.getElementById("status");
  const raceSelect = document.getElementById("raceSelect");
  const boatSelect = document.getElementById("boatSelect");
  const loadRaceBtn = document.getElementById("loadRaceBtn");
  const loadBoatBtn = document.getElementById("loadBoatBtn");
  const clearBtn = document.getElementById("clearBtn");
  const maxPointsInput = document.getElementById("maxPoints");

  let map, marker, trail;

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function initMap() {
    map = L.map("map", { preferCanvas: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, crossOrigin: true
    }).addTo(map);
    map.setView([-43.53, 172.62], 11);
  }

  function finnIcon() {
    return L.divIcon({
      className: "",
      html: `<div class="finn-marker"><img src="/assets/boat.svg" alt="Finn" /></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
  }

  function setRotation(m, degrees) {
    const el = m.getElement();
    if (!el) return;
    el.style.setProperty("--rot", `${degrees}deg`);
  }

  function clearMap() {
    if (trail) { trail.remove(); trail = null; }
    if (marker) { marker.remove(); marker = null; }
  }

  async function loadRaces() {
    setStatus("Loading races…");
    const races = await window.FinnAPI.listRaces();

    raceSelect.innerHTML = "";
    if (!races.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No races";
      raceSelect.appendChild(opt);
      setStatus("No races returned from API.");
      return;
    }

    for (const r of races) {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      raceSelect.appendChild(opt);
    }

    setStatus("Races loaded.");
  }

  async function loadRaceKeys(raceId) {
    const prefix = `replay/${raceId}/`;
    setStatus(`Listing replay keys: ${prefix}`);
    const keys = await window.FinnAPI.replayList(prefix);
    return keys;
  }

  function extractBoatIdsFromKeys(keys, raceId) {
    // replay/<raceId>/<boatId>/<timestamp>.json
    const set = new Set();
    const prefix = `replay/${raceId}/`;
    for (const k of keys) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const parts = rest.split("/");
      if (parts.length >= 2) set.add(parts[0]);
    }
    return [...set].sort();
  }

  async function loadBoatTrail(raceId, boatId, maxPoints) {
    setStatus(`Loading trail for ${boatId}…`);

    const prefix = `replay/${raceId}/${boatId}/`;
    const keys = await window.FinnAPI.replayList(prefix);

    // Sort keys by timestamp (they end in /<ts>.json)
    const sorted = keys
      .map(k => {
        const m = k.match(/\/(\d+)\.json$/);
        return { key: k, ts: m ? Number(m[1]) : 0 };
      })
      .sort((a, b) => a.ts - b.ts);

    const slice = sorted.slice(Math.max(0, sorted.length - maxPoints));

    if (!slice.length) {
      setStatus("No replay points found for that boat.");
      return;
    }

    // Fetch points (sequential to keep it simple & reliable)
    const points = [];
    for (const item of slice) {
      const obj = await window.FinnAPI.replayGet(item.key);
      const lat = Number(obj.lat);
      const lon = Number(obj.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      points.push({
        lat, lon,
        heading: Number(obj.heading ?? obj.cog ?? 0),
        ts: Number(obj.timestamp ?? item.ts ?? 0),
        speed: obj.speed ?? obj.vel ?? null
      });
    }

    if (points.length < 2) {
      setStatus("Not enough valid points to draw a trail.");
      return;
    }

    clearMap();

    const latlngs = points.map(p => [p.lat, p.lon]);
    trail = L.polyline(latlngs, { weight: 3, opacity: 0.8 }).addTo(map);

    const last = points[points.length - 1];
    marker = L.marker([last.lat, last.lon], { icon: finnIcon() }).addTo(map);
    setRotation(marker, last.heading || 0);

    map.fitBounds(trail.getBounds().pad(0.25), { animate: false });
    map.invalidateSize(true);

    const first = points[0];
    setStatus(
      `Loaded ${points.length} points. ` +
      `From ${new Date(first.ts).toLocaleTimeString()} to ${new Date(last.ts).toLocaleTimeString()}.`
    );
  }

  loadRaceBtn.addEventListener("click", async () => {
    const raceId = raceSelect.value;
    if (!raceId) return;

    boatSelect.innerHTML = "";
    clearMap();

    try {
      const keys = await loadRaceKeys(raceId);
      const boats = extractBoatIdsFromKeys(keys, raceId);

      if (!boats.length) {
        setStatus("No boats found in replay for this race yet.");
        return;
      }

      for (const b of boats) {
        const opt = document.createElement("option");
        opt.value = b;
        opt.textContent = b;
        boatSelect.appendChild(opt);
      }

      setStatus(`Race loaded. Found ${boats.length} boats.`);
    } catch (e) {
      console.error(e);
      setStatus(`Error loading race: ${e.message || e}`);
    }
  });

  loadBoatBtn.addEventListener("click", async () => {
    const raceId = raceSelect.value;
    const boatId = boatSelect.value;
    const maxPoints = Math.max(50, Math.min(2000, Number(maxPointsInput.value) || 400));
    if (!raceId || !boatId) return;

    try {
      await loadBoatTrail(raceId, boatId, maxPoints);
    } catch (e) {
      console.error(e);
      setStatus(`Error loading boat trail: ${e.message || e}`);
    }
  });

  clearBtn.addEventListener("click", () => {
    clearMap();
    setStatus("Cleared.");
  });

  // Boot
  initMap();
  loadRaces().catch(e => {
    console.error(e);
    setStatus(`Failed to load races: ${e.message || e}`);
  });
})();
