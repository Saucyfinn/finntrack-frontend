(() => {
  const API_BASE = "";
  const log = (...args) => console.log("[FinnTrack]", ...args);

  // Element references (matching HTML IDs)
  const raceSelect = document.getElementById("raceList");
  const loadBtn = document.getElementById("loadRaceBtn");
  const boatPanel = document.getElementById("boatPanel");
  const windArrow = document.getElementById("windArrow");
  const windImg = document.getElementById("windImg");

  // Layer toggles
  const toggleStart = document.getElementById("toggleStart");
  const toggleFinish = document.getElementById("toggleFinish");
  const toggleMarks = document.getElementById("toggleMarks");
  const togglePoly = document.getElementById("togglePoly");

  // Replay controls
  const modeBtn = document.getElementById("modeBtn");
  const playBtn = document.getElementById("playBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const stepBtn = document.getElementById("stepBtn");
  const speedSelect = document.getElementById("speedSelect");
  const slider = document.getElementById("slider");
  const frameInfo = document.getElementById("frameInfo");

  // Export buttons
  const exportGPX = document.getElementById("exportGPX");
  const exportKML = document.getElementById("exportKML");

  // Initialize Leaflet map
  const map = L.map("map", {
    center: [-27.44, 153.21], // Default to Moreton Bay off Manly Boat Harbour
    zoom: 13,
    zoomControl: true
  });

  // Add tile layer (OpenStreetMap)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);

  log("Map initialized");

  // State
  let ws = null;
  let boats = {}; // { boatId: { data, marker, trail } }
  let currentRaceId = null;
  let isReplayMode = false;
  let replayData = null;
  let replayFrame = 0;
  let replayTimer = null;
  let replaySpeed = 1;

  // Course feature layers
  let startLineLayer = null;
  let finishLineLayer = null;
  let marksLayer = L.layerGroup().addTo(map);
  let coursePolyLayer = null;

  // Boat colors
  const boatColors = [
    "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
    "#ffff33", "#a65628", "#f781bf", "#999999", "#66c2a5"
  ];
  let colorIndex = 0;

  function getBoatColor(boatId) {
    if (!boats[boatId]) {
      boats[boatId] = { color: boatColors[colorIndex % boatColors.length] };
      colorIndex++;
    }
    return boats[boatId].color;
  }

  // Fetch race list
  async function fetchRaces() {
    const res = await fetch(API_BASE + "/race/list");
    if (!res.ok) throw new Error("race/list failed: " + res.status);
    return await res.json();
  }

  function populateRaceDropdown(races) {
    if (!raceSelect) return;

    races.sort((a, b) => {
      const sa = (a.series || "").localeCompare(b.series || "");
      if (sa !== 0) return sa;
      return (a.raceNo || 0) - (b.raceNo || 0);
    });

    raceSelect.innerHTML = "";

    for (const r of races) {
      const opt = document.createElement("option");
      opt.value = r.raceId;
      opt.textContent = r.title || r.raceId;
      raceSelect.appendChild(opt);
    }
  }

  // WebSocket connection
  function connectWebSocket(raceId) {
    if (!raceId) return;

    if (ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
    }

    currentRaceId = raceId;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${location.host}/live?raceId=${encodeURIComponent(raceId)}`;

    log("Connecting WS:", wsUrl);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => log("WS open", raceId);
    ws.onclose = () => log("WS closed", raceId);
    ws.onerror = (e) => console.error("WS error", e);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        handleWebSocketMessage(msg);
      } catch (err) {
        console.error("WS parse error", err);
      }
    };
  }

  function handleWebSocketMessage(msg) {
    if (msg.type === "full" && msg.boats) {
      // Full snapshot - clear and re-render all boats
      clearBoats();
      for (const [boatId, data] of Object.entries(msg.boats)) {
        updateBoat(boatId, data);
      }
      fitMapToBounds();
    } else if (msg.type === "update" && msg.boat && msg.data) {
      // Single boat update
      updateBoat(msg.boat, msg.data);
    }
    updateBoatPanel();
  }

  function updateBoat(boatId, data) {
    const lat = data.lat || data.latitude;
    const lng = data.lng || data.longitude;

    if (lat == null || lng == null) return;

    const color = getBoatColor(boatId);

    if (!boats[boatId].marker) {
      // Create new marker
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        fillColor: color,
        color: "#fff",
        weight: 2,
        fillOpacity: 0.9
      }).addTo(map);

      marker.bindTooltip(boatId, { permanent: false, direction: "top" });

      boats[boatId].marker = marker;
      boats[boatId].trail = [[lat, lng]];
      boats[boatId].trailLine = L.polyline([[lat, lng]], {
        color: color,
        weight: 2,
        opacity: 0.6
      }).addTo(map);
    } else {
      // Update existing marker
      boats[boatId].marker.setLatLng([lat, lng]);
      boats[boatId].trail.push([lat, lng]);

      // Keep trail to last 100 points
      if (boats[boatId].trail.length > 100) {
        boats[boatId].trail.shift();
      }
      boats[boatId].trailLine.setLatLngs(boats[boatId].trail);
    }

    boats[boatId].data = data;
  }

  function clearBoats() {
    for (const boatId of Object.keys(boats)) {
      if (boats[boatId].marker) {
        map.removeLayer(boats[boatId].marker);
      }
      if (boats[boatId].trailLine) {
        map.removeLayer(boats[boatId].trailLine);
      }
    }
    boats = {};
    colorIndex = 0;
  }

  function fitMapToBounds() {
    const markers = Object.values(boats)
      .filter(b => b.marker)
      .map(b => b.marker.getLatLng());

    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  function updateBoatPanel() {
    if (!boatPanel) return;

    const boatList = Object.entries(boats)
      .filter(([_, b]) => b.data)
      .map(([id, b]) => {
        const d = b.data;
        const speed = d.speed != null ? d.speed.toFixed(1) : "?";
        const heading = d.heading != null ? Math.round(d.heading) : "?";
        return `<div style="color:${b.color};margin:4px 0;">
          <b>${id}</b>: ${speed}kn @ ${heading}&deg;
        </div>`;
      });

    boatPanel.innerHTML = boatList.length > 0
      ? `<b>Boats (${boatList.length})</b>` + boatList.join("")
      : "<i>No boats</i>";
  }

  // Fetch and render course features
  async function fetchCourseFeatures(raceId) {
    try {
      const res = await fetch(`${API_BASE}/autocourse?raceId=${encodeURIComponent(raceId)}`);
      if (!res.ok) return;

      const course = await res.json();
      renderCourseFeatures(course);
    } catch (err) {
      log("Failed to fetch course features:", err);
    }
  }

  function renderCourseFeatures(course) {
    // Clear existing
    if (startLineLayer) map.removeLayer(startLineLayer);
    if (finishLineLayer) map.removeLayer(finishLineLayer);
    marksLayer.clearLayers();
    if (coursePolyLayer) map.removeLayer(coursePolyLayer);

    // Start line
    if (course.startLine && course.startLine.length === 2) {
      const [p1, p2] = course.startLine;
      startLineLayer = L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
        color: "#00cc00",
        weight: 4,
        dashArray: "10, 5"
      }).addTo(map);
      startLineLayer.bindTooltip("Start Line");
    }

    // Finish line
    if (course.finishLine && course.finishLine.length === 2) {
      const [p1, p2] = course.finishLine;
      finishLineLayer = L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
        color: "#cc0000",
        weight: 4,
        dashArray: "10, 5"
      }).addTo(map);
      finishLineLayer.bindTooltip("Finish Line");
    }

    // Marks
    if (course.marks && course.marks.length > 0) {
      for (const mark of course.marks) {
        const m = L.circleMarker([mark.lat, mark.lng], {
          radius: 10,
          fillColor: "#ffcc00",
          color: "#000",
          weight: 2,
          fillOpacity: 0.8
        }).addTo(marksLayer);
        m.bindTooltip(mark.name || "Mark");
      }
    }

    // Course polygon
    if (course.polygon && course.polygon.length > 2) {
      const coords = course.polygon.map(p => [p.lat, p.lng]);
      coursePolyLayer = L.polygon(coords, {
        color: "#3388ff",
        weight: 2,
        fillOpacity: 0.1
      }).addTo(map);
    }

    // Wind direction
    if (course.windDirection != null && windArrow && windImg) {
      windArrow.style.display = "block";
      windImg.style.transform = `rotate(${course.windDirection}deg)`;
    }

    updateLayerVisibility();
  }

  function updateLayerVisibility() {
    if (startLineLayer) {
      if (toggleStart?.checked) map.addLayer(startLineLayer);
      else map.removeLayer(startLineLayer);
    }
    if (finishLineLayer) {
      if (toggleFinish?.checked) map.addLayer(finishLineLayer);
      else map.removeLayer(finishLineLayer);
    }
    if (toggleMarks?.checked) map.addLayer(marksLayer);
    else map.removeLayer(marksLayer);
    if (coursePolyLayer) {
      if (togglePoly?.checked) map.addLayer(coursePolyLayer);
      else map.removeLayer(coursePolyLayer);
    }
  }

  // Layer toggle event listeners
  [toggleStart, toggleFinish, toggleMarks, togglePoly].forEach(el => {
    if (el) el.addEventListener("change", updateLayerVisibility);
  });

  // Load race
  function loadRace(raceId) {
    if (!raceId) return;

    clearBoats();
    if (isReplayMode) {
      fetchReplayData(raceId);
    } else {
      connectWebSocket(raceId);
    }
    fetchCourseFeatures(raceId);
  }

  // Replay mode
  async function fetchReplayData(raceId) {
    try {
      const res = await fetch(`${API_BASE}/replay-multi?raceId=${encodeURIComponent(raceId)}`);
      if (!res.ok) throw new Error("replay-multi failed");

      replayData = await res.json();
      replayFrame = 0;

      if (replayData.frames && replayData.frames.length > 0) {
        slider.max = replayData.frames.length - 1;
        slider.value = 0;
        frameInfo.textContent = `1/${replayData.frames.length}`;
        renderReplayFrame(0);
      }
    } catch (err) {
      log("Replay fetch error:", err);
    }
  }

  function renderReplayFrame(frameIndex) {
    if (!replayData || !replayData.frames) return;
    if (frameIndex < 0 || frameIndex >= replayData.frames.length) return;

    const frame = replayData.frames[frameIndex];
    clearBoats();

    for (const boat of frame.boats || []) {
      updateBoat(boat.boatId, boat);
    }

    slider.value = frameIndex;
    frameInfo.textContent = `${frameIndex + 1}/${replayData.frames.length}`;
    updateBoatPanel();
  }

  function playReplay() {
    if (replayTimer) return;
    replayTimer = setInterval(() => {
      replayFrame++;
      if (replayFrame >= replayData.frames.length) {
        replayFrame = 0; // Loop
      }
      renderReplayFrame(replayFrame);
    }, 1000 / replaySpeed);
  }

  function pauseReplay() {
    if (replayTimer) {
      clearInterval(replayTimer);
      replayTimer = null;
    }
  }

  function stepReplay() {
    pauseReplay();
    replayFrame++;
    if (replayFrame >= replayData.frames.length) {
      replayFrame = 0;
    }
    renderReplayFrame(replayFrame);
  }

  // Mode toggle
  if (modeBtn) {
    modeBtn.addEventListener("click", () => {
      isReplayMode = !isReplayMode;
      modeBtn.textContent = isReplayMode ? "Switch to Live" : "Switch to Replay";

      // Toggle replay controls visibility
      document.querySelectorAll(".replayOnly").forEach(el => {
        el.style.display = isReplayMode ? "inline-block" : "none";
      });

      if (isReplayMode && ws) {
        ws.close();
        ws = null;
      }

      if (currentRaceId) {
        loadRace(currentRaceId);
      }
    });
  }

  // Replay control listeners
  if (playBtn) playBtn.addEventListener("click", playReplay);
  if (pauseBtn) pauseBtn.addEventListener("click", pauseReplay);
  if (stepBtn) stepBtn.addEventListener("click", stepReplay);

  if (speedSelect) {
    speedSelect.addEventListener("change", () => {
      replaySpeed = parseFloat(speedSelect.value);
      if (replayTimer) {
        pauseReplay();
        playReplay();
      }
    });
  }

  if (slider) {
    slider.addEventListener("input", () => {
      replayFrame = parseInt(slider.value, 10);
      renderReplayFrame(replayFrame);
    });
  }

  // Export functions
  if (exportGPX) {
    exportGPX.addEventListener("click", () => {
      if (currentRaceId) {
        window.location.href = `${API_BASE}/export/gpx?raceId=${encodeURIComponent(currentRaceId)}`;
      }
    });
  }

  if (exportKML) {
    exportKML.addEventListener("click", () => {
      if (currentRaceId) {
        window.location.href = `${API_BASE}/export/kml?raceId=${encodeURIComponent(currentRaceId)}`;
      }
    });
  }

  // Load button
  if (loadBtn) {
    loadBtn.addEventListener("click", () => {
      const raceId = raceSelect?.value;
      if (raceId) loadRace(raceId);
    });
  }

  // Race select change
  if (raceSelect) {
    raceSelect.addEventListener("change", () => {
      const raceId = raceSelect.value;
      if (raceId) loadRace(raceId);
    });
  }

  // Initialize
  async function init() {
    try {
      const data = await fetchRaces();
      const races = data.races || [];
      populateRaceDropdown(races);

      log("Viewer loaded. Races:", races.length);

      // Auto-load first race
      if (raceSelect && raceSelect.value) {
        loadRace(raceSelect.value);
      }
    } catch (err) {
      console.error("Init error:", err);
    }
  }

  init();
})();
