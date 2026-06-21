import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const port = 5184;
const tmpDir = await mkdtemp(path.join(os.tmpdir(), "twcg-decks-"));
const server = spawn(process.execPath, ["server.mjs", "--port", String(port)], {
  env: { ...process.env, GOOGLE_CLIENT_ID: "", DECK_STORE_PATH: path.join(tmpDir, "decks.json") },
  stdio: ["ignore", "pipe", "pipe"],
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // Retry while the child process starts.
    }
    await wait(100);
  }
  throw new Error("online server did not start");
}

function openClient() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages = [];
    socket.addEventListener("open", () => resolve({ socket, messages }));
    socket.addEventListener("message", (event) => messages.push(JSON.parse(event.data)));
    socket.addEventListener("error", () => reject(new Error("websocket error")));
  });
}

async function waitForMessage(client, predicate, label) {
  for (let i = 0; i < 30; i += 1) {
    const found = client.messages.find(predicate);
    if (found) return found;
    await wait(100);
  }
  throw new Error(`missing message: ${label}`);
}

try {
  await waitForServer();
  const config = await fetch(`http://127.0.0.1:${port}/config`).then((response) => response.json());
  assert(config.googleSignInEnabled === false, "test server should report Google sign-in disabled without env");
  const authResult = await fetch(`http://127.0.0.1:${port}/api/auth/google`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential: "fake" }),
  });
  assert(authResult.status === 401, "unconfigured Google auth should be rejected");

  const deckSave = await fetch(`http://127.0.0.1:${port}/api/decks?user=test-user`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      decks: [
        {
          id: "deck-a",
          name: "Server Deck",
          deck: { core: "frontierCore", main: ["lightInfantry"], struct: ["town"] },
          updatedAt: "2026-06-18T00:00:00.000Z",
        },
      ],
    }),
  }).then((response) => response.json());
  assert(deckSave.ok === true && deckSave.decks.length === 1, "server should save decks");
  const deckLoad = await fetch(`http://127.0.0.1:${port}/api/decks?user=test-user`).then((response) => response.json());
  assert(deckLoad.decks[0].name === "Server Deck", "server should load saved decks");

  const host = await openClient();
  const guest = await openClient();

  const hostDeck = { core: "frontierCore", main: ["lightInfantry"], struct: ["town"] };
  const guestDeck = { core: "arcaneReactorCore", main: ["knowledgeFairy"], struct: ["magicWell"] };
  host.socket.send(JSON.stringify({ type: "create", roomCode: "AB12CD", playerName: "Host", deck: hostDeck }));
  const hostRoom = await waitForMessage(host, (message) => message.type === "room", "host room");
  assert(hostRoom.role === "host", "host should receive host role");

  guest.socket.send(JSON.stringify({ type: "join", roomCode: "AB12CD", playerName: "Guest", deck: guestDeck }));
  const guestRoom = await waitForMessage(guest, (message) => message.type === "room", "guest room");
  assert(guestRoom.role === "guest", "guest should receive guest role");

  const hostPresence = await waitForMessage(
    host,
    (message) => message.type === "presence" && message.players.length === 2,
    "host presence",
  );
  assert(hostPresence.players.some((player) => player.name === "Guest"), "presence should include guest");
  assert(hostPresence.players.some((player) => player.role === "guest" && player.deck?.main?.[0] === "knowledgeFairy"), "presence should include guest deck");

  const startedState = { turn: 1, activePlayer: "p1", board: [[null]], players: { p1: {}, p2: {} } };
  host.socket.send(JSON.stringify({ type: "start", roomCode: "AB12CD", state: startedState }));
  const hostStart = await waitForMessage(host, (message) => message.type === "start", "host start echo");
  const guestStart = await waitForMessage(guest, (message) => message.type === "start", "guest start");
  assert(hostStart.state.turn === 1, "host should receive started state echo");
  assert(guestStart.state.turn === 1, "guest should receive started state");
  assert(guestStart.players.some((player) => player.role === "host" && player.name === "Host"), "start should include host name");
  assert(guestStart.players.some((player) => player.role === "guest" && player.name === "Guest"), "start should include guest name");
  assert(guestStart.players.some((player) => player.role === "guest" && player.deck?.struct?.[0] === "magicWell"), "start should include guest deck");

  const largeText = "deck-state-".repeat(9000);
  const largeStartedState = {
    turn: 3,
    activePlayer: "p1",
    board: [[null]],
    players: { p1: {}, p2: {} },
    largeDeckState: largeText,
  };
  host.socket.send(JSON.stringify({ type: "start", roomCode: "AB12CD", state: largeStartedState }));
  const largeGuestStart = await waitForMessage(
    guest,
    (message) => message.type === "start" && message.state?.turn === 3,
    "large guest start",
  );
  assert(largeGuestStart.state.largeDeckState.length === largeText.length, "large started state should sync to guest");

  const changedState = { ...startedState, turn: 2, message: "synced" };
  guest.socket.send(JSON.stringify({ type: "state", roomCode: "AB12CD", state: changedState }));
  const hostState = await waitForMessage(host, (message) => message.type === "state", "host state");
  assert(hostState.state.turn === 2, "host should receive guest state updates");

  host.socket.close();
  guest.socket.close();
  console.log(
    JSON.stringify(
      {
        ok: true,
        cases: ["config", "auth-disabled", "deck-save-load", "create", "join", "presence-deck", "start", "start-echo", "start-deck", "large-start", "state"],
      },
      null,
      2,
    ),
  );
} finally {
  server.kill();
}
