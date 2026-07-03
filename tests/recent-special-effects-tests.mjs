import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const playwrightPackage = path.join(os.homedir(), ".codex", "skills", "node_modules", "playwright", "package.json");
const require = createRequire(playwrightPackage);
const { chromium } = require("playwright");

const url = process.argv[2] || "http://127.0.0.1:5175";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") pageErrors.push(message.text());
});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Boolean(window.__twcg));
await page.waitForFunction(() => window.__twcg.testing.catalogCard("card_1782926307471")?.hp === 4);

const checks = await page.evaluate(() => {
  const api = window.__twcg;
  const fullResources = { funds: 30, people: 30, nature: 30, ore: 30, fuel: 30, electric: 30, magic: 30 };
  const results = {};

  function reset() {
    api.testing.reset({ emptyHands: true, resources: { p1: fullResources, p2: fullResources } });
    api.state.activePlayer = "p1";
    api.state.phase = "main";
  }

  reset();
  const restedChurch = structuredClone(api.testing.catalogCard("card_1782995682140"));
  restedChurch.rested = true;
  api.state.players.p1.structs = [restedChurch];
  api.state.players.p1.resources.magic = 0;
  for (let index = 0; index < 4; index += 1) {
    api.testing.notifyHandOrDumpCardExiled("p1", "hand", { name: `除外テスト${index + 1}` });
  }
  results.churchPassiveWhileRested = restedChurch.rested
    && api.state.players.p1.resources.magic === 3
    && restedChurch.exileMagicGainedThisTurn === 3;

  reset();
  const arc = api.testing.placeUnit("card_1782991288361", "p1", 2, 5, { rested: false });
  const arcTarget = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false });
  api.testing.selectUnit(2, 5);
  api.testing.activateSelectedUnit();
  api.testing.resolveChooseUnitActivate("placeCharmCounters");
  const arcChoiceOpened = api.state.pendingChoice?.type === "charmCounterPlacement";
  api.testing.toggleCharmCounterPlacementTarget(1, 5);
  api.testing.resolveCharmCounterPlacementConfirm();
  results.arcSuccubusCharm = arcChoiceOpened && arcTarget.charmCounters === 2 && arc.rested;

  const summonCharmSpecs = [
    ["card_1782991288361", 2],
    ["card_1782990420906", 1],
    ["card_1782991941200", 2],
    ["card_1782992896163", 2],
  ];
  let allSuccubusSummonChoicesOpened = true;
  for (const [cardId, expectedCounters] of summonCharmSpecs) {
    reset();
    const summonSource = api.testing.placeUnit(cardId, "p1", 2, 5, { rested: false });
    const summonTarget = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false });
    api.testing.triggerAbilities("p1", summonSource, "onSummon");
    allSuccubusSummonChoicesOpened &&= api.state.pendingChoice?.type === "charmCounterPlacement";
    api.testing.toggleCharmCounterPlacementTarget(1, 5);
    api.testing.resolveCharmCounterPlacementConfirm();
    allSuccubusSummonChoicesOpened &&= summonTarget.charmCounters === expectedCounters;
  }
  results.succubusSummonCharmUsesChoiceUI = allSuccubusSummonChoicesOpened;

  reset();
  const worm = api.testing.placeUnit("card_1783011918209", "p1", 2, 5, { rested: false });
  api.testing.setResources("p1", { ...fullResources, magic: 3 });
  api.testing.endTurn();
  const wormChoiceHeldTurn = api.state.activePlayer === "p1" && api.state.pendingChoice?.type === "optionalPayTurnEnd";
  api.testing.resolveOptionalPayTurnEnd(true);
  results.turnEndChoiceSequencing = wormChoiceHeldTurn
    && api.state.activePlayer === "p2"
    && api.state.players.p1.resources.magic === 0
    && worm.effectTargetImmuneForActivePlayer === "p2";

  reset();
  const lockTarget = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false });
  api.abilityEffects.unknownWormSummonRest({
    game: api.state,
    playerId: "p1",
    card: worm,
    ability: { effect: "unknownWormSummonRest" },
    source: { zone: "board" },
  });
  api.testing.toggleMultiUnitTarget(1, 5);
  api.testing.resolveMultiUnitTargetConfirm();
  api.testing.startTurn("p2", { skipDraw: true });
  const lockedForNextTurn = lockTarget.rested && lockTarget.lockedRestTurns === 0;
  api.testing.startTurn("p2", { skipDraw: true });
  results.restLockExpires = lockedForNextTurn && !lockTarget.rested && lockTarget.lockedRestTurns === 0;

  reset();
  const noUnrestTarget = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false });
  api.abilityEffects.restTargetNoUnrest({ game: api.state, target: noUnrestTarget });
  api.testing.startTurn("p2", { skipDraw: true });
  const skippedNextUnrest = noUnrestTarget.rested && noUnrestTarget.lockedRestTurns === 0;
  api.testing.startTurn("p2", { skipDraw: true });
  results.nextTurnNoUnrest = skippedNextUnrest && !noUnrestTarget.rested;

  reset();
  api.testing.placeUnit("card_1782818887721", "p1", 2, 5, { rested: false });
  const notionPrimary = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false, hp: 20 });
  const notionAdjacent = api.testing.placeUnit("armoredCar", "p2", 1, 4, { rested: false, hp: 20 });
  api.testing.selectUnit(2, 5);
  api.testing.attack({ kind: "unit", row: 1, col: 5 });
  if (api.state.pendingChoice?.type === "chargeAttack") api.testing.resolveChargeAttack(false);
  const notionChoice = api.state.pendingChoice;
  // Exercise the same JSON round trip used by online state synchronization.
  api.state.pendingChoice = JSON.parse(JSON.stringify(notionChoice));
  api.testing.resolvePayEnemyAttackCostsAndRest(true);
  const bothNotionTargetsLocked = notionPrimary.rested
    && notionAdjacent.rested
    && notionPrimary.skipNextOwnerUnrest
    && notionAdjacent.skipNextOwnerUnrest;
  api.testing.startTurn("p2", { skipDraw: true });
  const bothRemainRested = notionPrimary.rested
    && notionAdjacent.rested
    && !notionPrimary.skipNextOwnerUnrest
    && !notionAdjacent.skipNextOwnerUnrest;
  api.testing.startTurn("p2", { skipDraw: true });
  results.notionAdjacentRestPersistsThroughNextTurn = bothNotionTargetsLocked
    && bothRemainRested
    && !notionPrimary.rested
    && !notionAdjacent.rested;

  reset();
  const eater = api.testing.placeUnit("card_1782992896163", "p1", 2, 5, { rested: false });
  const counterHolder = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false });
  counterHolder.charmCounters = 8;
  api.testing.destroyUnitByEffect(eater, { source: { name: "test destroy" } });
  const shieldChoiceOpened = api.state.pendingChoice?.type === "charmDestroyShield";
  api.testing.resolveCharmDestroyShield(false);
  results.charmShieldDeclineDestroys = shieldChoiceOpened
    && api.state.board[2][5] === null
    && api.state.players.p1.exileZone.some((card) => card.id === eater.id);

  reset();
  const queuedEater = api.testing.placeUnit("card_1782992896163", "p1", 2, 5, { rested: false });
  const deity = api.testing.placeUnit("militia", "p1", 2, 4, { rested: false });
  deity.tags = ["\u795e\u683c"];
  api.testing.placeUnit("militia", "p2", 1, 5, { rested: false });
  api.testing.triggerAbilities("p1", queuedEater, "onSummon");
  api.testing.notifyDivineTagPresence("p1", queuedEater);
  const charmNotOverwritten = api.state.pendingChoice?.type === "charmCounterPlacement"
    && api.state.effectQueue.some((item) => item.ability?.effect === "verzariaDivineOffer");
  api.testing.toggleCharmCounterPlacementTarget(1, 5);
  api.testing.resolveCharmCounterPlacementConfirm();
  results.divineChoiceQueuedAfterCharm = charmNotOverwritten && api.state.pendingChoice?.type === "verzariaDivine";

  reset();
  const ashita = api.testing.placeUnit("card_1783013688397", "p1", 2, 5, { rested: false });
  const precisionStrike = structuredClone(api.testing.catalogCard("precisionStrike"));
  ashita.tactStack = [precisionStrike];
  const stackedTarget = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false });
  const hpBeforeStackedTact = stackedTarget.currentHp;
  api.testing.selectUnit(2, 5);
  api.testing.activateSelectedUnit();
  api.testing.resolveChooseUnitActivate("ashitaUseStackedTact");
  api.testing.resolveAshitaStackPick(0);
  const stackedTargetPrompt = api.state.pendingTarget?.ability?.effect === "damageTargetUnit";
  api.testing.resolveTarget(1, 5);
  results.ashitaTargetedTact = stackedTargetPrompt
    && stackedTarget.currentHp === hpBeforeStackedTact - 2
    && api.state.players.p1.dump.some((card) => card.id === "precisionStrike");

  reset();
  const bounceAshita = api.testing.placeUnit("card_1783013688397", "p1", 2, 5, { rested: false });
  bounceAshita.tactStack = [structuredClone(precisionStrike), structuredClone(precisionStrike)];
  const bounceTarget = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false });
  api.abilityEffects.ashitaStackDiscardBounce({ game: api.state, playerId: "p1", card: bounceAshita, target: bounceTarget });
  results.ashitaBounceDiscardsStack = bounceAshita.tactStack.length === 0
    && api.state.players.p1.dump.filter((card) => card.id === "precisionStrike").length === 2
    && api.state.players.p2.hand.some((card) => card.id === bounceTarget.id);

  reset();
  const high = api.testing.placeUnit("card_1782990420906", "p1", 3, 9, { rested: false });
  const forcedAttacker = api.testing.placeUnit("militia", "p2", 1, 5, { rested: true });
  const forcedDefender = api.testing.placeUnit("militia", "p1", 2, 5, { rested: false });
  forcedAttacker.charmCounters = 5;
  const attackerHpBefore = forcedAttacker.currentHp;
  const defenderHpBefore = forcedDefender.currentHp;
  api.abilityEffects.highSuccubusForcedAttack({ game: api.state, playerId: "p1", card: high, target: forcedAttacker });
  results.highSuccubusFullCombat = forcedAttacker.charmCounters === 0
    && forcedAttacker.rested
    && forcedAttacker.currentHp < attackerHpBefore
    && forcedDefender.currentHp < defenderHpBefore;

  reset();
  const distantHigh = api.testing.placeUnit("card_1782990420906", "p1", 3, 9, { rested: false });
  const charmedAttacker = api.testing.placeUnit("militia", "p2", 1, 5, { rested: true });
  const adjacentToCharmedA = api.testing.placeUnit("militia", "p1", 2, 5, { rested: false });
  const adjacentToCharmedB = api.testing.placeUnit("militia", "p1", 1, 4, { rested: false });
  const adjacentOnlyToHigh = api.testing.placeUnit("militia", "p1", 2, 9, { rested: false });
  charmedAttacker.charmCounters = 5;
  api.abilityEffects.highSuccubusForcedAttack({
    game: api.state,
    playerId: "p1",
    card: distantHigh,
    target: charmedAttacker,
  });
  const pendingForcedAttack = api.state.pendingChoice;
  const forcedTargetIds = [...(pendingForcedAttack?.targetInstanceIds || [])];
  const candidatesUseCharmedAdjacency = pendingForcedAttack?.attackerInstanceId === charmedAttacker.instanceId
    && forcedTargetIds.includes(adjacentToCharmedA.instanceId)
    && forcedTargetIds.includes(adjacentToCharmedB.instanceId)
    && !forcedTargetIds.includes(adjacentOnlyToHigh.instanceId);
  // Simulate the JSON round trip used by online state synchronization.
  api.state.pendingChoice = JSON.parse(JSON.stringify(pendingForcedAttack));
  const chosenForcedTargetIndex = forcedTargetIds.indexOf(adjacentToCharmedB.instanceId);
  const chosenHpBefore = adjacentToCharmedB.currentHp;
  const decoyHpBefore = adjacentOnlyToHigh.currentHp;
  api.testing.resolveHighSuccubusForcedAttackTarget(chosenForcedTargetIndex);
  results.highSuccubusUsesCharmedUnitAdjacency = candidatesUseCharmedAdjacency
    && adjacentToCharmedB.currentHp < chosenHpBefore
    && adjacentOnlyToHigh.currentHp === decoyHpBefore
    && charmedAttacker.charmCounters === 0;

  reset();
  const toy = api.testing.placeUnit("card_1783013402820", "p1", 2, 5, { rested: false });
  const toyTarget = api.testing.placeUnit("militia", "p1", 2, 4, { rested: false, counters: 1 });
  api.state.players.p1.dump.push(structuredClone(precisionStrike));
  api.abilityEffects.dailyToyRemoveCounter({ game: api.state, playerId: "p1", card: toy, ability: {}, source: { damage: 0 } });
  api.testing.resolveRemoveFieldCounter(2, 4);
  results.dailyToyCounterAndRecovery = toyTarget.counters === 0
    && api.state.players.p1.hand.some((card) => card.id === "precisionStrike");

  reset();
  const succubus = api.testing.placeUnit("card_1782926307471", "p1", 2, 5, { rested: false });
  succubus.currentHp = 1;
  succubus.atk = 3;
  const pureHuman = api.testing.placeUnit("militia", "p2", 1, 5, { rested: true });
  pureHuman.currentHp = 8;
  pureHuman.maxHp = 8;
  pureHuman.keywords = [];
  pureHuman.tags = ["\u7d14\u4eba\u9593"];
  const succubusHpBefore = succubus.currentHp;
  api.testing.selectUnit(2, 5);
  api.testing.attack({ kind: "unit", row: 1, col: 5 });
  results.succubusDamageHeal = succubus.currentHp > succubusHpBefore;

  reset();
  const doomedSuccubus = api.testing.placeUnit("card_1782926307471", "p1", 2, 5, { rested: false });
  doomedSuccubus.currentHp = 0;
  api.testing.cleanupAllDestroyed(null, api.state);
  results.succubusDestroyedToExile = api.state.board[2][5] === null
    && api.state.players.p1.exileZone.some((card) => card.id === doomedSuccubus.id);

  reset();
  const bishop = api.testing.placeUnit("card_1782991941200", "p1", 2, 5, { rested: false });
  const bishopTargetA = api.testing.placeUnit("militia", "p2", 1, 4, { rested: false });
  const bishopTargetB = api.testing.placeUnit("militia", "p2", 1, 6, { rested: false });
  api.testing.triggerAbilities("p1", bishop, "onSummon");
  api.testing.toggleCharmCounterPlacementTarget(1, 4);
  api.testing.toggleCharmCounterPlacementTarget(1, 6);
  api.testing.resolveCharmCounterPlacementConfirm();
  results.bishopTwoTargetCharm = bishopTargetA.charmCounters === 2 && bishopTargetB.charmCounters === 2;

  bishopTargetA.atk = 0;
  bishopTargetB.atk = 0;
  api.testing.selectUnit(2, 5);
  api.testing.activateSelectedUnit();
  api.testing.resolveTarget(1, 4);
  api.testing.selectUnit(2, 5);
  api.testing.activateSelectedUnit();
  api.testing.resolveTarget(1, 6);
  results.bishopRepeatedConsume = api.state.board[1][4] === null
    && api.state.board[1][6] === null
    && !bishop.rested;

  reset();
  const controlArc = api.testing.placeUnit("card_1782991288361", "p1", 2, 5, { rested: false });
  const controlledUnit = api.testing.placeUnit("militia", "p2", 1, 5, { rested: true });
  controlledUnit.charmCounters = Object.values(controlledUnit.cost || {}).reduce((sum, amount) => sum + amount, 0);
  api.abilityEffects.charmControlSteal({ game: api.state, playerId: "p1", card: controlArc, target: controlledUnit });
  results.arcSuccubusControl = controlledUnit.owner === "p1" && !controlledUnit.rested && controlledUnit.charmCounters === 0;

  reset();
  const warMaiden = api.testing.placeUnit("card_1782990273879", "p1", 2, 5, { rested: false });
  const charmedDefender = api.testing.placeUnit("militia", "p2", 1, 5, { rested: true, hp: 20 });
  charmedDefender.charmCounters = 2;
  const charmedHpBefore = charmedDefender.currentHp;
  api.testing.selectUnit(2, 5);
  api.testing.attack({ kind: "unit", row: 1, col: 5 });
  const warAttackDamage = charmedHpBefore - charmedDefender.currentHp;
  const warAtkBeforeDamage = warMaiden.atk;
  api.abilityEffects.warMaidenDamageAtkBuff({ game: api.state, playerId: "p1", card: warMaiden, source: { damage: 3 } });
  results.warMaidenBuffs = warAttackDamage === 5 && warMaiden.atk === warAtkBeforeDamage + 3;

  reset();
  const transformBishop = api.testing.placeUnit("card_1782991941200", "p1", 3, 3, { rested: false });
  transformBishop.atk += 3;
  transformBishop.maxHp += 2;
  transformBishop.currentHp += 2;
  api.testing.addHandCard("p1", "card_1782992896163");
  const eaterHandIndex = api.state.players.p1.hand.findIndex((card) => card.id === "card_1782992896163");
  const transformed = api.testing.summonFromHand(eaterHandIndex, 3, 5);
  const transformedEater = api.state.board[3][5];
  results.godEaterTransform = transformed
    && transformedEater?.id === "card_1782992896163"
    && transformedEater.atk === 11
    && transformedEater.maxHp === 18
    && api.state.players.p1.exileZone.some((card) => card.id === transformBishop.id);

  reset();
  const shieldedEater = api.testing.placeUnit("card_1782992896163", "p1", 2, 5, { rested: false });
  const shieldFuel = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false });
  shieldFuel.charmCounters = 8;
  api.testing.destroyUnitByEffect(shieldedEater, { source: { name: "test destroy" } });
  api.testing.resolveCharmDestroyShield(true);
  results.charmShieldAccepts = api.state.board[2][5] === shieldedEater
    && shieldFuel.charmCounters === 0
    && shieldedEater.currentHp > 0;

  reset();
  const coreDamageEater = api.testing.placeUnit("card_1782992896163", "p1", 2, 5, { rested: false });
  const coreHpBefore = api.state.players.p1.core.hp;
  coreDamageEater.currentHp = 0;
  api.testing.cleanupAllDestroyed(null, api.state);
  results.godEaterDeathPenalty = api.state.players.p1.core.hp === coreHpBefore - 10
    && api.state.players.p1.exileZone.some((card) => card.id === coreDamageEater.id);

  reset();
  const escapeDefender = api.testing.placeUnit("militia", "p1", 2, 5, { rested: false });
  const escapeAttacker = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false });
  api.testing.addHandCard("p1", "card_1782997215577");
  api.state.activePlayer = "p2";
  api.state.phase = "main";
  const escapeMagicBefore = api.state.players.p1.resources.magic;
  const escapeElectricBefore = api.state.players.p1.resources.electric;
  api.testing.selectUnit(1, 5);
  api.testing.attack({ kind: "unit", row: 2, col: 5 });
  const escapeChoiceOpened = api.state.pendingChoice?.type === "dimensionEscapeIntercept"
    && api.state.board[2][5] === escapeDefender
    && !escapeAttacker.rested;
  api.testing.resolveDimensionEscapeIntercept(true);
  results.dimensionEscape = escapeChoiceOpened
    && api.state.board[2][5] === null
    && escapeAttacker.rested
    && api.state.players.p1.exileZone.some((card) => card.id === escapeDefender.id)
    && api.state.players.p1.dump.some((card) => card.id === "card_1782997215577")
    && api.state.players.p1.resources.magic === escapeMagicBefore - 1
    && api.state.players.p1.resources.electric === escapeElectricBefore - 1;
  api.testing.startTurn("p2", { skipDraw: true });
  results.dimensionEscapeNormalUnrest = !escapeAttacker.rested && !escapeAttacker.lockedRestTurns;

  reset();
  const declineDefender = api.testing.placeUnit("militia", "p1", 2, 5, { rested: false, hp: 20 });
  const declineAttacker = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false, hp: 20 });
  api.testing.addHandCard("p1", "card_1782997215577");
  api.state.activePlayer = "p2";
  api.state.phase = "main";
  const declineHandBefore = api.state.players.p1.hand.length;
  const declineDefenderHpBefore = declineDefender.currentHp;
  api.testing.selectUnit(1, 5);
  api.testing.attack({ kind: "unit", row: 2, col: 5 });
  const declineChoiceOpened = api.state.pendingChoice?.type === "dimensionEscapeIntercept";
  api.testing.resolveDimensionEscapeIntercept(false);
  results.dimensionEscapeCanDecline = declineChoiceOpened
    && api.state.board[2][5] === declineDefender
    && declineDefender.currentHp < declineDefenderHpBefore
    && api.state.players.p1.hand.length === declineHandBefore
    && !api.state.players.p1.dump.some((card) => card.id === "card_1782997215577");

  reset();
  api.testing.addDumpCard("p1", "precisionStrike");
  api.testing.addDumpCard("p1", "precisionStrike");
  api.testing.addHandCard("p1", "card_1783013688397");
  api.testing.setResources("p1", { ...fullResources, electric: 11 });
  const ashitaHandIndex = api.state.players.p1.hand.findIndex((card) => card.id === "card_1783013688397");
  const ashitaSummoned = api.testing.summonFromHand(ashitaHandIndex, 3, 5);
  const summonedAshita = api.state.board[3][5];
  results.ashitaDiscountAndStack = ashitaSummoned
    && api.state.players.p1.resources.electric === 0
    && summonedAshita.tactStack?.length === 2
    && api.state.players.p1.dump.length === 0;

  reset();
  const damageToy = api.testing.placeUnit("card_1783013402820", "p1", 2, 5, { rested: false });
  const damageCounterTarget = api.testing.placeUnit("militia", "p1", 2, 4, { rested: false, counters: 1 });
  api.abilityEffects.dailyToyRemoveCounter({
    game: api.state,
    playerId: "p1",
    card: damageToy,
    ability: { requiresDamage: true },
    source: { damage: 0 },
  });
  const ignoredZeroDamage = !api.state.pendingChoice && damageCounterTarget.counters === 1;
  const lowCostBounce = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false });
  api.abilityEffects.dailyToyReturnToHand({ game: api.state, playerId: "p1", card: damageToy, target: lowCostBounce });
  results.dailyToyDamageGateAndBounce = ignoredZeroDamage
    && api.state.board[1][5] === null
    && api.state.players.p2.hand.some((card) => card.id === lowCostBounce.id);

  reset();
  const lowNin = api.testing.placeUnit("card_1783012700492", "p1", 2, 5, { rested: false });
  const lowNinTarget = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false, hp: 20 });
  lowNinTarget.atk = 8;
  const lowNinHpBefore = lowNin.currentHp;
  const lowNinTargetHpBefore = lowNinTarget.currentHp;
  api.testing.triggerAbilities("p1", lowNin, "onSummon");
  results.lowNinSummonStrike = lowNinTarget.currentHp < lowNinTargetHpBefore
    && lowNin.currentHp === lowNinHpBefore
    && !lowNin.rested;

  reset();
  const nekoDefender = api.testing.placeUnit("card_1783013402820", "p1", 2, 5, { rested: false });
  const nekoAttacker = api.testing.placeUnit("militia", "p2", 1, 5, { rested: false });
  api.testing.addHandCard("p1", "card_1783012268813");
  api.testing.setResources("p1", { ...fullResources, electric: 2 });
  api.state.activePlayer = "p2";
  api.state.phase = "main";
  const nekoHpBefore = nekoDefender.currentHp;
  api.testing.selectUnit(1, 5);
  api.testing.attack({ kind: "unit", row: 2, col: 5 });
  const nekoChoiceOpened = api.state.pendingChoice?.type === "nekoMasterIntercept";
  api.testing.resolveNekoMasterIntercept(true);
  results.nekoMasterIntercept = nekoChoiceOpened
    && nekoDefender.currentHp === nekoHpBefore
    && api.state.players.p1.resources.electric === 0
    && api.state.players.p1.dump.some((card) => card.id === "card_1783012268813")
    && nekoAttacker.rested;

  reset();
  const multiFour = api.testing.placeUnit("card_1782180616372", "p1", 2, 5, { rested: false });
  const multiTargetA = api.testing.placeUnit("militia", "p2", 1, 5, { rested: true, hp: 20 });
  const multiTargetB = api.testing.placeUnit("militia", "p2", 1, 6, { rested: true, hp: 20 });
  api.testing.selectUnit(2, 5);
  api.testing.attack({ kind: "unit", row: 1, col: 5 });
  const firstMultiAttackContinues = !multiFour.rested
    && multiFour.attacksThisTurn === 1
    && api.state.attackMode
    && multiTargetA.currentHp < 20;
  api.testing.attack({ kind: "unit", row: 1, col: 6 });
  const secondTargetChosenWhileFirstSurvives = !multiFour.rested
    && multiFour.attacksThisTurn === 2
    && api.state.attackMode
    && multiTargetA.currentHp > 0
    && multiTargetB.currentHp < 20;
  api.testing.attack({ kind: "unit", row: 1, col: 5 });
  api.testing.attack({ kind: "unit", row: 1, col: 6 });
  const fourthAttackStillContinues = !multiFour.rested
    && multiFour.attacksThisTurn === 4
    && api.state.attackMode;
  api.testing.attack({ kind: "unit", row: 1, col: 5 });
  results.multiStrikeRetargetsUntilLimit = firstMultiAttackContinues
    && secondTargetChosenWhileFirstSurvives
    && fourthAttackStillContinues
    && multiFour.rested
    && multiFour.attacksThisTurn === 5
    && !api.state.attackMode;

  reset();
  const bareMulti = api.testing.placeUnit("militia", "p1", 2, 5, { rested: false });
  bareMulti.keywords.push({ id: "multiStrike" });
  api.testing.placeUnit("militia", "p2", 1, 5, { rested: true, hp: 20 });
  api.testing.selectUnit(2, 5);
  api.testing.attack({ kind: "unit", row: 1, col: 5 });
  const bareFirstContinues = !bareMulti.rested && bareMulti.attacksThisTurn === 1 && api.state.attackMode;
  api.testing.attack({ kind: "unit", row: 1, col: 5 });
  results.bareMultiStrikeMeansOneExtraAttack = bareFirstContinues
    && bareMulti.rested
    && bareMulti.attacksThisTurn === 2
    && !api.state.attackMode;

  return results;
});

await browser.close();

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ checks, pageErrors }, null, 2));
if (failed.length || pageErrors.length) {
  throw new Error(`Recent special-effect regression failed: ${[...failed, ...pageErrors].join(", ")}`);
}
