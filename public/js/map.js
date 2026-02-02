/* public/js/map.js */

(function () {
  let map;
  let baseLayer;
  const markers = new Map();
  const trails = new Map();
  let lastBoundsRaceId = null;

  function ensureMap() {
    if (map) return map;

    map = L.map("map", {
      preferCanvas: true,
      zoomControl: true,
      attributionControl: true
    });

    baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      crossOrigin: true
    }).addTo(map);

    map.setView([-27.46, 153.19], 12);

    window.addEventListener("resize", () => hardRefreshSize(), { passive: true });

    return map;
  }

  function hardRefreshSize() {
    if (!map) return;
    map.invalidateSize(true);

    const center = map.getCenter();
    map.panTo([center.lat + 1e-8, center.lng + 1e-8], { animate: false });
    map.panTo([center.lat, center.lng], { animate: false });
  }

  function finnDivIcon() {
    return L.divIcon({
      className: "",
      html: `
        <div class="finn-marker">
          <img src="/assets/boat.svg" alt="Finn" />
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
  }

  function setMarkerRotation(marker, degrees) {
    const el = marker.getElement();
    if (!el) return;
    el.style.setProperty("--rot", `${degrees}deg`);
  }

  function upsertBoat(boatId, lat, lng, headingDeg) {
    ensureMap();

    let m = markers.get(boatId);
    if (!m) {
      m = L.marker([lat, lng], { icon: finnDivIcon(), interactive: true }).addTo(map);
      m.bindPopup(boatId);
      markers.set(boatId, m);
    } else {
      m.setLatLng([lat, lng]);
    }

    setMarkerRotation(m, headingDeg || 0);
    return m;
  }

  function setTrail(boatId, points) {
    ensureMap();
    let pl = trails.get(boatId);
    if (!points || points.length < 2) {
      if (pl) {
        pl.remove();
        trails.delete(boatId);
      }
      return;
    }
    if (!pl) {
      pl = L.polyline(points, { weight: 2, opacity: 0.6 }).addTo(map);
      trails.set(boatId, pl);
    } else {
      pl.setLatLngs(points);
    }
  }

  function clearMissing(activeBoatIds) {
    for (const [id, m] of markers.entries()) {
      if (!activeBoatIds.has(id)) {
        m.remove();
        markers.delete(id);
      }
    }
    for (const [id, pl] of trails.entries()) {
      if (!activeBoatIds.has(id)) {
        pl.remove();
        trails.delete(id);
      }
    }
  }

  function fitToBoatsOncePerRace(raceId, boats) {
    if (!boats || boats.length === 0) return;
    if (raceId && lastBoundsRaceId === raceId) return;

    const latlngs = boats
      .map(b => [Number(b.lat), Number(b.lng)])
      .filter(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo));

    if (latlngs.length === 0) return;

    lastBoundsRaceId = raceId;
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds.pad(0.25), { animate: false });
    hardRefreshSize();
  }

  window.FinnMap = {
    init() {
      ensureMap();
      setTimeout(() => hardRefreshSize(), 50);
      setTimeout(() => hardRefreshSize(), 250);
    },

    hardRefreshSize,

    setRace(raceId) {
      lastBoundsRaceId = null;
      markers.forEach(m => m.remove());
      markers.clear();
      trails.forEach(pl => pl.remove());
      trails.clear();
      setTimeout(() => hardRefreshSize(), 50);
    },

    updateBoats(raceId, boatsArray) {
      ensureMap();

      let boats = [];
      if (Array.isArray(boatsArray)) {
        boats = boatsArray;
      } else if (boatsArray && typeof boatsArray === "object") {
        boats = Object.values(boatsArray);
      }

      const active = [];
      for (const b of boats) {
        const lat = Number(b.lat);
        const lng = Number(b.lng || b.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const id = String(b.boatId || b.id || "");
        if (!id) continue;

        const heading = Number(b.heading ?? b.cog ?? 0);
        active.push({
          boatId: id,
          boatName: b.boatName || id,
          lat,
          lng,
          heading,
          timestamp: b.timestamp ?? b.t ?? null,
          speed: b.speed ?? b.sog ?? null
        });
      }

      const activeIds = new Set();
      for (const b of active) {
        activeIds.add(b.boatId);
        upsertBoat(b.boatId, b.lat, b.lng, b.heading);
      }
      clearMissing(activeIds);

      fitToBoatsOncePerRace(raceId, active);

      hardRefreshSize();

      return active;
    }
  };
})();
