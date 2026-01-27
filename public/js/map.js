// public/js/map.js
(() => {
  if (!window.L) {
    console.error("Leaflet (L) not found. leaflet.js failed to load.");
    return;
  }

  const mapEl = document.getElementById("map");
  if (!mapEl) {
    console.error("#map element not found");
    return;
  }

  // IMPORTANT: do NOT preferCanvas here. We want SVG overlays so nothing white-covers tiles.
  const map = L.map("map", { zoomControl: true });

  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  });

  tiles.on("tileerror", (e) => console.warn("Tile error:", e));
  tiles.addTo(map);

  // Christchurch default
  map.setView([-43.5321, 172.6362], 11);

  // Force SVG renderer for overlays
  const svgRenderer = L.svg();

  const boatLayer = L.layerGroup().addTo(map);
  const markers = new Map();

  function setBoat(boatId, lat, lng, label) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const existing = markers.get(boatId);
    if (existing) {
      existing.setLatLng([lat, lng]);
      if (label) existing.bindTooltip(label, { permanent: false });
      return;
    }

    const m = L.circleMarker([lat, lng], {
      renderer: svgRenderer,
      radius: 6,
      weight: 2,
      fillOpacity: 0.9,
    });

    if (label) m.bindTooltip(label, { permanent: false });

    m.addTo(boatLayer);
    markers.set(boatId, m);
  }

  function clearBoats() {
    boatLayer.clearLayers();
    markers.clear();
  }

  function fitToBoats() {
    const pts = [];
    markers.forEach((m) => pts.push(m.getLatLng()));
    if (pts.length === 0) return;
    map.fitBounds(L.latLngBounds(pts).pad(0.25));
  }

  function forceResize() {
    requestAnimationFrame(() => map.invalidateSize(true));
  }

  window.addEventListener("resize", forceResize);
  window.addEventListener("load", () => {
    forceResize();
    setTimeout(forceResize, 150);
    setTimeout(forceResize, 600);
  });

  window.FinnMap = { map, setBoat, clearBoats, fitToBoats, forceResize };
})();
