import { fetchAllFirebaseCards } from "../src/firebase_cards.js";
import { IMPLEMENTED_CARD_IDS } from "../src/card_implemented_registry.js";
import { HARDCODED_CARD_IDS, HARDCODED_TEXT_BASELINES, normalizeCardTextForBaseline } from "../src/card_hardcoded_registry.js";
import { collectCardDrift, normalizeDescription } from "../src/card_firebase_sync.js";

const firebaseCards = await fetchAllFirebaseCards();
const firebaseById = new Map(firebaseCards.map((c) => [c.id, c]));

const RISK = {
  missing: [],
  baselineMismatch: [],
  costMismatch: [],
  effectLost: [],
  textParseRisk: [],
  ok: [],
};

for (const id of [...IMPLEMENTED_CARD_IDS].sort()) {
  const fb = firebaseById.get(id);
  if (!fb) {
    RISK.missing.push({ id, note: "Firebaseに存在しない（同期後もバンドルのみ）" });
    continue;
  }

  const baseline = HARDCODED_TEXT_BASELINES[id];
  const fbDesc = normalizeCardTextForBaseline(fb.description || "");
  const baseDesc = baseline ? normalizeCardTextForBaseline(baseline) : null;

  // Known high-impact mismatches from manual audit + heuristics
  if (id === "card_1782464860185") {
    RISK.effectLost.push({
      id,
      name: fb.name,
      issue: "Firebase説明文がアクト支払いを含む場合のみ要注意。設置=人魔金(cos.play)、発動=人燃(description)で分離すること",
    });
    continue;
  }
  if (id === "card_1755670973607") {
    RISK.effectLost.push({
      id,
      name: fb.name,
      issue: "Firebase=(効果無し)。実装は毎ターン人②金②。同期後は常駐収入が消える",
    });
    continue;
  }
  if (id === "card_1782225519182") {
    RISK.costMismatch.push({
      id,
      name: fb.name,
      issue: "プレイコストがFirebase(人10金10鉱10自10)と実装想定(人1金6鉱6燃6)で不一致。オーラ等はID固定実装で動くがコストが違う",
    });
    continue;
  }
  if (id === "card_1782307790847") {
    RISK.costMismatch.push({
      id,
      name: fb.name,
      issue: "プレイコスト Firebase=金①鉱③ / 実装想定=人①鉱②",
    });
    continue;
  }
  if (id === "card_1782237267608") {
    RISK.textParseRisk.push({
      id,
      name: fb.name,
      issue: "Firebase文言が改行なしで結合（歩兵対象ATK+1と隣接アトラス北東軍バフが1行）。隣接バフはrefreshContinuousEffects未実装の可能性",
    });
    continue;
  }
  if (id === "card_1782208064951") {
    RISK.textParseRisk.push({
      id,
      name: fb.name,
      issue: "Firebaseに誤字「酒類」。ターン終了時の資源種類変更がパース不能の可能性",
    });
    continue;
  }
  if (id === "card_1782208333313") {
    RISK.textParseRisk.push({
      id,
      name: fb.name,
      issue: "Firebase「コスト送料」表記。実装はコスト総量一致。墓地復帰が動かない可能性",
    });
    continue;
  }
  if (id === "card_1782361783127") {
    RISK.textParseRisk.push({
      id,
      name: fb.name,
      issue: "デッキ2枚制限がFirebase文言に含まれるがエンジン未実装の可能性（破壊効果自体は動く）",
    });
    continue;
  }

  if (baseline && baseDesc !== fbDesc) {
  // minor unicode diffs only?
    const fbNorm = normalizeDescription(fb.description);
    const baseNorm = normalizeDescription(baseline);
    if (fbNorm !== baseNorm) {
      if (id === "card_1753680748888") {
        RISK.ok.push({ id, name: fb.name, note: "全角/半角数字のみの差。実装はID固定で問題なし" });
        continue;
      }
      if (HARDCODED_CARD_IDS.has(id)) {
        RISK.baselineMismatch.push({
          id,
          name: fb.name,
          issue: "ハードコード実装ベースラインとFirebase説明文が不一致（ID固定ロジックがあれば動く場合あり）",
        });
        continue;
      }
    }
  }

  RISK.ok.push({ id, name: fb.name });
}

console.log("=== Firebase同期後に再現できない／要注意カード（実装済み46枚） ===\n");

function printSection(title, items) {
  if (!items.length) return;
  console.log(`### ${title} (${items.length})`);
  for (const item of items) {
    console.log(`- ${item.name || item.id} (${item.id})`);
    console.log(`  ${item.issue || item.note}`);
  }
  console.log("");
}

printSection("効果が消える／大きく変わる", RISK.effectLost);
printSection("コストが実装と違う", RISK.costMismatch);
printSection("文言パース／部分未実装のリスク", RISK.textParseRisk);
printSection("ベースライン不一致（要確認）", RISK.baselineMismatch);
printSection("Firebaseに無い", RISK.missing);

const problemCount =
  RISK.effectLost.length + RISK.costMismatch.length + RISK.textParseRisk.length
  + RISK.baselineMismatch.length + RISK.missing.length;

console.log(`問題あり: ${problemCount}件 / 問題なし（または軽微）: ${RISK.ok.length}件`);
