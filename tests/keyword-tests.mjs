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
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Boolean(window.__twcg));

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

  out.push({
    name: "struct_catalog_loaded",
    summary: { count: Object.keys(api.cardCatalog.structs).length },
  });

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
  api.testing.placeUnit("militia", "p1", 2, 0, { rested: false });
  api.state.board[2][0].attackStrikeBonus = 2;
  api.testing.placeUnit("reconPlane", "p2", 1, 0, { rested: true });
    const flyingHpBefore = api.state.board[1][0].currentHp;
    api.testing.selectUnit(2, 0);
    api.testing.attack({ kind: "unit", row: 1, col: 0 });
    out.push({
      name: "flying_allows_buffed_ground_attack",
      summary: {
        effectiveAtk: api.testing.effectiveAttackPower(api.state.board[2][0], api.state.board[1][0]),
        flyingHpBefore,
        flyingHpAfter: api.state.board[1][0]?.currentHp,
        attackerRested: api.state.board[2][0]?.rested,
      },
    });

  reset();
  api.testing.placeUnit("armoredCar", "p1", 3, 0, { rested: false });
  api.testing.selectUnit(3, 0);
  api.testing.move();
  out.push(snapshot("mobile_move_does_not_rest_once"));

  reset();
  api.testing.placeUnit("armoredCar", "p1", 3, 0, { rested: false });
  api.testing.selectUnit(3, 0);
  api.testing.move();
  api.testing.selectUnit(2, 0);
  api.testing.move();
  out.push(snapshot("mobile_second_move_blocked"));

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
  api.testing.placeUnit("mageBattery", "p1", 2, 1, { rested: false });
  const coreHpBefore = api.state.players.p2.core.hp;
  api.testing.selectUnit(2, 1);
  api.testing.attack({ kind: "core", playerId: "p2" });
  out.push({ ...snapshot("arc_reaches_core"), coreHpBefore, coreHpAfter: api.state.players.p2.core.hp });

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
  api.testing.placeUnit("disruptionEngineer", "p2", 1, 0, { rested: true });
  api.testing.placeUnit("militia", "p2", 1, 1, { rested: true });
  api.abilityEffects.damageAllEnemyUnits({
    game: api.state,
    playerId: "p1",
    ability: { amount: 5 },
    card: { id: "simultaneous-effect-test", name: "同時効果テスト", owner: "p1", keywords: [] },
  });
  out.push(snapshot("effect_protect_aura_survives_simultaneous_destruction"));

  reset();
  api.testing.addHandCard("p1", "lightInfantry");
  const blockedOpponentSummon = api.testing.summonFromHand(0, 0, 3);
  out.push({ ...snapshot("cannot_summon_opponent_summon_row"), blockedOpponentSummon, handCount: api.state.players.p1.hand.length });

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

  reset();
  api.testing.setResources("p1", { funds: 20, people: 20, nature: 20, ore: 20, fuel: 20, electric: 20, magic: 20 });
  const townTemplate = JSON.parse(JSON.stringify(api.cardCatalog.structs.town));
  api.state.players.p1.structs = [];
  for (let i = 0; i < 10; i += 1) {
    api.state.players.p1.structs.push({
      ...JSON.parse(JSON.stringify(townTemplate)),
      id: `town-zone-${i}`,
      name: `村${i + 1}`,
    });
  }
  const deckIndex = api.state.players.p1.structDeck.length - 1;
  const cardToBuild = api.state.players.p1.structDeck[deckIndex];
  api.testing.playStruct(deckIndex);
  const replacePending = api.state.pendingChoice?.type === "structZoneReplace";
  const replacedName = replacePending ? api.state.players.p1.structs[0]?.name : null;
  if (replacePending) api.testing.resolveStructZoneReplace(0);
  out.push({
    name: "struct_zone_limit_replace",
    summary: {
      replacePending,
      zoneCount: api.state.players.p1.structs.length,
      deckCount: api.state.players.p1.structDeck.length,
      replacedName,
      builtName: cardToBuild?.name,
      deckContainsReplaced: replacedName ? api.state.players.p1.structDeck.some((c) => c.name === replacedName) : false,
      zoneContainsBuilt: cardToBuild ? api.state.players.p1.structs.some((c) => c.name === cardToBuild.name) : false,
    },
  });

  reset();
  api.state.players.p1.hand.push(JSON.parse(JSON.stringify(api.cardCatalog.structs.grove)));
  api.state.players.p1.dump.push(JSON.parse(JSON.stringify(api.cardCatalog.structs.mine)));
  const moved = api.testing.normalizeMisplacedStructCards("p1");
  out.push({
    name: "normalize_misplaced_struct_cards",
    summary: {
      moved,
      handHasStruct: api.state.players.p1.hand.some((c) => c.type === "struct"),
      dumpHasStruct: api.state.players.p1.dump.some((c) => c.type === "struct"),
      structDeckCount: api.state.players.p1.structDeck.length,
    },
  });

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
      {
        id: "dm_armor15_test",
        name: "Deckmaker Armor Fifteen Test",
        type: "ユニット",
        world: "ニュートラル",
        tags: ["歩兵"],
        description: "[装甲⑮]",
        costs: { play: { gold: 1 }, act: {}, choice: [], choiceAct: [] },
        generates: {},
        attack: 0,
        defense: 20,
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
      armor15: api.testing.catalogCard("dm_armor15_test"),
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
  api.testing.placeUnit("dm_armor15_test", "p2", 1, 0, { rested: true });
  api.testing.placeUnit("lightInfantry", "p1", 2, 0, { rested: false });
  api.state.board[2][0].atk = 20;
  api.testing.selectUnit(2, 0);
  api.testing.attack({ kind: "unit", row: 1, col: 0 });
  out.push(snapshot("armor_fifteen_reduces_damage"));

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
  api.testing.resolveChargeAttack(true);
  out.push(snapshot("charge_ignores_armor_and_pays_electric"));

  reset();
  api.testing.setResources("p1", { funds: 10, electric: 10 });
  api.testing.placeUnit("chargedLancer", "p1", 2, 0, { rested: false });
  api.testing.placeUnit("armoredCar", "p2", 1, 0, { rested: true });
  api.testing.selectUnit(2, 0);
  api.testing.attack({ kind: "unit", row: 1, col: 0 });
  api.testing.resolveChargeAttack(false);
  out.push(snapshot("charge_normal_attack_keeps_armor"));

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
  api.testing.setResources("p1", { ore: 1 });
  api.testing.placeUnit("card_1753681798567", "p1", 2, 4, { rested: false });
  api.testing.placeUnit("card_1753681798567", "p2", 1, 4, { rested: false });
  api.testing.selectUnit(2, 4);
  const projectionActivated = api.testing.activateSelectedUnit();
  const projectionResourceOptions = [...(api.state.pendingChoice?.resources || [])];
  api.testing.resolveChooseActivationResource("ore");
  const projectionPendingTarget = api.state.pendingTarget?.ability?.effect || null;
  api.testing.resolveTarget(1, 4);
  out.push({
    ...snapshot("concept_projection_rests_attackable_target"),
    projectionActivated,
    projectionResourceOptions,
    projectionPendingTarget,
    targetLockedRestTurns: api.state.board[1][4]?.lockedRestTurns || 0,
  });

  reset();
  api.testing.setResources("p1", { ore: 1 });
  api.testing.placeUnit("card_1753681798567", "p1", 2, 4, { rested: false });
  api.testing.placeUnit("card_1753681798567", "p2", 0, 4, { rested: false });
  api.testing.selectUnit(2, 4);
  const projectionOutOfRangeActivated = api.testing.activateSelectedUnit();
  out.push({
    ...snapshot("concept_projection_rejects_out_of_range_target"),
    projectionOutOfRangeActivated,
  });

  reset();
  api.testing.setResources("p1", { funds: 1, magic: 0 });
  api.testing.addDumpCard("p1", "lifeFairy");
  api.testing.addDumpCard("p1", "fieldOrder");
  api.testing.addHandCard("p1", "soulMage");
  api.testing.summonFromHand(0, 3, 0);
  const requiredSoulPrompt = {
    type: api.state.pendingChoice?.type,
    amounts: [...(api.state.pendingChoice?.amounts || [])],
    canPayWithoutSoul: api.state.pendingChoice?.canPayWithoutSoul,
  };
  api.testing.resolveSoulPayChoice(2);
  out.push({ ...snapshot("soul_pay_uses_dump_for_missing_magic"), requiredSoulPrompt });

  reset();
  api.testing.setResources("p1", { funds: 1, magic: 2 });
  api.testing.addDumpCard("p1", "militia");
  api.testing.addDumpCard("p1", "fieldOrder");
  api.testing.addHandCard("p1", "soulMage");
  api.testing.summonFromHand(0, 3, 0);
  const optionalSoulPrompt = {
    type: api.state.pendingChoice?.type,
    amounts: [...(api.state.pendingChoice?.amounts || [])],
    canPayWithoutSoul: api.state.pendingChoice?.canPayWithoutSoul,
  };
  api.testing.resolveSoulPayChoice(1);
  out.push({ ...snapshot("soul_pay_allows_optional_partial_payment"), optionalSoulPrompt });

  reset();
  const secondTomb = api.cardCatalog.structs["card_1753681080997"];
  const secondTombRevive = secondTomb.abilities.find((ability) => ability.effect === "reviveUnitFromDump");
  api.testing.addDumpCard("p1", "lifeFairy");
  api.abilityEffects.reviveUnitFromDump({
    game: api.state,
    playerId: "p1",
    card: secondTomb,
    ability: secondTombRevive,
    source: { zone: "struct" },
  });
  api.testing.resolveReviveFromDump(0);
  const secondTombRows = [...(api.state.pendingChoice?.validRows || [])];
  const secondTombSummonRowRejected = api.testing.resolveSummonPlacement(3, 1);
  const secondTombBattleRowAccepted = api.testing.resolveSummonPlacement(2, 1);
  out.push({
    ...snapshot("second_tomb_revives_only_to_battle_zone"),
    secondTombRows,
    secondTombSummonRowRejected,
    secondTombBattleRowAccepted,
  });

  const nobelburg = api.cardCatalog.cores["card_1755670973607"];
  out.push({
    name: "nobelburg_has_only_initial_resources",
    summary: { income: { ...(nobelburg?.income || {}) }, startResources: { ...(nobelburg?.startResources || {}) } },
  });

  reset();
  api.testing.addHandCard("p2", "militia");
  const previousMatchStatus = api.app.match.status;
  const previousMatchRole = api.app.match.role;
  api.app.match.status = "online";
  api.app.match.role = "host";
  api.state.pendingChoice = {
    type: "searchDeckPick",
    playerId: "p2",
    candidates: [{ card: api.cardCatalog.main.militia }],
  };
  const privateSelectionSummary = api.testing.summary();
  out.push({ name: "opponent_card_selection_is_private", summary: privateSelectionSummary });
  api.state.pendingChoice = null;
  api.app.match.status = previousMatchStatus;
  api.app.match.role = previousMatchRole;

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
      abilities: card.abilities,
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
  const captureCoreHpBefore = api.state.players.p1.core.hp;
  api.testing.toggleMysticCaptureChoice(0);
  api.testing.toggleMysticCaptureChoice(1);
  api.testing.resolveMysticCaptureChoice({ exile: true });
  out.push({ ...snapshot("mystic_capture_cost_core_damage"), coreHpBefore: captureCoreHpBefore, coreHpAfter: api.state.players.p1.core.hp });

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

  const annihilationAnomalyId = "card_1782311181226";
  const annihilationAnomaly = api.cardCatalog.main[annihilationAnomalyId];
  const originalAnnihilationAnomalyLimit = annihilationAnomaly?.limit;
  let fourAnnihilationAnomaliesValid = false;
  let fiveAnnihilationAnomaliesRejected = false;
  if (annihilationAnomaly) annihilationAnomaly.limit = 1;
  try {
    fourAnnihilationAnomaliesValid = api.testing.validateDeck(Array(4).fill(annihilationAnomalyId));
  } catch {
    fourAnnihilationAnomaliesValid = false;
  }
  try {
    api.testing.validateDeck(Array(5).fill(annihilationAnomalyId));
  } catch {
    fiveAnnihilationAnomaliesRejected = true;
  }
  if (annihilationAnomaly) annihilationAnomaly.limit = originalAnnihilationAnomalyLimit;
  out.push({
    name: "bundled_deck_limit_overrides_stale_catalog_limit",
    summary: { fourAnnihilationAnomaliesValid, fiveAnnihilationAnomaliesRejected },
  });

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

  const artilleryStruct = api.testing.catalogCard("card_1782229353995");
  const artilleryAbility = (artilleryStruct?.abilities || []).find(
    (a) => a.effect === "destroyEnemyStructs" && a.trigger === "onStructurePhase",
  );
  out.push({
    name: "long_range_artillery_struct_phase",
    summary: {
      found: !!artilleryAbility,
      fuelCost: artilleryAbility?.fuelCost,
      amount: artilleryAbility?.amount,
    },
  });

  reset();
  api.state.phase = "structure";
  api.state.activePlayer = "p1";
  api.state.pendingStructPhase = {
    playerId: "p1",
    activatedIndexes: [],
    activatedTactIndexes: [],
    resourcesBefore: { ...api.state.players.p1.resources },
    handBefore: api.state.players.p1.hand.length,
  };
  api.testing.setResources("p1", { funds: 5, people: 5, nature: 5, ore: 0, fuel: 3, electric: 0, magic: 0 });
  const artilleryRuntime = api.testing.catalogCard("card_1782229353995");
  api.state.players.p1.structs = [artilleryRuntime];
  api.state.players.p2.structs = [{
    id: "card_1753904622342",
    name: "銅鉱山",
    type: "struct",
    faction: "ニュートラル",
    abilities: [],
  }];
  const enemyStructsBefore = api.state.players.p2.structs.length;
  const fuelBefore = api.state.players.p1.resources.fuel;
  const activated = api.testing.activateStructInPhase(0);
  const pendingEnemyChoice = !!api.state.pendingStructPhase?.pendingEnemyStructChoice;
  let enemyStructsAfter = enemyStructsBefore;
  let artilleryRested = false;
  if (pendingEnemyChoice) {
    api.testing.resolveEnemyStructChoice(0);
    enemyStructsAfter = api.state.players.p2.structs.length;
    artilleryRested = api.state.players.p1.structs[0]?.rested === true;
  }
  out.push({
    name: "long_range_artillery_struct_phase_activates",
    summary: {
      activated,
      pendingEnemyChoice,
      enemyStructsBefore,
      enemyStructsAfter,
      fuelSpent: fuelBefore - api.state.players.p1.resources.fuel,
      artilleryRested,
    },
  });

  const sabotageCard = api.cardCatalog.main["card_1753659700866"];
  const sabotageAbility = (sabotageCard?.abilities || []).find((a) => a.effect === "destroyTargetStruct");
  out.push({
    name: "sabotage_destroy_target_struct_parsed",
    summary: { found: !!sabotageAbility, trigger: sabotageAbility?.trigger },
  });

  reset();
  api.state.activePlayer = "p1";
  api.state.phase = "main";
  api.state.players.p2.structs = [{
    id: "card_1753904622342",
    name: "銅鉱山",
    type: "struct",
    faction: "ニュートラル",
  }];
  const sabotageHandIdx = api.testing.addHandCard("p1", "card_1753659700866");
  api.testing.playTactFromHand(sabotageHandIdx);
  const pendingDestroyStruct = api.state.pendingChoice?.type === "destroyEnemyStruct";
  let structDestroyed = false;
  if (pendingDestroyStruct) {
    structDestroyed = api.testing.resolveDestroyEnemyStructChoice(0);
  }
  out.push({
    name: "sabotage_play_offers_struct_choice",
    summary: {
      pendingDestroyStruct,
      structDestroyed,
      enemyStructs: api.state.players.p2.structs.length,
      message: api.state.message,
    },
  });

  const strategicBombingCard = api.cardCatalog.main["card_1782229916488"];
  const strategicBombingAbility = (strategicBombingCard?.abilities || []).find(
    (a) => a.effect === "destroyEnemyStructsOnPlay" && a.trigger === "onPlay",
  );
  out.push({
    name: "strategic_bombing_parsed",
    summary: {
      found: !!strategicBombingAbility,
      amount: strategicBombingAbility?.amount,
    },
  });

  reset();
  api.state.activePlayer = "p1";
  api.state.phase = "main";
  api.testing.setResources("p1", { funds: 20, people: 20, nature: 20, ore: 20, fuel: 20, electric: 20, magic: 20 });
  api.state.players.p2.structs = [
    { id: "card_1753904622342", name: "銅鉱山", type: "struct", faction: "ニュートラル" },
    { id: "card_1753904622342", name: "銀鉱山", type: "struct", faction: "ニュートラル" },
  ];
  const bombingHandIdx = api.testing.addHandCard("p1", "card_1782229916488");
  api.testing.playTactFromHand(bombingHandIdx);
  const bombingPendingDestroy = api.state.pendingChoice?.type === "destroyEnemyStruct";
  const bombingRemaining = api.state.pendingChoice?.remaining;
  let bombingDestroyed = false;
  if (bombingPendingDestroy) {
    bombingDestroyed = api.testing.resolveDestroyEnemyStructChoice(0);
  }
  out.push({
    name: "strategic_bombing_play_offers_struct_choice",
    summary: {
      pendingDestroyStruct: bombingPendingDestroy,
      remaining: bombingRemaining,
      structDestroyed: bombingDestroyed,
      enemyStructs: api.state.players.p2.structs.length,
    },
  });

  reset();
  api.testing.placeUnit("militia", "p1", 2, 1);
  const zombieUnit = api.state.board[2][1];
  zombieUnit.currentHp = -3;
  zombieUnit.destroyed = true;
  zombieUnit._finalizing = true;
  api.testing.cleanupAllDestroyed();
  out.push({
    name: "zombie_unit_with_destroy_flags_cleaned",
    summary: {
      onBoard: !!api.state.board[2][1],
      dumpCount: api.state.players.p1.dump.length,
    },
  });

  reset();
  api.testing.placeUnit("militia", "p1", 2, 1, { fromDump: true, hp: 1 });
  const fromDumpUnit = api.state.board[2][1];
  const cleanOnSummon = !fromDumpUnit.destroyed && !fromDumpUnit._finalizing;
  fromDumpUnit.currentHp = -2;
  api.testing.cleanupAllDestroyed();
  out.push({
    name: "from_dump_unit_negative_hp_cleaned",
    summary: {
      onBoard: !!api.state.board[2][1],
      dumpCount: api.state.players.p1.dump.length,
      cleanOnSummon,
    },
  });

  const atlasCard = api.cardCatalog.main["card_1782600607874"];
  const enhanceAbility = (atlasCard?.abilities || []).find((a) => a.effect === "payOnAttackEnhance");
  out.push({
    name: "pay_on_attack_enhance_parsed",
    summary: {
      found: !!enhanceAbility,
      payCost: enhanceAbility?.payCost,
      pierce: enhanceAbility?.pierce,
      atkBuff: enhanceAbility?.atkBuff,
    },
  });

  reset();
  api.state.activePlayer = "p1";
  api.state.phase = "main";
  api.testing.setResources("p1", { funds: 5, people: 5, nature: 8, ore: 0, fuel: 0, electric: 0, magic: 0 });
  api.testing.placeUnit("card_1782600607874", "p1", 2, 2, { rested: false });
  api.testing.placeUnit("militia", "p2", 1, 2, { rested: true, hp: 20 });
  const atlasPeopleBefore = api.state.players.p1.resources.people;
  const atlasNatureBefore = api.state.players.p1.resources.nature;
  const atlasFundsBefore = api.state.players.p1.resources.funds;
  const defenderHpBefore = api.state.board[1][2].currentHp;
  api.testing.selectUnit(2, 2);
  api.testing.attack({ kind: "unit", row: 1, col: 2 });
  const pendingEnhance = api.state.pendingChoice?.type === "payOnAttackEnhance";
  let defenderHpAfter = defenderHpBefore;
  let enhanceDamage = 0;
  if (pendingEnhance) {
    api.testing.resolvePayOnAttackEnhance(true);
    defenderHpAfter = api.state.board[1][2]?.currentHp ?? 0;
    enhanceDamage = defenderHpBefore - defenderHpAfter;
  }
  out.push({
    name: "pay_on_attack_enhance_applies_before_damage",
    summary: {
      pendingEnhance,
      fundsSpentOnAct: atlasFundsBefore - api.state.players.p1.resources.funds,
      peopleSpentOnEnhance: atlasPeopleBefore - api.state.players.p1.resources.people,
      natureSpentTotal: atlasNatureBefore - api.state.players.p1.resources.nature,
      enhanceDamage,
      defenderHpBefore,
      defenderHpAfter,
    },
  });

  const guardCard = api.cardCatalog.main["card_1782592972506"];
  const guardBuffAbility = (guardCard?.abilities || []).find((a) => a.effect === "optionalPayBuffOnDamageDealt");
  out.push({
    name: "guard_optional_pay_buff_on_damage_dealt_parsed",
    summary: {
      found: !!guardBuffAbility,
      resource: guardBuffAbility?.resource,
      amount: guardBuffAbility?.amount,
      atkBuff: guardBuffAbility?.atkBuff,
      hpBuff: guardBuffAbility?.hpBuff,
    },
  });

  reset();
  api.state.activePlayer = "p1";
  api.state.phase = "main";
  api.testing.setResources("p1", { funds: 10, people: 0, nature: 4, ore: 4, fuel: 0, electric: 0, magic: 0 });
  api.testing.placeUnit("card_1782592972506", "p1", 2, 2, { rested: false });
  api.testing.placeUnit("militia", "p2", 1, 2, { rested: true, hp: 20 });
  const guardUnit = api.state.board[2][2];
  const guardAtkBefore = guardUnit.atk;
  const guardHpBefore = guardUnit.currentHp;
  const guardFundsBefore = api.state.players.p1.resources.funds;
  api.testing.selectUnit(2, 2);
  api.testing.attack({ kind: "unit", row: 1, col: 2 });
  const pendingGuardBuff = api.state.pendingChoice?.type === "payForBuff"
    && api.state.pendingChoice?.triggerContext === "onDamageDealt";
  let guardBuffApplied = false;
  if (pendingGuardBuff) {
    guardBuffApplied = api.testing.resolvePayForBuff(true);
  }
  out.push({
    name: "guard_optional_pay_buff_on_damage_dealt_applies",
    summary: {
      pendingGuardBuff,
      guardBuffApplied,
      fundsSpent: guardFundsBefore - api.state.players.p1.resources.funds,
      atkAfter: api.state.board[2][2]?.atk,
      hpAfter: api.state.board[2][2]?.currentHp,
      atkGain: (api.state.board[2][2]?.atk ?? 0) - guardAtkBefore,
      hpGain: (api.state.board[2][2]?.currentHp ?? 0) - guardHpBefore,
    },
  });

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

  reset();
  api.state.players.p2.mainDeck = Array.from({ length: 5 }, (_, i) => ({
    id: `deck302-${i}`,
    type: "unit",
    name: i === 0 ? "王国勇者テスト" : `Filler${i}`,
    tags: i === 0 ? ["王国勇者主義"] : [],
    cost: {},
    hp: 1,
    atk: 0,
  }));
  api.testing.placeUnit("card_1782239599000", "p2", 1, 0, { rested: false });
  api.testing.placeUnit("militia", "p1", 2, 0, { rested: false });
  api.testing.selectUnit(2, 0);
  api.testing.attack({ kind: "unit", row: 1, col: 0 });
  const pendingReveal = api.state.pendingChoice?.type === "revealPick";
  const attackerPendingRest = api.state.board[2][0].rested;
  let attackerRestedAfter = false;
  if (pendingReveal) {
    const tagIdx = api.state.pendingChoice.revealed.findIndex((c) => (c.tags || []).includes("王国勇者主義"));
    api.testing.resolveRevealPick(tagIdx >= 0 ? tagIdx : 0);
    attackerRestedAfter = api.state.board[2][0].rested;
  }
  out.push({
    name: "shock_battalion_attack_rests_attacker",
    summary: { pendingReveal, attackerPendingRest, attackerRestedAfter },
  });

  const longTermCard = api.testing.catalogCard("card_1782304306296");
  const longTermAbility = (longTermCard?.abilities || []).find((a) => a.effect === "longTermInvestmentPlay");
  out.push({
    name: "long_term_investment_parsed",
    summary: { found: !!longTermAbility },
  });

  reset();
  api.testing.setResources("p1", highResources);
  api.state.players.p1.hand = [];
  api.state.players.p1.mainDeck = Array.from({ length: 10 }, (_, i) => ({ id: `lt${i}`, name: `LT${i}`, type: "unit" }));
  const investmentHandIdx = api.testing.addHandCard("p1", "card_1782304306296");
  api.testing.playTactFromHand(investmentHandIdx);
  api.testing.endTurn();
  api.testing.endTurn();
  out.push({
    name: "long_term_investment_draw_bonus",
    summary: {
      handCount: api.state.players.p1.hand.length,
      expectedDraw: api.state.players.p1.core.draw + 2,
    },
  });

  reset();
  api.state.activePlayer = "p1";
  api.state.phase = "main";
  api.testing.setResources("p1", highResources);
  api.testing.placeUnit("guardian", "p2", 0, 5, { rested: true });
  api.testing.placeUnit("mageBattery", "p1", 2, 5, { rested: false });
  const guardedCoreHpBefore = api.state.players.p2.core.hp;
  api.testing.selectUnit(2, 5);
  api.testing.attack({ kind: "core", playerId: "p2" });
  out.push({
    name: "guard_on_summon_row_blocks_core",
    summary: {
      coreHpBefore: guardedCoreHpBefore,
      coreHpAfter: api.state.players.p2.core.hp,
    },
  });

  reset();
  api.state.activePlayer = "p1";
  api.state.phase = "main";
  api.testing.setResources("p1", highResources);
  api.testing.placeUnit("guardian", "p2", 0, 8, { rested: true });
  api.testing.placeUnit("mageBattery", "p1", 2, 5, { rested: false });
  const distantGuardCoreHpBefore = api.state.players.p2.core.hp;
  api.testing.selectUnit(2, 5);
  api.testing.attack({ kind: "core", playerId: "p2" });
  out.push({
    name: "guard_far_from_core_does_not_block",
    summary: {
      coreHpBefore: distantGuardCoreHpBefore,
      coreHpAfter: api.state.players.p2.core.hp,
      coreDamaged: distantGuardCoreHpBefore > api.state.players.p2.core.hp,
    },
  });

  reset();
  api.testing.setResources("p1", { ore: 5, magic: 5, funds: 0, people: 0, nature: 0, fuel: 0, electric: 0 });
  const deckGolem = api.testing.catalogCard("card_1753611186441");
  if (deckGolem) {
    api.state.players.p1.mainDeck = [{ ...deckGolem, instanceId: 91001 }];
    api.state.players.p1.dump = [{ ...deckGolem, id: "dump-golem", instanceId: 91002 }];
    api.state.players.p1.structs = [{
      id: "card_1753660736818",
      name: "覆没の大暴走",
      type: "struct",
      rested: false,
      abilities: [{
        trigger: "onStructurePhase",
        effect: "chooseSummonGolem",
        maxCost: 3,
        deckOnly: true,
        costOptions: [
          { resource: "ore", amount: 2 },
          { resource: "magic", amount: 1 },
        ],
      }],
    }];
    api.state.pendingStructPhase = {
      playerId: "p1",
      activatedIndexes: [],
      activatedTactIndexes: [],
      resourcesBefore: { ...api.state.players.p1.resources },
      handBefore: api.state.players.p1.hand.length,
    };
    api.state.phase = "structure";
    api.state.activePlayer = "p1";
    const oreBefore = api.state.players.p1.resources.ore;
    api.testing.activateStructInPhase(0);
    const pendingChoice = !!api.state.pendingStructPhase?.pendingResourceChoice;
    if (pendingChoice) api.testing.resolveMarketChoice("ore");
    out.push({
      name: "fumetsu_golem_summon_from_deck_only",
      summary: {
        pendingChoice,
        oreBefore,
        oreAfter: api.state.players.p1.resources.ore,
        deckLen: api.state.players.p1.mainDeck.length,
        dumpLen: api.state.players.p1.dump.length,
        structRested: api.state.players.p1.structs[0]?.rested,
        summonedFromDeck: api.state.players.p1.mainDeck.length === 0,
        dumpUntouched: api.state.players.p1.dump.length === 1,
      },
    });
  } else {
    out.push({ name: "fumetsu_golem_summon_from_deck_only", summary: { skipped: true } });
  }

  reset();
  api.testing.setResources("p1", { ore: 5, magic: 5, funds: 0, people: 0, nature: 0, fuel: 0, electric: 0 });
  api.state.players.p1.structs = [{
    id: "card_1753661462969",
    name: "覆没の迷宮",
    type: "struct",
    rested: false,
    abilities: [{ trigger: "onStructurePhase", effect: "produceResource", resource: "magic", amount: 3 }],
  }];
  const overlayHandIdx = api.testing.addHandCard("p1", "card_1753660736818");
  api.state.phase = "main";
  api.state.activePlayer = "p1";
  api.testing.playTactFromHand(overlayHandIdx);
  const overlaidStruct = api.state.players.p1.structs[0];
  const faceEffects = (overlaidStruct?.abilities || []).map((a) => a.effect);
  out.push({
    name: "tact_overlay_suppresses_base_struct",
    summary: {
      structCount: api.state.players.p1.structs.length,
      overlayId: overlaidStruct?.id,
      underlyingName: overlaidStruct?.underlyingStruct?.name,
      faceEffects,
      baseProduceSuppressed: !faceEffects.includes("produceResource"),
      baseStoredUnderneath: overlaidStruct?.underlyingStruct?.name === "覆没の迷宮",
    },
  });

  reset();
  if (api.cardCatalog.main["card_1782236231218"] && api.cardCatalog.main["card_1782500000000"]) {
    api.testing.placeUnit("card_1782236231218", "p1", 2, 2);
    api.testing.placeUnit("card_1782500000000", "p1", 2, 1);
    api.testing.placeUnit("card_1782500000000", "p1", 2, 3);
    delete api.state.board[2][2].text;
    delete api.state.board[2][2].description;
    api.state.board[2][1].tags = [];
    api.state.board[2][3].tags = [];
    api.testing.refreshContinuousEffects();
    const buffed = api.state.board[2][2];
    out.push({
      name: "adjacent_tag_buff_catalog_fallback",
      summary: {
        atk: buffed?.atk,
        maxHp: buffed?.maxHp,
        buffActive: Boolean(buffed?.continuousBuffs && Object.keys(buffed.continuousBuffs).some((k) => k.startsWith("adjTagBuff_"))),
      },
    });
  } else {
    out.push({ name: "adjacent_tag_buff_catalog_fallback", summary: { skipped: true } });
  }

  reset();
  if (api.cardCatalog.main["card_1782236231218"] && api.cardCatalog.main["card_1782500000000"]) {
    api.testing.placeUnit("card_1782236231218", "p1", 2, 2);
    api.testing.placeUnit("card_1782500000000", "p1", 2, 1);
    api.testing.placeUnit("card_1782500000000", "p1", 2, 3);
    api.testing.refreshContinuousEffects();
    const buffed = api.state.board[2][2];
    out.push({
      name: "adjacent_tag_buff_stats_display",
      summary: {
        atk: buffed?.atk,
        hp: buffed?.hp,
        maxHp: buffed?.maxHp,
        currentHp: buffed?.currentHp,
        statsText: api.testing.formatUnitStatsText(buffed),
        buffActive: Boolean(buffed?.continuousBuffs && Object.keys(buffed.continuousBuffs).some((k) => k.startsWith("adjTagBuff_"))),
      },
    });
  } else {
    out.push({ name: "adjacent_tag_buff_stats_display", summary: { skipped: true } });
  }

  const mobilizationCard = api.cardCatalog.main["card_1782682744095"];
  const mobilizationAbility = (mobilizationCard?.abilities || []).find((a) => a.effect === "tactPayRestDraw");
  out.push({
    name: "mobilization_plan_parsed",
    summary: {
      found: !!mobilizationAbility,
      cost: mobilizationAbility?.cost,
      draw: mobilizationAbility?.draw,
    },
  });

  reset();
  api.testing.setResources("p1", { funds: 3, people: 0, nature: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  api.state.players.p1.mainDeck = Array.from({ length: 5 }, (_, i) => ({ id: `mob-${i}`, name: `Deck${i}`, type: "unit" }));
  const mobilizationHandIdx = api.testing.addHandCard("p1", "card_1782682744095");
  api.testing.playTactFromHand(mobilizationHandIdx);
  const tactIdx = api.state.players.p1.tactZone.findIndex((c) => c.id === "card_1782682744095");
  const fundsBefore = api.state.players.p1.resources.funds;
  const handBefore = api.state.players.p1.hand.length;
  const deckBefore = api.state.players.p1.mainDeck.length;
  if (tactIdx >= 0) api.testing.activatePermanentTact(tactIdx);
  out.push({
    name: "mobilization_plan_draw_on_activate",
    summary: {
      fundsBefore,
      fundsAfter: api.state.players.p1.resources.funds,
      handBefore,
      handAfter: api.state.players.p1.hand.length,
      deckBefore,
      deckAfter: api.state.players.p1.mainDeck.length,
      tactRested: api.state.players.p1.tactZone[tactIdx]?.rested,
    },
  });

  const tacticalBombCard = api.cardCatalog.main["card_1782776308523"];
  const tacticalBombAbility = (tacticalBombCard?.abilities || []).find((a) => a.effect === "tacticalBombardmentPlay");
  out.push({
    name: "tactical_bombardment_parsed",
    summary: {
      found: !!tacticalBombAbility,
      permanentTact: tacticalBombCard?.tactSubType === "永続" || tacticalBombCard?.tags?.includes("永続"),
    },
  });

  reset();
  api.state.phase = "main";
  api.state.activePlayer = "p1";
  api.testing.setResources("p1", { fuel: 10, ore: 10, people: 0, nature: 0, funds: 10, electric: 0, magic: 0 });
  api.testing.setResources("p2", { fuel: 0, ore: 0, people: 0, nature: 0, funds: 0, electric: 0, magic: 0 });
  api.testing.placeUnit("militia", "p2", 1, 0, { rested: false });
  const enemyHpBefore = api.state.board[1][0].currentHp;
  const tactHandIdx = api.testing.addHandCard("p1", "card_1782776308523");
  api.testing.playTactFromHand(tactHandIdx);
  const tbTactIdx = api.state.players.p1.tactZone.findIndex((c) => c.id === "card_1782776308523");
  const fuelBeforeBomb = api.state.players.p1.resources.fuel;
  if (tbTactIdx >= 0) api.testing.activatePermanentTact(tbTactIdx);
  const modePending = api.state.pendingChoice?.type === "tacticalBombardment" && api.state.pendingChoice?.step === "chooseMode";
  if (modePending) api.testing.resolveTacticalBombardmentMode("unitBomb");
  const targetPending = api.state.pendingTarget?.ability?.effect === "tacticalBombUnitStrike";
  if (targetPending) api.testing.resolveTarget(1, 0);
  const enemyAfter = api.state.board[1][0];
  out.push({
    name: "tactical_bombardment_unit_mode",
    summary: {
      modePending,
      targetPending,
      fuelSpent: fuelBeforeBomb - api.state.players.p1.resources.fuel,
      enemyHpBefore,
      enemyHpAfter: enemyAfter?.currentHp,
      enemyRested: enemyAfter?.rested,
      tactRested: api.state.players.p1.tactZone[tbTactIdx]?.rested,
    },
  });

  reset();
  api.state.phase = "main";
  api.state.activePlayer = "p1";
  api.testing.setResources("p1", { fuel: 10, ore: 10, people: 0, nature: 0, funds: 10, electric: 0, magic: 0 });
  api.state.players.p2.structs = [{
    id: "card_1755656642598",
    name: "荒涼宮殿",
    type: "struct",
    rested: false,
  }, {
    id: "card_1755654825932",
    name: "寂滅の地",
    type: "struct",
    rested: false,
  }];
  const tactHandIdx2 = api.testing.addHandCard("p1", "card_1782776308523");
  api.testing.playTactFromHand(tactHandIdx2);
  const tbStructTactIdx = api.state.players.p1.tactZone.findIndex((c) => c.id === "card_1782776308523");
  const oreBefore = api.state.players.p1.resources.ore;
  const fuelBeforeStruct = api.state.players.p1.resources.fuel;
  if (tbStructTactIdx >= 0) api.testing.activatePermanentTact(tbStructTactIdx);
  if (api.state.pendingChoice?.step === "chooseMode") api.testing.resolveTacticalBombardmentMode("structRest");
  if (api.state.pendingChoice?.step === "pickStructs") api.testing.resolveTacticalBombStructChoice(0);
  out.push({
    name: "tactical_bombardment_struct_rest",
    summary: {
      oreSpent: oreBefore - api.state.players.p1.resources.ore,
      fuelSpent: fuelBeforeStruct - api.state.players.p1.resources.fuel,
      struct0Rested: api.state.players.p2.structs[0]?.rested,
      struct0Lock: api.state.players.p2.structs[0]?.tacticalRestBy,
    },
  });

  const militaryBandCard = api.cardCatalog.main["card_1782777924727"];
  const bandActivate = (militaryBandCard?.abilities || []).find(
    (a) => a.trigger === "onActivate" && a.effect === "buffFriendlyUnitsAtk",
  );
  out.push({
    name: "military_band_parsed",
    summary: {
      found: !!bandActivate,
      amount: bandActivate?.amount,
      hasAmbushText: (militaryBandCard?.description || "").includes("潜伏"),
    },
  });

  reset();
  api.state.phase = "main";
  api.state.activePlayer = "p1";
  api.testing.setResources("p1", { fuel: 0, ore: 0, people: 0, nature: 0, funds: 10, electric: 0, magic: 0 });
  const band = api.testing.placeUnit("card_1782777924727", "p1", 2, 2, { rested: false });
  const ally = api.testing.placeUnit("militia", "p1", 2, 0, { rested: false });
  const allyAtkBefore = ally.atk;
  api.testing.selectUnit(2, 2);
  api.testing.activateSelectedUnit();
  const allyAfter = api.state.board[2][0];
  out.push({
    name: "military_band_atk_buff",
    summary: {
      bandRested: api.state.board[2][2]?.rested,
      ambushKeyword: Boolean(band?.keywords?.some?.((k) => k?.type === "ambush" || k === "ambush")),
      allyAtkBefore,
      allyAtkAfter: allyAfter?.atk,
    },
  });

  reset();
  api.state.phase = "main";
  api.state.activePlayer = "p1";
  api.testing.setResources("p1", { fuel: 10, ore: 0, people: 0, nature: 0, funds: 10, electric: 0, magic: 0 });
  api.testing.placeUnit("card_1782777924727", "p2", 1, 0, { rested: false });
  const ambushHpBefore = api.state.board[1][0].currentHp;
  const tactHandIdx3 = api.testing.addHandCard("p1", "card_1782776308523");
  api.testing.playTactFromHand(tactHandIdx3);
  const tbAmbushTactIdx = api.state.players.p1.tactZone.findIndex((c) => c.id === "card_1782776308523");
  if (tbAmbushTactIdx >= 0) api.testing.activatePermanentTact(tbAmbushTactIdx);
  if (api.state.pendingChoice?.step === "chooseMode") api.testing.resolveTacticalBombardmentMode("unitBomb");
  if (api.state.pendingTarget) api.testing.resolveTarget(1, 0);
  out.push({
    name: "ambush_blocks_effect_targeting",
    summary: {
      hpBefore: ambushHpBefore,
      hpAfter: api.state.board[1][0]?.currentHp,
      stillHidden: !api.state.board[1][0]?.ambushRevealed,
      pendingTargetCleared: !api.state.pendingTarget,
    },
  });

  const notionCard = api.cardCatalog.main["card_1782818887721"];
  const notionAbilities = notionCard?.abilities || [];
  out.push({
    name: "notion_artillery_parsed",
    summary: {
      found: notionAbilities.some((a) => a.trigger === "onAttack" && a.effect === "payEnemyAttackCostsAndRest"),
      charge: (notionCard?.keywords || []).some((k) => k.id === "charge"),
      multiAttack: (notionCard?.keywords || []).some((k) => k.id === "multiAttack"),
      indirectFire: (notionCard?.keywords || []).some((k) => k.id === "indirectFire"),
      hp: notionCard?.hp,
    },
  });

  reset();
  api.state.phase = "main";
  api.state.activePlayer = "p1";
  api.testing.setResources("p1", { funds: 10, fuel: 10, electric: 10, people: 0, nature: 0, ore: 0, magic: 0 });
  const notionFundsBefore = api.state.players.p1.resources.funds;
  const notionFuelBefore = api.state.players.p1.resources.fuel;
  api.testing.placeUnit("card_1782818887721", "p1", 2, 1, { rested: false });
  api.testing.placeUnit("militia", "p2", 1, 1, { rested: false });
  api.testing.placeUnit("armoredCar", "p2", 1, 0, { rested: false });
  api.testing.placeUnit("militia", "p2", 1, 2, { rested: true });
  api.testing.selectUnit(2, 1);
  api.testing.attack({ kind: "unit", row: 1, col: 1 });
  if (api.state.pendingChoice?.type === "chargeAttack") api.testing.resolveChargeAttack(false);
  if (api.state.pendingChoice?.type === "payEnemyAttackCostsAndRest") api.testing.resolvePayEnemyAttackCostsAndRest(true);
  out.push({
    name: "notion_artillery_pay_and_rest",
    summary: {
      choiceType: api.state.pendingChoice?.type || null,
      primaryRested: api.state.board[1][1]?.rested,
      primaryLock: api.state.board[1][1]?.lockedRestTurns,
      adjacentRested: api.state.board[1][0]?.rested,
      adjacentLock: api.state.board[1][0]?.lockedRestTurns,
      restedAdjacentSkipped: api.state.board[1][2]?.rested === true && !api.state.board[1][2]?.lockedRestTurns,
      fundsSpent: notionFundsBefore - api.state.players.p1.resources.funds,
      fuelSpent: notionFuelBefore - api.state.players.p1.resources.fuel,
    },
  });

  const nobleAssemblyCard = api.cardCatalog.main["card_1782817772003"];
  const nobleAssemblyAbility = (nobleAssemblyCard?.abilities || []).find((a) => a.effect === "searchDeckPick");
  out.push({
    name: "noble_assembly_parsed",
    summary: {
      found: !!nobleAssemblyAbility,
      tagContains: nobleAssemblyAbility?.filters?.[0]?.tagContains,
      restTact: nobleAssemblyAbility?.restTact,
      permanent: nobleAssemblyCard?.tactSubType === "永続",
    },
  });

  reset();
  api.testing.setResources("p1", { funds: 5, people: 5, nature: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  api.state.players.p1.mainDeck = [
    { id: "card_1782651169572", name: "エレナ＝アンドート", type: "unit", tags: ["王政ウルダニア", "探究派貴族", "純人間", "魔法"], cost: { human: 2, gold: 3, magic: 1 } },
    { id: "card_1782500000000", name: "北東軍第65歩兵大隊", type: "unit", tags: ["アトラス北東軍", "歩兵"], cost: { human: 2 } },
  ];
  const nobleHandIdx = api.testing.addHandCard("p1", "card_1782817772003");
  api.testing.playTactFromHand(nobleHandIdx);
  const nobleTactIdx = api.state.players.p1.tactZone.findIndex((c) => c.id === "card_1782817772003");
  const nobleHandBefore = api.state.players.p1.hand.length;
  const nobleDeckBefore = api.state.players.p1.mainDeck.length;
  if (nobleTactIdx >= 0) api.testing.activatePermanentTact(nobleTactIdx);
  const nobleCandidates = api.state.pendingChoice?.candidates?.length || 0;
  if (api.state.pendingChoice?.type === "searchDeckPick") api.testing.resolveSearchDeckPick(0);
  out.push({
    name: "noble_assembly_tag_contains_search",
    summary: {
      pendingType: nobleCandidates ? "searchDeckPick" : api.state.pendingChoice?.type || null,
      candidateCount: nobleCandidates,
      pickedName: api.state.players.p1.hand.at(-1)?.name || null,
      handBefore: nobleHandBefore,
      handAfter: api.state.players.p1.hand.length,
      deckBefore: nobleDeckBefore,
      deckAfter: api.state.players.p1.mainDeck.length,
      tactRested: api.state.players.p1.tactZone[nobleTactIdx]?.rested,
    },
  });

  const speechCard = api.cardCatalog.main["card_1753659816385"];
  const speechAbility = (speechCard?.abilities || []).find((a) => a.effect === "searchDeckPick");
  out.push({
    name: "speech_parsed",
    summary: {
      found: !!speechAbility,
      tagContains: speechAbility?.filters?.[0]?.tagContains,
      maxCost: speechAbility?.filters?.[0]?.maxCost,
    },
  });

  reset();
  api.testing.setResources("p1", { funds: 5, people: 5, nature: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  api.state.players.p1.mainDeck = [
    { id: "card_1782500000000", name: "北東軍第65歩兵大隊", type: "unit", tags: ["アトラス北東軍", "歩兵"], cost: { people: 2 } },
    { id: "card_1782651169572", name: "エレナ＝アンドート", type: "unit", tags: ["王政ウルダニア", "探究派貴族", "純人間", "魔法"], cost: { people: 2, funds: 3, magic: 1 } },
  ];
  const speechHandIdx = api.testing.addHandCard("p1", "card_1753659816385");
  const speechHandBefore = api.state.players.p1.hand.length;
  const speechDeckBefore = api.state.players.p1.mainDeck.length;
  api.testing.playTactFromHand(speechHandIdx);
  const speechPendingType = api.state.pendingChoice?.type || null;
  const speechCandidates = api.state.pendingChoice?.candidates?.length || 0;
  if (speechPendingType === "searchDeckPick") api.testing.resolveSearchDeckPick(0);
  out.push({
    name: "speech_deck_search_pick",
    summary: {
      pendingType: speechPendingType,
      candidateCount: speechCandidates,
      pickedName: api.state.players.p1.hand.at(-1)?.name || null,
      handAfter: api.state.players.p1.hand.length,
      handBefore: speechHandBefore,
      deckLoss: speechDeckBefore - api.state.players.p1.mainDeck.length,
      tactInDump: api.state.players.p1.dump.some((c) => c.id === "card_1753659816385"),
    },
  });

  const secondBabelCard = api.cardCatalog.structs["card_1782813364684"];
  const secondBabelAbilities = secondBabelCard?.abilities || [];
  const deckSearchAbility = secondBabelAbilities.find((a) => a.effect === "searchDeckPick");
  const resourceAbility = secondBabelAbilities.find((a) => a.effect === "chooseProduceResource");
  out.push({
    name: "second_babel_parsed",
    summary: {
      found: secondBabelAbilities.length === 2,
      deckPickCount: deckSearchAbility?.pickCount,
      resourceMaxPicks: resourceAbility?.maxPicks,
      filterTags: (deckSearchAbility?.filters || []).map((f) => f.tagContains),
      resourceOptions: (resourceAbility?.options || []).length,
    },
  });

  reset();
  api.state.players.p1.mainDeck = [
    { id: "earth1", name: "地球カードA", type: "tact", tags: ["地球"], cost: { ore: 1 } },
    { id: "earth2", name: "地球カードB", type: "tact", tags: ["地球"], cost: { ore: 1 } },
    { id: "babel1", name: "バベルカード", type: "unit", tags: ["バベル・インダストリー"], cost: { people: 1 } },
  ];
  api.state.players.p1.structs = [{
    id: "card_1782813364684",
    name: "セカンド・バベル",
    type: "struct",
    rested: false,
    abilities: secondBabelAbilities,
  }];
  api.state.pendingStructPhase = {
    playerId: "p1",
    activatedIndexes: [],
    activatedTactIndexes: [],
    resourcesBefore: { ...api.state.players.p1.resources },
    handBefore: api.state.players.p1.hand.length,
  };
  api.state.phase = "structure";
  api.state.activePlayer = "p1";
  const babelHandBefore = api.state.players.p1.hand.length;
  api.testing.activateStructInPhase(0);
  if (api.state.pendingChoice?.type === "chooseStructPhaseActivate") {
    api.testing.resolveChooseStructPhaseActivate("searchDeckPick");
  }
  if (api.state.pendingChoice?.type === "searchDeckPick") api.testing.resolveSearchDeckPick(0);
  if (api.state.pendingChoice?.type === "searchDeckPick") api.testing.resolveSearchDeckPick(0);
  out.push({
    name: "second_babel_deck_search",
    summary: {
      structRested: api.state.players.p1.structs[0]?.rested,
      handGain: api.state.players.p1.hand.length - babelHandBefore,
      deckLoss: 3 - api.state.players.p1.mainDeck.length,
      pickedNames: api.state.players.p1.hand.slice(babelHandBefore).map((c) => c.name),
    },
  });

  reset();
  api.testing.setResources("p1", { funds: 0, people: 0, nature: 0, ore: 0, fuel: 0, electric: 0, magic: 3 });
  api.state.players.p1.structs = [{
    id: "card_1782813364684",
    name: "セカンド・バベル",
    type: "struct",
    rested: false,
    abilities: secondBabelAbilities,
  }];
  api.state.pendingStructPhase = {
    playerId: "p1",
    activatedIndexes: [],
    activatedTactIndexes: [],
    resourcesBefore: { ...api.state.players.p1.resources },
    handBefore: api.state.players.p1.hand.length,
  };
  api.state.phase = "structure";
  api.state.activePlayer = "p1";
  const babelPeopleBefore = api.state.players.p1.resources.people;
  const babelMagicBefore = api.state.players.p1.resources.magic;
  api.testing.activateStructInPhase(0);
  if (api.state.pendingChoice?.type === "chooseStructPhaseActivate") {
    api.testing.resolveChooseStructPhaseActivate("chooseProduceResource");
  }
  if (api.state.pendingStructPhase?.pendingResourceChoice) {
    api.testing.resolveMarketChoice("people");
    api.testing.resolveMarketChoice("ore");
  }
  out.push({
    name: "second_babel_resource_pick",
    summary: {
      structRested: api.state.players.p1.structs[0]?.rested,
      peopleGain: api.state.players.p1.resources.people - babelPeopleBefore,
      oreGain: api.state.players.p1.resources.ore,
      magicSpent: babelMagicBefore - api.state.players.p1.resources.magic,
    },
  });

  const fruitGodCard = api.cardCatalog.main["card_1782802249493"];
  const fruitGodAbilities = fruitGodCard?.abilities || [];
  out.push({
    name: "wrathful_fruit_god_parsed",
    summary: {
      found: fruitGodAbilities.some((a) => a.effect === "damageHighestEnemyUnitByOwnAtk"),
      onExileBuff: fruitGodAbilities.some((a) => a.trigger === "onExile" && a.effect === "buffFriendlyUnitsAtk"),
      onAttackedRest: fruitGodAbilities.some((a) => a.trigger === "onAttacked" && a.effect === "restAttacker"),
      effectPenetrate: (fruitGodCard?.keywords || []).some((k) => k.id === "effectPenetrate"),
    },
  });

  reset();
  api.state.phase = "main";
  api.state.activePlayer = "p1";
  api.testing.placeUnit("card_1753664991902", "p2", 1, 0);
  api.testing.placeUnit("card_1753664991902", "p2", 1, 1);
  api.state.board[1][0].atk = 2;
  api.state.board[1][1].atk = 7;
  const highHpBefore = api.state.board[1][1].currentHp;
  const lowHpBefore = api.state.board[1][0].currentHp;
  const fruitGodUnit = api.testing.placeUnit("card_1782802249493", "p1", 2, 2);
  for (const ability of fruitGodUnit.abilities || []) {
    if (ability.trigger === "onSummon") {
      api.state.effectQueue.push({ playerId: "p1", card: fruitGodUnit, ability, source: {} });
    }
  }
  api.testing.processEffectQueue();
  out.push({
    name: "wrathful_fruit_god_on_summon_damage",
    summary: {
      highHpBefore,
      highHpAfter: api.state.board[1][1]?.currentHp,
      lowHpBefore,
      lowHpAfter: api.state.board[1][0]?.currentHp,
    },
  });

  reset();
  api.state.phase = "main";
  api.testing.placeUnit("card_1753664991902", "p1", 2, 0);
  const wfgAllyAtkBefore = api.state.board[2][0].atk;
  const exiledGod = api.testing.placeUnit("card_1782802249493", "p1", 2, 1);
  api.state.board[2][1] = null;
  for (const ability of exiledGod.abilities || []) {
    if (ability.trigger === "onExile") {
      api.state.effectQueue.push({ playerId: "p1", card: exiledGod, ability, source: {} });
    }
  }
  api.testing.processEffectQueue();
  out.push({
    name: "wrathful_fruit_god_on_exile_buff",
    summary: {
      allyAtkBefore: wfgAllyAtkBefore,
      allyAtkAfter: api.state.board[2][0]?.atk,
    },
  });

  reset();
  api.state.phase = "main";
  api.state.activePlayer = "p1";
  api.testing.setResources("p1", { people: 10, nature: 10, funds: 10, ore: 10, fuel: 10, electric: 10, magic: 10 });
  api.testing.placeUnit("card_1782802249493", "p2", 1, 1);
  api.testing.placeUnit("card_1753664991902", "p1", 2, 1, { rested: false });
  api.testing.selectUnit(2, 1);
  api.testing.attack({ row: 1, col: 1 });
  out.push({
    name: "wrathful_fruit_god_on_attacked_rest",
    summary: {
      attackerRested: api.state.board[2][1]?.rested === true,
    },
  });

  const tsunataiCard = api.cardCatalog.main["card_1782803110038"];
  out.push({
    name: "tsunatai_rite_parsed",
    summary: {
      found: (tsunataiCard?.abilities || []).some((a) => a.effect === "tsunataiRitePlay"),
      zeroAtk: (tsunataiCard?.abilities || []).some((a) => a.effect === "tsunataiRitePlay" && a.zeroAtk),
    },
  });

  reset();
  api.state.phase = "main";
  api.state.activePlayer = "p1";
  api.testing.setResources("p1", { people: 10, nature: 10, funds: 10, ore: 10, fuel: 10, electric: 10, magic: 10 });
  const tsunGodHandIdx = api.testing.addHandCard("p1", "card_1782802249493");
  const tsunTactHandIdx = api.testing.addHandCard("p1", "card_1782803110038");
  api.testing.playTactFromHand(tsunTactHandIdx);
  if (api.state.pendingChoice?.type === "tsunataiRiteHand") {
    api.testing.resolveTsunataiRiteChoice(tsunGodHandIdx);
  }
  const summonedGod = api.state.board.flat().find((u) => u?.id === "card_1782802249493");
  out.push({
    name: "tsunatai_rite_summon_zero_atk",
    summary: {
      choicePending: api.state.pendingChoice?.type === "tsunataiRiteHand",
      summoned: !!summonedGod,
      summonedAtk: summonedGod?.atk,
      fuelSpent: 10 - (api.state.players.p1.resources.fuel || 0),
      magicSpent: 10 - (api.state.players.p1.resources.magic || 0),
    },
  });

  const namelessGodCard = api.cardCatalog.main["card_1782804595225"];
  out.push({
    name: "nameless_god_parsed",
    summary: {
      onSummonAoE: (namelessGodCard?.abilities || []).some(
        (a) => a.trigger === "onSummon" && a.effect === "damageAllEnemyUnits" && a.amount === 3,
      ),
      onDamagedAoE: (namelessGodCard?.abilities || []).some(
        (a) => a.trigger === "onDamageReceived" && a.effect === "damageAllEnemyUnits" && a.amount === 5,
      ),
    },
  });

  reset();
  api.state.phase = "main";
  api.state.activePlayer = "p1";
  api.testing.placeUnit("card_1753664991902", "p2", 1, 0);
  api.testing.placeUnit("card_1753664991902", "p2", 1, 1);
  const ngE1HpBefore = api.state.board[1][0].currentHp;
  const ngE2HpBefore = api.state.board[1][1].currentHp;
  const namelessGod = api.testing.placeUnit("card_1782804595225", "p1", 2, 2);
  for (const ability of namelessGod.abilities || []) {
    if (ability.trigger === "onSummon" && ability.effect === "damageAllEnemyUnits") {
      api.state.effectQueue.push({ playerId: "p1", card: namelessGod, ability, source: {} });
    }
  }
  api.testing.processEffectQueue();
  out.push({
    name: "nameless_god_on_summon_aoe",
    summary: {
      ngE1HpBefore,
      ngE1HpAfter: api.state.board[1][0]?.currentHp,
      ngE2HpBefore,
      ngE2HpAfter: api.state.board[1][1]?.currentHp,
    },
  });

  reset();
  api.state.phase = "main";
  api.testing.placeUnit("card_1753664991902", "p2", 1, 0);
  api.testing.placeUnit("card_1753664991902", "p2", 1, 1);
  const ngDamE1Before = api.state.board[1][0].currentHp;
  const ngDamE2Before = api.state.board[1][1].currentHp;
  const damagedGod = api.testing.placeUnit("card_1782804595225", "p1", 2, 2);
  for (const ability of damagedGod.abilities || []) {
    if (ability.trigger === "onDamageReceived" && ability.effect === "damageAllEnemyUnits") {
      api.state.effectQueue.push({ playerId: "p1", card: damagedGod, ability, source: { damage: 1 } });
    }
  }
  api.testing.processEffectQueue();
  out.push({
    name: "nameless_god_on_damaged_aoe",
    summary: {
      ngDamE1Before,
      ngDamE1HpAfter: api.state.board[1][0]?.currentHp,
      ngDamE2Before,
      ngDamE2HpAfter: api.state.board[1][1]?.currentHp,
    },
  });

  const babelClerkCard = api.cardCatalog.main["card_1782810886587"];
  const babelClerkAbilities = babelClerkCard?.abilities || [];
  out.push({
    name: "babel_third_class_clerk_parsed",
    summary: {
      noAttack: (babelClerkCard?.keywords || []).some((k) => k.id === "noAttack"),
      drawOnSummon: babelClerkAbilities.some((a) => a.trigger === "onSummon" && a.effect === "drawCards" && a.amount === 1),
      electricOnSummon: babelClerkAbilities.some(
        (a) => a.trigger === "onSummon" && a.effect === "gainResource" && a.resource === "electric" && a.amount === 1,
      ),
    },
  });

  reset();
  api.state.phase = "main";
  api.state.activePlayer = "p1";
  api.testing.setResources("p1", { people: 10, nature: 10, funds: 10, ore: 10, fuel: 10, electric: 10, magic: 10 });
  const babelClerkDeckBefore = api.state.players.p1.mainDeck.length;
  const babelClerkHandBefore = api.state.players.p1.hand.length;
  const babelClerkElectricBefore = api.state.players.p1.resources.electric || 0;
  const clerk = api.testing.placeUnit("card_1782810886587", "p1", 2, 2);
  for (const ability of clerk.abilities || []) {
    if (ability.trigger === "onSummon") {
      api.state.effectQueue.push({ playerId: "p1", card: clerk, ability, source: {} });
    }
  }
  api.testing.processEffectQueue();
  out.push({
    name: "babel_third_class_clerk_on_summon",
    summary: {
      deckAfter: api.state.players.p1.mainDeck.length,
      handAfter: api.state.players.p1.hand.length,
      electricAfter: api.state.players.p1.resources.electric || 0,
      deckBefore: babelClerkDeckBefore,
      handBefore: babelClerkHandBefore,
      electricBefore: babelClerkElectricBefore,
    },
  });

  reset();
  api.testing.placeUnit("card_1755671140352", "p1", 3, 0);
  api.testing.placeUnit("militia", "p2", 0, 1);
  api.state.activePlayer = "p2";
  const sadBlockedHandIdx = api.testing.addHandCard("p2", "lightInfantry");
  const sadBlockedSummon = api.testing.summonFromHand(sadBlockedHandIdx, 0, 0);
  const sadAllowedHandIdx = api.testing.addHandCard("p2", "armoredCar");
  const sadAllowedSummon = api.testing.summonFromHand(sadAllowedHandIdx, 0, 2);
  out.push({
    name: "sad_girl_play_cost_lock",
    summary: {
      blockedSameCost: sadBlockedSummon === false,
      allowedDifferentCost: sadAllowedSummon === true,
      blockedUnitStillInHand: !!api.state.players.p2.hand[sadBlockedHandIdx],
      allowedUnitOnBoard: !!api.state.board[0][2],
    },
  });

  reset();
  api.testing.placeUnit("militia", "p2", 0, 1);
  api.state.activePlayer = "p2";
  const sadNoAuraHandIdx = api.testing.addHandCard("p2", "lightInfantry");
  const sadNoAuraSummon = api.testing.summonFromHand(sadNoAuraHandIdx, 0, 0);
  out.push({
    name: "sad_girl_play_cost_lock_inactive_without_sad_girl",
    summary: {
      summonOk: sadNoAuraSummon === true,
      unitOnBoard: !!api.state.board[0][0],
    },
  });

  const kihaCard = api.cardCatalog.structs["card_1782681464783"];
  const kihaAbility = (kihaCard?.abilities || []).find((a) => a.effect === "structPayProduce");
  out.push({
    name: "kiha_eho_facility_parsed",
    summary: {
      found: !!kihaAbility,
      cost: kihaAbility?.cost,
      produces: kihaAbility?.produces,
    },
  });

  reset();
  api.testing.setResources("p1", { funds: 2, nature: 2, people: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  api.state.players.p1.structs = [{
    id: "card_1782681464783",
    name: "キハエーホ陸軍施設",
    type: "struct",
    rested: false,
    abilities: [{
      trigger: "onStructurePhase",
      effect: "structPayProduce",
      cost: { funds: 1, nature: 1 },
      produces: { people: 5 },
    }],
  }];
  api.state.pendingStructPhase = {
    playerId: "p1",
    activatedIndexes: [],
    activatedTactIndexes: [],
    resourcesBefore: { ...api.state.players.p1.resources },
    handBefore: api.state.players.p1.hand.length,
  };
  api.state.phase = "structure";
  api.state.activePlayer = "p1";
  const kihaFundsBefore = api.state.players.p1.resources.funds;
  const kihaNatureBefore = api.state.players.p1.resources.nature;
  const kihaPeopleBefore = api.state.players.p1.resources.people;
  api.testing.activateStructInPhase(0);
  out.push({
    name: "kiha_eho_facility_paid_produce",
    summary: {
      fundsBefore: kihaFundsBefore,
      fundsAfter: api.state.players.p1.resources.funds,
      natureBefore: kihaNatureBefore,
      natureAfter: api.state.players.p1.resources.nature,
      peopleBefore: kihaPeopleBefore,
      peopleAfter: api.state.players.p1.resources.people,
      structRested: api.state.players.p1.structs[0]?.rested,
    },
  });

  const refineryCard = api.cardCatalog.structs.refinery;
  const refineryAbility = (refineryCard?.abilities || []).find((a) => a.effect === "structPayProduce");
  out.push({
    name: "refinery_paid_produce_parsed",
    summary: {
      found: !!refineryAbility,
      cost: refineryAbility?.cost,
      produces: refineryAbility?.produces,
      hasFreeProduction: (refineryCard?.abilities || []).some((a) => a.effect === "produceResource"),
    },
  });

  reset();
  api.testing.setResources("p1", { funds: 0, nature: 2, people: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  api.state.players.p1.structs = [JSON.parse(JSON.stringify(refineryCard))];
  api.state.pendingStructPhase = {
    playerId: "p1",
    activatedIndexes: [],
    activatedTactIndexes: [],
    resourcesBefore: { ...api.state.players.p1.resources },
    handBefore: api.state.players.p1.hand.length,
  };
  api.state.phase = "structure";
  api.state.activePlayer = "p1";
  const refineryNatureBefore = api.state.players.p1.resources.nature;
  const refineryFuelBefore = api.state.players.p1.resources.fuel;
  api.testing.activateStructInPhase(0);
  out.push({
    name: "refinery_paid_produce",
    summary: {
      natureBefore: refineryNatureBefore,
      natureAfter: api.state.players.p1.resources.nature,
      fuelBefore: refineryFuelBefore,
      fuelAfter: api.state.players.p1.resources.fuel,
      structRested: api.state.players.p1.structs[0]?.rested,
    },
  });

  const farmCard = api.cardCatalog.structs["card_1782738882848"];
  const farmAbility = (farmCard?.abilities || []).find((a) => a.effect === "chooseProduceResource");
  out.push({
    name: "grand_farm_parsed",
    summary: {
      found: !!farmAbility,
      optionCount: farmAbility?.options?.length || 0,
      restOption: farmAbility?.options?.[0]?.produces?.nature,
      payOption: farmAbility?.options?.[1]?.produces?.nature,
    },
  });

  reset();
  api.testing.setResources("p1", { funds: 2, nature: 0, people: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  api.state.players.p1.structs = [{
    id: "card_1782738882848",
    name: "大農園",
    type: "struct",
    rested: false,
    abilities: farmAbility ? [farmAbility] : [],
  }];
  api.state.pendingStructPhase = {
    playerId: "p1",
    activatedIndexes: [],
    activatedTactIndexes: [],
    resourcesBefore: { ...api.state.players.p1.resources },
    handBefore: api.state.players.p1.hand.length,
  };
  api.state.phase = "structure";
  api.state.activePlayer = "p1";
  const farmNatureBefore = api.state.players.p1.resources.nature;
  api.testing.activateStructInPhase(0);
  if (api.state.pendingStructPhase?.pendingResourceChoice) {
    api.testing.resolveMarketChoice("rest_nature3");
  }
  out.push({
    name: "grand_farm_rest_choice",
    summary: {
      natureBefore: farmNatureBefore,
      natureAfter: api.state.players.p1.resources.nature,
      structRested: api.state.players.p1.structs[0]?.rested,
    },
  });

  const marketCard = api.cardCatalog.structs["card_1782736989649"];
  const marketAbility = (marketCard?.abilities || []).find((a) => a.effect === "chooseProduceResource");
  out.push({
    name: "grand_market_parsed",
    summary: {
      found: !!marketAbility,
      optionCount: marketAbility?.options?.length || 0,
      oreOption: marketAbility?.options?.find((opt) => opt.id === "ore")?.produces?.funds,
    },
  });

  reset();
  api.testing.setResources("p1", { funds: 0, nature: 0, people: 0, ore: 2, fuel: 0, electric: 0, magic: 0 });
  api.state.players.p1.structs = [{
    id: "card_1782736989649",
    name: "大市場",
    type: "struct",
    rested: false,
    abilities: marketAbility ? [marketAbility] : [],
  }];
  api.state.pendingStructPhase = {
    playerId: "p1",
    activatedIndexes: [],
    activatedTactIndexes: [],
    resourcesBefore: { ...api.state.players.p1.resources },
    handBefore: api.state.players.p1.hand.length,
  };
  api.state.phase = "structure";
  api.state.activePlayer = "p1";
  const marketOreBefore = api.state.players.p1.resources.ore;
  const marketFundsBefore = api.state.players.p1.resources.funds;
  api.testing.activateStructInPhase(0);
  if (api.state.pendingStructPhase?.pendingResourceChoice) {
    api.testing.resolveMarketChoice("ore");
  }
  out.push({
    name: "grand_market_ore_choice",
    summary: {
      oreBefore: marketOreBefore,
      oreAfter: api.state.players.p1.resources.ore,
      fundsBefore: marketFundsBefore,
      fundsAfter: api.state.players.p1.resources.funds,
      structRested: api.state.players.p1.structs[0]?.rested,
    },
  });

  const donaCard = api.cardCatalog.structs["card_1782226032497"];
  const donaAbility = (donaCard?.abilities || []).find((a) => a.effect === "structPayProduce");
  out.push({
    name: "dona_camp_parsed",
    summary: {
      found: !!donaAbility,
      cost: donaAbility?.cost,
      produces: donaAbility?.produces,
    },
  });

  const meikyuCard = api.cardCatalog.structs["card_1753661462969"];
  const meikyuAbility = (meikyuCard?.abilities || []).find((a) => a.effect === "structPayProduce");
  out.push({
    name: "fumetsu_meikyu_parsed",
    summary: {
      found: !!meikyuAbility,
      effect: meikyuAbility?.effect,
      cost: meikyuAbility?.cost,
      produces: meikyuAbility?.produces,
      hasChooseExchange: (meikyuCard?.abilities || []).some((a) => a.effect === "chooseExchange"),
    },
  });

  reset();
  api.testing.setResources("p1", { people: 2, funds: 0, nature: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  api.state.players.p1.structs = [{
    id: "card_1782226032497",
    name: "ドーナー強制収容所",
    type: "struct",
    rested: false,
    abilities: [{
      trigger: "onStructurePhase",
      effect: "structPayProduce",
      cost: { people: 1 },
      produces: { funds: 5 },
    }],
  }];
  api.state.pendingStructPhase = {
    playerId: "p1",
    activatedIndexes: [],
    activatedTactIndexes: [],
    resourcesBefore: { ...api.state.players.p1.resources },
    handBefore: api.state.players.p1.hand.length,
  };
  api.state.phase = "structure";
  api.state.activePlayer = "p1";
  const donaPeopleBefore = api.state.players.p1.resources.people;
  const donaFundsBefore = api.state.players.p1.resources.funds;
  api.testing.activateStructInPhase(0);
  out.push({
    name: "dona_camp_paid_produce",
    summary: {
      peopleBefore: donaPeopleBefore,
      peopleAfter: api.state.players.p1.resources.people,
      fundsBefore: donaFundsBefore,
      fundsAfter: api.state.players.p1.resources.funds,
      structRested: api.state.players.p1.structs[0]?.rested,
    },
  });

  reset();
  api.testing.setResources("p1", { people: 4, funds: 0, nature: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  api.state.players.p1.structs = [{
    id: "card_1753661462969",
    name: "覆没の迷宮",
    type: "struct",
    rested: false,
    abilities: [{
      trigger: "onStructurePhase",
      effect: "structPayProduce",
      cost: { people: 2 },
      produces: { magic: 1, ore: 2 },
    }],
  }];
  api.state.pendingStructPhase = {
    playerId: "p1",
    activatedIndexes: [],
    activatedTactIndexes: [],
    resourcesBefore: { ...api.state.players.p1.resources },
    handBefore: api.state.players.p1.hand.length,
  };
  api.state.phase = "structure";
  api.state.activePlayer = "p1";
  const meikyuPeopleBefore = api.state.players.p1.resources.people;
  const meikyuOreBefore = api.state.players.p1.resources.ore;
  const meikyuMagicBefore = api.state.players.p1.resources.magic;
  api.testing.activateStructInPhase(0);
  out.push({
    name: "fumetsu_meikyu_one_button",
    summary: {
      pendingChoice: !!api.state.pendingStructPhase?.pendingResourceChoice,
      peopleAfter: api.state.players.p1.resources.people,
      oreAfter: api.state.players.p1.resources.ore,
      magicAfter: api.state.players.p1.resources.magic,
      peopleBefore: meikyuPeopleBefore,
      oreBefore: meikyuOreBefore,
      magicBefore: meikyuMagicBefore,
      structRested: api.state.players.p1.structs[0]?.rested,
    },
  });

  api.cardCatalog.main["card_1782681464783"] = {
    id: "card_1782681464783",
    name: "キハエーホ陸軍施設",
    type: "tact",
    faction: "ユニフォール",
    tags: [],
    cost: {},
    actCost: {},
    text: "stale duplicate",
    flavor: "stale duplicate",
    keywords: [],
    abilities: [],
    limit: 4,
  };
  api.testing.importDeckmakerAllData({
    id: "card_1782681464783",
    name: "キハエーホ陸軍施設",
    type: "ストラクト",
    world: "ユニフォール",
    description: "金①自①を支払う：人⑤を得る",
    costs: {
      play: { gold: 1, human: 1, nature: 1, mineral: 0, fuel: 0, electric: 0, magic: 0 },
      act: {},
      choice: [],
      choiceAct: [],
    },
    generates: { gold: 0, human: 5, nature: 0, mineral: 0, fuel: 0, electric: 0, magic: 0 },
  });
  const kihaCatalogHits = [
    api.cardCatalog.main["card_1782681464783"],
    api.cardCatalog.structs["card_1782681464783"],
    api.cardCatalog.cores["card_1782681464783"],
  ].filter(Boolean);
  out.push({
    name: "kiha_eho_facility_import_dedupes_catalog",
    summary: {
      catalogHits: kihaCatalogHits.length,
      inStructs: !!api.cardCatalog.structs["card_1782681464783"],
      inMain: !!api.cardCatalog.main["card_1782681464783"],
      structType: api.cardCatalog.structs["card_1782681464783"]?.type,
    },
  });

  const mortarCard = api.cardCatalog.main["card_1782237267608"];
  const mortarVsInfantry = (mortarCard?.abilities || []).find((a) => a.effect === "vsTagAtkBonus" && a.vsTag === "歩兵");
  const artilleryCard = api.cardCatalog.main["card_1782307790847"];
  const artilleryVsInfantry = (artilleryCard?.abilities || []).find((a) => a.effect === "vsTagAtkBonus" && a.vsTag === "歩兵");
  out.push({
    name: "vs_tag_infantry_atk_bonus_parsed",
    summary: {
      mortarFound: !!mortarVsInfantry,
      mortarBonus: mortarVsInfantry?.atkBonus,
      artilleryFound: !!artilleryVsInfantry,
      artilleryBonus: artilleryVsInfantry?.atkBonus,
    },
  });

  reset();
  api.state.activePlayer = "p1";
  api.state.phase = "main";
  api.testing.setResources("p1", { nature: 5, people: 0, funds: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  if (api.cardCatalog.main["card_1782237267608"] && api.cardCatalog.main["card_1782500000000"]) {
    api.testing.placeUnit("card_1782237267608", "p1", 2, 2, { rested: false });
    api.state.board[2][2].abilities = [];
    api.testing.placeUnit("card_1782500000000", "p2", 1, 2, { rested: true, hp: 3 });
    api.state.board[1][2].tags = [];
    const defenderHpBefore = api.state.board[1][2].currentHp;
    api.testing.selectUnit(2, 2);
    api.testing.attack({ kind: "unit", row: 1, col: 2 });
    out.push({
      name: "vs_tag_infantry_atk_bonus_catalog_fallback",
      summary: {
        defenderHpBefore,
        defenderHpAfter: api.state.board[1][2]?.currentHp ?? 0,
        damageDealt: defenderHpBefore - (api.state.board[1][2]?.currentHp ?? 0),
      },
    });
  } else {
    out.push({ name: "vs_tag_infantry_atk_bonus_catalog_fallback", summary: { skipped: true } });
  }

  reset();
  api.state.activePlayer = "p1";
  api.state.phase = "main";
  api.testing.setResources("p1", { nature: 5, people: 0, funds: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  if (api.cardCatalog.main["card_1782237267608"] && api.cardCatalog.main["card_1782500000000"]) {
    api.testing.placeUnit("card_1782237267608", "p1", 2, 2, { rested: false });
    api.testing.placeUnit("card_1782500000000", "p2", 1, 2, { rested: true, hp: 3 });
    const defenderHpBefore = api.state.board[1][2].currentHp;
    api.testing.selectUnit(2, 2);
    api.testing.attack({ kind: "unit", row: 1, col: 2 });
    out.push({
      name: "vs_tag_infantry_atk_bonus_applies",
      summary: {
        defenderHpBefore,
        defenderHpAfter: api.state.board[1][2]?.currentHp ?? 0,
        damageDealt: defenderHpBefore - (api.state.board[1][2]?.currentHp ?? 0),
      },
    });
  } else {
    out.push({ name: "vs_tag_infantry_atk_bonus_applies", summary: { skipped: true } });
  }

  const surveyDeptCatalog = api.testing.catalogCard("card_1782739826805");
  const surveyVsMagic = (surveyDeptCatalog?.abilities || []).find((a) => a.effect === "vsMagicPlayCostAtkBonus");
  out.push({
    name: "survey_dept_vs_magic_play_cost_parsed",
    summary: {
      found: !!surveyVsMagic,
      atkBonus: surveyVsMagic?.atkBonus,
      hasShock: (surveyDeptCatalog?.keywords || []).includes("shock"),
      hasCharge: (surveyDeptCatalog?.keywords || []).includes("charge"),
    },
  });

  reset();
  api.state.activePlayer = "p1";
  api.state.phase = "main";
  api.testing.setResources("p1", { nature: 5, people: 0, funds: 0, ore: 0, fuel: 0, electric: 10, magic: 0 });
  if (api.cardCatalog.main["card_1782739826805"] && api.cardCatalog.main["card_1782641805941"]) {
    api.testing.placeUnit("card_1782739826805", "p1", 2, 2, { rested: false });
    api.testing.placeUnit("card_1782641805941", "p2", 1, 2, { rested: true, hp: 10 });
    const defenderHpBefore = api.state.board[1][2].currentHp;
    api.testing.selectUnit(2, 2);
    api.testing.attack({ kind: "unit", row: 1, col: 2 });
    out.push({
      name: "survey_dept_vs_magic_play_cost_applies",
      summary: {
        defenderHpBefore,
        defenderHpAfter: api.state.board[1][2]?.currentHp ?? 0,
        damageDealt: defenderHpBefore - (api.state.board[1][2]?.currentHp ?? 0),
      },
    });
  } else {
    out.push({ name: "survey_dept_vs_magic_play_cost_applies", summary: { skipped: true } });
  }

  const fieldLabCatalog = api.testing.catalogCard("card_1782741779575");
  const fieldLabOnSummon = (fieldLabCatalog?.abilities || []).find((a) => a.effect === "fieldExperimentOnSummon");
  out.push({
    name: "field_lab_on_summon_parsed",
    summary: {
      found: !!fieldLabOnSummon,
      trigger: fieldLabOnSummon?.trigger,
    },
  });

  reset();
  api.state.activePlayer = "p1";
  api.state.phase = "main";
  api.testing.setResources("p1", { funds: 5, people: 5, ore: 5, electric: 20, magic: 0, nature: 0, fuel: 0 });
  if (api.cardCatalog.main["card_1782741779575"] && api.cardCatalog.main["card_1782641805941"]) {
    const fieldLabIdx = api.testing.addHandCard("p1", "card_1782741779575");
    api.testing.addHandCard("p1", "card_1782641805941");
    api.testing.summonFromHand(fieldLabIdx, 2, 2);
    const pending = api.state.pendingChoice;
    out.push({
      name: "field_lab_summon_choice_offered",
      summary: {
        pendingType: pending?.type,
        step: pending?.step,
        eligibleCount: pending?.eligible?.length ?? 0,
      },
    });
    if (pending?.type === "fieldExperiment" && pending.eligible?.length) {
      const electricBefore = api.state.players.p1.resources.electric;
      const handEntry = pending.eligible[0];
      const expectedElectric = handEntry.handCard.cost
        ? Object.values(handEntry.handCard.cost).reduce((sum, amount) => sum + (amount || 0), 0)
        : 0;
      api.testing.resolveFieldExperimentHandUnit(handEntry.handIndex);
      const afterExile = api.state.pendingChoice;
      const exiledCount = api.state.players.p1.exileZone.filter((c) => c.name === handEntry.handCard.name).length;
      out.push({
        name: "field_lab_exile_and_grant_choice",
        summary: {
          electricSpent: electricBefore - api.state.players.p1.resources.electric,
          expectedElectric,
          exiledCount,
          stepAfterExile: afterExile?.step,
          babelTargetCount: afterExile?.babelTargets?.length ?? 0,
        },
      });
      if (afterExile?.step === "chooseBabelTarget" && afterExile.babelTargets?.length) {
        const targetBefore = afterExile.babelTargets[0].card.abilities?.length ?? 0;
        api.testing.resolveFieldExperimentBabelTarget(0);
        const targetAfter = api.state.board[2][2];
        out.push({
          name: "field_lab_grant_abilities",
          summary: {
            abilitiesBefore: targetBefore,
            abilitiesAfter: targetAfter?.abilities?.length ?? 0,
            pendingCleared: api.state.pendingChoice == null,
          },
        });
      } else {
        out.push({ name: "field_lab_grant_abilities", summary: { skipped: true } });
      }
    } else {
      out.push({ name: "field_lab_exile_and_grant_choice", summary: { skipped: true } });
      out.push({ name: "field_lab_grant_abilities", summary: { skipped: true } });
    }
  } else {
    out.push({ name: "field_lab_summon_choice_offered", summary: { skipped: true } });
    out.push({ name: "field_lab_exile_and_grant_choice", summary: { skipped: true } });
    out.push({ name: "field_lab_grant_abilities", summary: { skipped: true } });
  }

  reset();
  api.state.phase = "main";
  const commanderCatalog = api.testing.catalogCard("card_1782225519182");
  const commanderDamageBuff = (commanderCatalog?.abilities || []).find(
    (ability) => ability.trigger === "onDamageReceived" && ability.effect === "optionalPayBuffOnDamageReceived",
  );
  const commanderLifeSurvive = (commanderCatalog?.abilities || []).find(
    (ability) => ability.trigger === "onActivate" && ability.effect === "spendLifeCounterSurviveBuff",
  );
  out.push({
    name: "northeast_commander_damage_buff_parsed",
    summary: {
      found: !!commanderDamageBuff,
      atkBuff: commanderDamageBuff?.atkBuff,
      hpBuff: commanderDamageBuff?.hpBuff,
      armorBuff: commanderDamageBuff?.armorBuff,
      amount: commanderDamageBuff?.amount,
    },
  });
  out.push({
    name: "northeast_commander_life_survive_parsed",
    summary: {
      found: !!commanderLifeSurvive,
      costCounters: commanderLifeSurvive?.costCounters,
      hpBuff: commanderLifeSurvive?.hpBuff,
      exclusiveGroup: commanderLifeSurvive?.exclusiveGroup,
    },
  });

  reset();
  api.state.phase = "main";
  api.state.activePlayer = "p1";
  api.testing.setResources("p1", { nature: 10, people: 0, funds: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  const commanderWithCounter = api.testing.placeUnit("card_1782225519182", "p1", 2, 2, { rested: false, counters: 1 });
  const hpBeforeLife = commanderWithCounter.currentHp;
  api.testing.selectUnit(2, 2);
  api.testing.activateSelectedUnit();
  const commanderAfterLife = api.state.board[2][2];
  out.push({
    name: "northeast_commander_life_survive_activate",
    summary: {
      countersBefore: 1,
      countersAfter: commanderAfterLife?.counters ?? 0,
      hpBefore: hpBeforeLife,
      hpAfter: commanderAfterLife?.currentHp,
    },
  });

  reset();
  api.state.phase = "main";
  api.state.activePlayer = "p2";
  api.testing.setResources("p1", { nature: 10, people: 0, funds: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  api.testing.setResources("p2", { funds: 10, people: 0, nature: 0, ore: 0, fuel: 0, electric: 0, magic: 0 });
  api.testing.placeUnit("card_1782225519182", "p1", 2, 2, { rested: false });
  api.testing.placeUnit("militia", "p2", 1, 3, { rested: false });
  api.state.board[1][3].atk = 20;
  const commanderBeforeDamage = api.state.board[2][2];
  const armorBefore = Math.max(
    0,
    ...(commanderBeforeDamage.keywords || []).filter((keyword) => keyword.id === "armor").map((keyword) => keyword.value || 1),
  );
  const hpBefore = commanderBeforeDamage.currentHp;
  const atkBefore = commanderBeforeDamage.atk;
  const natureBefore = api.state.players.p1.resources.nature;
  api.testing.selectUnit(1, 3);
  api.testing.attack({ kind: "unit", row: 2, col: 2 });
  const pendingDamageBuff = api.state.pendingChoice?.type === "payForBuff"
    && api.state.pendingChoice?.triggerContext === "onDamageReceived";
  let paid = false;
  if (pendingDamageBuff) {
    paid = api.testing.resolvePayForBuff(true);
  }
  const commanderAfterDamage = api.state.board[2][2];
  const armorAfter = Math.max(
    0,
    ...(commanderAfterDamage?.keywords || []).filter((keyword) => keyword.id === "armor").map((keyword) => keyword.value || 1),
  );
  out.push({
    name: "northeast_commander_damage_buff",
    summary: {
      pendingDamageBuff,
      paid,
      hpBefore,
      hpAfter: commanderAfterDamage?.currentHp,
      atkBefore,
      atkAfter: commanderAfterDamage?.atk,
      armorBefore,
      armorAfter,
      natureBefore,
      natureAfter: api.state.players.p1.resources.nature,
    },
  });

  reset();
  const miningCard = { id: "card_1753760240197", name: "採掘", type: "tact" };
  const miningAbility = { effect: "drawPlusPayResource", resource: "ore", baseDraw: 1, maxPay: 99 };
  api.state.players.p1.resources.ore = 5;
  api.state.players.p1.mainDeck = Array.from({ length: 10 }, (_, index) => ({
    id: `mining_deck_${index}`,
    name: `Mining Deck ${index}`,
    type: "unit",
  }));
  const miningHandBefore = api.state.players.p1.hand.length;
  const miningDeckBefore = api.state.players.p1.mainDeck.length;
  const miningOreBefore = api.state.players.p1.resources.ore;
  const miningPending = api.abilityEffects.drawPlusPayResource({
    game: api.state,
    playerId: "p1",
    card: miningCard,
    ability: miningAbility,
    source: { zone: "tact" },
  });
  out.push({
    name: "mining_draw_pending_with_ore",
    summary: {
      pending: miningPending === "pending",
      pendingType: api.state.pendingChoice?.type,
      maxPay: api.state.pendingChoice?.maxPay,
    },
  });
  api.testing.resolveDrawPlusPayResource(2);
  out.push({
    name: "mining_draw_pays_optional_ore",
    summary: {
      oreAfter: api.state.players.p1.resources.ore,
      handGain: api.state.players.p1.hand.length - miningHandBefore,
      deckAfter: api.state.players.p1.mainDeck.length,
      expectedHandGain: 3,
      expectedOre: miningOreBefore - 2,
    },
  });

  reset();
  api.state.players.p1.resources.ore = 0;
  api.state.players.p1.mainDeck = Array.from({ length: 4 }, (_, index) => ({
    id: `mining_zero_${index}`,
    name: `Mining Zero ${index}`,
    type: "unit",
  }));
  const zeroHandBefore = api.state.players.p1.hand.length;
  const zeroDeckBefore = api.state.players.p1.mainDeck.length;
  const zeroPending = api.abilityEffects.drawPlusPayResource({
    game: api.state,
    playerId: "p1",
    card: miningCard,
    ability: miningAbility,
    source: { zone: "tact" },
  });
  out.push({
    name: "mining_draw_without_ore",
    summary: {
      pending: zeroPending === "pending",
      handGain: api.state.players.p1.hand.length - zeroHandBefore,
      deckAfter: api.state.players.p1.mainDeck.length,
      expectedHandGain: 1,
      expectedDeckAfter: zeroDeckBefore - 1,
    },
  });

  return out;
});

await browser.close();

const byName = Object.fromEntries(results.map((result) => [result.name, result.summary]));

assert(byName.struct_catalog_loaded.count >= 20, `struct catalog should load deckmaker structs (got ${byName.struct_catalog_loaded.count})`);
const byResult = Object.fromEntries(results.map((result) => [result.name, result]));

assert(byName.armor_reduces_damage.board[1][0].hp === 4, "armor should reduce militia damage by 1");
assert(byName.armor_reduces_damage.board[2][0].rested === true, "attacker should rest after ordinary attack");

assert(byName.pierce_and_shock.board[1][0].hp === 2, "pierce should ignore armor value 1");
assert(byName.pierce_and_shock.board[1][0].rested === true, "shock should rest damaged target");
assert(byName.pierce_and_shock.board[2][0].hp === 4, "shock-rested target should not counterattack");

assert(byName.flying_blocks_low_ground_attack.board[1][0].hp === 3, "low ATK non-flying unit should not damage flying unit");
assert(byName.flying_blocks_low_ground_attack.board[2][0].rested === false, "failed flying attack should not rest attacker");
assert(byName.flying_allows_buffed_ground_attack.effectiveAtk === 4, "buffed militia should reach flying threshold");
assert(byName.flying_allows_buffed_ground_attack.flyingHpAfter < byName.flying_allows_buffed_ground_attack.flyingHpBefore, "buffed ground unit should damage flying unit");
assert(byName.flying_allows_buffed_ground_attack.attackerRested === true, "successful flying attack should rest attacker");

assert(byName.mobile_move_does_not_rest_once.board[2][0]?.name === "装甲車", "mobile unit should advance");
assert(byName.mobile_move_does_not_rest_once.board[2][0].rested === false, "first mobile move should not rest");
assert(byName.mobile_second_move_blocked.board[2][0]?.name === "装甲車", "mobile unit should stay after blocked second move");
assert(byName.mobile_second_move_blocked.board[2][0].mobileMoveUsed === true, "mobile unit should be marked moved this turn");
assert(byName.mobile_second_move_blocked.board[1][0] == null, "mobile unit should not advance twice in one turn");

assert(byName.guard_protects_adjacent_unit.board[1][1].hp === 4, "guard should prevent adjacent unit from being attacked");
assert(byName.guard_protects_adjacent_unit.board[2][1].rested === false, "guarded failed attack should not rest attacker");

assert(byName.arc_and_cleave.board[1][1] === null, "arc attacker should destroy distant target");
assert(byName.arc_and_cleave.board[1][0].hp === 3, "cleave should damage left adjacent enemy");
assert(byName.arc_and_cleave.board[1][2].hp === 3, "cleave should damage right adjacent enemy");

assert(byResult.arc_reaches_core.coreHpAfter === byResult.arc_reaches_core.coreHpBefore - 5, "arc extended range should allow core attack from row 2");

assert(byResult.cannot_summon_opponent_summon_row.blockedOpponentSummon === false, "summon to opponent summon row should fail");
assert(byResult.cannot_summon_opponent_summon_row.handCount === 1, "card should remain in hand when opponent summon row is blocked");
assert(byName.cannot_summon_opponent_summon_row.board[0][3] == null, "opponent summon row should stay empty");

assert(byName.self_destruct_splash.board[1][1] === null, "destroyed bomb drone should leave board");
assert(byName.self_destruct_splash.board[1][0].hp === 2, "self-destruct should damage left adjacent unit");
assert(byName.self_destruct_splash.board[1][2].hp === 2, "self-destruct should damage right adjacent unit");

assert(byName.self_destruct_blocked_by_effect_protect.board[1][2] === null, "bomb drone should be destroyed");
assert(byName.self_destruct_blocked_by_effect_protect.board[1][1].hp === 4, "effect-protected adjacent unit should ignore self-destruct");
assert(byName.self_destruct_blocked_by_effect_protect.board[1][3].hp === 2, "unprotected adjacent unit should still take self-destruct damage");
assert(byName.effect_protect_aura_survives_simultaneous_destruction.board[1][0] === null, "destroyed disruption engineer should leave the board");
assert(byName.effect_protect_aura_survives_simultaneous_destruction.board[1][1]?.name === "民兵分隊", "adjacent protected unit should remain when the aura source dies in the same damage batch");
assert(byName.effect_protect_aura_survives_simultaneous_destruction.board[1][1].hp === 4, "simultaneously protected unit should ignore the effect damage");

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
assert(byName.struct_zone_limit_replace.replacePending === true, "building at struct zone cap should open replace choice");
assert(byName.struct_zone_limit_replace.zoneCount === 10, "struct zone should stay at 10 after replace-and-build");
assert(byName.struct_zone_limit_replace.deckContainsReplaced === true, "replaced struct should return to struct deck");
assert(byName.struct_zone_limit_replace.zoneContainsBuilt === true, "new struct should appear in struct zone");
assert(byName.normalize_misplaced_struct_cards.moved === 2, "misplaced struct cards should be collected from other zones");
assert(byName.normalize_misplaced_struct_cards.handHasStruct === false, "hand should not keep struct cards after normalize");
assert(byName.normalize_misplaced_struct_cards.dumpHasStruct === false, "dump should not keep struct cards after normalize");
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
assert(
  byName.deckmaker_all_data_imports_cards.armor15.keywords.some((keyword) => keyword.id === "armor" && keyword.value === 15),
  "Deckmaker import should parse circled armor fifteen",
);
assert(byName.armor_fifteen_reduces_damage.board[1][0].hp === 15, "armor fifteen should reduce twenty damage to five");
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

assert(byName.charge_normal_attack_keeps_armor.board[1][0].hp === 3, "normal attack should respect armor");
assert(byName.charge_normal_attack_keeps_armor.players.p1.resources.electric === 10, "normal attack should not spend electric");
assert(byName.charge_normal_attack_keeps_armor.players.p1.resources.funds === 9, "normal attack should still pay act cost");

assert(byName.multi_strike_rests_after_second_attack.board[2][0].rested === true, "multi-strike unit should rest after attack limit");
assert(byName.multi_strike_rests_after_second_attack.board[2][0].attacksThisTurn === 2, "multi-strike should track both attacks");
assert(byName.multi_strike_rests_after_second_attack.board[1][0].hp === 3, "first multi-strike target should take damage");
assert(byName.multi_strike_rests_after_second_attack.board[1][1].hp === 3, "second multi-strike target should take damage");

assert(byName.immobile_cannot_move.board[3][0]?.name === "掩体壕", "immobile unit should stay in place");
assert(byName.immobile_cannot_move.board[3][0].rested === false, "failed immobile move should not rest");

assert(byName.no_attack_cannot_attack.board[1][0].hp === 4, "noAttack unit should not damage target");
assert(byName.no_attack_cannot_attack.board[2][0].rested === false, "failed noAttack should not rest attacker");

assert(byResult.concept_projection_rests_attackable_target.projectionActivated === true, "concept projection should activate when a legal target exists");
assert(byResult.concept_projection_rests_attackable_target.projectionResourceOptions.length === 1 && byResult.concept_projection_rests_attackable_target.projectionResourceOptions[0] === "ore", "concept projection should offer only payable resources contained in an attackable target act cost");
assert(byResult.concept_projection_rests_attackable_target.projectionPendingTarget === "restTargetNoUnrest", "concept projection should wait for an enemy target after payment");
assert(byName.concept_projection_rests_attackable_target.board[2][4].rested === true, "concept projection should rest itself on activation");
assert(byName.concept_projection_rests_attackable_target.board[1][4].rested === true, "concept projection should rest the attackable target");
assert(byResult.concept_projection_rests_attackable_target.targetLockedRestTurns === 1, "concept projection target should stay rested through its next unrest");
assert(byResult.concept_projection_rejects_out_of_range_target.projectionOutOfRangeActivated === false, "concept projection should not activate without an attackable target");
assert(byName.concept_projection_rejects_out_of_range_target.pendingChoice === null, "out-of-range concept projection should not consume a resource choice");

assert(byName.soul_pay_uses_dump_for_missing_magic.board[3][0]?.name === "魂術師", "soulPay should allow summon with dump cards");
assert(byName.soul_pay_uses_dump_for_missing_magic.players.p1.dumpCount === 0, "soulPay should exile dump cards used for magic");
assert(byName.soul_pay_uses_dump_for_missing_magic.players.p1.resources.funds === 0, "soulPay summon should still pay funds");
assert(byResult.soul_pay_uses_dump_for_missing_magic.requiredSoulPrompt.type === "soulPay", "soulPay should ask before replacing magic");
assert(byResult.soul_pay_uses_dump_for_missing_magic.requiredSoulPrompt.amounts.includes(2), "soulPay prompt should offer enough souls to cover missing magic");
assert(byName.soul_pay_allows_optional_partial_payment.board[3][0]?.name === "魂術師", "optional partial soul payment should finish the summon");
assert(byResult.soul_pay_allows_optional_partial_payment.optionalSoulPrompt.canPayWithoutSoul === true, "soulPay should still ask when normal magic payment is available");
assert(byResult.soul_pay_allows_optional_partial_payment.optionalSoulPrompt.amounts.includes(1), "soulPay should offer an arbitrary partial replacement amount");
assert(byName.soul_pay_allows_optional_partial_payment.players.p1.resources.magic === 1, "partial soul payment should pay the remaining magic normally");
assert(byName.soul_pay_allows_optional_partial_payment.players.p1.dumpCount === 1, "partial soul payment should exile exactly the chosen number of dump cards");

assert(byResult.second_tomb_revives_only_to_battle_zone.secondTombRows.length === 1 && byResult.second_tomb_revives_only_to_battle_zone.secondTombRows[0] === 2, "Second Tomb should only offer the controller battle row");
assert(byResult.second_tomb_revives_only_to_battle_zone.secondTombSummonRowRejected === false, "Second Tomb should reject the summon-field row");
assert(byResult.second_tomb_revives_only_to_battle_zone.secondTombBattleRowAccepted === true, "Second Tomb should accept the battle-zone row");
assert(byName.second_tomb_revives_only_to_battle_zone.board[2][1]?.name === "生命妖精", "Second Tomb should place the revived unit in the battle zone");
assert((byName.nobelburg_has_only_initial_resources.income.people || 0) === 0, "Nobelburg should not gain people at turn start");
assert((byName.nobelburg_has_only_initial_resources.income.funds || 0) === 0, "Nobelburg should not gain funds at turn start");
assert(byName.nobelburg_has_only_initial_resources.startResources.funds === 8, "Nobelburg should keep its initial funds 8");
assert((byName.nobelburg_has_only_initial_resources.startResources.magic || 0) === 0, "Nobelburg should not start with magic");
assert(byName.opponent_card_selection_is_private.pendingChoice?.type === "privateCardSelection", "opponent deck selection should expose only a private waiting state");
assert(byName.opponent_card_selection_is_private.pendingChoice?.hidden === true, "opponent deck selection should be marked hidden");
assert(byName.opponent_card_selection_is_private.players.p2.hand[0]?.hidden === true, "opponent hand details should be redacted from the viewer summary");
assert(!byName.opponent_card_selection_is_private.players.p2.hand[0]?.name, "opponent hand card name should not leak to the viewer summary");

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
assert(
  initialCards.mysticCapture.abilities?.some((ability) => ability.effect === "mysticCapture"),
  "mystic capture catalog should include mysticCapture onPlay ability",
);

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
  byName.bundled_deck_limit_overrides_stale_catalog_limit.fourAnnihilationAnomaliesValid === true,
  "bundled 壊滅怪異 limit should allow four copies even when Firebase/cache says one",
);
assert(
  byName.bundled_deck_limit_overrides_stale_catalog_limit.fiveAnnihilationAnomaliesRejected === true,
  "bundled 壊滅怪異 limit should still reject a fifth copy",
);

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
assert(byName.long_range_artillery_struct_phase.found === true, "長距離砲撃陣 should parse struct-phase destroyEnemyStructs");
assert(byName.long_range_artillery_struct_phase.fuelCost === 1, "長距離砲撃陣 fuel cost should be 1");
assert(byName.long_range_artillery_struct_phase.amount === 2, "長距離砲撃陣 destroy amount should be 2");
assert(byName.long_range_artillery_struct_phase_activates.activated === true, "長距離砲撃陣 should open struct-phase destroy choice");
assert(byName.long_range_artillery_struct_phase_activates.pendingEnemyChoice === true, "長距離砲撃陣 should offer enemy struct choice");
assert(byName.long_range_artillery_struct_phase_activates.enemyStructsAfter === byName.long_range_artillery_struct_phase_activates.enemyStructsBefore - 1, "長距離砲撃陣 should destroy 1 enemy struct");
assert(byName.long_range_artillery_struct_phase_activates.fuelSpent === 1, "長距離砲撃陣 should spend 1 fuel per destroy");
assert(byName.long_range_artillery_struct_phase_activates.artilleryRested === true, "長距離砲撃陣 should rest after struct-phase activation resolves");
assert(byName.sabotage_destroy_target_struct_parsed.found === true, "破壊工作 should parse destroyTargetStruct");
assert(byName.sabotage_destroy_target_struct_parsed.trigger === "onPlay", "破壊工作 destroyTargetStruct should trigger on play");
assert(byName.sabotage_play_offers_struct_choice.pendingDestroyStruct === true, "破壊工作 should open enemy struct choice");
assert(byName.sabotage_play_offers_struct_choice.structDestroyed === true, "破壊工作 struct choice should destroy a struct");
assert(byName.sabotage_play_offers_struct_choice.enemyStructs === 0, "破壊工作 should remove destroyed enemy struct");
assert(byName.strategic_bombing_parsed.found === true, "戦略爆撃 should parse destroyEnemyStructsOnPlay");
assert(byName.strategic_bombing_parsed.amount === 15, "戦略爆撃 destroy amount should be 15");
assert(byName.strategic_bombing_play_offers_struct_choice.pendingDestroyStruct === true, "戦略爆撃 should open enemy struct choice modal");
assert(byName.strategic_bombing_play_offers_struct_choice.remaining === 15, "戦略爆撃 should allow up to 15 destroys");
assert(byName.strategic_bombing_play_offers_struct_choice.structDestroyed === true, "戦略爆撃 struct choice should destroy a struct");
assert(byName.strategic_bombing_play_offers_struct_choice.enemyStructs === 1, "戦略爆撃 should leave remaining enemy structs after one pick");
assert(byName.zombie_unit_with_destroy_flags_cleaned.onBoard === false, "HP<=0 unit with stale destroy flags should leave the board");
assert(byName.zombie_unit_with_destroy_flags_cleaned.dumpCount === 1, "HP<=0 zombie unit should go to dump");
assert(byName.from_dump_unit_negative_hp_cleaned.onBoard === false, "fromDump unit at negative HP should be destroyed");
assert(byName.from_dump_unit_negative_hp_cleaned.dumpCount === 1, "fromDump unit at negative HP should go to dump");
assert(byName.from_dump_unit_negative_hp_cleaned.cleanOnSummon === true, "fromDump summon should not carry destroy flags");
assert(byName.pay_on_attack_enhance_parsed.found === true, "payOnAttackEnhance should parse from card text");
assert(byName.pay_on_attack_enhance_parsed.payCost?.people === 1, "payOnAttackEnhance people cost should be 1");
assert(byName.pay_on_attack_enhance_parsed.payCost?.nature === 2, "payOnAttackEnhance nature cost should be 2");
assert(byName.pay_on_attack_enhance_applies_before_damage.pendingEnhance === true, "attack should open payOnAttackEnhance choice");
assert(byName.pay_on_attack_enhance_applies_before_damage.peopleSpentOnEnhance === 1, "enhance should spend 1 people");
assert(byName.pay_on_attack_enhance_applies_before_damage.natureSpentTotal === 4, "act+enhance should spend 4 nature total");
assert(byName.pay_on_attack_enhance_applies_before_damage.enhanceDamage >= 6, "enhanced attack should deal at least 6 damage to militia");
assert(byName.guard_optional_pay_buff_on_damage_dealt_parsed.found === true, "北東軍親衛隊 should parse optionalPayBuffOnDamageDealt");
assert(byName.guard_optional_pay_buff_on_damage_dealt_parsed.resource === "funds", "北東軍親衛隊 buff cost should be funds");
assert(byName.guard_optional_pay_buff_on_damage_dealt_parsed.amount === 6, "北東軍親衛隊 buff cost should be 6 funds");
assert(byName.guard_optional_pay_buff_on_damage_dealt_applies.pendingGuardBuff === true, "北東軍親衛隊 attack should open payForBuff choice after damage");
assert(byName.guard_optional_pay_buff_on_damage_dealt_applies.guardBuffApplied === true, "北東軍親衛隊 payForBuff should resolve");
assert(byName.guard_optional_pay_buff_on_damage_dealt_applies.fundsSpent === 6, "北東軍親衛隊 should spend 6 funds for buff");
assert(byName.guard_optional_pay_buff_on_damage_dealt_applies.atkGain === 1, "北東軍親衛隊 should gain +1 ATK");
assert(byName.guard_optional_pay_buff_on_damage_dealt_applies.hpGain === 1, "北東軍親衛隊 should gain +1 HP");
assert(byName.deckmaker_mill_on_summon.millDumpAfter === byName.deckmaker_mill_on_summon.millDumpBefore + 2, "deckmaker mill ability should send 2 cards to dump on summon");
assert(byName.deckmaker_struct_destroy_gain.peopleAfter === byName.deckmaker_struct_destroy_gain.peopleBefore + 1, "deckmaker struct should gain 1 people on enemy unit destroyed");
assert(byName.shock_battalion_attack_rests_attacker.pendingReveal === true, "302 shock battalion should trigger reveal pick on damage");
assert(byName.shock_battalion_attack_rests_attacker.attackerPendingRest === false, "attacker should stay active while reveal pick is pending");
assert(byName.shock_battalion_attack_rests_attacker.attackerRestedAfter === true, "attacker should rest after resolving 302 reveal pick");

assert(byName.long_term_investment_parsed.found === true, "長期投資 should parse longTermInvestmentPlay");
assert(byName.long_term_investment_draw_bonus.handCount === byName.long_term_investment_draw_bonus.expectedDraw, "長期投資 should add +2 draw on the following turn");
assert(byName.guard_on_summon_row_blocks_core.coreHpAfter === byName.guard_on_summon_row_blocks_core.coreHpBefore, "守護 on summon row should block core attacks");
assert(byName.guard_far_from_core_does_not_block.coreDamaged === true, "守護 far from core should not block core attacks");
if (!byName.fumetsu_golem_summon_from_deck_only.skipped) {
  assert(byName.fumetsu_golem_summon_from_deck_only.pendingChoice === true, "覆没の大暴走 should ask for resource payment");
  assert(byName.fumetsu_golem_summon_from_deck_only.oreAfter === byName.fumetsu_golem_summon_from_deck_only.oreBefore - 2, "覆没の大暴走 should consume ore on activation");
  assert(byName.fumetsu_golem_summon_from_deck_only.summonedFromDeck === true, "覆没の大暴走 should summon from deck");
  assert(byName.fumetsu_golem_summon_from_deck_only.dumpUntouched === true, "覆没の大暴走 should not summon from dump");
  assert(byName.fumetsu_golem_summon_from_deck_only.structRested === true, "覆没の大暴走 should rest after activation");
}
assert(byName.tact_overlay_suppresses_base_struct.structCount === 1, "tact overlay should not add a second struct");
assert(byName.tact_overlay_suppresses_base_struct.overlayId === "card_1753660736818", "overlaid struct should use tact identity");
assert(byName.tact_overlay_suppresses_base_struct.baseStoredUnderneath === true, "base struct should be stored underneath overlay");
assert(byName.tact_overlay_suppresses_base_struct.baseProduceSuppressed === true, "base struct abilities should not remain active on face");

if (!byName.adjacent_tag_buff_stats_display.skipped) {
  assert(byName.adjacent_tag_buff_stats_display.buffActive === true, "adjacent tag buff should apply with two tagged neighbors");
  assert(byName.adjacent_tag_buff_stats_display.statsText.includes(`ATK ${byName.adjacent_tag_buff_stats_display.atk}`), "tooltip stats should use effective ATK");
  assert(byName.adjacent_tag_buff_stats_display.statsText.includes(`${byName.adjacent_tag_buff_stats_display.currentHp}/${byName.adjacent_tag_buff_stats_display.maxHp}`), "tooltip stats should use effective HP, not base hp");
  assert(byName.adjacent_tag_buff_stats_display.maxHp === byName.adjacent_tag_buff_stats_display.hp + 1, "adjacent tag buff should raise maxHp above printed hp");
}
if (!byName.adjacent_tag_buff_catalog_fallback.skipped) {
  assert(byName.adjacent_tag_buff_catalog_fallback.buffActive === true, "adjacent tag buff should use catalog text/tags when board copies are missing");
  assert(byName.adjacent_tag_buff_catalog_fallback.atk === 2, "adjacent tag buff should add +1 ATK with two atlas neighbors");
  assert(byName.adjacent_tag_buff_catalog_fallback.maxHp === 5, "adjacent tag buff should add +1 max HP with two atlas neighbors");
}

assert(byName.mobilization_plan_parsed.found === true, "動員計画 should parse tactPayRestDraw");
assert(byName.mobilization_plan_parsed.draw === 2, "動員計画 draw amount should be 2");
assert(byName.mobilization_plan_draw_on_activate.fundsAfter === byName.mobilization_plan_draw_on_activate.fundsBefore - 1, "動員計画 should consume gold on activation");
assert(byName.mobilization_plan_draw_on_activate.handAfter === byName.mobilization_plan_draw_on_activate.handBefore + 2, "動員計画 should draw 2 cards");
assert(byName.mobilization_plan_draw_on_activate.deckAfter === byName.mobilization_plan_draw_on_activate.deckBefore - 2, "動員計画 should draw from deck");
assert(byName.mobilization_plan_draw_on_activate.tactRested === true, "動員計画 should rest after activation");
assert(byName.kiha_eho_facility_parsed.found === true, "キハエーホ陸軍施設 should parse structPayProduce");
assert(byName.kiha_eho_facility_paid_produce.fundsAfter === byName.kiha_eho_facility_paid_produce.fundsBefore - 1, "キハエーホ should consume gold");
assert(byName.kiha_eho_facility_paid_produce.natureAfter === byName.kiha_eho_facility_paid_produce.natureBefore - 1, "キハエーホ should consume nature");
assert(byName.kiha_eho_facility_paid_produce.peopleAfter === byName.kiha_eho_facility_paid_produce.peopleBefore + 5, "キハエーホ should gain 5 people");
assert(byName.kiha_eho_facility_paid_produce.structRested === true, "キハエーホ should rest after activation");
assert(byName.refinery_paid_produce_parsed.found === true, "精製所 should use paid structure production");
assert(byName.refinery_paid_produce_parsed.cost?.nature === 2, "精製所 should cost 2 nature");
assert(byName.refinery_paid_produce_parsed.produces?.fuel === 2, "精製所 should produce 2 fuel");
assert(byName.refinery_paid_produce_parsed.hasFreeProduction === false, "精製所 should not produce fuel for free");
assert(byName.refinery_paid_produce.natureAfter === byName.refinery_paid_produce.natureBefore - 2, "精製所 should consume 2 nature");
assert(byName.refinery_paid_produce.fuelAfter === byName.refinery_paid_produce.fuelBefore + 2, "精製所 should gain 2 fuel");
assert(byName.refinery_paid_produce.structRested === true, "精製所 should rest after activation");
assert(byName.grand_farm_parsed.found === true, "大農園 should parse chooseProduceResource");
assert(byName.grand_farm_parsed.optionCount === 2, "大農園 should offer two activation modes");
assert(byName.grand_farm_rest_choice.natureAfter === byName.grand_farm_rest_choice.natureBefore + 3, "大農園 rest option should gain 3 nature");
assert(byName.grand_farm_rest_choice.structRested === true, "大農園 should rest after activation");
assert(byName.grand_market_parsed.found === true, "大市場 should parse chooseProduceResource");
assert(byName.grand_market_parsed.oreOption === 4, "大市場 ore option should produce 4 funds");
assert(byName.grand_market_ore_choice.oreAfter === byName.grand_market_ore_choice.oreBefore - 1, "大市場 should spend 1 ore");
assert(byName.grand_market_ore_choice.fundsAfter === byName.grand_market_ore_choice.fundsBefore + 4, "大市場 should gain 4 funds");
assert(byName.grand_market_ore_choice.structRested === true, "大市場 should rest after activation");
assert(byName.dona_camp_parsed.found === true, "ドーナー強制収容所 should parse structPayProduce");
assert(byName.dona_camp_parsed.cost?.people === 1, "ドーナー強制収容所 should cost 1 people");
assert(byName.dona_camp_parsed.produces?.funds === 5, "ドーナー強制収容所 should produce 5 funds");
assert(byName.dona_camp_paid_produce.peopleAfter === byName.dona_camp_paid_produce.peopleBefore - 1, "ドーナー強制収容所 should consume 1 people");
assert(byName.dona_camp_paid_produce.fundsAfter === byName.dona_camp_paid_produce.fundsBefore + 5, "ドーナー強制収容所 should gain 5 funds");
assert(byName.dona_camp_paid_produce.structRested === true, "ドーナー強制収容所 should rest after activation");
assert(byName.fumetsu_meikyu_parsed.found === true, "覆没の迷宮 should parse structPayProduce");
assert(byName.fumetsu_meikyu_parsed.cost?.people === 2, "覆没の迷宮 should cost 2 people");
assert(byName.fumetsu_meikyu_parsed.produces?.magic === 1, "覆没の迷宮 should produce 1 magic");
assert(byName.fumetsu_meikyu_parsed.produces?.ore === 2, "覆没の迷宮 should produce 2 ore");
assert(byName.fumetsu_meikyu_parsed.hasChooseExchange === false, "覆没の迷宮 should not use chooseExchange");
assert(byName.fumetsu_meikyu_one_button.pendingChoice === false, "覆没の迷宮 should activate in one button");
assert(byName.fumetsu_meikyu_one_button.peopleAfter === byName.fumetsu_meikyu_one_button.peopleBefore - 2, "覆没の迷宮 should consume 2 people");
assert(byName.fumetsu_meikyu_one_button.oreAfter === byName.fumetsu_meikyu_one_button.oreBefore + 2, "覆没の迷宮 should gain 2 ore");
assert(byName.fumetsu_meikyu_one_button.magicAfter === byName.fumetsu_meikyu_one_button.magicBefore + 1, "覆没の迷宮 should gain 1 magic");
assert(byName.fumetsu_meikyu_one_button.structRested === true, "覆没の迷宮 should rest after activation");
assert(byName.kiha_eho_facility_import_dedupes_catalog.catalogHits === 1, "キハエーホ import should keep one catalog entry");
assert(byName.kiha_eho_facility_import_dedupes_catalog.inStructs === true, "キハエーホ should live in struct catalog");
assert(byName.kiha_eho_facility_import_dedupes_catalog.inMain === false, "キハエーホ stale main entry should be removed");
assert(byName.kiha_eho_facility_import_dedupes_catalog.structType === "struct", "キハエーホ should stay a struct");
assert(byName.vs_tag_infantry_atk_bonus_parsed.mortarFound === true, "迫撃砲分隊 should parse vsTagAtkBonus vs 歩兵");
assert(byName.vs_tag_infantry_atk_bonus_parsed.artilleryFound === true, "砲中隊 should parse vsTagAtkBonus vs 歩兵");
if (!byName.vs_tag_infantry_atk_bonus_applies.skipped) {
  assert(byName.vs_tag_infantry_atk_bonus_applies.damageDealt >= 2, "vsTagAtkBonus should increase damage vs 歩兵");
  assert(byName.vs_tag_infantry_atk_bonus_applies.damageDealt === 3, "迫撃砲分隊 should deal 3 damage to 3HP 歩兵 with +2 bonus");
}
if (!byName.vs_tag_infantry_atk_bonus_catalog_fallback.skipped) {
  assert(byName.vs_tag_infantry_atk_bonus_catalog_fallback.damageDealt === 3, "vsTagAtkBonus should fall back to catalog abilities/tags");
}

assert(byName.survey_dept_vs_magic_play_cost_parsed.found === true, "第三警備部：調査部 should parse vsMagicPlayCostAtkBonus");
assert(byName.survey_dept_vs_magic_play_cost_parsed.atkBonus === 4, "第三警備部：調査部 should grant +4 ATK vs magic play cost");
if (!byName.survey_dept_vs_magic_play_cost_applies.skipped) {
  assert(byName.survey_dept_vs_magic_play_cost_applies.damageDealt >= 4, "調査部 should deal bonus damage vs magic play cost unit");
}
assert(byName.field_lab_on_summon_parsed.found === true, "野外実験課 should parse fieldExperimentOnSummon");
assert(byName.field_lab_on_summon_parsed.trigger === "onSummon", "野外実験課 effect should trigger on summon");
if (!byName.field_lab_summon_choice_offered.skipped) {
  assert(byName.field_lab_summon_choice_offered.pendingType === "fieldExperiment", "野外実験課 should open field experiment choice");
  assert(byName.field_lab_summon_choice_offered.eligibleCount >= 1, "野外実験課 should list magic-cost hand units");
}
if (!byName.field_lab_exile_and_grant_choice.skipped) {
  assert(byName.field_lab_exile_and_grant_choice.exiledCount === 1, "野外実験課 should exile selected hand unit");
  assert(
    byName.field_lab_exile_and_grant_choice.electricSpent === byName.field_lab_exile_and_grant_choice.expectedElectric,
    "野外実験課 should pay full play cost in electric",
  );
  assert(byName.field_lab_exile_and_grant_choice.stepAfterExile === "chooseBabelTarget", "野外実験課 should offer babel target choice");
  assert(byName.field_lab_exile_and_grant_choice.babelTargetCount >= 1, "野外実験課 should list babel industry targets");
}
if (!byName.field_lab_grant_abilities.skipped) {
  assert(byName.field_lab_grant_abilities.abilitiesAfter > byName.field_lab_grant_abilities.abilitiesBefore, "野外実験課 should grant exiled unit abilities");
  assert(byName.field_lab_grant_abilities.pendingCleared === true, "野外実験課 choice should finish after grant");
}

assert(byName.northeast_commander_damage_buff_parsed.found === true, "北東軍最高司令官 should parse on-damage buff");
assert(byName.northeast_commander_damage_buff_parsed.hpBuff === 10, "北東軍最高司令官 on-damage buff should grant HP+10");
assert(byName.northeast_commander_damage_buff_parsed.armorBuff === 5, "北東軍最高司令官 on-damage buff should grant armor+5");
assert(byName.northeast_commander_damage_buff_parsed.atkBuff === 5, "北東軍最高司令官 on-damage buff should grant ATK+5");
assert(byName.northeast_commander_life_survive_parsed.found === true, "北東軍最高司令官 should parse life counter survive activate");
assert(byName.northeast_commander_life_survive_parsed.hpBuff === 10, "北東軍最高司令官 life survive should grant HP+10");
assert(byName.northeast_commander_life_survive_activate.countersAfter === 0, "北東軍最高司令官 life survive should consume 1 counter");
assert(byName.northeast_commander_life_survive_activate.hpAfter === byName.northeast_commander_life_survive_activate.hpBefore + 10, "北東軍最高司令官 life survive should increase HP by 10");
assert(byName.northeast_commander_damage_buff.pendingDamageBuff === true, "北東軍最高司令官 should offer on-damage buff choice");
assert(byName.northeast_commander_damage_buff.paid === true, "北東軍最高司令官 damage buff choice should resolve");
assert(byName.northeast_commander_damage_buff.atkAfter === byName.northeast_commander_damage_buff.atkBefore + 5, "北東軍最高司令官 damage buff should increase ATK by 5");
assert(byName.northeast_commander_damage_buff.armorAfter === byName.northeast_commander_damage_buff.armorBefore + 5, "北東軍最高司令官 damage buff should increase armor by 5");
assert(byName.northeast_commander_damage_buff.natureAfter === byName.northeast_commander_damage_buff.natureBefore - 2, "北東軍最高司令官 damage buff should cost nature 2");
assert(
  byName.northeast_commander_damage_buff.hpAfter === byName.northeast_commander_damage_buff.hpBefore + 5,
  "北東軍最高司令官 damage buff should net +5 HP after combat damage and HP+10 buff",
);

assert(byName.mining_draw_pending_with_ore.pending === true, "採掘 should ask how much ore to pay when ore is available");
assert(byName.mining_draw_pending_with_ore.pendingType === "drawPlusPayResource", "採掘 pending choice type should be drawPlusPayResource");
assert(byName.mining_draw_pending_with_ore.maxPay === 5, "採掘 should allow paying up to current ore");
assert(byName.mining_draw_pays_optional_ore.handGain === 3, "採掘 should draw 1 card plus X paid ore");
assert(byName.mining_draw_pays_optional_ore.oreAfter === 3, "採掘 should only spend chosen ore amount");
assert(byName.mining_draw_without_ore.pending !== true, "採掘 should resolve immediately when ore is 0");
assert(byName.mining_draw_without_ore.handGain === 1, "採掘 should draw 1 card when no ore is paid");

assert(byName.tactical_bombardment_parsed.found === true, "戦術爆撃 should parse tacticalBombardmentPlay");
assert(byName.tactical_bombardment_unit_mode.modePending === true, "戦術爆撃 activate should open mode choice");
assert(byName.tactical_bombardment_unit_mode.targetPending === true, "戦術爆撃 unit mode should open target selection");
assert(byName.tactical_bombardment_unit_mode.fuelSpent === 3, "戦術爆撃 unit mode should spend 3 fuel");
assert(byName.tactical_bombardment_unit_mode.enemyHpAfter === byName.tactical_bombardment_unit_mode.enemyHpBefore - 10, "戦術爆撃 should deal 10 damage");
assert(byName.tactical_bombardment_unit_mode.enemyRested === true, "戦術爆撃 should rest damaged enemy unit");
assert(byName.tactical_bombardment_struct_rest.oreSpent === 3, "戦術爆撃 struct mode should spend 3 ore");
assert(byName.tactical_bombardment_struct_rest.fuelSpent === 3, "戦術爆撃 struct mode should spend 3 fuel");
assert(byName.tactical_bombardment_struct_rest.struct0Rested === true, "戦術爆撃 should rest chosen enemy struct");
assert(byName.tactical_bombardment_struct_rest.struct0Lock === "p1", "戦術爆撃 should lock struct rest until caster turn end");
assert(byName.military_band_parsed.found === true, "北東軍軍楽隊 should parse buffFriendlyUnitsAtk activate");
assert(byName.military_band_parsed.amount === 3, "北東軍軍楽隊 should buff +3 ATK");
assert(byName.military_band_atk_buff.bandRested === true, "北東軍軍楽隊 should rest on activate");
assert(byName.military_band_atk_buff.allyAtkAfter === byName.military_band_atk_buff.allyAtkBefore + 3, "北東軍軍楽隊 should buff all friendly units");
assert(byName.notion_artillery_parsed.found === true, "Notion Artillery should parse payEnemyAttackCostsAndRest");
assert(byName.notion_artillery_parsed.hp === 3, "Notion Artillery should have 3 HP from updated defense");
assert(byName.notion_artillery_pay_and_rest.primaryRested === true, "Notion Artillery should rest primary target");
assert(byName.notion_artillery_pay_and_rest.primaryLock === 1, "Notion Artillery should lock primary rest for next opponent turn");
assert(byName.notion_artillery_pay_and_rest.adjacentRested === true, "Notion Artillery should rest adjacent unrested enemy");
assert(byName.notion_artillery_pay_and_rest.adjacentLock === 1, "Notion Artillery should lock adjacent rest");
assert(byName.notion_artillery_pay_and_rest.restedAdjacentSkipped === true, "Notion Artillery should skip already-rested adjacent unit");
assert(byName.notion_artillery_pay_and_rest.fundsSpent === 1, "Notion Artillery should pay militia attack cost");
assert(byName.notion_artillery_pay_and_rest.fuelSpent === 1, "Notion Artillery should pay armored car attack cost");
assert(byName.noble_assembly_parsed.found === true, "全土貴族会議 should parse searchDeckPick with tagContains");
assert(byName.noble_assembly_parsed.tagContains === "貴族", "全土貴族会議 should search by partial tag 貴族");
assert(byName.noble_assembly_tag_contains_search.candidateCount === 1, "全土貴族会議 should only offer cards with 貴族 in a tag");
assert(byName.noble_assembly_tag_contains_search.pickedName === "エレナ＝アンドート", "全土貴族会議 should add partial-tag noble card to hand");
assert(byName.noble_assembly_tag_contains_search.tactRested === true, "全土貴族会議 should rest on activation");
assert(byName.speech_parsed.found === true, "演説 should parse searchDeckPick");
assert(byName.speech_parsed.tagContains === "歩兵", "演説 should search by partial tag 歩兵");
assert(byName.speech_parsed.maxCost === 4, "演説 should filter cost total 4 or less");
assert(byName.speech_deck_search_pick.candidateCount === 1, "演説 should only offer [歩兵] units within cost limit");
assert(byName.speech_deck_search_pick.pickedName === "北東軍第65歩兵大隊", "演説 should add chosen infantry to hand");
assert(byName.speech_deck_search_pick.handAfter === byName.speech_deck_search_pick.handBefore, "演説 should swap itself for the chosen unit in hand");
assert(byName.speech_deck_search_pick.deckLoss === 1, "演説 should remove searched card from deck");
assert(byName.speech_deck_search_pick.tactInDump === true, "演説 should go to dump after resolving search");
assert(byName.second_babel_parsed.found === true, "セカンド・バベル should parse two struct phase abilities");
assert(byName.second_babel_parsed.deckPickCount === 3, "セカンド・バベル deck search should pick 3 cards");
assert(byName.second_babel_parsed.resourceMaxPicks === 4, "セカンド・バベル resource ability should allow up to 4 picks");
assert(byName.second_babel_deck_search.structRested === true, "セカンド・バベル deck search should rest struct");
assert(byName.second_babel_deck_search.handGain === 2, "セカンド・バベル should add 2 picked cards to hand in test deck");
assert(byName.second_babel_resource_pick.structRested === true, "セカンド・バベル resource pick should rest struct");
assert(byName.second_babel_resource_pick.peopleGain === 4, "セカンド・バベル should produce 人④ on first pick");
assert(byName.second_babel_resource_pick.oreGain === 4, "セカンド・バベル should produce 鉱④ on second pick");
assert(byName.second_babel_resource_pick.magicSpent === 2, "セカンド・バベル should pay 魔① per resource pick");
assert(byName.ambush_blocks_effect_targeting.hpAfter === byName.ambush_blocks_effect_targeting.hpBefore, "潜伏 should block effect targeting until revealed");
assert(byName.ambush_blocks_effect_targeting.stillHidden === true, "潜伏 unit should stay hidden when targeting blocked");
assert(byName.wrathful_fruit_god_parsed.found === true, "怒れる摘果神 should parse onSummon highest-ATK damage");
assert(byName.wrathful_fruit_god_parsed.onExileBuff === true, "怒れる摘果神 should parse onExile ATK buff");
assert(byName.wrathful_fruit_god_parsed.onAttackedRest === true, "怒れる摘果神 should parse onAttacked rest");
assert(byName.wrathful_fruit_god_on_summon_damage.highHpAfter === byName.wrathful_fruit_god_on_summon_damage.highHpBefore - 7, "怒れる摘果神 should damage highest-ATK enemy by its ATK");
assert(byName.wrathful_fruit_god_on_summon_damage.lowHpAfter === byName.wrathful_fruit_god_on_summon_damage.lowHpBefore, "怒れる摘果神 should not damage lower-ATK enemy");
assert(byName.wrathful_fruit_god_on_exile_buff.allyAtkAfter === byName.wrathful_fruit_god_on_exile_buff.allyAtkBefore + 1, "怒れる摘果神 exile should buff ally ATK");
assert(byName.wrathful_fruit_god_on_attacked_rest.attackerRested === true, "怒れる摘果神 should rest attacker when attacked");
assert(byName.tsunatai_rite_parsed.found === true, "つなたい召喚儀式 should parse tsunataiRitePlay");
assert(byName.tsunatai_rite_summon_zero_atk.summoned === true, "つなたい召喚儀式 should summon chosen god unit");
assert(byName.tsunatai_rite_summon_zero_atk.summonedAtk === 0, "つなたい召喚儀式 should set summoned unit ATK to 0");
assert(byName.tsunatai_rite_summon_zero_atk.fuelSpent === 3, "つなたい召喚儀式 should pay summoned unit fuel cost");
assert(byName.tsunatai_rite_summon_zero_atk.magicSpent === 1, "つなたい召喚儀式 should pay summoned unit magic cost");
assert(byName.nameless_god_parsed.onSummonAoE === true, "名前のない神 should parse onSummon AoE damage");
assert(byName.nameless_god_parsed.onDamagedAoE === true, "名前のない神 should parse onDamageReceived AoE damage");
assert(byName.nameless_god_on_summon_aoe.ngE1HpAfter === byName.nameless_god_on_summon_aoe.ngE1HpBefore - 3, "名前のない神 onSummon should deal 3 to all enemies");
assert(byName.nameless_god_on_summon_aoe.ngE2HpAfter === byName.nameless_god_on_summon_aoe.ngE2HpBefore - 3, "名前のない神 onSummon should hit every enemy");
assert(byName.nameless_god_on_damaged_aoe.ngDamE1HpAfter === byName.nameless_god_on_damaged_aoe.ngDamE1Before - 5, "名前のない神 onDamageReceived should deal 5 to all enemies");
assert(byName.nameless_god_on_damaged_aoe.ngDamE2HpAfter === byName.nameless_god_on_damaged_aoe.ngDamE2Before - 5, "名前のない神 onDamageReceived should hit every enemy");
assert(byName.babel_third_class_clerk_parsed.noAttack === true, "バベル社三等社員 should have noAttack");
assert(byName.babel_third_class_clerk_parsed.drawOnSummon === true, "バベル社三等社員 should draw on summon");
assert(byName.babel_third_class_clerk_parsed.electricOnSummon === true, "バベル社三等社員 should gain electric on summon");
assert(byName.babel_third_class_clerk_on_summon.handAfter === byName.babel_third_class_clerk_on_summon.handBefore + 1, "バベル社三等社員 should draw 1 card on summon");
assert(byName.babel_third_class_clerk_on_summon.electricAfter === byName.babel_third_class_clerk_on_summon.electricBefore + 1, "バベル社三等社員 should gain 1 electric on summon");
assert(byName.sad_girl_play_cost_lock.blockedSameCost === true, "骨の少女 should block same play cost as opponent field units");
assert(byName.sad_girl_play_cost_lock.allowedDifferentCost === true, "骨の少女 should allow different play costs");
assert(byName.sad_girl_play_cost_lock.blockedUnitStillInHand === true, "blocked summon should leave card in hand");
assert(byName.sad_girl_play_cost_lock_inactive_without_sad_girl.summonOk === true, "play cost lock should not apply without Sad Girl");

console.log(JSON.stringify({ ok: true, cases: results.map((result) => result.name) }, null, 2));
