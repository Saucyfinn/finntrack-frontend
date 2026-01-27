/* public/js/live.js */

(function () {
  const wsStatus = document.getElementById("wsStatus");
  const raceSelect = document.getElementById("raceSelect");
  const loadRaceBtn = document.getElementById("loadRaceBtn");
  const followSelect = document.getElementById("followSelect");
  const followBtn = document.getElementById("followBtn");
  const resetViewBtn = document.getElementById("resetViewBtn");
  const boatList = document.getElementById("boatList");

  let currentRaceId = null;
  let pollTimer = null;
  let followBoatId = ""; // empty means "all boats"

  function setStatus(ok, text) {
    wsStatus.textContent = `● ${text}`;
    wsStatus.style.color = ok ? "green" : "crimson";
  }

  function renderBoatList(activeBoats) {
    if (!activeBoats || activeBoats.length === 0) {
      boatList.textContent = "(no boats connected yet)";
      return;
    }

    // Simple list
    const ul = document.createElement("ul");
    ul.style.margin = "0";
    ul.style.paddingLeft = "16px";

    for (const b of activeBoats) {
      const li = document.createElement("li");
      li.textContent = `${b.boatId}`;
      ul.appendChild(li);
    }

    boatList.innerHTML = "";
    boatList.appendChild(ul);
  }

  function renderFollowDropdown(activeBoats) {
    const previous = followSelect.value;

    // Keep first option
    followSelect.innerHTML = `<option value="">-- All boats --</option>`;

    for (const b of activeBoats) {
      const opt = document.createElement("option");
      opt.value = b.boatId;
      opt.textContent = b.boatId;
      followSelect.appendChild(opt);
    }

    // Restore selection if still present
    const stillThere = [...followSelect.options].some(o => o.value === previous);
    followSelect.value = stillThere ? previous : "";
    followBoatId = followSelect.value || "";
  }

  function applyFollow(activeBoats) {
    if (!followBoatId) return; // all boats

    const b = activeBoats.find(x => x.boatId === followBoatId);
    if (!b) return;

    // Pan map to that boat
    // Use Leaflet global `FinnMap` helper via hard refresh + fit is handled in map.js,
    // so here we just set view gently by calling invalidate+pan using the map canvas nudge.
    // If you want explicit pan, add a FinnMap.panTo API later.
  }

  async function loadRaces() {
    try {
      const data = await window.FinnAPI.listRaces();

      // Expect array of { id, name } or similar
      const races = Array.isArray(data) ? data : (data?.races || []);
      raceSelect.innerHTML = "";

      for (const r of races) {
        const id = r.id || r.raceId || r.slug || r.name;
        const name = r.name || r.title || id;
        if (!id) continue;

        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = name;
        raceSelect.appendChild(opt);
      }

      // Default select first
      if (!currentRaceId && raceSelect.options.length) {
        currentRaceId = raceSelect.options[0].value;
        raceSelect.value = currentRaceId;
      }

      setStatus(true, "Connected");
    } catch (e) {
      console.error("[live.js] loadRaces failed:", e);
      setStatus(false, "Disconnected");
    }
  }

  async function pollBoats() {
    if (!currentRaceId) return;

    try {
      const boats = await window.FinnAPI.listBoats(currentRaceId, 300);

      // Update map and get normalized list back
      const activeBoats = window.FinnMap.updateBoats(currentRaceId, boats);

      renderBoatList(activeBoats);
      renderFollowDropdown(activeBoats);
      applyFollow(activeBoats);

      setStatus(true, activeBoats.length ? "Connected" : "No boats yet");
    } catch (e) {
      console.error("[live.js] pollBoats failed:", e);
      setStatus(false, "Disconnected");
      boatList.textContent = "(no boats connected yet)";
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollBoats, 1000);
    pollBoats(); // immediate
  }

  loadRaceBtn.addEventListener("click", () => {
    currentRaceId = raceSelect.value;
    window.FinnMap.setRace(currentRaceId);

    // This is the key “blank map after Load Race” fix:
    // force Leaflet to re-measure after any layout changes.
    setTimeout(() => window.FinnMap.hardRefreshSize(), 25);
    setTimeout(() => window.FinnMap.hardRefreshSize(), 250);

    startPolling();
  });

  followBtn.addEventListener("click", () => {
    followBoatId = followSelect.value || "";
    // Next poll will apply follow logic
  });

  resetViewBtn.addEventListener("click", () => {
    followBoatId = "";
    followSelect.value = "";
    // allow map.js to auto fit once per race again
    window.FinnMap.setRace(currentRaceId);
  });

  // Boot
  window.FinnMap.init();
  loadRaces().then(() => startPolling());
})();
