/* public/js/config.js
   FinnTrack Frontend runtime configuration.
   This is loaded BEFORE api.js / live.js / map.js etc.
*/

(function () {
  // Production API (Cloudflare Worker)
  window.FINNTRACK_API_BASE = "https://api.finntracker.org";

  // Optional: useful toggles for debugging
  window.FINNTRACK_DEBUG = false;

  // Optional: if you later add an API key for read endpoints (not recommended for public spectator)
  // window.FINNTRACK_API_KEY = "";
})();

