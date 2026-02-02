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
  let followBoatId = "";

  function setStatus(ok, text) {
    wsStatus.textContent = `● ${text}`;
    wsStatus.style.color = ok ? "green" : "crimson";
  }

  function renderBoatList(activeBoats) {
    if (!activeBoats || activeBoats.length === 0) {
      boatList.textContent = "(no boats connected yet)";
      return;
    }

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

    followSelect.innerHTML = `<option value="">-- All boats --</option>`;

    for (const b of activeBoats) {
      const opt = document.createElement("option");
      opt.value = b.boatId;
      opt.textContent = b.boatId;
      followSelect.appendChild(opt);
    }

    const stillThere = [...followSelect.options].some(o => o.value === previous);
    followSelect.value = stillThere ? previous : "";
    followBoatId = followSelect.value || "";
  }

  function applyFollow(activeBoats) {
    if (!followBoatId) return;

    const b = activeBoats.find(x => x.boatId === followBoatId);
    if (!b) return;
  }

  async function loadRaces() {
    try {
      const races = await window.FinnAPI.getRaces();

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

      if (!currentRaceId && raceSelect.options.length) {
        currentRaceId = raceSelect.options[0].value;
        raceSelect.value = currentRaceId;
      }

      setStatus(true, "Connected");
    } catch (e) {
      console.error("[live.js] loadRaces failed:", e);
      setStatus(false, "Disconnected - " + (e.message || "fetch failed"));
    }
  }

  async function pollBoats() {
    if (!currentRaceId) return;

    try {
      const boats = await window.FinnAPI.getLiveBoats(currentRaceId, 300);

      const activeBoats = window.FinnMap.updateBoats(currentRaceId, boats);

      renderBoatList(activeBoats);
      renderFollowDropdown(activeBoats);
      applyFollow(activeBoats);

      setStatus(true, activeBoats.length ? "Connected" : "No boats yet");
    } catch (e) {
      console.error("[live.js] pollBoats failed:", e);
      setStatus(false, "Disconnected - " + (e.message || "fetch failed"));
      boatList.textContent = "(no boats connected yet)";
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollBoats, 1000);
    pollBoats();
  }

  loadRaceBtn.addEventListener("click", () => {
    currentRaceId = raceSelect.value;
    window.FinnMap.setRace(currentRaceId);

    setTimeout(() => window.FinnMap.hardRefreshSize(), 25);
    setTimeout(() => window.FinnMap.hardRefreshSize(), 250);

    startPolling();
  });

  followBtn.addEventListener("click", () => {
    followBoatId = followSelect.value || "";
  });

  resetViewBtn.addEventListener("click", () => {
    followBoatId = "";
    followSelect.value = "";
    window.FinnMap.setRace(currentRaceId);
  });

  window.FinnMap.init();
  loadRaces().then(() => startPolling());
})();
