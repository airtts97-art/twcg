import baselineData from "./card_hardcoded_baselines.js";

/** Card IDs whose abilities are implemented with hardcoded logic in main.js. */
export const HARDCODED_CARD_IDS = new Set(baselineData.ids);

/** Description text that the hardcoded implementation was written against. */
export const HARDCODED_TEXT_BASELINES = baselineData.baselines;

export function normalizeCardTextForBaseline(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/　/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function isHardcodedCard(cardId) {
  return HARDCODED_CARD_IDS.has(String(cardId || ""));
}

export function getHardcodedTextBaseline(cardId) {
  const id = String(cardId || "");
  return Object.hasOwn(HARDCODED_TEXT_BASELINES, id) ? HARDCODED_TEXT_BASELINES[id] : null;
}

export function hasHardcodedTextChanged(card) {
  if (!card?.id || !isHardcodedCard(card.id)) return false;
  const baseline = getHardcodedTextBaseline(card.id);
  if (baseline == null) return false;
  const current = normalizeCardTextForBaseline(card.text || card.description || "");
  return current !== normalizeCardTextForBaseline(baseline);
}
