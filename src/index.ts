<header>
    <img src="/assets/logo.svg" id="logo">
    <nav>
        <a href="/live.html">Live</a>
        <a href="/replay.html">Replay</a>
        <a href="/analytics.html">Analytics</a>
    </nav>
</header>

<main class="center">
    <h1>FinnTrack</h1>
    <p>Live tracking and replay for Finn sailing races.</p>

    <div class="home-buttons">
        <a class="btn" href="/live.html">Live Tracking</a>
        <a class="btn" href="/replay.html">Race Replay</a>
        <a class="btn" href="/analytics.html">Analytics Dashboard</a>
    </div>
</main>

<footer>FinnTrack — Powered by Cloudflare & MapLibre</footer>

<!-- FinnTrack API base URL -->
<script>
    window.FINNTRACK_API_BASE = "https://api.finntracker.org";
</script>

<!-- Load FinnTrack API client -->
<script src="/js/api.js"></script>

</body>
</html>
