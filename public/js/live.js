///////////////////////////////////////////////////////////////
// FinnTrack Live Module
// Real-time boat tracking via WebSocket
///////////////////////////////////////////////////////////////

document.addEventListener("DOMContentLoaded", async () => {
    console.log("FinnTrack Live viewer loaded");

    // Initialize map
    FinnTrackMap.initMap("map");

    // State
    let reconnectTimer = null;
    let selectedBoat = null;
    let followingBoat = null;
    let fleetData = null;

    // DOM elements
    const raceSelect = document.getElementById("raceSelect");
    const loadRaceBtn = document.getElementById("loadRaceBtn");
    const boatList = document.getElementById("boatList");
    const connectionStatus = document.getElementById("connectionStatus");
    const boatSelect = document.getElementById("boatSelect");
    const followBoatBtn = document.getElementById("followBoatBtn");
    const resetViewBtn = document.getElementById("resetViewBtn");

    // Toggle elements
    const toggleLabels = document.getElementById("toggleLabels");
    const toggleVectors = document.getElementById("toggleVectors");
    const toggleTrails = document.getElementById("toggleTrails");
    const toggleStart = document.getElementById("toggleStart");
    const toggleFinish = document.getElementById("toggleFinish");
    const toggleMarks = document.getElementById("toggleMarks");
    const togglePolygon = document.getElementById("togglePolygon");

    // Export buttons
    const exportGPX = document.getElementById("exportGPX");
    const exportKML = document.getElementById("exportKML");
    const exportJSON = document.getElementById("exportJSON");

    // Load fleet data for boat list display
    async function loadFleetData() {
        try {
            const res = await fetch("/data/fleet.json");
            if (!res.ok) return;
            fleetData = await res.json();
            renderFleetList();
        } catch (err) {
            console.log("Fleet data not available");
        }
    }

    // Render fleet list in sidebar (registered boats)
    function renderFleetList(connectedBoats = []) {
        if (!fleetData) return;
        boatList.innerHTML = "";

        const connected = new Set(connectedBoats);
        const entries = fleetData.entries || [];

        entries.forEach(entry => {
            const li = document.createElement("li");
            const boatId = entry.sailNumber;
            const isConnected = connected.has(boatId);
            const color = isConnected ? FinnTrackMap.getBoatColor(boatId) : "#ccc";
            const style = isConnected ? "font-weight: 600;" : "opacity: 0.5;";

            li.innerHTML = `<span style="color:${color}">●</span> <span style="${style}">${boatId}</span>`;
            li.dataset.boat = boatId;

            if (isConnected) {
                li.style.cursor = "pointer";
                li.onclick = () => {
                    selectedBoat = boatId;
                    FinnTrackMap.focusBoat(boatId);
                    FinnTrackMap.highlightBoat(boatId);
                };
            }
            boatList.appendChild(li);
        });

        // Add any connected boats not in fleet
        connectedBoats.forEach(boatId => {
            const inFleet = entries.some(e => e.sailNumber === boatId);
            if (!inFleet) {
                const li = document.createElement("li");
                const color = FinnTrackMap.getBoatColor(boatId);
                li.innerHTML = `<span style="color:${color}">●</span> <span style="font-weight: 600;">${boatId}</span>`;
                li.dataset.boat = boatId;
                li.style.cursor = "pointer";
                li.onclick = () => {
                    selectedBoat = boatId;
                    FinnTrackMap.focusBoat(boatId);
                    FinnTrackMap.highlightBoat(boatId);
                };
                boatList.appendChild(li);
            }
        });
    }

    // Update boat dropdown from live data only
    function updateBoatSelectFromLive(boatIds) {
        if (!boatSelect) return;

        // Reset and rebuild from live boats only
        boatSelect.innerHTML = '<option value="">-- All boats --</option>';

        boatIds.sort().forEach(boatId => {
            const opt = document.createElement("option");
            opt.value = boatId;
            opt.textContent = boatId;
            boatSelect.appendChild(opt);
        });
    }

    // Add a single boat to dropdown if not already present
    function addBoatToSelect(boatId) {
        if (!boatSelect) return;
        const exists = Array.from(boatSelect.options).some(o => o.value === boatId);
        if (!exists) {
            const opt = document.createElement("option");
            opt.value = boatId;
            opt.textContent = boatId;
            boatSelect.appendChild(opt);
        }
    }

    // Follow selected boat (auto-center on updates)
    function startFollowing(boatId) {
        followingBoat = boatId;
        if (boatId) {
            FinnTrackMap.focusBoat(boatId, 16);
            FinnTrackMap.highlightBoat(boatId);
            if (followBoatBtn) followBoatBtn.textContent = "Following...";
        }
    }

    // Stop following
    function stopFollowing() {
        followingBoat = null;
        FinnTrackMap.resetHighlight();
        if (followBoatBtn) followBoatBtn.textContent = "Follow";
    }

    // Load race list
    async function populateRaceList() {
        const races = await FinnTrackAPI.loadRaceList();
        raceSelect.innerHTML = "";
        if (races.length === 0) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "No races available";
            raceSelect.appendChild(opt);
            return;
        }
        // Group by series
        let currentSeries = "";
        let optgroup = null;
        races.forEach(r => {
            if (r.series && r.series !== currentSeries) {
                currentSeries = r.series;
                optgroup = document.createElement("optgroup");
                optgroup.label = r.series;
                raceSelect.appendChild(optgroup);
            }
            const opt = document.createElement("option");
            opt.value = r.raceId;
            opt.textContent = r.title || r.raceId;
            if (optgroup) {
                optgroup.appendChild(opt);
            } else {
                raceSelect.appendChild(opt);
            }
        });
        if (races.length > 0) {
            FinnTrackAPI.setRaceId(races[0].raceId);
        }
    }

    // Update connection status indicator
    function setConnectionStatus(status) {
        const dot = connectionStatus.querySelector(".status-dot");
        const text = connectionStatus.querySelector(".status-text");

        dot.className = "status-dot " + status;
        text.textContent = status === "connected" ? "Connected" :
                          status === "connecting" ? "Connecting..." : "Disconnected";
    }

    // Render boat list in sidebar (connected boats only, or fleet if loaded)
    function renderBoatList(connectedBoats) {
        if (fleetData) {
            renderFleetList(connectedBoats);
            return;
        }

        // Fallback: just show connected boats
        boatList.innerHTML = "";
        connectedBoats.sort().forEach(boatId => {
            const li = document.createElement("li");
            const color = FinnTrackMap.getBoatColor(boatId);
            li.innerHTML = `<span style="color:${color}">●</span> ${boatId}`;
            li.onclick = () => {
                selectedBoat = boatId;
                FinnTrackMap.focusBoat(boatId);
                FinnTrackMap.highlightBoat(boatId);
            };
            boatList.appendChild(li);
        });
    }

    // Handle incoming WebSocket messages
    function handleMessage(msg) {
        setConnectionStatus("connected");

        if (msg.type === "full") {
            // Full boat snapshot
            FinnTrackMap.clearBoatLayers();
            const boats = msg.boats || {};
            for (const boatId in boats) {
                FinnTrackMap.updateBoat(boatId, boats[boatId], {
                    appendTrail: false,
                    onClick: (id) => {
                        selectedBoat = id;
                        FinnTrackMap.focusBoat(id);
                        FinnTrackMap.highlightBoat(id);
                        FinnTrackMap.showBoatPopup(id, boats[id]);
                    }
                });
            }
            renderBoatList(Object.keys(boats));
            updateBoatSelectFromLive(Object.keys(boats));

            // Re-focus on followed boat if set
            if (followingBoat && boats[followingBoat]) {
                FinnTrackMap.focusBoat(followingBoat, 16);
                FinnTrackMap.highlightBoat(followingBoat);
            }
        }

        if (msg.type === "update") {
            // Single boat update
            FinnTrackMap.updateBoat(msg.boat, msg.data, {
                appendTrail: true,
                onClick: (id) => {
                    selectedBoat = id;
                    FinnTrackMap.focusBoat(id);
                    FinnTrackMap.highlightBoat(id);
                    FinnTrackMap.showBoatPopup(id, msg.data);
                }
            });

            // Auto-center on followed boat
            if (followingBoat === msg.boat) {
                FinnTrackMap.focusBoat(msg.boat, 16);
            }

            // Update boat in list (mark as connected or add if new)
            const existingLi = boatList.querySelector(`[data-boat="${msg.boat}"]`);
            if (existingLi) {
                // Update existing entry to show as connected
                const color = FinnTrackMap.getBoatColor(msg.boat);
                existingLi.innerHTML = `<span style="color:${color}">●</span> <span style="font-weight: 600;">${msg.boat}</span>`;
                existingLi.style.cursor = "pointer";
                existingLi.onclick = () => {
                    selectedBoat = msg.boat;
                    FinnTrackMap.focusBoat(msg.boat);
                    FinnTrackMap.highlightBoat(msg.boat);
                };
                addBoatToSelect(msg.boat);
            } else {
                // Add new boat not in fleet
                const li = document.createElement("li");
                li.dataset.boat = msg.boat;
                const color = FinnTrackMap.getBoatColor(msg.boat);
                li.innerHTML = `<span style="color:${color}">●</span> <span style="font-weight: 600;">${msg.boat}</span>`;
                li.style.cursor = "pointer";
                li.onclick = () => {
                    selectedBoat = msg.boat;
                    FinnTrackMap.focusBoat(msg.boat);
                    FinnTrackMap.highlightBoat(msg.boat);
                };
                boatList.appendChild(li);
                addBoatToSelect(msg.boat);
            }
        }
    }

    // Handle WebSocket disconnect
    function handleDisconnect() {
        setConnectionStatus("disconnected");

        // Auto-reconnect after 3 seconds
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
            setConnectionStatus("connecting");
            FinnTrackAPI.connectLive(handleMessage, handleDisconnect);
        }, 3000);
    }

    // Connect to live stream
    function connect() {
        setConnectionStatus("connecting");
        FinnTrackAPI.connectLive(handleMessage, handleDisconnect);
    }

    // Load course and connect
    async function loadRace() {
        const raceId = raceSelect.value;
        if (!raceId) return;

        FinnTrackAPI.setRaceId(raceId);
        FinnTrackAPI.disconnectLive();
        FinnTrackMap.clearBoatLayers();
        boatList.innerHTML = "";

        // Load course layers
        const courseData = await FinnTrackAPI.loadCourseData();
        FinnTrackMap.renderCourseLayers(courseData);

        // Connect to live feed
        connect();
    }

    // Event listeners
    loadRaceBtn.addEventListener("click", loadRace);

    // Follow boat controls
    if (followBoatBtn) {
        followBoatBtn.addEventListener("click", () => {
            const boatId = boatSelect ? boatSelect.value : null;
            if (boatId) {
                startFollowing(boatId);
            }
        });
    }

    if (resetViewBtn) {
        resetViewBtn.addEventListener("click", () => {
            stopFollowing();
            if (boatSelect) boatSelect.value = "";
            FinnTrackMap.fitToBounds();
        });
    }

    if (boatSelect) {
        boatSelect.addEventListener("change", () => {
            const boatId = boatSelect.value;
            if (boatId) {
                selectedBoat = boatId;
                FinnTrackMap.focusBoat(boatId, 15);
                FinnTrackMap.highlightBoat(boatId);
            } else {
                stopFollowing();
            }
        });
    }

    // Layer toggles
    if (toggleLabels) toggleLabels.addEventListener("change", e => FinnTrackMap.setLabelsVisible(e.target.checked));
    if (toggleVectors) toggleVectors.addEventListener("change", e => FinnTrackMap.setVectorsVisible(e.target.checked));
    if (toggleTrails) toggleTrails.addEventListener("change", e => FinnTrackMap.setTrailsVisible(e.target.checked));
    if (toggleStart) toggleStart.addEventListener("change", e => FinnTrackMap.setStartLineVisible(e.target.checked));
    if (toggleFinish) toggleFinish.addEventListener("change", e => FinnTrackMap.setFinishLineVisible(e.target.checked));
    if (toggleMarks) toggleMarks.addEventListener("change", e => FinnTrackMap.setMarksVisible(e.target.checked));
    if (togglePolygon) togglePolygon.addEventListener("change", e => FinnTrackMap.setPolygonVisible(e.target.checked));

    // Export buttons
    if (exportGPX) exportGPX.addEventListener("click", () => FinnTrackAPI.exportGPX());
    if (exportKML) exportKML.addEventListener("click", () => FinnTrackAPI.exportKML());
    if (exportJSON) exportJSON.addEventListener("click", async () => {
        const data = await FinnTrackAPI.loadReplayData();
        if (data && data.boats) {
            FinnTrackAPI.exportJSON(data.boats);
        }
    });

    // Handle window resize
    window.addEventListener("resize", () => {
        const map = FinnTrackMap.getMap();
        if (map) map.invalidateSize();
    });

    // Initial load
    await loadFleetData();
    await populateRaceList();
    await loadRace();
});
