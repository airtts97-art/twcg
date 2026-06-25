const KNOWN_KEYWORD_LABELS = [
  "装甲", "貫通", "衝撃", "帯電", "機動", "連撃", "航空", "対空", "曲射", "伝説",
  "警戒", "守護", "自爆", "奇襲", "不動", "不攻", "魂", "魂支払", "巨撃", "効果保護",
  "効果貫通", "構造挑発", "降臨", "一傷防御",
];

const KNOWN_ABILITY_EFFECTS = new Set([
  "produceResource", "drawCards", "gainResource", "millCards", "destroyAll", "destroyAllEnemyUnits",
  "searchSelfToHand", "destroyTargetStruct", "destroyEnemyStructs", "destroyEnemyStructsOnPlay",
  "summonSelfFromDump", "buffTagUnitsAtk", "buffFriendlyUnitsHp", "grantEffectProtectToAdjacent",
  "buffSelfAtk", "buffSelfHpFromTagCount", "gainPerStructTag", "chooseGainResource", "buffSelfHp",
  "addCounters", "addCounterOnFirstAttack", "bigConstructionPlanPlay", "bigConstructionPlanActivate",
  "defeatIfNamedUnitDestroyed", "gainStatBuff", "coreStructStartDiscardOrHP", "addCounterIfTagDestroyed",
  "discardForDraw", "grantCounterArmor", "payGoldAndDeployHero", "healSelfAndRemoveCounter",
  "coreDeathCounter", "grantIndestructibleToTagUnits", "gainResourcePlusPerStructTag", "opponentDiscard",
  "drawPlusPayResource", "destroyUpToEnemyCards", "destroyFriendlyUnitDraw", "controlEnemyUnitToSummonRow",
  "prohibitOpponentTact", "summonNamedFromHand", "removeLifeCounterOrBottomDeck", "reviveTagUnitsUpToCost",
  "damageRestedTarget", "exileTargetNonNeutralNonUnifall", "exileAllNonNeutralNonUnifall", "reviveFromExile",
  "grantKeywordsToAllMagicMachines", "damageAllEnemiesAndPushBack", "reviveStructFromDump",
  "buffFriendlyUnitsAtk", "descentEffect", "searchUnitToCostHand", "searchCardToHand",
  "summonGolemFromDeckOrDump", "summonGolemToSameRow", "tactToStructOverStruct", "summonSelfFromDumpMobile",
  "mysticCapture", "damageEnemyCore", "damageTargetUnit", "grantDestroyGain", "chooseExchange",
  "chooseProduceResource", "chooseSummonGolem", "destroySelf", "searchDeckByType", "searchDeckMinCostToHand",
  "revealTopNPick", "payResourceOrCoreDamage", "gainShockOrAlert", "grantKeywordsToEnemyRelativeRow",
  "destroySelfIfUnrested", "summonToken", "gainActCostResources", "reviveUnitFromDump", "restTargetNoUnrest",
  "produceResourceCostHP", "produceResourceCostHuman", "deployNamedFromDecks", "grantTactPeopleDiscount",
  "adjacentTagBuff", "grantMobileIfAnyTag", "grantConditionalKeywordsByCounter", "goldGolemStrike",
  "payDestroyUpToEnemyCards", "registerDumpLifeGain", "enterRestedLocked", "unrestSelf",
  "summonTagFromDumpAndRest", "summonHandUnitToOpponent", "kaijuAwaken", "damageOwnCore",
  "redirectDamageToOther", "revealTagsForResources", "surviveDamageAndOptionalBuff",
]);

const STRUCT_PRODUCTION_EFFECTS = new Set([
  "produceResource", "produceResourceCostHP", "produceResourceCostHuman", "chooseProduceResource",
]);

const EFFECT_TRIGGER_RE = /(?:出撃|召喚|破壊|レスト|アクト|構造フェイズ|ターン開始|ターン終了|被ダメージ|攻撃|撃破|除外|手札から|デッキから|墓地から|召喚された|配置された|コアが|相手のターン|自分のターン|プレイした|使用した|ダメージを与えた)(?:時|して|された|した|に)/;

function extractBracketTokens(text) {
  const tokens = [];
  for (const match of String(text || "").matchAll(/\[([^\]]+)\]/g)) {
    tokens.push(match[1]);
  }
  return tokens;
}

function keywordLabelFromToken(token) {
  return String(token || "")
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩⓵⓶⓷⓸⓹⓺⓻⓼⓽⓾0-9０-９]+/g, "")
    .trim();
}

function isKnownKeywordToken(token) {
  const label = keywordLabelFromToken(token);
  if (!label) return true;
  return KNOWN_KEYWORD_LABELS.some((known) => label === known || label.startsWith(known));
}

function hasResourceBackedCoreRules(card) {
  if (card.type !== "core") return false;
  const hasValues = (obj) => Object.values(obj || {}).some((amount) => Number(amount) > 0);
  return hasValues(card.income) || hasValues(card.startResources) || Boolean(card.deckRestriction);
}

function hasLikelyUnparsedEffect(card) {
  const text = String(card.text || card.description || "").trim();
  if (!text) return false;

  const withoutLeadingKeywords = text.replace(/^(?:\s*\[[^\]]+\])+/, "").trim();
  if (!withoutLeadingKeywords) return false;
  if ((card.abilities || []).length > 0) return false;
  if (card.fixture) return false;
  if (hasResourceBackedCoreRules(card)) return false;

  if (card.type === "struct") {
    const hasProduction = (card.abilities || []).some((ability) => STRUCT_PRODUCTION_EFFECTS.has(ability.effect));
    if (hasProduction) return false;
  }

  return EFFECT_TRIGGER_RE.test(withoutLeadingKeywords);
}

export function applyCardCompatibility(card) {
  if (!card) return card;
  if (card.fixture) {
    card.compatibilityIssues = [];
    card.processable = true;
    return card;
  }

  const issues = [];
  const text = String(card.text || card.description || "");

  for (const token of extractBracketTokens(text)) {
    if (!isKnownKeywordToken(token)) {
      issues.push(`未知キーワード[${token}]`);
    }
  }

  for (const ability of card.abilities || []) {
    if (ability?.effect && !KNOWN_ABILITY_EFFECTS.has(ability.effect)) {
      issues.push(`未実装効果:${ability.effect}`);
    }
  }

  if (hasLikelyUnparsedEffect(card)) {
    issues.push("効果再現不可（テキスト未解析）");
  }

  card.compatibilityIssues = issues;
  card.processable = issues.length === 0;
  return card;
}

export function refreshCatalogCompatibility(cardCatalog) {
  for (const group of ["cores", "main", "structs"]) {
    for (const card of Object.values(cardCatalog[group] || {})) {
      applyCardCompatibility(card);
    }
  }
}

export function compatibilityWarningForCard(card) {
  if (!card?.compatibilityIssues?.length) return "";
  return card.compatibilityIssues.join(" / ");
}
