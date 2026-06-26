import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAllFirebaseCards } from "../src/firebase_cards.js";
import { collectCardDrift } from "../src/card_firebase_sync.js";
import { IMPLEMENTED_CARD_IDS } from "../src/card_implemented_registry.js";
import hardcodedBaselines from "../src/card_hardcoded_baselines.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadSupplementalCards() {
  const mod = await import("../src/supplemental_cards.js");
  return mod.default || [];
}

async function loadDeckmakerCards() {
  const dir = join(root, "deckmaker_cards");
  const files = await readdir(dir);
  const cards = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      cards.push(JSON.parse(await readFile(join(dir, file), "utf8")));
    } catch {
      // skip invalid
    }
  }
  return cards;
}

const firebaseCards = await fetchAllFirebaseCards();
const supplementalCards = await loadSupplementalCards();
const deckmakerCards = await loadDeckmakerCards();
const watchIds = [...IMPLEMENTED_CARD_IDS].sort();

const drift = collectCardDrift({
  firebaseCards,
  supplementalCards,
  deckmakerCards,
  hardcodedBaselines: hardcodedBaselines.baselines || {},
  watchIds,
});

console.log(`Firebase cards: ${firebaseCards.length}`);
console.log(`Implemented cards checked: ${watchIds.length}`);
console.log(`Drift entries: ${drift.length}\n`);

for (const entry of drift) {
  console.log(`## ${entry.name} (${entry.id})`);
  for (const diff of entry.diffs) {
    console.log(`  - ${diff.field}`);
    console.log(`      firebase: ${diff.firebase}`);
    console.log(`      local:    ${diff.local}`);
  }
  console.log("");
}

if (!drift.length) {
  console.log("No differences between Firebase and local bundled data for implemented cards.");
}

process.exit(drift.length ? 1 : 0);
