// Handle both GET and POST from Traccar Client (OsmAnd protocol)
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Traccar sends device ID as 'id' parameter
  const deviceId = url.searchParams.get('id');
  const key = url.searchParams.get('key') || 'finn123';
  
  // Get location data from URL params (Traccar sends via query string)
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const speed = url.searchParams.get('speed'); // in knots
  const bearing = url.searchParams.get('bearing') || url.searchParams.get('course');
  const timestamp = url.searchParams.get('timestamp') || Date.now();
  
  if (!deviceId || !lat || !lon) {
    return new Response('Missing required parameters', { status: 400 });
  }
  
  // Default race ID - can be overridden with raceId param
  const raceId = url.searchParams.get('raceId') || 'aus-nats-2026';
  
  // Forward to the main update endpoint
  const updatePayload = {
    raceId: raceId,
    boatId: deviceId,
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    sog: speed ? parseFloat(speed) : undefined,
    cog: bearing ? parseFloat(bearing) : undefined,
    t: typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
  };
  
  try {
    // Forward to internal update handler or store directly
    const updateUrl = new URL('/update', url.origin);
    updateUrl.searchParams.set('key', key);
    
    const response = await fetch(updateUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(updatePayload)
    });
    
    if (response.ok) {
      return new Response('OK', { status: 200 });
    } else {
      const error = await response.text();
      return new Response(error, { status: response.status });
    }
  } catch (err) {
    console.error('Traccar forward error:', err);
    return new Response('Internal error', { status: 500 });
  }
}
