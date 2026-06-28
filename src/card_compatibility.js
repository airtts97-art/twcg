import { getHardcodedTextBaseline, hasHardcodedTextChanged, isHardcodedCard } from "./card_hardcoded_registry.js";
import { isImplementedCard } from "./card_implemented_registry.js";

const KNOWN_KEYWORD_LABELS = [
  "装甲", "貫通", "衝撃", "帯電", "機動", "連撃", "航空", "対空", "曲射", "伝説",
  "警戒", "守護", "自爆", "奇襲", "不動", "不攻", "魂", "魂支払", "巨撃", "効果保護",
  "効果貫通", "構造挑発", "降臨", "一傷防御", "制圧", "データリンク",
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
  "summonGolemFromDeck", "summonGolemFromDeckOrDump", "summonGolemToSameRow", "tactToStructOverStruct", "summonSelfFromDumpMobile",
  "mysticCapture", "damageEnemyCore", "damageTargetUnit", "grantDestroyGain", "chooseExchange",
  "structPayRestChooseResource", "structPayDrawProduce", "identityPrivateOnSummon", "identityKaijuSummonFromDump",
  "stripNeutralUnitAbilities", "discardEqualToFieldUnits", "colorfulTurnEndRemap", "sheriffOnSummon",
  "imposterTactPlay", "imposterDestroyNeutral",
  "otherworldKinTactPlay",
  "northeastGloryTactPlay",
  "chooseProduceResource", "chooseSummonGolem", "destroySelf", "searchDeckByType", "searchDeckMinCostToHand",
  "revealTopNPick", "payResourceOrCoreDamage", "gainShockOrAlert", "grantKeywordsToEnemyRelativeRow",
  "destroySelfIfUnrested", "summonToken", "gainActCostResources", "reviveUnitFromDump", "restTargetNoUnrest",
  "produceResourceCostHP", "produceResourceCostHuman", "deployNamedFromDecks", "grantTactPeopleDiscount",
  "adjacentTagBuff", "grantMobileIfAnyTag", "grantConditionalKeywordsByCounter", "goldGolemStrike",
  "payDestroyUpToEnemyCards", "registerDumpLifeGain", "enterRestedLocked", "unrestSelf",
  "summonTagFromDumpAndRest", "summonHandUnitToOpponent", "kaijuAwaken", "damageOwnCore",
  "redirectDamageToOther", "revealTagsForResources", "surviveDamageAndOptionalBuff",
  "vsTagAtkBonus", "spendCountersForBuff", "selfCounterDeathShield",
  "payOnAttackEnhance",
  "payOptionalOnSummonSearch",
  "payOnSummonGrantBraveBlood",
  "buffSelfAtkThisAttack", "destroyAllUnits", "expandDataLinkRange",
  "discardHandToMillOpponentDeck",
]);

const STRUCT_PRODUCTION_EFFECTS = new Set([
  "produceResource", "produceResourceCostHP", "produceResourceCostHuman", "chooseProduceResource",
  "structPayRestChooseResource", "structPayDrawProduce",
]);

const EFFECT_TRIGGER_RE = /(?:出撃|召喚|破壊|レスト|アクト|構造フェイズ|ターン開始|ターン終了|被ダメージ|攻撃|撃破|除外|手札から|デッキから|墓地から|召喚された|配置された|コアが|相手のターン|自分のターン|プレイした|使用した|ダメージを与えた)(?:時|して|された|した|に)/;

const CARD_CONDITION_AFTER_BRACKET_RE = /^(?:\[[^\]]+\])*(?:ユニット|タクト|カード|指令|施設|ストラクト|Wild|Grand|コア|フォート|タグ|のカード|ユニットカード|があれば|のカードを|を見せ|・(?:プレイコスト|コスト))/;

function keywordLabelFromToken(token) {
  return String(token || "")
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩⓵⓶⓷⓸⓹⓺⓻⓼⓽⓾0-9０-９]+/g, "")
    .trim();
}

function isCardConditionBracket(text, start, bracketLength) {
  const after = String(text || "").slice(start + bracketLength);
  return CARD_CONDITION_AFTER_BRACKET_RE.test(after);
}

function isTagConditionOnCard(token, card) {
  const label = keywordLabelFromToken(token);
  const tags = card?.tags || [];
  if (tags.includes(token) || (label && tags.includes(label))) return true;
  const requirements = [
    ...(card?.specialRequirements || []),
    ...(card?.deckRestriction?.tags || []),
  ];
  return requirements.some((entry) => String(entry).includes(`[${token}]`) || (label && String(entry).includes(`[${label}]`)));
}

function isKnownKeywordToken(token) {
  const label = keywordLabelFromToken(token);
  if (!label) return true;
  return KNOWN_KEYWORD_LABELS.some((known) => label === known || label.startsWith(known));
}

function findUnknownKeywordIssues(text, card) {
  const issues = [];
  const source = String(text || "");
  for (const match of source.matchAll(/\[([^\]]+)\]/g)) {
    const token = match[1];
    const start = match.index ?? 0;
    const bracketLength = match[0].length;
    if (isCardConditionBracket(source, start, bracketLength)) continue;
    if (isTagConditionOnCard(token, card)) continue;
    if (!isKnownKeywordToken(token)) {
      issues.push(`未知キーワード[${token}]`);
    }
  }
  return issues;
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

  if (isImplementedCard(card.id)) {
    card.compatibilityIssues = [];
    card.processable = true;
    card.implementationVerified = true;
    return card;
  }

  const issues = [];
  const text = String(card.text || card.description || "");
  issues.push(...findUnknownKeywordIssues(text, card));

  for (const ability of card.abilities || []) {
    if (ability?.effect && !KNOWN_ABILITY_EFFECTS.has(ability.effect)) {
      issues.push(`未実装効果:${ability.effect}`);
    }
  }

  if (hasLikelyUnparsedEffect(card)) {
    issues.push("効果再現不可（テキスト未解析）");
  }

  if (hasHardcodedTextChanged(card)) {
    issues.push("機能不全警告（固有能力カードのテキスト変更）");
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

export function listCatalogCards(cardCatalog) {
  const cards = [];
  for (const group of ["cores", "main", "structs"]) {
    for (const card of Object.values(cardCatalog[group] || {})) {
      if (!card?.id || card.fixture) continue;
      cards.push({ ...card, catalogGroup: group });
    }
  }
  return cards.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja"));
}

export function buildIncompleteCardReport(card) {
  const text = String(card.text || card.description || "");
  const hardcoded = isHardcodedCard(card.id);
  const baselineText = hardcoded ? getHardcodedTextBaseline(card.id) : null;
  return {
    id: card.id,
    name: card.name,
    type: card.type,
    faction: card.faction || "",
    catalogGroup: card.catalogGroup || "",
    text,
    issues: [...(card.compatibilityIssues || [])],
    hardcoded,
    baselineText,
    textChanged: hardcoded && baselineText != null && text !== baselineText,
    abilities: (card.abilities || []).map((ability) => ({ ...ability })),
    keywords: (card.keywords || []).map((keyword) => ({ ...keyword })),
    tags: [...(card.tags || [])],
    cost: { ...(card.cost || {}) },
    actCost: { ...(card.actCost || {}) },
  };
}

export function collectIncompleteCardReports(cardCatalog) {
  return listCatalogCards(cardCatalog)
    .filter((card) => card.compatibilityIssues?.length > 0)
    .map((card) => buildIncompleteCardReport(card));
}

function formatAbilityLine(ability) {
  const parts = [`${ability.trigger || "?"} → ${ability.effect || "?"}`];
  const extras = Object.entries(ability).filter(([key]) => !["trigger", "effect"].includes(key));
  if (extras.length) {
    parts.push(`(${extras.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(", ")})`);
  }
  return parts.join(" ");
}

export function buildIncompleteCardDataText(reports, { exportedAt = new Date().toISOString() } = {}) {
  const lines = [
    "Threads World Card Game — 不足データ一覧",
    `出力日時: ${exportedAt}`,
    `対象カード数: ${reports.length}`,
    "",
  ];

  for (const [index, report] of reports.entries()) {
    lines.push(`${"=".repeat(72)}`);
    lines.push(`[${index + 1}/${reports.length}] ${report.id} / ${report.name}`);
    lines.push(`種類: ${report.type} / 陣営: ${report.faction || "なし"} / カタログ: ${report.catalogGroup}`);
    lines.push(`問題: ${report.issues.join(" / ")}`);
    lines.push(`固有能力実装: ${report.hardcoded ? "あり" : "なし"}`);
    if (report.tags.length) lines.push(`タグ: ${report.tags.join(" / ")}`);
    if (report.keywords.length) {
      lines.push(`キーワード: ${report.keywords.map((kw) => `${kw.id}${kw.value ? `(${kw.value})` : ""}`).join(" / ")}`);
    }
    if (report.abilities.length) {
      lines.push("解析済み能力:");
      for (const ability of report.abilities) lines.push(`  - ${formatAbilityLine(ability)}`);
    } else {
      lines.push("解析済み能力: なし");
    }
    lines.push("--- 現在のテキスト ---");
    lines.push(report.text || "（テキストなし）");
    if (report.textChanged && report.baselineText != null) {
      lines.push("--- 固有能力の基準テキスト ---");
      lines.push(report.baselineText || "（テキストなし）");
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export function buildIncompleteCardDataPayload(cardCatalog) {
  const exportedAt = new Date().toISOString();
  const cards = collectIncompleteCardReports(cardCatalog);
  return {
    exportedAt,
    count: cards.length,
    cards,
    textReport: buildIncompleteCardDataText(cards, { exportedAt }),
  };
}
