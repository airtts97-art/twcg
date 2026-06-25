/** Cards verified as fully implemented in the engine (manual audit). */
/** Unimplemented from 2026-06-25 audit: card_1782212242238, card_1782211899987, card_1782297782539, card_1782211693491, card_1782208064951, card_1782211496085, card_1782208333313, card_1782236231218 */
export const IMPLEMENTED_CARD_IDS = new Set([
  "card_1753663163643", // [3→BUG←1/2→・](ガブ・バグ)
  "card_1753660083940", // アトラス・コントロール
  "card_1753716897980", // アングローナ近衛儀礼兵
  "card_1755657552300", // オートマタディメンション
  "card_1782226154092", // マイサータ貿易港
  "card_1753970684315", // 炎の大英傑
  "card_1753661560335", // 儀式の準備
  "card_1753680748888", // 緊急"招集"兵
  "card_1782182910548", // 血統整理委員会
  "card_1755656642598", // 荒涼宮殿
  "card_1753660371468", // 産業革命
  "card_1755654825932", // 寂滅の地
  "tradeCityCore", // 商業都市コア
  "card_1755655012242", // 神山
  "mysticCapture", // 神秘捕縛
  "card_1755612018710", // 胎動する森
  "card_1782204551547", // 第76森人狙撃分隊
  "card_1753681080997", // 第二墓標
  "mobilizationCore", // 動員司令部
  "card_1753664991902", // 農民
  "card_1753660736818", // 覆没の大暴走
  "card_1782520000000", // 北東軍総司令部
  "card_1782237267608", // 北東軍第27迫撃砲分隊
  "arcaneReactorCore", // 魔導炉心
  "card_1782180616372", // 唯字の騎士
  "card_1755655390809", // 雷光の荒野
  "disruptionEngineer", // 攪乱工兵
]);

export function isImplementedCard(cardId) {
  return IMPLEMENTED_CARD_IDS.has(String(cardId || ""));
}
