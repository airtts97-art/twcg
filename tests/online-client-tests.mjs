import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const playwrightPackage = path.join(
  os.homedir(),
  ".codex",
  "skills",
  "node_modules",
  "playwright",
  "package.json",
);
const require = createRequire(playwrightPackage);
const { chromium } = require("playwright");

const port = 5185;
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

async function waitForPage(page, predicate, label) {
  for (let i = 0; i < 40; i += 1) {
    const value = await page.evaluate(predicate);
    if (value) return value;
    await wait(100);
  }
  throw new Error(`missing page state: ${label}`);
}

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const host = await browser.newPage();
  const guest = await browser.newPage();
  await host.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
  await guest.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });

  await host.evaluate(async () => {
    window.__twcg.testing.signInWithGoogleDemo();
    window.__twcg.testing.saveDeck("Server Sync Deck");
    await window.__twcg.testing.persistDecksToServer();
  });
  const loadedDeckCount = await guest.evaluate(async () => {
    window.__twcg.testing.signInWithGoogleDemo();
    await window.__twcg.testing.syncDecksFromServer();
    return window.__twcg.app.savedDecks.filter((deck) => deck.name === "Server Sync Deck").length;
  });
  assert(loadedDeckCount === 1, "client should load server-saved decks");

  await host.evaluate(() => {
    window.__twcg.testing.signInWithGoogleDemo();
    window.__twcg.testing.createRoomMatch();
  });
  const roomCode = await waitForPage(host, () => window.__twcg.app.match.status === "online" && window.__twcg.app.match.roomCode, "host room");
  const copiedRoomCode = await host.evaluate(async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { window.__twcgCopiedRoomCode = text; } },
    });
    await window.__twcg.testing.copyRoomCode();
    return window.__twcgCopiedRoomCode;
  });
  assert(copiedRoomCode === roomCode, "room code copy should write the active room code");

  await guest.evaluate((code) => {
    window.__twcg.testing.signInAsGuest();
    window.__twcg.app.match.roomCode = code;
    window.__twcg.testing.joinRoomMatch();
  }, roomCode);
  await waitForPage(guest, () => window.__twcg.app.match.status === "online", "guest joined");

  await host.evaluate(() => window.__twcg.testing.startOnlineMatch());
  await waitForPage(host, () => window.__twcg.app.screen === "game", "host game screen");
  await waitForPage(guest, () => window.__twcg.app.screen === "game", "guest game screen");
  const hostPerspective = await host.evaluate(() => {
    window.__twcg.state.board = Array.from({ length: 4 }, () => Array(5).fill(null));
    window.__twcg.testing.placeUnit("lightInfantry", "p1", 3, 0);
    window.__twcg.testing.placeUnit("lightInfantry", "p2", 0, 0);
    return window.__twcg.testing.summary();
  });
  const guestPerspective = await guest.evaluate(() => {
    window.__twcg.state.board = Array.from({ length: 4 }, () => Array(5).fill(null));
    window.__twcg.testing.placeUnit("lightInfantry", "p1", 3, 0);
    window.__twcg.testing.placeUnit("lightInfantry", "p2", 0, 0);
    return window.__twcg.testing.summary();
  });
  assert(hostPerspective.viewerPlayer === "p1", "host should view p1 as their side");
  assert(hostPerspective.bottomHandPlayer === "p1", "host bottom hand should be p1");
  assert(hostPerspective.visualBoard[3][0].owner === "p1", "host should see p1 units on the near row");
  assert(hostPerspective.visualBoard[0][0].owner === "p2", "host should see p2 units on the far row");
  assert(guestPerspective.viewerPlayer === "p2", "guest should view p2 as their side");
  assert(guestPerspective.bottomHandPlayer === "p2", "guest bottom hand should be p2");
  assert(guestPerspective.visualBoard[3][0].owner === "p2", "guest should see p2 units on the near row");
  assert(guestPerspective.visualBoard[0][0].owner === "p1", "guest should see p1 units on the far row");
  const playerNames = await waitForPage(
    guest,
    () =>
      window.__twcg.state.players.p1.name === "Google Player" &&
      window.__twcg.state.players.p2.name === "Guest Player" && {
        p1: window.__twcg.state.players.p1.name,
        p2: window.__twcg.state.players.p2.name,
      },
    "synced player names",
  );
  assert(playerNames.p1 === "Google Player", "host name should appear as Player 1");
  assert(playerNames.p2 === "Guest Player", "guest name should appear as Player 2");
  await host.evaluate(() => {
    window.__twcg.testing.setResources("p1", { funds: 10, people: 10, nature: 10, ore: 10, fuel: 10, electric: 10, magic: 10 });
    const handIndex = window.__twcg.testing.addHandCard("p1", "precisionStrike");
    window.__twcg.testing.selectHandCard(handIndex);
    window.__twcg.testing.broadcastOnlineState();
  });
  const guestPreConfirmPopup = await waitForPage(
    guest,
    () => {
      const summary = window.__twcg.testing.summary();
      return summary.selected?.kind === "hand" &&
        summary.selected.playerId === "p1" && {
          handConfirmVisible: summary.handConfirmVisible,
          hasCardReveal: Boolean(summary.cardReveal),
        };
    },
    "guest opponent pre-confirm selection",
  );
  assert(guestPreConfirmPopup.handConfirmVisible === false, "opponent pre-confirm hand selection should not show a card popup");
  assert(guestPreConfirmPopup.hasCardReveal === false, "opponent pre-confirm hand selection should not reveal card content");
  await host.evaluate(() => {
    window.__twcg.testing.setResources("p1", { funds: 10, people: 10, nature: 10, ore: 10, fuel: 10, electric: 10, magic: 10 });
    const handIndex = window.__twcg.testing.addHandCard("p1", "hiddenSupply");
    window.__twcg.testing.playWildFromHand(handIndex);
    window.__twcg.testing.broadcastOnlineState();
  });
  const guestCardReveal = await waitForPage(
    guest,
    () =>
      window.__twcg.testing.summary().cardReveal?.playerId === "p1" &&
      window.__twcg.testing.summary().viewerPlayer === "p2" && {
        playerId: window.__twcg.testing.summary().cardReveal.playerId,
        cardName: window.__twcg.testing.summary().cardReveal.card.name,
      },
    "guest opponent card reveal",
  );
  assert(guestCardReveal.playerId === "p1", "guest should receive opponent card reveal");
  assert(guestCardReveal.cardName, "opponent card reveal should include card content");
  const guestEndTurnAttempt = await guest.evaluate(() => ({
    result: window.__twcg.testing.endTurn(),
    activePlayer: window.__twcg.state.activePlayer,
    message: window.__twcg.state.message,
  }));
  assert(guestEndTurnAttempt.result === false, "guest should not be able to end host turn");
  assert(guestEndTurnAttempt.activePlayer === "p1", "blocked guest end turn should not pass priority");
  await host.evaluate(() => window.__twcg.testing.endTurn());
  const guestAfterHostEndTurn = await waitForPage(
    guest,
    () => window.__twcg.state.activePlayer === "p2" && { activePlayer: window.__twcg.state.activePlayer, turn: window.__twcg.state.turn },
    "guest receives host end turn",
  );
  assert(guestAfterHostEndTurn.activePlayer === "p2", "host end turn should sync active player to guest");

  await host.evaluate(() => {
    window.__twcg.state.turn = 7;
    window.__twcg.testing.broadcastOnlineState("test", "p1");
  });
  const guestTurn = await waitForPage(guest, () => window.__twcg.state.turn === 7 && window.__twcg.state.turn, "guest turn sync");
  assert(guestTurn === 7, "guest should receive host state updates");

  const hostCurrentDeck = await browser.newPage();
  const guestCurrentDeck = await browser.newPage();
  await hostCurrentDeck.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
  await guestCurrentDeck.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
  await hostCurrentDeck.evaluate(() => {
    localStorage.clear();
    window.__twcg.app.savedDecks = [
      {
        id: "saved-guest-like-deck",
        name: "Saved Guest-like Deck",
        deck: { core: "arcaneReactorCore", main: ["knowledgeFairy"], struct: ["magicWell"] },
      },
    ];
    window.__twcg.app.match.selectedDeckId = null;
    window.__twcg.app.deck = { core: "frontierCore", main: ["lightInfantry"], struct: ["town"] };
    window.__twcg.app.deckName = "Host Current Deck";
    window.__twcg.testing.signInWithGoogleDemo();
    window.__twcg.app.match.selectedDeckId = null;
    window.__twcg.testing.createRoomMatch();
  });
  const currentDeckRoomCode = await waitForPage(
    hostCurrentDeck,
    () => window.__twcg.app.match.status === "online" && window.__twcg.app.match.roomCode,
    "current deck host room",
  );
  await guestCurrentDeck.evaluate((code) => {
    localStorage.clear();
    window.__twcg.app.savedDecks = [
      {
        id: "saved-host-like-deck",
        name: "Saved Host-like Deck",
        deck: { core: "frontierCore", main: ["lightInfantry"], struct: ["town"] },
      },
    ];
    window.__twcg.app.match.selectedDeckId = null;
    window.__twcg.app.deck = { core: "arcaneReactorCore", main: ["knowledgeFairy"], struct: ["magicWell"] };
    window.__twcg.app.deckName = "Guest Current Deck";
    window.__twcg.testing.signInAsGuest();
    window.__twcg.app.match.selectedDeckId = null;
    window.__twcg.app.match.roomCode = code;
    window.__twcg.testing.joinRoomMatch();
  }, currentDeckRoomCode);
  await waitForPage(
    hostCurrentDeck,
    () => {
      const guest = (window.__twcg.app.match.players || []).find((player) => player.role === "guest");
      return guest?.deck?.main?.[0] === "knowledgeFairy" && window.__twcg.app.match.guestDeck?.main?.[0] === "knowledgeFairy";
    },
    "current deck host presence with guest deck",
  );
  await waitForPage(guestCurrentDeck, () => (window.__twcg.app.match.players || []).length >= 2, "current deck guest presence");
  await hostCurrentDeck.evaluate(() => {
    window.__twcg.app.deck = { core: "arcaneReactorCore", main: ["knowledgeFairy"], struct: ["magicWell"] };
  });
  await hostCurrentDeck.evaluate(() => window.__twcg.testing.startMatchFromLobby());
  await waitForPage(hostCurrentDeck, () => window.__twcg.app.screen === "game", "current deck host game screen");
  await waitForPage(guestCurrentDeck, () => window.__twcg.app.screen === "game", "current deck guest game screen");
  const matchedDecks = await hostCurrentDeck.evaluate(() => ({
    p1Core: window.__twcg.state.players.p1.core.id,
    p2Core: window.__twcg.state.players.p2.core.id,
    p1Hand: window.__twcg.state.players.p1.hand.map((card) => card.id),
    p2Hand: window.__twcg.state.players.p2.hand.map((card) => card.id),
    p1StructDeck: window.__twcg.state.players.p1.structDeck.map((card) => card.id),
    p2StructDeck: window.__twcg.state.players.p2.structDeck.map((card) => card.id),
  }));
  assert(matchedDecks.p1Core === "frontierCore", "host should use the host-selected core for p1");
  assert(matchedDecks.p2Core === "arcaneReactorCore", "host should use the guest-selected core for p2");
  assert(matchedDecks.p1Hand.includes("lightInfantry"), "p1 opening hand should use host current deck");
  assert(matchedDecks.p2Hand.includes("knowledgeFairy"), "p2 opening hand should use guest current deck");
  assert(matchedDecks.p1StructDeck.includes("town"), "p1 struct deck should use host current deck");
  assert(matchedDecks.p2StructDeck.includes("magicWell"), "p2 struct deck should use guest current deck");

  await browser.close();
  console.log(JSON.stringify({ ok: true, cases: ["client-deck-sync", "client-create", "client-copy-room-code", "client-join", "client-start", "client-perspective", "client-player-names", "client-opponent-pre-confirm-hidden", "client-opponent-card-reveal", "client-turn-ownership", "client-state", "client-current-deck-lobby-start", "client-guest-deck-start"] }, null, 2));
} finally {
  server.kill();
}
