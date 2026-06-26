/** Utilities to compare Firebase card data with local bundled fallbacks. */

export const DECKMAKER_RESOURCE_TO_LOCAL = {
  human: "people",
  gold: "funds",
  nature: "nature",
  mineral: "ore",
  fuel: "fuel",
  electric: "electric",
  magic: "magic",
};

export function normalizeDescription(text) {
  return String(text || "").replace(/\s+/g, "").trim();
}

export function normalizePlayCosts(costs = {}) {
  const play = costs?.play || costs || {};
  const out = {};
  for (const [key, amount] of Object.entries(play)) {
    const localKey = DECKMAKER_RESOURCE_TO_LOCAL[key] || key;
    const n = Number(amount) || 0;
    if (n > 0) out[localKey] = n;
  }
  return JSON.stringify(out, Object.keys(out).sort());
}

export function normalizeGenerates(generates = {}) {
  const out = {};
  for (const [key, amount] of Object.entries(generates || {})) {
    const localKey = DECKMAKER_RESOURCE_TO_LOCAL[key] || key;
    const n = Number(amount) || 0;
    if (n > 0) out[localKey] = n;
  }
  return JSON.stringify(out, Object.keys(out).sort());
}

export function cardDataSnapshot(deckmakerCard) {
  if (!deckmakerCard) return null;
  return {
    name: String(deckmakerCard.name || ""),
    description: normalizeDescription(deckmakerCard.description),
    playCosts: normalizePlayCosts(deckmakerCard.costs),
    generates: normalizeGenerates(deckmakerCard.generates),
    tactSubType: String(deckmakerCard.tactSubType || ""),
    type: String(deckmakerCard.type || ""),
  };
}

export function diffCardSnapshots(firebaseCard, localCard) {
  const fb = cardDataSnapshot(firebaseCard);
  const local = cardDataSnapshot(localCard);
  if (!fb || !local) return [];
  const diffs = [];
  for (const field of ["name", "description", "playCosts", "generates", "tactSubType", "type"]) {
    if (fb[field] !== local[field]) {
      diffs.push({ field, firebase: fb[field], local: local[field] });
    }
  }
  return diffs;
}

export function buildLocalCardIndex(supplementalCards = [], deckmakerCards = []) {
  const byId = new Map();
  for (const card of deckmakerCards) {
    if (card?.id) byId.set(card.id, card);
  }
  for (const card of supplementalCards) {
    if (card?.id) byId.set(card.id, card);
  }
  return byId;
}

export function collectCardDrift({
  firebaseCards = [],
  supplementalCards = [],
  deckmakerCards = [],
  hardcodedBaselines = {},
  watchIds = [],
}) {
  const firebaseById = new Map(firebaseCards.filter((c) => c?.id).map((c) => [c.id, c]));
  const localById = buildLocalCardIndex(supplementalCards, deckmakerCards);
  const entries = [];

  for (const id of watchIds) {
    const firebaseCard = firebaseById.get(id);
    const localCard = localById.get(id);
    const baselineText = hardcodedBaselines[id];
    const item = { id, name: firebaseCard?.name || localCard?.name || id, diffs: [] };

    if (!firebaseCard && !localCard) {
      item.diffs.push({ field: "presence", firebase: "missing", local: "missing" });
      entries.push(item);
      continue;
    }
    if (!firebaseCard) {
      item.diffs.push({ field: "presence", firebase: "missing", local: "present" });
    } else if (!localCard) {
      item.diffs.push({ field: "presence", firebase: "present", local: "missing" });
    } else {
      item.diffs.push(...diffCardSnapshots(firebaseCard, localCard));
    }

    if (firebaseCard && baselineText) {
      const fbDesc = normalizeDescription(firebaseCard.description);
      const baselineDesc = normalizeDescription(baselineText);
      if (fbDesc !== baselineDesc) {
        item.diffs.push({ field: "baselineDescription", firebase: fbDesc, local: baselineDesc });
      }
    }

    if (item.diffs.length) entries.push(item);
  }

  return entries;
}
