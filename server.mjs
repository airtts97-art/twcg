import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { homedir } from "node:os";

const root = process.cwd();
const localEnv = await readLocalEnv(join(root, ".env.local"));
const port = Number(process.env.PORT || getArg("--port") || 5174);
const googleClientId = Object.hasOwn(process.env, "GOOGLE_CLIENT_ID") ? process.env.GOOGLE_CLIENT_ID : localEnv.GOOGLE_CLIENT_ID || "";
const deckStorePath = resolve(process.env.DECK_STORE_PATH || join(root, "data", "decks.json"));
const rooms = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function readLocalEnv(filePath) {
  const values = {};
  try {
    const raw = await readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      values[key] = value;
    }
  } catch {
    // Local env files are optional.
  }
  return values;
}

function resolveStaticPath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const requested = cleanPath === "/" ? "/index.html" : cleanPath;
  const absolute = resolve(root, normalize(requested).replace(/^([/\\])+/, ""));
  if (absolute !== root && !absolute.startsWith(root + sep)) return null;
  return absolute;
}

const server = createServer(async (req, res) => {
  // CORS for GitHub Pages and other external origins
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  if (req.url === "/config") {
    sendJson(res, {
      googleClientId,
      googleSignInEnabled: Boolean(googleClientId),
    });
    return;
  }

  if (req.url === "/config.js") {
    const config = JSON.stringify({
      googleClientId,
      googleSignInEnabled: Boolean(googleClientId),
    });
    res.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(`globalThis.__TWCG_SERVER_CONFIG__ = ${config};\n`);
    return;
  }

  if (req.url === "/api/auth/google" && req.method === "POST") {
    const body = await readJsonBody(req).catch(() => null);
    const result = await verifyGoogleCredential(body?.credential);
    sendJson(res, result, result.ok ? 200 : 401);
    return;
  }

  if ((req.url || "").startsWith("/api/decks")) {
    await handleDeckApi(req, res);
    return;
  }

  const filePath = resolveStaticPath(req.url || "/");
  if (!filePath || !existsSync(filePath)) {
    // Silence favicon — browsers always request it and it's not an error
    if ((req.url || "").startsWith("/favicon")) {
      res.writeHead(204);
      res.end();
      return;
    }
    console.log(`[404] ${req.method} ${req.url}`);
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, {
    "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(res);
});

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 256_000) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
    req.on("error", reject);
  });
}

async function handleDeckApi(req, res) {
  const url = new URL(req.url || "/api/decks", `http://${req.headers.host || "127.0.0.1"}`);
  const userKey = normalizeUserKey(url.searchParams.get("user"));
  if (!userKey) {
    sendJson(res, { ok: false, message: "user is required" }, 400);
    return;
  }

  if (req.method === "GET") {
    const store = await readDeckStore();
    sendJson(res, { ok: true, decks: store[userKey] || [] });
    return;
  }

  if (req.method === "POST") {
    const body = await readJsonBody(req).catch(() => null);
    if (!body || !Array.isArray(body.decks)) {
      sendJson(res, { ok: false, message: "decks array is required" }, 400);
      return;
    }
    const decks = body.decks.map(normalizeSavedDeckEntry).filter(Boolean).slice(0, 20);
    const store = await readDeckStore();
    store[userKey] = decks;
    await writeDeckStore(store);
    sendJson(res, { ok: true, decks });
    return;
  }

  sendJson(res, { ok: false, message: "method not allowed" }, 405);
}

function normalizeUserKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, "")
    .slice(0, 120);
}

function normalizeSavedDeckEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const deck = normalizeDeckPayload(entry.deck);
  const name = String(entry.name || "").trim().slice(0, 80);
  if (!deck || !name) return null;
  return {
    id: String(entry.id || randomUUID()).slice(0, 80),
    name,
    deck,
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

function normalizeDeckPayload(deck) {
  if (!deck || !Array.isArray(deck.main) || !Array.isArray(deck.struct)) return null;
  return {
    core: String(deck.core || "frontierCore"),
    main: deck.main.map((id) => String(id)).slice(0, 80),
    struct: deck.struct.map((id) => String(id)).slice(0, 40),
  };
}

async function readDeckStore() {
  try {
    return JSON.parse(await readFile(deckStorePath, "utf8"));
  } catch {
    return {};
  }
}

async function writeDeckStore(store) {
  await mkdir(dirname(deckStorePath), { recursive: true });
  await writeFile(deckStorePath, JSON.stringify(store, null, 2), "utf8");
}

async function verifyGoogleCredential(credential) {
  if (!googleClientId) return { ok: false, message: "GOOGLE_CLIENT_ID is not configured." };
  if (!credential) return { ok: false, message: "Google credential is missing." };

  try {
    const url = new URL("https://oauth2.googleapis.com/tokeninfo");
    url.searchParams.set("id_token", credential);
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) return { ok: false, message: payload.error_description || "Google token verification failed." };
    if (payload.aud !== googleClientId) return { ok: false, message: "Google token audience does not match this app." };
    if (payload.email_verified !== "true" && payload.email_verified !== true) return { ok: false, message: "Google account email is not verified." };
    return {
      ok: true,
      user: {
        provider: "google",
        signedIn: true,
        name: payload.name || payload.email || "Google Player",
        email: payload.email || null,
        picture: payload.picture || null,
        sub: payload.sub || null,
      },
    };
  } catch {
    return { ok: false, message: "Google token verification request failed." };
  }
}

server.on("upgrade", (req, socket) => {
  if (req.url !== "/ws") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n"),
  );

  const client = {
    id: randomUUID(),
    socket,
    roomCode: null,
    role: "guest",
    name: "Player",
    frameBuffer: Buffer.alloc(0),
  };
  dbg("[WS] connected", { id: client.id.slice(0, 8) });
  socket.on("data", (chunk) => receiveFrames(client, chunk));
  socket.on("close", () => { dbg("[WS] disconnected", { id: client.id.slice(0, 8), room: client.roomCode || "-" }); removeClient(client); });
  socket.on("end", () => { dbg("[WS] end", { id: client.id.slice(0, 8), room: client.roomCode || "-" }); removeClient(client); });
  socket.on("error", (e) => { dbg("[WS] error", { id: client.id.slice(0, 8), msg: e.message }); removeClient(client); });
});

function receiveFrames(client, chunk) {
  client.frameBuffer = Buffer.concat([client.frameBuffer || Buffer.alloc(0), chunk]);
  let offset = 0;
  while (offset + 2 <= client.frameBuffer.length) {
    const frameStart = offset;
    const first = client.frameBuffer[offset++];
    const second = client.frameBuffer[offset++];
    const fin = Boolean(first & 0x80);
    const opcode = first & 0x0f;
    let length = second & 0x7f;
    if (length === 126) {
      if (offset + 2 > client.frameBuffer.length) { offset = frameStart; break; }
      length = client.frameBuffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (offset + 8 > client.frameBuffer.length) { offset = frameStart; break; }
      const bigLength = client.frameBuffer.readBigUInt64BE(offset);
      offset += 8;
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) { client.socket.destroy(); return; }
      length = Number(bigLength);
    }
    const masked = Boolean(second & 0x80);
    if (masked && offset + 4 > client.frameBuffer.length) { offset = frameStart; break; }
    const mask = masked ? client.frameBuffer.subarray(offset, offset + 4) : null;
    if (masked) offset += 4;
    if (offset + length > client.frameBuffer.length) { offset = frameStart; break; }
    const payload = client.frameBuffer.subarray(offset, offset + length);
    offset += length;

    if (opcode === 8) {
      client.frameBuffer = Buffer.alloc(0);
      removeClient(client);
      client.socket.end();
      return;
    }

    // Only process text (1) and continuation (0) frames
    if (opcode !== 1 && opcode !== 0) continue;

    const data = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i += 1) {
      data[i] = masked ? payload[i] ^ mask[i % 4] : payload[i];
    }

    if (opcode === 1 && fin) {
      // Complete single-frame message
      client.pendingMessage = null;
      dispatchMessage(client, data);
    } else if (opcode === 1 && !fin) {
      // First fragment of a fragmented message
      client.pendingMessage = data;
    } else if (opcode === 0) {
      // Continuation frame
      const acc = client.pendingMessage ? Buffer.concat([client.pendingMessage, data]) : data;
      if (fin) {
        client.pendingMessage = null;
        dispatchMessage(client, acc);
      } else {
        client.pendingMessage = acc;
      }
    }
  }
  client.frameBuffer = client.frameBuffer.subarray(offset);
}

function dispatchMessage(client, data) {
  dbg("[MSG]", { id: client.id.slice(0, 8), dataLen: data.length });
  try {
    handleMessage(client, JSON.parse(data.toString("utf8")));
  } catch (e) {
    dbg("[ERR] handleMessage", { id: client.id.slice(0, 8), dataLen: data.length, err: String(e).slice(0, 80) });
    send(client, { type: "error", message: "メッセージを処理できませんでした。" });
  }
}

const dbgLogPath = join(homedir(), "card-server-debug.log");

function dbg(label, extra = {}) {
  const ts = new Date().toISOString().slice(11, 23);
  const parts = [ts, label, ...Object.entries(extra).map(([k, v]) => `${k}=${v}`)];
  const line = parts.join(" ") + "\n";
  console.log(parts.join(" "));
  try { appendFileSync(dbgLogPath, line); } catch {}
}

function handleMessage(client, message) {
  if (message.type === "create") {
    const roomCode = normalizeRoomCode(message.roomCode);
    if (!roomCode) return send(client, { type: "error", message: "ルームコードが不正です。" });
    if (rooms.has(roomCode)) return send(client, { type: "error", message: "同じルームコードが既に存在します。" });
    const room = { roomCode, clients: new Set(), lastState: null, stateVersion: 0, actionQueue: [], processingQueue: false };
    rooms.set(roomCode, room);
    joinRoom(client, room, "host", message.playerName, message.deck);
    dbg("create", { room: roomCode, client: client.id.slice(0, 8) });
    sendRoomInfo(client, room, "ルームを作成しました。");
    broadcastPresence(room);
    return;
  }

  if (message.type === "join") {
    const roomCode = normalizeRoomCode(message.roomCode);
    const room = rooms.get(roomCode);
    if (!room) return send(client, { type: "error", message: "指定されたルームが見つかりません。" });
    if (room.clients.size >= 2 && !room.clients.has(client)) return send(client, { type: "error", message: "このルームは満員です。" });
    joinRoom(client, room, "guest", message.playerName, message.deck);
    dbg("join", { room: roomCode, client: client.id.slice(0, 8) });
    sendRoomInfo(client, room, "ルームへ参加しました。");
    broadcastPresence(room);
    if (room.lastState) send(client, { type: "start", roomCode, state: room.lastState, players: playersFor(room), version: room.stateVersion });
    return;
  }

  if (message.type === "syncRequest") {
    const room = rooms.get(normalizeRoomCode(message.roomCode));
    if (!room || !room.clients.has(client)) return send(client, { type: "error", message: "room not joined" });
    if (room.lastState) {
      send(client, {
        type: "state",
        roomCode: room.roomCode,
        reason: "syncRequest",
        state: room.lastState,
        version: room.stateVersion || 0,
        players: playersFor(room),
      });
    }
    return;
  }

  if (message.type === "start" || message.type === "state") {
    const room = rooms.get(normalizeRoomCode(message.roomCode));
    if (!room || !room.clients.has(client)) return send(client, { type: "error", message: "room not joined" });
    if (!message.state) return send(client, { type: "error", message: "missing state" });
    dbg("recv", { type: message.type, room: room.roomCode, role: client.role, reason: message.reason || "-", opId: message.opId || "-" });
    enqueueRoomState(room, client, message);
    return;
  }
}

function enqueueRoomState(room, client, message) {
  room.actionQueue.push({
    type: message.type,
    reason: message.reason || "sync",
    state: message.state,
    clientId: client.id,
    clientRole: client.role,
    opId: message.opId || null,
  });
  processRoomQueue(room);
}

function processRoomQueue(room) {
  if (room.processingQueue) return;
  room.processingQueue = true;
  queueMicrotask(() => {
    try {
      while (room.actionQueue.length) {
        const item = room.actionQueue.shift();
        room.lastState = item.state;
        room.stateVersion = (room.stateVersion || 0) + 1;
        dbg("bcast", { type: item.type, room: room.roomCode, ver: room.stateVersion, reason: item.reason, opId: item.opId || "-", from: item.clientRole });
        broadcast(
          room,
          {
            type: item.type,
            roomCode: room.roomCode,
            reason: item.reason,
            state: room.lastState,
            version: room.stateVersion,
            opId: item.opId,
            players: playersFor(room),
            from: item.clientId,
            fromRole: item.clientRole,
          },
          null,
        );
      }
    } finally {
      room.processingQueue = false;
    }
  });
}


function joinRoom(client, room, role, playerName, deck) {
  removeClient(client);
  client.roomCode = room.roomCode;
  client.role = role;
  client.name = playerName || (role === "host" ? "Host" : "Guest");
  if (deck) client.deck = deck;
  room.clients.add(client);
}

function removeClient(client) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;
  room.clients.delete(client);
  broadcastPresence(room);
  if (room.clients.size === 0) rooms.delete(room.roomCode);
  client.roomCode = null;
}

function normalizeRoomCode(roomCode) {
  return String(roomCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function playersFor(room) {
  return [...room.clients].map((client) => ({ id: client.id, role: client.role, name: client.name, deck: client.deck || null }));
}

function sendRoomInfo(client, room, message) {
  send(client, {
    type: "room",
    roomCode: room.roomCode,
    role: client.role,
    players: playersFor(room),
    message,
    state: room.lastState,
    version: room.stateVersion || 0,
  });
}

function broadcastPresence(room) {
  broadcast(room, { type: "presence", roomCode: room.roomCode, players: playersFor(room) });
}

function broadcast(room, payload, exceptClient = null) {
  for (const client of room.clients) {
    if (client !== exceptClient) send(client, payload);
  }
}

function send(client, payload) {
  if (client.socket.destroyed) return;
  const data = Buffer.from(JSON.stringify(payload), "utf8");
  if (data.length < 126) {
    const header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = data.length;
    client.socket.write(Buffer.concat([header, data]));
  } else if (data.length <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
    client.socket.write(Buffer.concat([header, data]));
  } else {
    const header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
    client.socket.write(Buffer.concat([header, data]));
  }
}

server.listen(port, "0.0.0.0", async () => {
  const pkg = await readFile(join(root, "package.json"), "utf8").catch(() => "{}");
  const name = JSON.parse(pkg).name || "threads-world-card-game";
  const { networkInterfaces } = await import("node:os");
  const nets = networkInterfaces();
  const localIps = Object.values(nets).flat().filter((n) => n.family === "IPv4" && !n.internal).map((n) => n.address);
  console.log(`${name} server: http://127.0.0.1:${port}`);
  if (localIps.length) console.log(`  LAN access: http://${localIps[0]}:${port}`);
});
