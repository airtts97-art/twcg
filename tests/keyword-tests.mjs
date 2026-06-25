import { createRequire } from "node:module";
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

const url = process.argv[2] || "http://127.0.0.1:5173";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (err) => console.error("[page error]", err.message));
page.on("console", (msg) => { if (msg.type() === "error") console.error("[console]", msg.text()); });
await page.goto(url, { waitUntil: "networkidle" });

const results = await page.evaluate(() => {
  const api = window.__twcg;
  const highResources = {
    funds: 10,
    people: 10,
    nature: 10,
    ore: 10,
    fuel: 10,
    electric: 10,
    magic: 10,
  };

  function reset() {
    api.testing.reset({
      emptyHands: true,
      resources: { p1: highResources, p2: highResources },
    });
    api.state.activePlayer = "p1";
    api.state.board = Array.from({ length: 4 }, () => Array(5).fill(null));
  }

  function snapshot(name) {
    return { name, summary: api.testing.summary() };
  }

  const out = [];

  reset();
  api.testing.placeUnit("militia", "p1", 2, 0, { rested: false });
  api.testing.placeUnit("armoredCar", "p2", 1, 0, { rested: true });
  api.testing.selectUnit(2, 0);
  api.testing.attack({ kind: "unit", row: 1, col: 0 });
  out.push(snapshot("armor_reduces_damage"));

  reset();
  api.testing.placeUnit("shockTrooper", "p1", 2, 0, { rested: false });
  api.testing.placeUnit("armoredCar", "p2", 1, 0, { rested: false });
  api.testing.selectUnit(2, 0);
  api.testing.attack({ kind: "unit", row: 1, col: 0 });
  out.push(snapshot("pierce_and_shock"));

  reset();
  api.testing.placeUnit("militia", "p1", 2, 0, { rested: false });
  api.testing.placeUnit("reconPlane", "p2", 1, 0, { rested: true });
  api.testing.selectUnit(2, 0);
  api.testing.attack({ kind: "unit", row: 1, col: 0 });
  out.push(snapshot("flying_blocks_low_ground_attack"));

  reset();
  api.testing.placeUnit("armoredCar", "p1", 3, 0, { rested: false });
  api.testing.selectUnit(3, 0);
  api.testing.move();
  out.push(snapshot("mobile_move_does_not_rest_once"));

  reset();
  api.testing.placeUnit("militia", "p1", 2, 1, { rested: false });
  api.testing.placeUnit("guardian", "p2", 1, 0, { rested: true });
  api.testing.placeUnit("militia", "p2", 1, 1, { rested: true });
  api.testing.selectUnit(2, 1);
  api.testing.attack({ kind: "unit", row: 1, col: 1 });
  out.push(snapshot("guard_protects_adjacent_unit"));

  reset();
  api.testing.placeUnit("mageBattery", "p1", 3, 1, { rested: false });
  api.testing.placeUnit("militia", "p2", 1, 0, { rested: true });
  api.testing.placeUnit("militia", "p2", 1, 1, { rested: true });
  api.testing.placeUnit("militia", "p2", 1, 2, { rested: true });
  api.testing.selectUnit(3, 1);
  api.testing.attack({ kind: "unit", row: 1, col: 1 });
  out.push(snapshot("arc_and_cleave"));

  reset();
  api.testing.placeUnit("militia", "p1", 2, 1, { rested: false });
  api.testing.placeUnit("bombDrone", "p2", 1, 1, { rested: true });
  api.testing.placeUnit("militia", "p2", 1, 0, { rested: true });
  api.testing.placeUnit("militia", "p2", 1, 2, { rested: true });
  api.testing.selectUnit(2, 1);
  api.testing.attack({ kind: "unit", row: 1, col: 1 });
  out.push(snapshot("self_destruct_splash"));

  reset();
  api.testing.placeUnit("militia", "p1", 2, 1, { rested: false });
  api.testing.placeUnit("disruptionEngineer", "p2", 1, 0, { rested: true });
  api.testing.placeUnit("militia", "p2", 1, 1, { rested: true });
  api.testing.placeUnit("bombDrone", "p2", 1, 2, { rested: true });
  api.testing.placeUnit("militia", "p2", 1, 3, { rested: true });
  api.testing.selectUnit(2, 1);
  api.testing.attack({ kind: "unit", row: 1, col: 2 });
  out.push(snapshot("self_destruct_blocked_by_effect_protect"));

  reset();
  api.testing.addHandCard("p1", "raidBike");
  api.testing.summonFromHand(0, 2, 3);
  out.push(snapshot("raid_summons_to_second_row"));

  reset();
  api.testing.addHandCard("p1", "lightInfantry");
  api.testing.selectHandCard(0);
  out.push(snapshot("hand_click_buffers_card_use"));
  api.testing.useSelectedHandCard();
  out.push(snapshot("hand_use_confirms_unit_placement"));
  api.testing.placeUnit("lightInfantry", "p1", 3, 0);
  api.testing.openUnitDetail(3, 0);
  out.push(snapshot("field_unit_click_shows_detail"));

  reset();
  api.testing.selectStructDeckCard(0);
  out.push(snapshot("struct_click_buffers_card_use"));
  api.testing.useSelectedPlayableCard();
  out.push(snapshot("struct_use_confirms_build"));
  api.testing.openFieldStructDetail("p1", 0);
  out.push(snapshot("field_struct_click_shows_detail"));
  api.state.players.p1.structDeck.push(...api.state.players.p1.structDeck.map((card) => ({ ...card, id: `${card.id}-extra` })));
  api.testing.changeStructDeckScroll(1);
  out.push(snapshot("struct_deck_scrolls"));

  api.testing.importDeckmakerDeckData({
    name: "Deckmaker Sample",
    coreCardId: "frontierCore",
    mainDeckCardIds: ["lightInfantry", "hiddenSupply", "precisionStrike"],
    structDeckCardIds: ["town", "grove"],
  });
  out.push(snapshot("deckmaker_deck_imports"));
  api.testing.importDeckmakerAllData({
    cards: [
      {
        id: "dm_core_test",
        name: "Deckmaker Core Test",
        type: "コア",
        world: "ニュートラル",
        tags: ["拠点"],
        description: "Deckmaker core import test",
        initialHand: 5,
        handLimit: 4,
        initialResources: { gold: 7 },
        costs: { play: {}, act: {}, choice: [], choiceAct: [] },
        generates: {},
      },
      {
        id: "dm_unit_test",
        name: "Deckmaker Unit Test",
        type: "ユニット",
        world: "ニュートラル",
        tags: ["歩兵"],
        description: "[装甲③] カードを1枚引く",
        flavorText: "import test",
        costs: { play: { human: 1, nature: 1, gold: 1 }, act: { mineral: 1 }, choice: [], choiceAct: [] },
        generates: {},
        attack: 2,
        defense: 3,
      },
      {
        id: "dm_struct_test",
        name: "Deckmaker Struct Test",
        type: "ストラクト",
        world: "ニュートラル",
        tags: ["建物"],
        description: "自然を生む",
        costs: { play: { gold: 1 }, act: {}, choice: [], choiceAct: [] },
        generates: { nature: 2 },
      },
    ],
    decks: [
      {
        id: "dm_deck_test",
        name: "Deckmaker All Data Sample",
        coreCardId: "dm_core_test",
        mainDeckCardIds: ["dm_unit_test"],
        structDeckCardIds: ["dm_struct_test"],
      },
    ],
    worlds: [{ id: "neutral", name: "ニュートラル" }],
  });
  out.push({
    name: "deckmaker_all_data_imports_cards",
    summary: {
      deckName: api.app.deckName,
      deck: { core: api.app.deck.core, main: [...api.app.deck.main], struct: [...api.app.deck.struct] },
      core: api.testing.catalogCard("dm_core_test"),
      unit: api.testing.catalogCard("dm_unit_test"),
      struct: api.testing.catalogCard("dm_struct_test"),
    },
  });
  out.push({
    name: "deckmaker_bundled_core_initial_resources",
    summary: {
      meatCastle: api.testing.catalogCard("card_1753611174564"),
    },
  });
  window.__deckmakerExportPayload = api.testing.deckmakerAllDataPayload();
  out.push({ name: "deckmaker_all_data_exports", summary: { exportPayload: window.__deckmakerExportPayload } });

  reset();
  api.testing.placeUnit("guardian", "p1", 3, 0, { rested: true });
  api.testing.endTurn();
  out.push(snapshot("alert_unrests_at_end_turn"));
  out.push(snapshot("turn_start_resource_summary"));

  reset();
  api.testing.placeUnit("chargedLancer", "p1", 2, 0, { rested: false });
  api.testing.placeUnit("armoredCar", "p2", 1, 0, { rested: true });
  api.testing.selectUnit(2, 0);
  api.testing.attack({ kind: "unit", row: 1, col: 0 });
  out.push(snapshot("charge_ignores_armor_and_pays_electric"));

  reset();
  api.testing.setResources("p1", { funds: 10, electric: 0 });
  api.testing.placeUnit("chargedLancer", "p1", 2, 0, { rested: false });
  api.testing.placeUnit("armoredCar", "p2", 1, 0, { rested: true });
  api.testing.selectUnit(2, 0);
  api.testing.attack({ kind: "unit", row: 1, col: 0 });
  out.push(snapshot("charge_payment_failure_is_atomic"));

  reset();
  api.testing.placeUnit("rapidGunner", "p1", 2, 0, { rested: false });
  api.testing.placeUnit("militia", "p2", 1, 0, { rested: true });
  api.testing.placeUnit("militia", "p2", 1, 1, { rested: true });
  api.testing.selectUnit(2, 0);
  api.testing.attack({ kind: "unit", row: 1, col: 0 });
  api.testing.attack({ kind: "unit", row: 1, col: 1 });
  out.push(snapshot("multi_strike_rests_after_second_attack"));

  reset();
  api.testing.placeUnit("bunker", "p1", 3, 0, { rested: false });
  api.testing.selectUnit(3, 0);
  api.testing.move();
  out.push(snapshot("immobile_cannot_move"));

  reset();
  api.testing.placeUnit("bombDrone", "p1", 2, 0, { rested: false });
  api.testing.placeUnit("militia", "p2", 1, 0, { rested: true });
  api.testing.selectUnit(2, 0);
  api.testing.attack({ kind: "unit", row: 1, col: 0 });
  out.push(snapshot("no_attack_cannot_attack"));

  reset();
  api.testing.setResources("p1", { funds: 1, magic: 0 });
  api.testing.addDumpCard("p1", "militia");
  api.testing.addDumpCard("p1", "fieldOrder");
  api.testing.addHandCard("p1", "soulMage");
  api.testing.summonFromHand(0, 3, 0);
  out.push(snapshot("soul_pay_uses_dump_for_missing_magic"));

  let duplicateLegendaryRejected = false;
  try {
    api.testing.validateDeck(["legendaryAce", "legendaryAce"]);
  } catch {
    duplicateLegendaryRejected = true;
  }
  out.push({ name: "legendary_rejects_duplicate", summary: { duplicateLegendaryRejected } });

  reset();
  api.testing.addHandCard("p1", "fieldOrder");
  api.state.players.p1.mainDeck = [api.cardCatalog.main.militia];
  api.testing.playTactFromHand(0);
  out.push(snapshot("immediate_tact_resolves_and_dumps"));

  reset();
  api.testing.addHandCard("p1", "precisionStrike");
  api.testing.placeUnit("militia", "p2", 1, 0, { rested: false });
  api.testing.playTactFromHand(0);
  out.push(snapshot("targeted_tact_waits_for_enemy_unit"));
  api.testing.resolveTarget(1, 0);
  out.push(snapshot("targeted_tact_resolves_and_dumps"));

  reset();
  api.testing.addHandCard("p1", "precisionStrike");
  api.testing.placeUnit("militia", "p1", 3, 0, { rested: false });
  api.testing.playTactFromHand(0);
  api.testing.resolveTarget(3, 0);
  out.push(snapshot("targeted_tact_rejects_invalid_friendly_target"));

  reset();
  api.testing.addHandCard("p1", "hiddenSupply");
  const hiddenNatureBefore = api.state.players.p1.resources.nature;
  const hiddenFuelBefore = api.state.players.p1.resources.fuel;
  const hiddenDeckBefore = api.state.players.p1.mainDeck.length;
  api.testing.playWildFromHand(0);
  const hiddenSnapshot = snapshot("wild_sets_face_down");
  hiddenSnapshot.summary.natureBefore = hiddenNatureBefore;
  hiddenSnapshot.summary.fuelBefore = hiddenFuelBefore;
  hiddenSnapshot.summary.deckBefore = hiddenDeckBefore;
  out.push(hiddenSnapshot);

  reset();
  api.testing.placeUnit("lightInfantry", "p1", 3, 0);
  api.testing.addHandCard("p1", "grandMandate");
  const grandDeckBefore = api.state.players.p1.mainDeck.length;
  api.testing.playGrandFromHand(0);
  const grandSnapshot = snapshot("grand_places_face_up");
  grandSnapshot.summary.deckBefore = grandDeckBefore;
  out.push(grandSnapshot);

  const initialCards = [
    "lightInfantry",
    "smallFieldGunFuel",
    "commonArmoredCar",
    "antiArmorMageTeam328",
    "peoplesReconForce",
    "lifeFairy",
    "knowledgeFairy",
    "mysticCapture",
  ].map((id) => {
    const card = api.cardCatalog.main[id];
    return {
      id,
      name: card.name,
      faction: card.faction,
      tags: card.tags,
      cost: card.cost,
      actCost: card.actCost,
      atk: card.atk,
      hp: card.hp,
      keywords: card.keywords,
      variant: card.variant || null,
    };
  });
  out.push({ name: "initial_cards_match_spec", summary: { initialCards } });

  reset();
  api.testing.placeUnit("lightInfantry", "p1", 3, 0);
  api.testing.addHandCard("p1", "lifeFairy");
  api.testing.summonFromHand(0, 3, 1);
  out.push(snapshot("life_fairy_buffs_friendly_units"));

  reset();
  const deckBeforeKnowledge = api.state.players.p1.mainDeck.length;
  api.testing.addHandCard("p1", "knowledgeFairy");
  api.testing.summonFromHand(0, 3, 0);
  out.push({
    name: "knowledge_fairy_draws_two",
    summary: {
      handCount: api.state.players.p1.hand.length,
      deckBefore: deckBeforeKnowledge,
      deckAfter: api.state.players.p1.mainDeck.length,
    },
  });

  reset();
  api.testing.placeUnit("peoplesReconForce", "p1", 2, 0);
  api.testing.placeUnit("bombDrone", "p2", 1, 0, { rested: true });
  api.testing.selectUnit(2, 0);
  const reconHandBefore = api.state.players.p1.hand.length;
  const reconFundsBefore = api.state.players.p1.resources.funds;
  api.testing.attack({ kind: "unit", row: 1, col: 0 });
  out.push({
    name: "peoples_recon_destroy_reward",
    summary: {
      handBefore: reconHandBefore,
      handAfter: api.state.players.p1.hand.length,
      fundsBefore: reconFundsBefore,
      fundsAfter: api.state.players.p1.resources.funds,
      targetCleared: api.state.board[1][0] === null,
    },
  });

  reset();
  api.testing.placeUnit("lightInfantry", "p1", 3, 0);
  api.testing.addHandCard("p1", "lifeFairy");
  api.testing.addHandCard("p1", "knowledgeFairy");
  api.testing.addHandCard("p1", "mysticCapture");
  api.testing.playTactFromHand(2);
  out.push(snapshot("mystic_capture_waits_for_choice"));
  api.testing.toggleMysticCaptureChoice(0);
  api.testing.toggleMysticCaptureChoice(1);
  api.testing.resolveMysticCaptureChoice({ exile: true });
  out.push(snapshot("mystic_capture_triggers_exiled_mystics_twice"));

  reset();
  api.testing.addHandCard("p1", "lifeFairy");
  api.testing.addHandCard("p1", "knowledgeFairy");
  api.testing.addHandCard("p1", "mysticCapture");
  api.testing.playTactFromHand(2);
  api.testing.toggleMysticCaptureChoice(1);
  api.testing.resolveMysticCaptureChoice({ exile: false });
  out.push(snapshot("mystic_capture_discards_selected_mystic_once"));

  // cost payment: exile 2 mystics (lifeFairy magic1 + knowledgeFairy magic1 = total cost 2)
  // electric=0 at resolve time → shortfall=2 → core takes 2 damage
  reset();
  api.testing.addHandCard("p1", "lifeFairy");
  api.testing.addHandCard("p1", "knowledgeFairy");
  api.testing.addHandCard("p1", "mysticCapture");
  api.testing.playTactFromHand(2); // costs electric 1; pendingChoice set
  api.state.players.p1.resources.electric = 0; // drain remaining electric before resolve
  const coreHpBefore = api.state.players.p1.core.hp;
  api.testing.toggleMysticCaptureChoice(0);
  api.testing.toggleMysticCaptureChoice(1);
  api.testing.resolveMysticCaptureChoice({ exile: true });
  out.push({ ...snapshot("mystic_capture_cost_core_damage"), coreHpBefore, coreHpAfter: api.state.players.p1.core.hp });

  // electric=5 at resolve time → pays from resource, no core damage
  reset();
  api.testing.addHandCard("p1", "lifeFairy");
  api.testing.addHandCard("p1", "knowledgeFairy");
  api.testing.addHandCard("p1", "mysticCapture");
  api.testing.playTactFromHand(2);
  api.state.players.p1.resources.electric = 5;
  const coreHpBefore2 = api.state.players.p1.core.hp;
  api.testing.toggleMysticCaptureChoice(0);
  api.testing.toggleMysticCaptureChoice(1);
  api.testing.resolveMysticCaptureChoice({ exile: true });
  out.push({ ...snapshot("mystic_capture_cost_electric_paid"), coreHpBefore: coreHpBefore2, coreHpAfter: api.state.players.p1.core.hp, electricAfter: api.state.players.p1.resources.electric });

  let twoFactionDeckValid = false;
  let threeFactionRejected = false;
  try {
    twoFactionDeckValid = api.testing.validateDeck(["antiArmorMageTeam328", "peoplesReconForce"]);
  } catch {
    twoFactionDeckValid = false;
  }
  try {
    api.testing.validateDeck(["antiArmorMageTeam328", "peoplesReconForce", "mysticCapture"]);
  } catch {
    threeFactionRejected = true;
  }
  out.push({ name: "non_neutral_faction_limit", summary: { twoFactionDeckValid, threeFactionRejected } });

  api.testing.resetDeckBuilder();
  api.testing.reset({ resources: { p1: highResources, p2: highResources } });
  api.state.activePlayer = "p1";
  out.push({
    name: "default_deck_excludes_demo_fixtures",
    summary: {
      activeCards: [...api.state.players.p1.hand, ...api.state.players.p1.mainDeck].map((card) => ({
        id: card.id,
        name: card.name,
        fixture: Boolean(card.fixture),
      })),
    },
  });

  reset();
  out.push({
    name: "struct_cards_use_japanese_names",
    summary: {
      structNames: api.state.players.p1.structDeck.map((card) => card.name),
    },
  });

  api.testing.resetDeckBuilder();
  api.testing.selectCoreCard("arcaneReactorCore");
  api.testing.startLocalMatch();
  const coreSummary = api.testing.summary();
  out.push({
    name: "core_selection_applies_to_match",
    summary: {
      deckCore: api.app.deck.core,
      playerCore: coreSummary.players.p1.core,
      resources: coreSummary.players.p1.resources,
      handCount: coreSummary.players.p1.hand.length,
    },
  });

  out.push({
    name: "core_cards_follow_template",
    summary: {
      cores: Object.values(api.cardCatalog.cores).map((core) => ({
        id: core.id,
        name: core.name,
        faction: core.faction,
        flavor: core.flavor,
        initialHand: core.initialHand,
        draw: core.draw,
        handLimit: core.handLimit,
        deckSize: core.deckSize,
        deckMin: core.deckMin,
        deckMax: core.deckMax,
        startResources: core.startResources,
        specialRequirements: core.specialRequirements,
      })),
    },
  });

  api.testing.signOut();
  api.testing.signInWithGoogle();
  out.push({
    name: "google_requires_config_without_demo_fallback",
    summary: {
      screen: api.app.screen,
      auth: api.app.auth,
    },
  });

  api.testing.resetDeckBuilder();
  const managedBefore = api.app.deck.main.length;
  api.testing.addDeckCard("lightInfantry");
  api.testing.addDeckCard("lightInfantry");
  api.testing.addDeckCard("lightInfantry");
  api.testing.addDeckCard("lightInfantry");
  const managedAfterCap = api.app.deck.main.length;
  api.testing.removeDeckCardById("lightInfantry");
  const managedAfterRemove = api.app.deck.main.length;
  const structBefore = api.app.deck.struct.length;
  api.testing.addStructDeckCard("town");
  const structAfterAdd = api.app.deck.struct.length;
  api.testing.removeStructDeckCardById("town");
  const structAfterRemove = api.app.deck.struct.length;
  api.testing.setDeckBuilderLibrary("unit");
  const unitFilter = api.app.deckBuilder.libraryType;
  api.testing.changeLibraryPage(1);
  const pageAfterNext = api.app.deckBuilder.libraryScroll;
  api.testing.setDeckBuilderLibrary("struct");
  const structFilter = api.app.deckBuilder.libraryType;
  api.testing.setDeckBuilderSearchPreset("attack");
  const searchPreset = api.app.deckBuilder.searchPreset;
  api.testing.setDeckBuilderTagFilter("純人間");
  const tagFilter = api.app.deckBuilder.tagFilter;
  api.testing.cycleDeckBuilderSort();
  const sortBy = api.app.deckBuilder.sortBy;
  api.testing.testDrawDeck();
  const saveName = `テストデッキ-${Date.now()}`;
  const savedOk = api.testing.saveDeck(saveName);
  const savedId = api.app.savedDecks.find((entry) => entry.name === saveName)?.id;
  api.testing.addDeckCard("lifeFairy");
  const modifiedCount = api.app.deck.main.length;
  const loadOk = api.testing.loadNamedDeck(savedId);
  api.testing.selectCardForDetail("mysticCapture");
  const selectedCard = api.testing.summary().app.selectedCard;
  out.push({
    name: "deck_builder_manages_card_counts",
    summary: {
      managedBefore,
      managedAfterCap,
      managedAfterRemove,
      structBefore,
      structAfterAdd,
      structAfterRemove,
      unitFilter,
      pageAfterNext,
      structFilter,
      searchPreset,
      tagFilter,
      sortBy,
      testDraw: api.app.deckBuilder.testDraw,
      savedOk,
      savedId: Boolean(savedId),
      modifiedCount,
      loadedCount: api.app.deck.main.length,
      loadOk,
      deckName: api.app.deckName,
      selectedCard,
    },
  });

  api.testing.signInWithGoogleDemo();
  api.testing.openDeckBuilder();
  api.testing.resetDeckBuilder();
  api.testing.saveDeck("対戦用テストデッキ");
  const lobbyDeckId = api.app.savedDecks.find((entry) => entry.name === "対戦用テストデッキ")?.id;
  const beforeAdd = api.app.deck.main.length;
  api.testing.addDeckCard("lightInfantry");
  const afterAdd = api.app.deck.main.length;
  api.testing.removeDeckCard(afterAdd - 1);
  const afterRemove = api.app.deck.main.length;
  api.testing.openMatchLobby();
  const selectedLobbyDeck = api.testing.selectMatchDeck(lobbyDeckId);
  api.testing.createRoomMatch();
  const roomCode = api.app.match.roomCode;
  api.app.match.status = "online";
  api.app.match.players = [{ name: "host" }];
  api.testing.startMatchFromLobby();
  const blockedMessage = api.app.match.message;
  const blockedScreen = api.app.screen;
  api.testing.startLocalMatch();
  out.push({
    name: "app_login_deckbuilder_match_flow",
    summary: {
      auth: api.app.auth,
      beforeAdd,
      afterAdd,
      afterRemove,
      selectedLobbyDeck,
      roomCode,
      blockedMessage,
      blockedScreen,
      screen: api.app.screen,
      match: api.app.match,
      hand: api.testing.summary().players.p1.hand.map((card) => card.name),
    },
  });

  // --- deck_data.json imported card effects ---
  // Register minimal Deckmaker cards to test new ability parsers
  api.testing.importDeckmakerAllData({
    cards: [
      {
        id: "test-zombie",
        name: "テストゾンビ",
        type: "ユニット",
        world: "ニュートラル",
        description: "出撃時：デッキの上から2枚を墓地へ送る。",
        attack: 1,
        defense: 1,
        costs: { play: { human: 0 }, act: {} },
        generates: {},
      },
      {
        id: "test-mori",
        name: "テスト森の恵み",
        type: "タクト",
        world: "ニュートラル",
        description: "デッキから2枚ドローする。",
        costs: { play: { nature: 0 }, act: {} },
        generates: {},
      },
    ],
  });

  // Verify mill ability parsed from card text
  const zombieCard = api.cardCatalog.main["test-zombie"];
  const zombieMillAbility = (zombieCard?.abilities || []).find((a) => a.effect === "millCards");
  out.push({ name: "deckmaker_mill_ability_parsed", summary: { found: !!zombieMillAbility, amount: zombieMillAbility?.amount } });

  // Verify draw ability parsed from "デッキから2枚ドロー" pattern
  const moriCard = api.cardCatalog.main["test-mori"];
  const moriDrawAbility = (moriCard?.abilities || []).find((a) => a.effect === "drawCards");
  out.push({ name: "deckmaker_draw_pattern_parsed", summary: { found: !!moriDrawAbility, amount: moriDrawAbility?.amount } });

  // Verify mill effect fires on summon
  reset();
  api.state.players.p1.mainDeck = Array.from({ length: 5 }, (_, i) => ({ id: `dk${i}`, name: `DeckCard${i}`, type: "unit" }));
  const millHandIdx = api.testing.addHandCard("p1", "test-zombie");
  const millDumpBefore = api.testing.summary().players.p1.dumpCount;
  api.testing.summonFromHand(millHandIdx, 3, 2);
  out.push({ name: "deckmaker_mill_on_summon", summary: { millDumpBefore, millDumpAfter: api.testing.summary().players.p1.dumpCount } });

  // Verify struct onDestroyEnemyUnit gain
  reset();
  api.state.players.p1.structs = [{ id: "dummy-struct", name: "テスト施設", type: "struct", abilities: [{ trigger: "onDestroyEnemyUnit", effect: "gainResource", resource: "people", amount: 1 }] }];
  api.testing.placeUnit("militia", "p1", 2, 0, { rested: false });
  api.testing.placeUnit("militia", "p2", 1, 0, { rested: true, hp: 1 });
  const peopleBefore = api.testing.summary().players.p1.resources.people;
  api.testing.selectUnit(2, 0);
  api.testing.attack({ kind: "unit", row: 1, col: 0 });
  out.push({ name: "deckmaker_struct_destroy_gain", summary: { peopleBefore, peopleAfter: api.testing.summary().players.p1.resources.people } });

  return out;
});

await browser.close();

const byName = Object.fromEntries(results.map((result) => [result.name, result.summary]));
const byResult = Object.fromEntries(results.map((result) => [result.name, result]));

assert(byName.armor_reduces_damage.board[1][0].hp === 4, "armor should reduce militia damage by 1");
assert(byName.armor_reduces_damage.board[2][0].rested === true, "attacker should rest after ordinary attack");

assert(byName.pierce_and_shock.board[1][0].hp === 2, "pierce should ignore armor value 1");
assert(byName.pierce_and_shock.board[1][0].rested === true, "shock should rest damaged target");
assert(byName.pierce_and_shock.board[2][0].hp === 4, "shock-rested target should not counterattack");

assert(byName.flying_blocks_low_ground_attack.board[1][0].hp === 3, "low ATK non-flying unit should not damage flying unit");
assert(byName.flying_blocks_low_ground_attack.board[2][0].rested === false, "failed flying attack should not rest attacker");

assert(byName.mobile_move_does_not_rest_once.board[2][0]?.name === "装甲車", "mobile unit should advance");
assert(byName.mobile_move_does_not_rest_once.board[2][0].rested === false, "first mobile move should not rest");

assert(byName.guard_protects_adjacent_unit.board[1][1].hp === 4, "guard should prevent adjacent unit from being attacked");
assert(byName.guard_protects_adjacent_unit.board[2][1].rested === false, "guarded failed attack should not rest attacker");

assert(byName.arc_and_cleave.board[1][1] === null, "arc attacker should destroy distant target");
assert(byName.arc_and_cleave.board[1][0].hp === 3, "cleave should damage left adjacent enemy");
assert(byName.arc_and_cleave.board[1][2].hp === 3, "cleave should damage right adjacent enemy");

assert(byName.self_destruct_splash.board[1][1] === null, "destroyed bomb drone should leave board");
assert(byName.self_destruct_splash.board[1][0].hp === 2, "self-destruct should damage left adjacent unit");
assert(byName.self_destruct_splash.board[1][2].hp === 2, "self-destruct should damage right adjacent unit");

assert(byName.self_destruct_blocked_by_effect_protect.board[1][2] === null, "bomb drone should be destroyed");
assert(byName.self_destruct_blocked_by_effect_protect.board[1][1].hp === 4, "effect-protected adjacent unit should ignore self-destruct");
assert(byName.self_destruct_blocked_by_effect_protect.board[1][3].hp === 2, "unprotected adjacent unit should still take self-destruct damage");

assert(byName.raid_summons_to_second_row.board[2][3]?.name === "奇襲バイク", "raid should allow second-row summon");
assert(byName.raid_summons_to_second_row.cardReveal?.card?.name === "奇襲バイク", "summoned cards should create a card reveal payload");

assert(byName.hand_click_buffers_card_use.players.p1.hand.length === 1, "clicking a hand card should not play it immediately");
assert(byName.hand_click_buffers_card_use.selected.kind === "hand", "clicking a hand card should select it for confirmation");
assert(byName.hand_click_buffers_card_use.selected.confirmed === false, "clicked hand card should wait for use confirmation");
assert(byName.hand_use_confirms_unit_placement.players.p1.hand.length === 1, "confirming a unit should not leave hand before choosing a cell");
assert(byName.hand_use_confirms_unit_placement.selected.kind === "hand", "confirmed unit should remain selected for placement");
assert(byName.hand_use_confirms_unit_placement.selected.confirmed === true, "use button should mark unit as ready for placement");
assert(byName.field_unit_click_shows_detail.selected.kind === "unit", "clicking a field unit should select the field unit");
assert(byName.field_unit_click_shows_detail.selected.detailOpen === true, "clicking a field unit should open card details");
assert(byName.struct_click_buffers_card_use.players.p1.structs.length === 0, "clicking a struct deck card should not build it immediately");
assert(byName.struct_click_buffers_card_use.players.p1.structDeckCount === 6, "clicking a struct deck card should keep it in the struct deck");
assert(byName.struct_click_buffers_card_use.selected.kind === "structDeck", "clicking a struct deck card should select it for confirmation");
assert(byName.struct_click_buffers_card_use.selected.confirmed === false, "clicked struct deck card should wait for use confirmation");
assert(byName.struct_use_confirms_build.players.p1.structs.length === 1, "confirming a struct card should build it");
assert(byName.struct_use_confirms_build.players.p1.structDeckCount === 5, "built struct card should leave struct deck");
assert(byName.struct_use_confirms_build.cardReveal?.playerId === "p1", "built struct cards should create a card reveal payload");
assert(byName.field_struct_click_shows_detail.selected.kind === "fieldStruct", "clicking a field struct should select the field struct");
assert(byName.field_struct_click_shows_detail.selected.detailOpen === true, "clicking a field struct should open card details");
assert(byName.struct_deck_scrolls.app.structDeckScroll === 1, "struct deck should support scrolling to later rows");
assert(byName.deckmaker_deck_imports.app.deckName === "Deckmaker Sample", "Deckmaker import should set deck name");
assert(byName.deckmaker_deck_imports.app.deck.core === "frontierCore", "Deckmaker import should map coreCardId");
assert(byName.deckmaker_deck_imports.app.deck.main.length === 3, "Deckmaker import should map mainDeckCardIds");
assert(byName.deckmaker_deck_imports.app.deck.struct.length === 2, "Deckmaker import should map structDeckCardIds");
assert(Array.isArray(byName.deckmaker_all_data_exports.exportPayload.cards), "Deckmaker export should include cards");
assert(Array.isArray(byName.deckmaker_all_data_exports.exportPayload.decks), "Deckmaker export should include decks");
assert(Array.isArray(byName.deckmaker_all_data_exports.exportPayload.worlds), "Deckmaker export should include worlds");
assert(byName.deckmaker_all_data_exports.exportPayload.cards.some((card) => card.id && card.name && card.type), "Deckmaker export cards should have required fields");
assert(byName.deckmaker_all_data_imports_cards.deckName === "Deckmaker All Data Sample", "Deckmaker all-data import should set deck name");
assert(byName.deckmaker_all_data_imports_cards.deck.core === "dm_core_test", "Deckmaker all-data import should map imported core cards");
assert(byName.deckmaker_all_data_imports_cards.deck.main[0] === "dm_unit_test", "Deckmaker all-data import should map imported main cards");
assert(byName.deckmaker_all_data_imports_cards.deck.struct[0] === "dm_struct_test", "Deckmaker all-data import should map imported struct cards");
assert(byName.deckmaker_all_data_imports_cards.core.initialHand === 5, "Deckmaker core import should preserve initial hand");
assert(byName.deckmaker_all_data_imports_cards.core.handLimit === 4, "Deckmaker core import should preserve hand limit");
assert(byName.deckmaker_all_data_imports_cards.core.startResources.funds === 7, "Deckmaker core import should preserve initial gold as starting funds");
assert(byName.deckmaker_all_data_imports_cards.core.startResources.people === 0, "Deckmaker core import should preserve explicit initial resources instead of defaulting people");
assert(byName.deckmaker_all_data_imports_cards.core.startResources.nature === 0, "Deckmaker core import should preserve explicit initial resources instead of defaulting nature");
assert(byName.deckmaker_all_data_imports_cards.core.income.funds === 2, "Deckmaker core import should default turn funds income");
assert(byName.deckmaker_all_data_imports_cards.unit.keywords.some((keyword) => keyword.id === "armor" && keyword.value === 3), "Deckmaker all-data import should parse armor keyword");
assert(byName.deckmaker_all_data_imports_cards.unit.cost.people === 1 && byName.deckmaker_all_data_imports_cards.unit.cost.nature === 1, "Deckmaker all-data import should map human and nature costs");
assert(byName.deckmaker_all_data_imports_cards.struct.abilities.some((ability) => ability.resource === "nature" && ability.amount === 2), "Deckmaker all-data import should map generated nature resources");
assert(byName.deckmaker_bundled_core_initial_resources.meatCastle?.name === "肉の王城", "Bundled Deckmaker core should include 肉の王城");
assert(byName.deckmaker_bundled_core_initial_resources.meatCastle.startResources.funds === 7, "肉の王城 should preserve initialResources.gold as starting funds 7");
assert(byName.deckmaker_all_data_exports.exportPayload.decks[0].mainDeckCardIds.length === 1, "Deckmaker export should include current imported deck ids");

assert(byName.alert_unrests_at_end_turn.board[3][0].rested === false, "alert should unrest at controller end turn");
assert(byName.alert_unrests_at_end_turn.activePlayer === "p2", "end turn should pass priority to opponent");
assert(byName.turn_start_resource_summary.turnStartSummary.playerId === "p2", "turn start summary should identify the new active player");
assert(byName.turn_start_resource_summary.turnStartSummary.gained.funds >= 2, "turn start summary should include gained funds");
assert(byName.turn_start_resource_summary.turnStartSummary.gained.people >= 1, "turn start summary should include gained people");
assert(byName.turn_start_resource_summary.turnStartSummary.drawn === 1, "turn start summary should include drawn card count");

assert(byName.charge_ignores_armor_and_pays_electric.board[1][0].hp === 2, "charge should ignore armor and deal full damage");
assert(byName.charge_ignores_armor_and_pays_electric.players.p1.resources.funds === 9, "charge should pay normal act cost");
assert(byName.charge_ignores_armor_and_pays_electric.players.p1.resources.electric === 9, "charge should pay extra electric cost");

assert(byName.charge_payment_failure_is_atomic.board[1][0].hp === 5, "failed charge payment should not damage target");
assert(byName.charge_payment_failure_is_atomic.board[2][0].rested === false, "failed charge payment should not rest attacker");
assert(byName.charge_payment_failure_is_atomic.players.p1.resources.funds === 10, "failed charge payment should not spend normal act cost");

assert(byName.multi_strike_rests_after_second_attack.board[2][0].rested === true, "multi-strike unit should rest after attack limit");
assert(byName.multi_strike_rests_after_second_attack.board[2][0].attacksThisTurn === 2, "multi-strike should track both attacks");
assert(byName.multi_strike_rests_after_second_attack.board[1][0].hp === 3, "first multi-strike target should take damage");
assert(byName.multi_strike_rests_after_second_attack.board[1][1].hp === 3, "second multi-strike target should take damage");

assert(byName.immobile_cannot_move.board[3][0]?.name === "掩体壕", "immobile unit should stay in place");
assert(byName.immobile_cannot_move.board[3][0].rested === false, "failed immobile move should not rest");

assert(byName.no_attack_cannot_attack.board[1][0].hp === 4, "noAttack unit should not damage target");
assert(byName.no_attack_cannot_attack.board[2][0].rested === false, "failed noAttack should not rest attacker");

assert(byName.soul_pay_uses_dump_for_missing_magic.board[3][0]?.name === "魂術師", "soulPay should allow summon with dump cards");
assert(byName.soul_pay_uses_dump_for_missing_magic.players.p1.dumpCount === 0, "soulPay should exile dump cards used for magic");
assert(byName.soul_pay_uses_dump_for_missing_magic.players.p1.resources.funds === 0, "soulPay summon should still pay funds");

assert(byName.legendary_rejects_duplicate.duplicateLegendaryRejected === true, "legendary duplicate should be rejected");

assert(byName.immediate_tact_resolves_and_dumps.players.p1.hand.length === 1, "immediate tact should draw before leaving hand empty");
assert(byName.immediate_tact_resolves_and_dumps.players.p1.hand[0].name === "民兵分隊", "field order should draw top deck card");
assert(byName.immediate_tact_resolves_and_dumps.players.p1.dumpCount === 1, "immediate tact should move to dump after resolution");
assert(byName.immediate_tact_resolves_and_dumps.effectQueueCount === 0, "immediate tact should leave no queued effects");

assert(byName.targeted_tact_waits_for_enemy_unit.pendingTarget?.card === "精密攻撃", "targeted tact should wait for target");
assert(byName.targeted_tact_waits_for_enemy_unit.players.p1.tactZone.includes("精密攻撃"), "targeted tact should remain in tact zone while pending");
assert(byName.targeted_tact_resolves_and_dumps.board[1][0].hp === 2, "targeted tact should damage chosen enemy unit");
assert(byName.targeted_tact_resolves_and_dumps.pendingTarget === null, "targeted tact should clear pending target after resolution");
assert(byName.targeted_tact_resolves_and_dumps.players.p1.dumpCount === 1, "targeted tact should move to dump after resolution");
assert(byName.targeted_tact_resolves_and_dumps.players.p1.tactZone.length === 0, "targeted tact should leave tact zone after resolution");

assert(byName.targeted_tact_rejects_invalid_friendly_target.pendingTarget?.card === "精密攻撃", "invalid target should keep pending target");
assert(byName.targeted_tact_rejects_invalid_friendly_target.board[3][0].hp === 4, "invalid friendly target should not be damaged");
assert(byName.targeted_tact_rejects_invalid_friendly_target.players.p1.tactZone.includes("精密攻撃"), "invalid target should keep card in tact zone");

assert(byName.wild_sets_face_down.players.p1.hand.length === 1, "wild supply should draw one card after leaving hand");
assert(byName.wild_sets_face_down.players.p1.wildZone.length === 1, "wild card should enter Wild Zone");
assert(byName.wild_sets_face_down.players.p1.wildZone[0].faceDown === true, "wild card should be face down");
assert(byName.wild_sets_face_down.players.p1.resources.nature === byName.wild_sets_face_down.natureBefore + 2, "hidden supply should gain 2 nature");
assert(byName.wild_sets_face_down.players.p1.resources.fuel === byName.wild_sets_face_down.fuelBefore + 1, "hidden supply should gain 1 fuel");
assert(byName.wild_sets_face_down.players.p1.mainDeckCount === byName.wild_sets_face_down.deckBefore - 1, "hidden supply should draw from deck");

assert(byName.grand_places_face_up.players.p1.hand.length === 1, "grand mandate should draw after leaving hand");
assert(byName.grand_places_face_up.players.p1.grandZone[0] === "大号令", "grand card should enter Grand Zone face up");
assert(byName.grand_places_face_up.board[3][0].atk === 2, "grand mandate should buff friendly unit atk");
assert(byName.grand_places_face_up.board[3][0].hp === 3, "grand mandate should buff friendly unit hp");
assert(byName.grand_places_face_up.players.p1.mainDeckCount === byName.grand_places_face_up.deckBefore - 1, "grand mandate should draw one card");

const initialCards = Object.fromEntries(byName.initial_cards_match_spec.initialCards.map((card) => [card.id, card]));
assert(Boolean(initialCards.lightInfantry.name), "light infantry name should exist");
assert(Boolean(initialCards.lightInfantry.faction), "light infantry faction should exist");
assert(initialCards.lightInfantry.tags.length >= 2, "light infantry tags should exist");
assert(initialCards.lightInfantry.cost.people === 1 && initialCards.lightInfantry.cost.funds === 1, "light infantry cost should be people 1 funds 1");
assert(Object.keys(initialCards.lightInfantry.actCost).length === 0, "light infantry should have no act cost");
assert(initialCards.lightInfantry.atk === 1 && initialCards.lightInfantry.hp === 2, "light infantry stats should be 1/2");
assert(initialCards.lightInfantry.keywords.some((keyword) => keyword.id === "alert"), "light infantry should have alert");

assert(!initialCards.smallFieldGun, "ore-only field gun should be removed");
assert(initialCards.smallFieldGunFuel.tags.length >= 2, "fuel field gun tags should exist");
assert(initialCards.smallFieldGunFuel.cost.ore === 1 && initialCards.smallFieldGunFuel.cost.funds === 1, "fuel field gun cost should be ore 1 funds 1");
assert(initialCards.smallFieldGunFuel.actCost.ore === 1 && initialCards.smallFieldGunFuel.actCost.fuel === 1, "fuel field gun act cost should be ore 1 fuel 1");
assert(Boolean(initialCards.smallFieldGunFuel.name), "fuel field gun should keep a display name");
assert(initialCards.smallFieldGunFuel.keywords.some((keyword) => keyword.id === "shock"), "fuel field gun should have shock");
assert(initialCards.smallFieldGunFuel.keywords.some((keyword) => keyword.id === "arc" && keyword.value === 1), "fuel field gun should have arc 1");

assert(Boolean(initialCards.commonArmoredCar.name), "common armored car name should exist");
assert(initialCards.commonArmoredCar.tags.length >= 2, "common armored car tags should exist");
assert(initialCards.commonArmoredCar.cost.ore === 1 && initialCards.commonArmoredCar.cost.funds === 1, "common armored car cost should be ore 1 funds 1");
assert(initialCards.commonArmoredCar.actCost.ore === 1 && initialCards.commonArmoredCar.actCost.fuel === 1, "common armored car act cost should be ore 1 fuel 1");
assert(initialCards.commonArmoredCar.atk === 3 && initialCards.commonArmoredCar.hp === 2, "common armored car stats should be 3/2");
assert(initialCards.commonArmoredCar.keywords.some((keyword) => keyword.id === "armor" && keyword.value === 1), "common armored car should have armor 1");
assert(initialCards.commonArmoredCar.keywords.some((keyword) => keyword.id === "mobile"), "common armored car should have mobile");

assert(Boolean(initialCards.antiArmorMageTeam328.name), "328 mage team name should exist");
assert(Boolean(initialCards.antiArmorMageTeam328.faction), "328 mage team faction should exist");
assert(initialCards.antiArmorMageTeam328.tags.length >= 3, "328 mage team tags should exist");
assert(
  initialCards.antiArmorMageTeam328.cost.people === 2 && initialCards.antiArmorMageTeam328.cost.funds === 1 && initialCards.antiArmorMageTeam328.cost.nature === 1,
  "328 mage team cost should include people 2 funds 1 nature 1",
);
assert(initialCards.antiArmorMageTeam328.actCost.magic === 1, "328 mage team act cost should be magic 1");
assert(initialCards.antiArmorMageTeam328.atk === 4 && initialCards.antiArmorMageTeam328.hp === 2, "328 mage team stats should be 4/2");
assert(initialCards.antiArmorMageTeam328.keywords.some((keyword) => keyword.id === "raid"), "328 mage team should have raid");
assert(initialCards.antiArmorMageTeam328.keywords.some((keyword) => keyword.id === "pierce" && keyword.value === 1), "328 mage team should have pierce 1");

assert(Boolean(initialCards.peoplesReconForce.faction), "recon force faction should exist");
assert(initialCards.peoplesReconForce.tags.length >= 4, "recon force tags should exist");
assert(initialCards.peoplesReconForce.cost.people === 2 && initialCards.peoplesReconForce.cost.funds === 2, "recon force cost should be people 2 funds 2");
assert(initialCards.peoplesReconForce.actCost.people === 1, "recon force act cost should be people 1");
assert(initialCards.peoplesReconForce.atk === 2 && initialCards.peoplesReconForce.hp === 3, "recon force stats should be 2/3");

assert(initialCards.lifeFairy.tags.length >= 2, "life fairy tags should exist");
assert(initialCards.lifeFairy.cost.magic === 1 && Object.keys(initialCards.lifeFairy.actCost).length === 0, "life fairy costs should match");
assert(initialCards.lifeFairy.atk === 0 && initialCards.lifeFairy.hp === 1, "life fairy stats should be 0/1");
assert(Boolean(initialCards.knowledgeFairy.name), "knowledge fairy name should exist");
assert(initialCards.knowledgeFairy.cost.magic === 1 && initialCards.knowledgeFairy.atk === 0 && initialCards.knowledgeFairy.hp === 1, "knowledge fairy stats and cost should match");
assert(Boolean(initialCards.mysticCapture.name), "mystic capture name should exist");
assert(Boolean(initialCards.mysticCapture.faction), "mystic capture faction should exist");
assert(initialCards.mysticCapture.cost.electric === 1, "mystic capture cost should be electric 1");

assert(byName.life_fairy_buffs_friendly_units.board[3][0].hp === 3, "life fairy should raise existing friendly hp");
assert(byName.life_fairy_buffs_friendly_units.board[3][1].hp === 2, "life fairy should also raise its own hp after entering");
assert(byName.knowledge_fairy_draws_two.handCount === 2, "knowledge fairy should draw two cards after summon");
assert(byName.knowledge_fairy_draws_two.deckAfter === byName.knowledge_fairy_draws_two.deckBefore - 2, "knowledge fairy should reduce deck by two");
assert(byName.peoples_recon_destroy_reward.targetCleared === true, "recon force should destroy the target");
assert(byName.peoples_recon_destroy_reward.handAfter === byName.peoples_recon_destroy_reward.handBefore + 1, "recon force should draw on destroying enemy unit");
assert(byName.peoples_recon_destroy_reward.fundsAfter === byName.peoples_recon_destroy_reward.fundsBefore + 3, "recon force should gain 3 funds on destroying enemy unit");
assert(byName.mystic_capture_waits_for_choice.pendingChoice?.type === "mysticCapture", "mystic capture should wait for choice UI");
assert(byName.mystic_capture_waits_for_choice.pendingChoice.choices.length === 2, "mystic capture should list mystic units in hand");
assert(byName.mystic_capture_triggers_exiled_mystics_twice.pendingChoice === null, "mystic capture should clear choice after resolve");
assert(byName.mystic_capture_triggers_exiled_mystics_twice.players.p1.exileCount === 2, "mystic capture should exile two mystic units");
assert(byName.mystic_capture_triggers_exiled_mystics_twice.players.p1.dumpCount === 1, "mystic capture tact should go to dump");
assert(byName.mystic_capture_triggers_exiled_mystics_twice.players.p1.hand.length === 4, "mystic capture should trigger knowledge fairy draw twice");
assert(byName.mystic_capture_triggers_exiled_mystics_twice.board[3][0].hp === 4, "mystic capture should trigger life fairy buff twice");
assert(byName.mystic_capture_discards_selected_mystic_once.players.p1.exileCount === 0, "discard mode should not exile selected mystic");
assert(byName.mystic_capture_discards_selected_mystic_once.players.p1.dumpCount === 2, "discard mode should dump selected mystic and tact");
assert(byName.mystic_capture_discards_selected_mystic_once.players.p1.hand.length === 3, "discard mode should keep unselected mystic and draw two");
assert(byResult.mystic_capture_cost_core_damage.coreHpAfter === byResult.mystic_capture_cost_core_damage.coreHpBefore - 2, "mystic capture exile cost shortfall should deal core damage");
assert(byResult.mystic_capture_cost_electric_paid.coreHpAfter === byResult.mystic_capture_cost_electric_paid.coreHpBefore, "mystic capture exile cost should not damage core when electric is sufficient");
assert(byResult.mystic_capture_cost_electric_paid.electricAfter === 3, "mystic capture should consume 2 electric for two magic-cost cards");
assert(byName.non_neutral_faction_limit.twoFactionDeckValid === true, "two non-neutral factions should be valid");
assert(byName.non_neutral_faction_limit.threeFactionRejected === true, "three non-neutral factions should be rejected");

assert(
  byName.default_deck_excludes_demo_fixtures.activeCards.every((card) => card.fixture === false),
  "default deck and opening hand should not include demo fixture units",
);
assert(
  ["野戦命令", "精密攻撃", "隠匿補給", "大号令"].every((name) =>
    byName.default_deck_excludes_demo_fixtures.activeCards.some((card) => card.name === name),
  ),
  "default deck should use Japanese names for tact, wild, and grand cards",
);
assert(
  byName.struct_cards_use_japanese_names.structNames.join("/") === "町/資源林/鉱山/精製所/発電所/魔力井戸",
  "struct deck names should be Japanese",
);
assert(byName.core_selection_applies_to_match.deckCore === "arcaneReactorCore", "deck should keep selected core id");
assert(byName.core_selection_applies_to_match.playerCore.id === "arcaneReactorCore", "match should use selected core");
assert(byName.core_selection_applies_to_match.playerCore.hp === 18, "arcane core hp should apply");
assert(byName.core_selection_applies_to_match.handCount === 3, "selected core initial hand should apply");
assert(byName.core_selection_applies_to_match.resources.magic === 1, "arcane core starting magic should apply");
assert(
  byName.core_cards_follow_template.cores.length >= 4 &&
    byName.core_cards_follow_template.cores.every(
      (core) =>
        core.name &&
        core.faction &&
        core.flavor &&
        Number.isInteger(core.initialHand) &&
        Number.isInteger(core.draw) &&
        Number.isInteger(core.handLimit) &&
        core.deckSize === "40〜60" &&
        core.deckMin === 40 &&
        core.deckMax === 60 &&
        core.startResources &&
        Array.isArray(core.specialRequirements),
    ),
  "core cards should define all template fields",
);
assert(byName.google_requires_config_without_demo_fallback.screen === "login", "unconfigured Google button should stay on login");
assert(byName.google_requires_config_without_demo_fallback.auth.signedIn === false, "unconfigured Google button should not sign in");
assert(
  !byName.google_requires_config_without_demo_fallback.auth.message ||
    byName.google_requires_config_without_demo_fallback.auth.message.includes("GOOGLE_CLIENT_ID"),
  "unconfigured Google button should explain missing client id when config is absent",
);
assert(byName.deck_builder_manages_card_counts.managedAfterCap === byName.deck_builder_manages_card_counts.managedBefore + 3, "deck builder should cap ordinary card copies at 4");
assert(byName.deck_builder_manages_card_counts.managedAfterRemove === byName.deck_builder_manages_card_counts.managedAfterCap - 1, "deck builder should decrement a main card copy");
assert(byName.deck_builder_manages_card_counts.structAfterAdd === byName.deck_builder_manages_card_counts.structBefore + 1, "deck builder should add struct cards");
assert(byName.deck_builder_manages_card_counts.structAfterRemove === byName.deck_builder_manages_card_counts.structAfterAdd - 1, "deck builder should decrement struct cards");
assert(byName.deck_builder_manages_card_counts.unitFilter === "unit", "deck builder should filter library by unit type");
assert(byName.deck_builder_manages_card_counts.pageAfterNext >= 0, "deck builder library paging should be bounded");
assert(byName.deck_builder_manages_card_counts.structFilter === "struct", "deck builder should filter library by struct type");
assert(byName.deck_builder_manages_card_counts.searchPreset === "attack", "deck builder should apply search presets");
assert(byName.deck_builder_manages_card_counts.tagFilter === "純人間", "deck builder should apply tag filters");
assert(byName.deck_builder_manages_card_counts.sortBy === "cost", "deck builder should cycle sort mode");
assert(byName.deck_builder_manages_card_counts.testDraw.length === 4, "test draw should use selected core initial hand");
assert(byName.deck_builder_manages_card_counts.savedOk === true, "named deck save should succeed");
assert(byName.deck_builder_manages_card_counts.savedId === true, "named deck should be listed after save");
assert(byName.deck_builder_manages_card_counts.modifiedCount === byName.deck_builder_manages_card_counts.loadedCount + 1, "loading named deck should restore saved card count");
assert(byName.deck_builder_manages_card_counts.loadOk === true, "named deck load should succeed");
assert(byName.deck_builder_manages_card_counts.deckName.startsWith("テストデッキ-"), "loaded deck name should be restored");
assert(byName.deck_builder_manages_card_counts.selectedCard.name === "神秘捕縛", "selected card detail should expose card name");
assert(byName.deck_builder_manages_card_counts.selectedCard.text.includes("神秘タグ"), "selected card detail should expose full text");
assert(byName.deck_builder_manages_card_counts.selectedCard.abilities.includes("神秘ユニット"), "selected card detail should expose effect text");
assert(byName.app_login_deckbuilder_match_flow.auth.provider === "google", "google demo login should set provider");
assert(byName.app_login_deckbuilder_match_flow.afterAdd === byName.app_login_deckbuilder_match_flow.beforeAdd + 1, "deck builder should add a card");
assert(byName.app_login_deckbuilder_match_flow.afterRemove === byName.app_login_deckbuilder_match_flow.beforeAdd, "deck builder should remove a card");
assert(byName.app_login_deckbuilder_match_flow.selectedLobbyDeck === true, "match lobby should select a saved deck");
assert(byName.app_login_deckbuilder_match_flow.roomCode.length === 6, "room match should create a room code");
assert(byName.app_login_deckbuilder_match_flow.blockedScreen === "matchLobby", "online battle should stay in lobby without opponent");
assert(byName.app_login_deckbuilder_match_flow.blockedMessage.includes("対戦相手"), "online battle should require an opponent");
assert(byName.app_login_deckbuilder_match_flow.screen === "game", "starting a match should enter game screen");
assert(byName.app_login_deckbuilder_match_flow.match.status === "local", "match should become local after start");
assert(byName.app_login_deckbuilder_match_flow.hand.length === 4, "match should draw the selected core initial hand");

assert(byName.deckmaker_mill_ability_parsed.found === true, "deckmaker mill ability should be parsed from card description");
assert(byName.deckmaker_mill_ability_parsed.amount === 2, "deckmaker mill amount should be 2");
assert(byName.deckmaker_draw_pattern_parsed.found === true, "deckmaker draw ability should be parsed from デッキから2枚ドロー pattern");
assert(byName.deckmaker_draw_pattern_parsed.amount === 2, "deckmaker draw amount should be 2");
assert(byName.deckmaker_mill_on_summon.millDumpAfter === byName.deckmaker_mill_on_summon.millDumpBefore + 2, "deckmaker mill ability should send 2 cards to dump on summon");
assert(byName.deckmaker_struct_destroy_gain.peopleAfter === byName.deckmaker_struct_destroy_gain.peopleBefore + 1, "deckmaker struct should gain 1 people on enemy unit destroyed");

console.log(JSON.stringify({ ok: true, cases: results.map((result) => result.name) }, null, 2));
