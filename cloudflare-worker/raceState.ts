/**
 * RaceState Durable Object - manages real-time boat/phone state and WebSocket connections
 */

interface BoatState {
  boatId: string;
  boatName?: string;
  nation?: string;
  lat: number;
  lon: number;
  sog?: number;
  cog?: number;
  heading?: number;
  heel?: number;
  altitude?: number;
  accuracy?: number;
  timestamp: number;
  lastUpdate: number;
}

interface PhoneState {
  deviceId: string;
  name: string;
  lat: number;
  lon: number;
  speed: number;
  heading: number;
  accuracy: number;
  lastUpdate: number;
}

export class RaceStateDO {
  private state: DurableObjectState;
  private boats: Map<string, BoatState> = new Map();
  private phones: Map<string, PhoneState> = new Map();
  private sessions: Set<WebSocket> = new Set();
  private phoneSessions: Set<WebSocket> = new Set();
  private corsOrigin: string = "*";

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.corsOrigin = env.CORS_ORIGIN || "*";
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": this.corsOrigin,
          "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method === "GET" && (path === "/boats" || path.endsWith("/boats"))) {
      return this.getBoats();
    }

    if (request.method === "POST" && (path === "/update" || path.endsWith("/update"))) {
      return this.handleUpdate(request);
    }

    if (request.method === "GET" && path === "/api/phones") {
      return this.getPhones();
    }

    if (request.method === "POST" && path === "/api/phone/update") {
      return this.handlePhoneUpdate(request);
    }

    if (request.method === "DELETE" && path.startsWith("/api/phone/")) {
      const deviceId = path.split("/").pop();
      return this.disconnectPhone(deviceId || "");
    }

    return this.jsonResponse({ error: "Not found", path }, 404);
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const isPhoneOnly = url.pathname.includes("/phones");

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);

    if (isPhoneOnly) {
      this.phoneSessions.add(server);
      const initData = {
        type: "init",
        phones: Array.from(this.phones.values()),
      };
      server.send(JSON.stringify(initData));
    } else {
      this.sessions.add(server);
      const initData = {
        type: "init",
        boats: Array.from(this.boats.values()),
        phones: Array.from(this.phones.values()),
      };
      server.send(JSON.stringify(initData));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketClose(ws: WebSocket) {
    this.sessions.delete(ws);
    this.phoneSessions.delete(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.sessions.delete(ws);
    this.phoneSessions.delete(ws);
  }

  private broadcast(message: object) {
    const data = JSON.stringify(message);
    for (const ws of this.sessions) {
      try {
        ws.send(data);
      } catch (e) {
        this.sessions.delete(ws);
      }
    }
  }

  private broadcastToPhones(message: object) {
    const data = JSON.stringify(message);
    for (const ws of this.phoneSessions) {
      try {
        ws.send(data);
      } catch (e) {
        this.phoneSessions.delete(ws);
      }
    }
    for (const ws of this.sessions) {
      try {
        ws.send(data);
      } catch (e) {
        this.sessions.delete(ws);
      }
    }
  }

  private async handleUpdate(request: Request): Promise<Response> {
    try {
      const body = await request.json() as any;

      const boatId = body.boatId || body.id;
      if (!boatId) {
        return this.jsonResponse({ ok: false, error: "Missing boatId" }, 400);
      }

      const lat = body.lat ?? body.latitude;
      const lon = body.lon ?? body.longitude;
      if (typeof lat !== "number" || typeof lon !== "number") {
        return this.jsonResponse({ ok: false, error: "Missing or invalid lat/lon" }, 400);
      }

      const now = Date.now();
      const boatState: BoatState = {
        boatId,
        boatName: body.boatName || body.name,
        nation: body.nation,
        lat,
        lon,
        sog: body.sog ?? body.speed,
        cog: body.cog ?? body.course,
        heading: body.heading,
        heel: body.heel,
        altitude: body.altitude,
        accuracy: body.accuracy,
        timestamp: body.timestamp || body.t || now,
        lastUpdate: now,
      };

      this.boats.set(boatId, boatState);

      this.broadcast({
        type: "boat_update",
        boat: boatState,
      });

      return this.jsonResponse({ ok: true, boatId, count: this.boats.size });
    } catch (e: any) {
      return this.jsonResponse({ ok: false, error: e?.message || String(e) }, 500);
    }
  }

  private async handlePhoneUpdate(request: Request): Promise<Response> {
    try {
      const body = await request.json() as any;

      const deviceId = body.deviceId;
      if (!deviceId) {
        return this.jsonResponse({ ok: false, error: "Missing deviceId" }, 400);
      }

      if (typeof body.lat !== "number" || typeof body.lon !== "number") {
        return this.jsonResponse({ ok: false, error: "Missing or invalid lat/lon" }, 400);
      }

      const now = Date.now();
      const phoneState: PhoneState = {
        deviceId,
        name: body.name || deviceId,
        lat: body.lat,
        lon: body.lon,
        speed: body.speed || 0,
        heading: body.heading || 0,
        accuracy: body.accuracy || 0,
        lastUpdate: now,
      };

      this.phones.set(deviceId, phoneState);

      this.broadcastToPhones({
        type: "phone_update",
        phone: phoneState,
      });

      return this.jsonResponse({ ok: true, deviceId, count: this.phones.size });
    } catch (e: any) {
      return this.jsonResponse({ ok: false, error: e?.message || String(e) }, 500);
    }
  }

  private async disconnectPhone(deviceId: string): Promise<Response> {
    this.phones.delete(deviceId);

    this.broadcastToPhones({
      type: "phone_disconnect",
      deviceId,
    });

    return this.jsonResponse({ ok: true });
  }

  private getBoats(): Response {
    const now = Date.now();
    const within = 300000;
    const activeBoats: BoatState[] = [];

    for (const [id, boat] of this.boats) {
      if (now - boat.lastUpdate < within) {
        activeBoats.push(boat);
      } else {
        this.boats.delete(id);
      }
    }

    return this.jsonResponse({ boats: activeBoats });
  }

  private getPhones(): Response {
    const now = Date.now();
    const activePhones: PhoneState[] = [];

    for (const [id, phone] of this.phones) {
      if (now - phone.lastUpdate < 60000) {
        activePhones.push(phone);
      } else {
        this.phones.delete(id);
      }
    }

    return this.jsonResponse({ phones: activePhones });
  }

  private jsonResponse(obj: any, status = 200): Response {
    return new Response(JSON.stringify(obj, null, 2), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": this.corsOrigin,
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }
}
