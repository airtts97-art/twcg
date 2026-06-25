import deckData from "./deck_data.js";
import supplementalCards from "./supplemental_cards.js";
import { fetchAllFirebaseCards } from "./firebase_cards.js";
import { applyCardCompatibility, buildIncompleteCardDataPayload, compatibilityWarningForCard, refreshCatalogCompatibility } from "./card_compatibility.js";
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;
const ROWS = 4;
const COLS = 13;
const CARD_ASPECT = 63 / 88; // portrait width:height ratio (standard TCG card)
const RESOURCE_KEYS = ["funds", "people", "nature", "ore", "fuel", "electric", "magic"];
const CARD_TYPE_LABELS = {
  all: "全種",
  core: "コア",
  unit: "ユニット",
  tact: "指令",
  wild: "Wild",
  grand: "Grand",
  struct: "施設",
};
const LIBRARY_TYPE_ORDER = ["all", "unit", "tact", "wild", "grand", "struct", "core"];
const MAIN_DECK_SECTION_ORDER = ["unit", "tact", "wild", "grand"];
const SEARCH_PRESETS = [
  { id: "all", label: "全検索", term: "" },
  { id: "attack", label: "攻撃", term: "攻撃" },
  { id: "resource", label: "資源", term: "資源" },
  { id: "draw", label: "ドロー", term: "ドロー" },
];
const SORT_OPTIONS = [
  { id: "name", label: "名前" },
  { id: "cost", label: "コスト" },
  { id: "type", label: "種類" },
];
let googleClientId = "";
let googleSignInEnabled = false;
const DEFAULT_PUBLIC_SERVER_BASE = "https://favourite-responsible-cargo-liabilities.trycloudflare.com";
const DEFAULT_PUBLIC_WS_URL = `${DEFAULT_PUBLIC_SERVER_BASE.replace(/^https:/, "wss:")}/ws`;
const ONLINE_WS_URL = (() => {
  const params = new URLSearchParams(location.search);
  if (params.has("ws")) {
    localStorage.setItem("twcg_ws_url", params.get("ws"));
    return params.get("ws");
  }
  if (params.has("server")) {
    const serverBase = params.get("server").replace(/\/+$/, "");
    const wsUrl = `${serverBase.replace(/^https:/, "wss:").replace(/^http:/, "ws:")}/ws`;
    localStorage.setItem("twcg_ws_url", wsUrl);
    return wsUrl;
  }
  const saved = localStorage.getItem("twcg_ws_url");
  if (saved) return saved;
  if (location.hostname.endsWith("github.io")) return DEFAULT_PUBLIC_WS_URL;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const hostname = location.hostname || "127.0.0.1";
  const host = location.port === "5173" ? `${hostname}:5174` : location.host || `${hostname}:5174`;
  return `${protocol}://${host}/ws`;
})();
// wss://xxxx/ws → https://xxxx  (fallback: same origin)
const SERVER_BASE = (() => {
  const wsUrl = ONLINE_WS_URL;
  if (wsUrl.includes("://") && !wsUrl.startsWith("ws://localhost") && !wsUrl.startsWith("wss://localhost") && !wsUrl.includes("127.0.0.1")) {
    return wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/ws$/, "");
  }
  return "";
})();
const ONLINE_DEBUG = false;
const RESOURCE_LABELS = {
  funds: "資金",
  people: "人",
  nature: "自然",
  ore: "鉱石",
  fuel: "燃料",
  electric: "電気",
  magic: "魔法",
};
const RESOURCE_ICON_PATHS = {
  funds: "assets/resources/people.png",
  people: "assets/resources/funds.png",
  nature: "assets/resources/nature.png",
  ore: "assets/resources/ore.png",
  fuel: "assets/resources/fuel.png",
  electric: "assets/resources/electric.png",
  magic: "assets/resources/magic.png",
  none: "assets/resources/none.png",
};

const KEYWORD_DEFINITIONS = {
  armor: { label: "装甲", description: "Reduce incoming damage by the keyword value." },
  pierce: { label: "貫通", description: "Ignore armor up to the keyword value." },
  shock: { label: "衝撃", description: "When this unit deals attack damage, rest the damaged target." },
  charge: { label: "帯電", description: "On attack, you may pay electric equal to total act cost to ignore armor." },
  mobile: { label: "機動", description: "Once each turn, moving does not rest this unit." },
  multiStrike: { label: "連撃", description: "Can attack this many times before resting." },
  flying: { label: "航空", description: "Cannot be attacked or countered by non-flying units with ATK at or below the value." },
  antiAir: { label: "対空", description: "Can attack flying units regardless of their flying value." },
  arc: { label: "曲射", description: "前方へこの値まで攻撃でき、反撃を受けない。延長射程は相手コアにも届く（コアは最前線の1行奥）。" },
  legendary: { label: "伝説", description: "Only one copy should be put in a deck." },
  alert: { label: "警戒", description: "Unrests at the end of its controller's turn." },
  guard: { label: "守護", description: "Protects adjacent allied units from ordinary attacks." },
  selfDestruct: { label: "自爆", description: "When destroyed, damages adjacent units by the keyword value." },
  raid: { label: "奇襲", description: "May be summoned to the second row if that row is not enemy controlled." },
  immobile: { label: "不動", description: "Cannot move." },
  noAttack: { label: "不攻", description: "Cannot attack." },
  soulPay: { label: "魂支払", description: "May exile dump cards to pay missing magic costs." },
  cleave: { label: "巨撃", description: "Also damages units horizontally adjacent to the attack target." },
  oneDamage: { label: "一傷防御", description: "Can only receive 1 damage per hit from any source." },
  structTaunt: { label: "構造挑発", description: "Opponents must target structs with the highest struct taunt value first. This struct gains effect protection equal to its taunt value." },
  effectProtect: { label: "効果保護", description: "カード効果の影響を受けない（効果攻撃を含む。通常攻撃・曲射などの戦闘ダメージは対象外）。[効果貫通]がこの値以上のカードのみ影響できる。" },
  effectPenetrate: { label: "効果貫通", description: "Bypasses effect protection up to this value." },
};
const PLAYERS = {
  p1: { id: "p1", name: "Player 1", side: "bottom", forward: -1, summonRow: 3, coreRow: 4, directRow: 1 },
  p2: { id: "p2", name: "Player 2", side: "top", forward: 1, summonRow: 0, coreRow: -1, directRow: 2 },
};

const DEFAULT_CORE_ID = "frontierCore";
const DEFAULT_MAIN_DECK_IDS = [
  "lightInfantry",
  "smallFieldGunFuel",
  "commonArmoredCar",
  "antiArmorMageTeam328",
  "lifeFairy",
  "knowledgeFairy",
  "fieldOrder",
  "precisionStrike",
  "hiddenSupply",
  "grandMandate",
];
const DEFAULT_STRUCT_DECK_IDS = ["town", "grove", "mine", "refinery", "powerPlant", "magicWell"];
const BUNDLED_PRODUCTION_STRUCT_IDS = new Set(DEFAULT_STRUCT_DECK_IDS);
const STRUCT_PHASE_TRIGGERS = ["onStructurePhase", "onStructurePhaseHP"];
const SAVED_DECK_KEY = "twcg.savedDeck.v1";
const SAVED_DECK_LIBRARY_KEY = "twcg.savedDeckLibrary.v1";
const CUSTOM_CARD_STORE_KEY = "twcg.customCards.v1";
const FORCE_BUNDLED_CARD_IDS = new Set([
  "card_1753611167885", // クリスタヴィアゴーレム
  "card_1753660736818", // 覆没の大暴走
  "card_1753660200559", // デウス・エクス・マキナ
  "card_1753680748888", // 連合王国歩兵
  "card_1753664241159", // 諜報機関
  "card_1753664708023", // ゴールドゴーレム
  "card_1753626357784", // カッパーゴーレム
  "card_1753664097092", // 改良型マーガト
  "card_1755655012242", // 忌地:山
  "card_1753611174564", // 肉の王城
  "card_1753660083940", // アトラス・コントロール
  "card_1753659816385", // 演説
  "card_1753661091291", // 間接貿易
  "card_1753661560335", // 儀式の準備
  "card_1753660371468", // 産業革命
  "card_1753659109009", // 死体漁り
  "card_1753659571381", // 世論誘導
  "card_1753681080997", // 第二墓標
  "card_1753683637865", // 難民保護施設
  "card_1753683067735", // 農業協同組合
  "card_1753664991902", // 農民
  "card_1753904806388", // ゴールドラッシュ
  "card_1753716897980", // アングローナ近衛儀礼兵
  "card_1753904622342", // 銅鉱山
  "card_1753658925940", // 動死体
  "card_1753660887452", // 研究
  "card_1753659473530", // 覆没の脈動
  "card_1753760240197", // 採掘
  "card_1753775442028", // 堕ちし龍の動死体
  "card_1755612018710", // 忌地:森
  "card_1755654825932", // 忌地:団地
  "card_1755655390809", // 忌地:天宮
  "card_1755656642598", // 特別指定忌地:霊廟
  "card_1755648239499", // 虚の尖塔
  "card_1753662513755", // 命脈の交信
  "card_1753662124367", // 動死体の呼び声
  "card_1755701443493", // 呼び贄
  "card_1755906183709", // 風是の怪異
  "card_1755925813924", // 怪異災害:吹雪
  "card_1755670731207", // 【正体不明】罪人
  "card_1762416434855", // 編剣の怪異
  "card_1766737979616", // 思想魔法『強制送還』
  "card_1753905404273", // 炎使いの騎士
  "card_1753968998785", // 炎の英傑
  "card_1753970684315", // 炎の大英傑
  "card_1755657552300", // 不明な忌地
  "card_1755671140352", // 【正体不明】骨の少女
  "card_1755671320457", // 【正体不明】怪獣
  "card_1757041693503", // 愚世の怪異
  "card_1761808048476", // 幾龍の怪異
  "knowledgeFairy",      // 知識妖精
  "lifeFairy",           // 生命妖精
  "mischievousFairy",    // 悪戯妖精
  "card_1782310000000",  // 幾代勇者
  "card_1782320000000",  // 勇者の名誉
  "card_1782180616372",  // 唯字の騎士
  "card_1782182910548",  // 血統整理委員会
  "card_1782330000000",  // 連合王国特務航空勇者機動群 "天撃"
  "card_1782192967652",  // 第108高人歩兵大隊
  "card_1782152241822",  // 大建設計画
  "card_1782240416000",  // 第82空挺歩兵大隊
  "card_1782239599000",  // 第302衝撃大隊
  "card_1782500000000",  // 北東軍第65歩兵大隊
  "card_1782510000000",  // 第122戦車大隊
  "card_1755670973607",  // 王城ノーベルグ
  "card_1782225814944",  // 石油コンビナート
  "card_1782520000000",  // 北東軍総司令部
  "card_1782530000000",  // 北東軍第37歩兵小隊
  "card_1782540000000",  // 第11歩兵大隊
  "card_1782204551547",  // 第76森人狙撃分隊
  "card_1782205873100",  // シルバーゴーレム
  "card_1782315551233",  // 第６サラマンダー混成支援大隊
  "card_1782307790847",  // 北東軍第33師団砲中隊
  "card_1782303856785",  // 第8装甲騎兵大隊
  "card_1782287759412",  // DTO前線指揮所
  "card_1782311181226",  // 壊滅怪異
  "card_1782237267608",  // 北東軍第27迫撃砲分隊
  "card_1782308723608",  // 特別計画
  "card_1782361783127",  // GNS Sovereign
  "card_1782225519182",  // 北東軍最高司令官
  "card_1782330659181",  // ÜSPz.76V Aust. A
  "card_1782229353995",  // 長距離砲撃陣
  "card_1782600000000",  // 戦時国債
  "card_1782610000000",  // 金準備を押収
]);
const DECKMAKER_RESOURCE_KEYS = {
  people: "human",
  nature: "nature",
  ore: "mineral",
  funds: "gold",
  electric: "electric",
  fuel: "fuel",
  magic: "magic",
};
const DECKMAKER_TO_RESOURCE_KEYS = {
  human: "people",
  people: "people",
  nature: "nature",
  natural: "nature",
  food: "nature",
  mineral: "ore",
  ore: "ore",
  gold: "funds",
  funds: "funds",
  electric: "electric",
  fuel: "fuel",
  magic: "magic",
};
const DECKMAKER_TYPE_LABELS = {
  core: "コア",
  unit: "ユニット",
  tact: "タクト",
  wild: "タクト",
  grand: "グランド",
  struct: "ストラクト",
};

// 全画面レイアウト: 1440×900 を隙間なく使用
// ヘッダー: y=0〜60, 左右パネル: w=200, センター: w=1040
// board cell: 208×140
// フルスクリーンレイアウト: 7列構造
// y=60  ヘッダー下
// y=60  相手ストラクトゾーン (50px)
// y=110 相手コマンドロー   (60px)
// y=170 バトルボード       (472px = 4行×118px)
// y=642 自コマンドロー     (60px)
// コマンドロー廃止: Core Card / Deck / Command Zone は盤面召喚行に統合
// y=96  盤面               (608px = 4×152px)
// y=60  相手手札            (60px)
// y=120 相手ストラクトゾーン (36px)
// y=156 盤面               (548px = 4×137px)
// y=704 自ストラクトゾーン  (36px)
// y=740 手札               (120px)
// リソースは盤面左2列(p1)/右2列(p2)に統合 → リソースバー廃止
// y=900  ← 60+60+36+548+76+120=900
const layout = {
  board:        { x: 0, y: 156, w: 1440, h: 548 },
  hand:         { x: 0, y: 780, w: 1440, h: 120 },
  topHand:      { x: 0, y: 60,  w: 1440, h: 60  },
  left:         { x: 0, y: 60,  w: 0,   h: 0   }, // 未使用
  right:        { x: 0, y: 60,  w: 0,   h: 0   }, // 未使用
  oppStruct:    { x: 0, y: 120, w: 1440, h: 36  },
  playerStruct: { x: 0, y: 704, w: 1440, h: 76  },
  resourceBar:  { x: 0, y: 860, w: 1440, h: 0   }, // 廃止済み(drawResourceInBoardCellに移行)
};
layout.cell = { w: layout.board.w / COLS, h: layout.board.h / ROWS };
// ゾーン列定義 (左0〜右10, COLS=11)
// Col 0-1: Wild Zone / Command Zone, Col 2-8: Standard (7列), Col 9-10: Grand Zone / Dump
const ZONE_WILD_COLS  = [0, 1];  // Wild Zone
const ZONE_STD_COLS   = [2, 3, 4]; // Standard / Core
const ZONE_GRAND_COLS = [5, 6];  // Grand Zone
const BOARD_CORE_COL = 6;

// --- Animation system ---
const animations = [];
let animFrameId = null;

function cellCardPos(row, col) {
  const visualRow = boardRowToVisualRow(row);
  return {
    x: layout.board.x + col * layout.cell.w + 8,
    y: layout.board.y + visualRow * layout.cell.h + 8,
    w: layout.cell.w - 16,
    h: layout.cell.h - 16,
  };
}

// アニメーション用: セル内のポートレートカード実座標を返す
function cellPortraitCardBounds(row, col) {
  const visualRow = boardRowToVisualRow(row);
  const cx = layout.board.x + col * layout.cell.w;
  const cy = layout.board.y + visualRow * layout.cell.h;
  const padX = 6, padY = 4, statsH = 22;
  const avW = layout.cell.w - padX * 2;
  const avH = layout.cell.h - padY * 2 - statsH;
  const cardH = Math.min(avH, avW / CARD_ASPECT);
  const cardW = cardH * CARD_ASPECT;
  return {
    x: cx + padX + (avW - cardW) / 2,
    y: cy + padY + (avH - cardH) / 2,
    w: cardW,
    h: cardH,
  };
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function startAnimation(anim) {
  anim.startTime = performance.now();
  animations.push(anim);
  if (!animFrameId) {
    animFrameId = requestAnimationFrame(tickAnimations);
  }
}

function tickAnimations() {
  const now = performance.now();
  let i = animations.length;
  while (i--) {
    if (now >= animations[i].startTime + animations[i].duration) animations.splice(i, 1);
  }
  render();
  if (animations.length > 0) {
    animFrameId = requestAnimationFrame(tickAnimations);
  } else {
    animFrameId = null;
  }
}

function startMoveAnimation(card, fromRow, fromCol, toRow, toCol) {
  const from = cellPortraitCardBounds(fromRow, fromCol);
  const to = cellPortraitCardBounds(toRow, toCol);
  startAnimation({ type: "move", card, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, w: from.w, h: from.h, duration: 280 });
}

function startAttackAnimation(card, fromRow, fromCol, toRow, toCol) {
  const from = cellPortraitCardBounds(fromRow, fromCol);
  const to = cellPortraitCardBounds(toRow, toCol);
  startAnimation({ type: "attack", card, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, w: from.w, h: from.h, duration: 340 });
}

function drawAnimations() {
  const now = performance.now();
  for (const anim of animations) {
    const t = Math.min(1, (now - anim.startTime) / anim.duration);
    let px, py;
    if (anim.type === "move") {
      const e = easeInOut(t);
      px = anim.fromX + (anim.toX - anim.fromX) * e;
      py = anim.fromY + (anim.toY - anim.fromY) * e;
    } else {
      // attack: lunge 40% toward target then return
      const lunge = t < 0.5 ? easeInOut(t * 2) : easeInOut((1 - t) * 2);
      px = anim.fromX + (anim.toX - anim.fromX) * 0.4 * lunge;
      py = anim.fromY + (anim.toY - anim.fromY) * 0.4 * lunge;
    }
    ctx.save();
    ctx.globalAlpha = t > 0.85 && anim.type === "move" ? 1 - (t - 0.85) / 0.15 : 1;
    drawCard(px, py, anim.w, anim.h, anim.card, { selected: true, artOnly: true });
    ctx.restore();
  }
}
// --- End animation system ---

// --- Zone viewer state ---
let zoneViewerState = null; // { playerId, zone: "dump"|"exile", scroll: 0 }
let structPhaseScroll = 0;
let enemyStructChoiceScroll = 0;
// --- End zone viewer ---

const abilityEffects = {
  produceResource({ game, playerId, ability }) {
    addResources(game.players[playerId], ability.resource, ability.amount);
    log(game, `${game.players[playerId].name}: ${RESOURCE_LABELS[ability.resource]} +${ability.amount}`);
  },
  drawCards({ game, playerId, ability }) {
    drawCards(game, playerId, ability.amount);
  },
  gainResource({ game, playerId, ability }) {
    addResources(game.players[playerId], ability.resource, ability.amount);
    log(game, `${game.players[playerId].name}: ${RESOURCE_LABELS[ability.resource]} +${ability.amount}`);
  },
  warTimeBondPlay({ game, playerId, card }) {
    const core = game.players[playerId].core;
    core.termCounter = (core.termCounter || 0) + 2;
    core.warBondCounter = (core.warBondCounter || 0) + 10;
    addResources(game.players[playerId], "funds", 6);
    log(
      game,
      `${game.players[playerId].name}: 「${card.name}」→ コアに期限カウンター+2・国債カウンター+10、金+6`,
    );
  },
  addCoreTermCounter({ game, playerId, card, ability }) {
    const core = game.players[playerId].core;
    const amount = ability.amount || 1;
    core.termCounter = (core.termCounter || 0) + amount;
    log(game, `${game.players[playerId].name}: 「${card.name}」→ コアに期限カウンター+${amount}`);
  },
  dumpWarBondReturn({ game, playerId, card, ability, source }) {
    game.pendingChoice = {
      type: "dumpWarBondReturn",
      playerId,
      cardName: card.name,
      resource: ability.resource || "funds",
      amount: ability.amount || 3,
      dumpCardRef: card,
      queueItem: { playerId, card, ability, source },
    };
    game.selected = { kind: "choice", choice: "dumpWarBondReturn" };
    game.message = `墓地の「${card.name}」を金${ability.amount || 3}で手札に戻しますか？`;
    return "pending";
  },
  millCards({ game, playerId, ability }) {
    const player = game.players[playerId];
    const amount = ability.amount || 1;
    for (let i = 0; i < amount; i++) {
      const card = player.mainDeck.shift();
      if (card) {
        player.dump.push(card);
        notifyDumpChanged(game, playerId);
        triggerAbilities(game, playerId, card, "onMill");
      }
    }
    log(game, `${player.name}: デッキから${amount}枚墓地へ送る`);
  },
  destroyAll({ game }) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const unit = game.board[row][col];
        if (unit) unit.currentHp = 0;
      }
    }
    cleanupAllDestroyed();
    for (const pid of ["p1", "p2"]) {
      const player = game.players[pid];
      let dumpChanged = false;
      while (player.tactZone.length) {
        player.dump.push(player.tactZone.pop());
        dumpChanged = true;
      }
      while (player.structs.length) {
        player.dump.push(player.structs.pop());
        dumpChanged = true;
      }
      if (dumpChanged) notifyDumpChanged(game, pid);
    }
    log(game, "全ユニット・タクト・ストラクトを破壊");
  },
  destroyAllEnemyUnits({ game, playerId, card }) {
    const opponent = opponentOf(playerId);
    let count = 0;
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const unit = game.board[row][col];
        if (unit?.owner === opponent) {
          unit.currentHp = 0;
          count += 1;
        }
      }
    }
    cleanupAllDestroyed(card, game);
    if (count > 0) {
      log(game, `${game.players[playerId].name}: 「${card.name}」で相手ユニット${count}体を破壊`);
    } else {
      log(game, `${game.players[playerId].name}: 「${card.name}」— 破壊する相手ユニットがいなかった`);
    }
  },
  searchSelfToHand({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    const amount = ability.amount || 1;
    let found = 0;
    for (let i = 0; i < player.mainDeck.length && found < amount; i++) {
      if (player.mainDeck[i].id === card.id) {
        player.hand.push(player.mainDeck.splice(i, 1)[0]);
        found++;
        i--;
      }
    }
    if (found) log(game, `${player.name}: 「${card.name}」を${found}枚手札に`);
  },
  destroyTargetStruct({ game, playerId, card, ability, source }) {
    return offerDestroyEnemyStructChoice(game, playerId, card, ability, source, { amount: 1 });
  },
  destroyEnemyStructs({ game, playerId, card, ability }) {
    const opponent = opponentOf(playerId);
    const fuelCost = ability.fuelCost || 1;
    const amount = ability.amount || 1;
    if ((game.players[playerId].resources.fuel || 0) < fuelCost) {
      log(game, `${game.players[playerId].name}: 燃料が不足しているため「${card.name}」を使えない`);
      return;
    }
    if (!game.players[opponent].structs.length) {
      log(game, `${game.players[playerId].name}: 相手のストラクトがないため「${card.name}」を使えない`);
      return;
    }
    if (!getDestroyableEnemyStructEntries(game, opponent, card).length) {
      log(game, `${game.players[playerId].name}: 効果で破壊できる相手ストラクトがない`);
      return;
    }
    if (!game.pendingStructPhase) return;
    game.pendingStructPhase.pendingEnemyStructChoice = {
      fuelCost,
      amount,
      remaining: amount,
      cardName: card.name,
      sourceCard: card,
    };
    enemyStructChoiceScroll = 0;
    game.message = `${card.name}: 破壊する相手ストラクトを選択してください。`;
    return "pending";
  },
  destroyEnemyStructsOnPlay({ game, playerId, card, ability, source }) {
    return offerDestroyEnemyStructChoice(game, playerId, card, ability, source, { amount: ability.amount || 1 });
  },
  summonSelfFromDump({ game, playerId, card }) {
    const player = game.players[playerId];
    const dumpIdx = player.dump.findLastIndex((c) => c.id === card.id);
    if (dumpIdx < 0) return;
    player.dump.splice(dumpIdx, 1);
    notifyDumpChanged(game, playerId);
    const summonRow = player.summonRow;
    for (let col = 0; col < COLS; col++) {
      if (!game.board[summonRow][col]) {
        const unit = makeUnit(card.id, playerId, summonRow, col, { fromDump: true });
        commitUnitToBoard(game, unit, summonRow, col);
        log(game, `${player.name}: 「${card.name}」が墓地から出た`);
        triggerAbilities(game, playerId, unit, "onSummon", { fromDump: true });
        return;
      }
    }
    player.dump.push(card);
    log(game, `${player.name}: フィールドが満員のため「${card.name}」は場に出せない`);
  },
  buffTagUnitsAtk({ game, playerId, ability }) {
    const tag = ability.tag;
    let count = 0;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const unit = game.board[row][col];
        if (unit?.owner === playerId && (!tag || (unit.tags || []).includes(tag))) {
          unit.atk += ability.amount || 1;
          count++;
        }
      }
    }
    log(game, `${game.players[playerId].name}: ${tag ? `[${tag}]` : "味方"}ユニットATK +${ability.amount || 1}（${count}体）`);
  },
  buffFriendlyUnitsHp({ game, playerId, ability }) {
    for (const row of game.board) {
      for (const unit of row) {
        if (unit?.owner === playerId) {
          unit.maxHp += ability.amount;
          unit.currentHp += ability.amount;
        }
      }
    }
    log(game, `${game.players[playerId].name}: 味方ユニットHP +${ability.amount}`);
  },
  // 隣接する味方ユニットに効果保護をアビリティとして付与（アウラ：動的チェック済みのため参照用）
  grantEffectProtectToAdjacent({ game, playerId, card }) {
    const value = (card.abilities || []).find((a) => a.effect === "grantEffectProtectToAdjacent")?.value || 1;
    log(game, `${game.players[playerId].name}: 「${card.name}」隣接ユニットに効果保護${value}を付与（アウラ）`);
  },
  buffSelfAtk({ game, playerId, card, ability }) {
    card.atk = (card.atk || 0) + (ability.amount || 1);
    log(game, `${game.players[playerId].name}: 「${card.name}」+${ability.amount || 1}/0 補正`);
  },
  buffSelfHpFromTagCount({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    const tag = ability.tag;
    let count = 0;
    for (const boardRow of game.board) {
      for (const cell of boardRow) {
        if (cell && cell !== card && cell.owner === playerId && (cell.tags || []).includes(tag)) count++;
      }
    }
    if (count > 0) {
      card.hp = (card.hp || 0) + count;
      if (card.maxHp !== undefined) card.maxHp = (card.maxHp || 0) + count;
      if (card.currentHp !== undefined) card.currentHp = (card.currentHp || 0) + count;
      log(game, `${player.name}: 「${card.name}」±0/+${count}（[${tag}]×${count}）`);
    }
  },
  gainPerStructTag({ game, playerId, ability }) {
    const player = game.players[playerId];
    const tag = ability.tag;
    const count = (player.structs || []).filter((s) => (s.tags || []).includes(tag)).length;
    if (count > 0) {
      addResources(player, ability.resource, count * (ability.amount || 1));
      log(game, `${player.name}: [${tag}]×${count} → ${RESOURCE_LABELS[ability.resource] || ability.resource}+${count}`);
    }
  },
  chooseGainResource({ game, playerId, card, ability, source }) {
    game.pendingChoice = {
      type: "chooseGainResource",
      playerId,
      options: ability.options || [],
      cardName: card?.name || "",
      queueItem: { playerId, card, ability, source },
    };
    game.selected = { kind: "choice", choice: "chooseGainResource" };
    game.message = "得る資源を選んでください。";
    return "pending";
  },
  buffSelfHp({ game, playerId, card, ability }) {
    const amount = ability.amount || 1;
    card.hp = (card.hp || 0) + amount;
    if (card.maxHp !== undefined) card.maxHp = (card.maxHp || 0) + amount;
    if (card.currentHp !== undefined) card.currentHp = (card.currentHp || 0) + amount;
    log(game, `${game.players[playerId].name}: 「${card.name}」+0/+${amount}`);
  },
  addCounters({ game, playerId, card, ability }) {
    card.counters = (card.counters || 0) + (ability.amount || 1);
    log(game, `${game.players[playerId].name}: 「${card.name}」カウンター +${ability.amount || 1}`);
  },
  addCounterOnFirstAttack({ game, playerId, card, ability }) {
    if (card.hasAttackedEver) return;
    card.hasAttackedEver = true;
    card.counters = (card.counters || 0) + (ability.amount || 1);
    log(game, `${game.players[playerId].name}: 「${card.name}」初攻撃カウンター +${ability.amount || 1}`);
  },
  bigConstructionPlanPlay({ game, playerId, card }) {
    card.activationCount = 0;
    card.rested = false;
    card.permanentTact = true;
    card.abilities = [
      { trigger: "onStructurePhase", effect: "bigConstructionPlanActivate", isPermanent: true },
      { trigger: "onDestroy", effect: "searchDeckMinCostToHand", minCost: 18 },
    ];
    log(game, `${game.players[playerId].name}: 「${card.name}」をTACTゾーンに配置`);
  },
  bigConstructionPlanActivate({ game, playerId, card }) {
    const player = game.players[playerId];
    if (card.rested) {
      log(game, `${player.name}: 「${card.name}」はレスト中`);
      return;
    }
    card.rested = true;
    addResources(player, "funds", 3);
    addResources(player, "ore", 5);
    addResources(player, "fuel", 2);
    card.activationCount = (card.activationCount || 0) + 1;
    log(game, `${player.name}: 「${card.name}」発動${card.activationCount}回目 → 金+3、鉱+5、燃+2`);
    if (card.activationCount >= 5) {
      log(game, `${player.name}: 「${card.name}」5回発動後に破壊`);
      destroyTactFromZone(game, playerId, card);
    }
  },
  defeatIfNamedUnitDestroyed({ game, playerId, ability, source }) {
    const destroyed = source?.target;
    if (!destroyed || !ability.targetName) return;
    if ((destroyed.name || "").includes(ability.targetName)) {
      game.players[playerId].core.hp = 0;
      log(game, `${game.players[playerId].name}: 「${destroyed.name}」が破壊され、敗北条件達成`);
      checkWinner(game);
    }
  },
  gainStatBuff({ game, playerId, card, ability }) {
    card.atk = (card.atk || 0) + (ability.atkBuff || 0);
    if (ability.hpBuff) {
      card.currentHp = (card.currentHp || 0) + ability.hpBuff;
      card.maxHp = (card.maxHp || card.hp || 0) + ability.hpBuff;
    }
    log(game, `${game.players[playerId].name}: 「${card.name}」+${ability.atkBuff || 0}/+${ability.hpBuff || 0}の修正`);
  },
  coreStructStartDiscardOrHP({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    if (!player.hand.length) {
      player.core.hp -= ability.hpCostOnDecline || 2;
      for (const [res, amt] of Object.entries(ability.gainOnDecline || {})) addResources(player, res, amt);
      log(game, `${player.name}: 「${card.name}」手札なし → コアHP-${ability.hpCostOnDecline || 2}、資源獲得`);
      checkWinner(game);
      return;
    }
    game.pendingChoice = {
      type: "coreStructStartDiscard",
      playerId,
      cardName: card.name,
      gainOnDiscard: ability.gainOnDiscard || {},
      gainOnDecline: ability.gainOnDecline || {},
      hpCostOnDecline: ability.hpCostOnDecline || 2,
    };
    game.selected = { kind: "choice", choice: "coreStructStartDiscard" };
    game.message = `「${card.name}」手札を1枚捨てますか？`;
    return "pending";
  },
  addCounterIfTagDestroyed({ game, playerId, card, ability, source }) {
    const destroyed = source?.target;
    if (!destroyed) return;
    if (!matchesCond(destroyed, ability.cond || ability.tag)) return;
    card.counters = (card.counters || 0) + (ability.amount || 1);
    const label = ability.cond?.tag || ability.cond?.nameContains || ability.tag || "?";
    log(game, `${game.players[playerId].name}: 「${card.name}」カウンター +${ability.amount || 1}（${label}破壊）`);
  },
  discardForDraw({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    if (!player.hand.length) return;
    game.pendingChoice = {
      type: "discardForDraw",
      playerId,
      cardName: card.name,
      bonusCond: ability.cond || (ability.pureHumanTag ? { tag: ability.pureHumanTag } : { tag: "純人間" }),
    };
    return "pending";
  },
  grantCounterArmor({ game, playerId, card, ability }) {
    if (!game.globalEffects) game.globalEffects = [];
    game.globalEffects.push({ type: "counterArmor", playerId, armorValue: ability.armorValue || 2 });
    log(game, `${game.players[playerId].name}: 「${card.name}」カウンター持ちユニットに装甲${ability.armorValue || 2}付与`);
  },
  payGoldAndDeployHero({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    const heroCond = ability.cond || (ability.heroTag ? { tag: ability.heroTag } : { tag: "勇者" });
    const heroOptions = player.hand
      .map((c, i) => {
        const totalCost = totalCostAmount(c.cost || {});
        return { card: c, handIdx: i, totalCost, minGold: Math.ceil(totalCost / 2) };
      })
      .filter((opt) => opt.card.type === "unit" && matchesCond(opt.card, heroCond));
    if (!heroOptions.length) {
      log(game, `${player.name}: 「${card.name}」手札に[勇者]ユニットなし`);
      return;
    }
    const adjCells = [
      { row: card.row - 1, col: card.col },
      { row: card.row + 1, col: card.col },
      { row: card.row, col: card.col - 1 },
      { row: card.row, col: card.col + 1 },
    ].filter(({ row, col }) => row >= 0 && row < ROWS && col >= 0 && col < COLS && !game.board[row][col] && canSummonUnitTo(playerId, row, col, card.col));
    if (!adjCells.length) {
      log(game, `${player.name}: 「${card.name}」隣接する空きマスなし`);
      return;
    }
    game.pendingChoice = {
      type: "deployHeroFromAttack",
      step: "chooseGold",
      playerId,
      cardName: card.name,
      sourceRow: card.row,
      sourceCol: card.col,
      heroOptions,
      adjCells,
      selectedHeroIdx: null,
      goldToPay: 0,
    };
    return "pending";
  },
  healSelfAndRemoveCounter({ game, playerId, card, ability }) {
    if ((card.counters || 0) > 0) card.counters -= 1;
    const amount = ability.amount || 1;
    card.currentHp = Math.min(card.maxHp || card.hp || card.currentHp || 0, (card.currentHp || 0) + amount);
    log(game, `${game.players[playerId].name}: 「${card.name}」${amount}回復`);
  },
  coreDeathCounter({ game, playerId, card, ability }) {
    card.counters = (card.counters || 0) + 1;
    const threshold = ability.threshold || 4;
    if (card.counters >= threshold) {
      card.counters = 0;
      addResources(game.players[playerId], ability.resource || "people", ability.amount || 1);
      log(game, `${game.players[playerId].name}: 「${card.name}」カウンター${threshold}消費`);
    }
  },
  grantIndestructibleToTagUnits({ game, playerId, ability }) {
    const tag = ability.tag;
    let count = 0;
    for (const unit of unitsOwnedBy(playerId)) {
      if (!tag || (unit.tags || []).includes(tag)) {
        unit.indestructibleUntilTurnEnd = playerId;
        count++;
      }
    }
    log(game, `${game.players[playerId].name}: [${tag || "味方"}] ${count}体に破壊不能`);
  },
  gainResourcePlusPerStructTag({ game, playerId, ability }) {
    const player = game.players[playerId];
    const base = ability.baseAmount || 0;
    const tag = ability.tag;
    const count = (player.structs || []).filter((s) => (s.tags || []).includes(tag)).length;
    const amount = base + count * (ability.amountPer || 1);
    addResources(player, ability.resource, amount);
    log(game, `${player.name}: ${RESOURCE_LABELS[ability.resource] || ability.resource}+${amount}`);
  },
  opponentDiscard({ game, playerId, ability }) {
    const opponent = game.players[opponentOf(playerId)];
    const amount = ability.amount || 1;
    for (let i = 0; i < amount && opponent.hand.length; i++) {
      const index = Math.floor(Math.random() * opponent.hand.length);
      opponent.dump.push(opponent.hand.splice(index, 1)[0]);
      notifyDumpChanged(game, opponentOf(playerId));
    }
    log(game, `${opponent.name}: 手札を${amount}枚捨てる`);
  },
  drawPlusPayResource({ game, playerId, ability }) {
    const player = game.players[playerId];
    let extra = 0;
    const maxPay = Math.min(player.resources[ability.resource] || 0, ability.maxPay || 99);
    if (maxPay > 0) {
      player.resources[ability.resource] -= maxPay;
      extra = maxPay;
    }
    drawCards(game, playerId, (ability.baseDraw || 1) + extra);
  },
  destroyUpToEnemyCards({ game, playerId, ability }) {
    const opponent = opponentOf(playerId);
    let remaining = ability.amount || 1;
    for (let row = 0; row < ROWS && remaining > 0; row++) {
      for (let col = 0; col < COLS && remaining > 0; col++) {
        const unit = game.board[row][col];
        if (unit?.owner === opponent) {
          unit.currentHp = 0;
          remaining--;
        }
      }
    }
    cleanupAllDestroyed();
  },
  destroyFriendlyUnitDraw({ game, playerId, target, ability }) {
    if (!target || target.owner !== playerId) return;
    if (target.indestructibleUntilTurnEnd) return;
    target.currentHp = 0;
    drawCards(game, playerId, ability.amount || 1);
    cleanupAllDestroyed(null, game);
  },
  controlEnemyUnitToSummonRow({ game, playerId, target }) {
    if (!target || target.owner === playerId) return;
    const oldOwner = target.owner;
    const oldRow = target.row;
    const oldCol = target.col;
    const player = game.players[playerId];
    const col = findFirstEmptyColInRow(game, player.summonRow);
    if (col < 0) return;
    game.board[oldRow][oldCol] = null;
    target.owner = playerId;
    target.row = player.summonRow;
    target.col = col;
    target.rested = true;
    game.board[target.row][target.col] = target;
    log(game, `${game.players[playerId].name}: 「${target.name}」の支配を得た`);
  },
  prohibitOpponentTact({ game, playerId }) {
    if (!game.globalEffects) game.globalEffects = [];
    game.globalEffects.push({ type: "noTact", playerId: opponentOf(playerId), untilPlayerTurnEnd: playerId });
    log(game, `${game.players[playerId].name}: 相手の指令使用を封じた`);
  },
  summonNamedFromHand({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    const idx = player.hand.findIndex((c) =>
      (ability.cardName && c.name === ability.cardName) || (ability.cardId && c.id === ability.cardId));
    const targetLabel = ability.cardName
      || cardCatalog.main[ability.cardId]?.name
      || cardCatalog.structs[ability.cardId]?.name
      || ability.cardId
      || "指定ユニット";
    if (idx < 0) {
      game.message = `手札に「${targetLabel}」がないため効果は発動しませんでした。`;
      log(game, `${player.name}: 手札に「${targetLabel}」がないため「${card.name}」を発動できません`);
      return;
    }
    const targetCard = player.hand[idx];
    if (ability.lifeCounterFromPeople) {
      game.pendingChoice = {
        type: "lifeCounterPayment",
        playerId,
        cardName: card.name,
        targetHandIndex: idx,
        targetCard,
        maxLifeCounters: ability.maxLifeCounters || 5,
        counters: ability.counters || 0,
        queueItem: { playerId, card, ability, source: { zone: "tact" } },
      };
      game.selected = { kind: "choice", choice: "lifeCounterPayment" };
      game.message = `${card.name}: 生命カウンターを置く人資源を選んでください。`;
      return "pending";
    }
    if (!payForCard(player, targetCard.cost || {}, targetCard)) return;
    const placement = findSummonPlacement(game, playerId, targetCard);
    if (!placement) {
      game.message = "配置できるマスがありません。";
      log(game, `${player.name}: 配置できるマスがないため「${targetCard.name}」を出撃できません`);
      return;
    }
    const { row, col } = placement;
    player.hand.splice(idx, 1);
    const unit = makeUnit(targetCard.id, playerId, row, col, { rested: false });
    unit.counters = ability.counters || 0;
    commitUnitToBoard(game, unit, row, col);
    triggerAbilities(game, playerId, unit, "onSummon");
    log(game, `${player.name}: 「${card.name}」で「${targetCard.name}」を出撃`);
  },
  removeLifeCounterOrBottomDeck({ game, playerId, card }) {
    if (!card.lifeCounterUnit) return;
    if ((card.counters || 0) > 0) {
      card.counters -= 1;
      log(game, `${game.players[playerId].name}: ${card.name} life counter -1`);
      return;
    }
    game.board[card.row][card.col] = null;
    game.players[playerId].mainDeck.push(stripRuntime(card));
    log(game, `${game.players[playerId].name}: ${card.name} returns to deck bottom`);
  },
  reviveTagUnitsUpToCost({ game, playerId, ability }) {
    const player = game.players[playerId];
    const tag = ability.tag;
    let remaining = ability.maxTotalCost || 4;
    let count = 0;
    for (let i = 0; i < player.dump.length; i++) {
      const c = player.dump[i];
      const cost = totalCostAmount(c.cost || {});
      if (c.type !== "unit" || !(c.tags || []).includes(tag) || cost > remaining) continue;
      const col = findFirstEmptyColInRow(game, player.summonRow);
      if (col < 0) break;
      player.dump.splice(i, 1);
      i--;
      remaining -= cost;
      const unit = makeUnit(c.id, playerId, player.summonRow, col, { rested: false, fromDump: true });
      commitUnitToBoard(game, unit, player.summonRow, col);
      triggerAbilities(game, playerId, unit, "onSummon", { fromDump: true });
      count++;
    }
    log(game, `${player.name}: 墓地から[${tag}] ${count}体を出した`);
  },
  damageRestedTarget({ game, target, ability, card }) {
    if (!target || !target.rested) return;
    const result = dealDamageToUnit(game, target, ability.amount || 2, { source: card }, { cleanup: true, effectAttack: true });
    if (result.pending) return "pending";
  },
  exileTargetNonNeutralNonUnifall({ game, target }) {
    if (!target) return;
    const faction = target.faction || "";
    if (faction === "ニュートラル" || faction === "ユニフォール") return;
    game.board[target.row][target.col] = null;
    game.players[target.owner].exileZone.push(stripRuntime(target));
    log(game, `「${target.name}」を除外`);
  },
  exileAllNonNeutralNonUnifall({ game }) {
    const exiled = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const unit = game.board[row][col];
        if (!unit) continue;
        const faction = unit.faction || "";
        if (faction === "ニュートラル" || faction === "ユニフォール") continue;
        game.board[row][col] = null;
        game.players[unit.owner].exileZone.push(stripRuntime(unit));
        exiled.push(unit.name);
      }
    }
    if (exiled.length > 0) log(game, `除外：${exiled.join("、")}`);
    cleanupAllDestroyed();
  },
  reviveFromExile({ game, playerId, card }) {
    const eligible = [];
    for (const [pid, player] of Object.entries(game.players)) {
      for (const c of (player.exileZone || [])) {
        if (c.type === "unit") eligible.push({ ...c, _exileOwner: pid });
      }
    }
    if (eligible.length === 0) {
      log(game, `${game.players[playerId].name}: 「${card.name}」— 除外ゾーンにユニットがいない`);
      return;
    }
    game.pendingChoice = {
      type: "reviveFromExile",
      playerId,
      eligible,
      cardName: card.name,
    };
    game.selected = { kind: "choice", choice: "reviveFromExile" };
    game.message = "除外ゾーンから場に出すユニットを選んでください。";
    return "pending";
  },
  grantKeywordsToAllMagicMachines({ game, ability }) {
    for (const pid of ["p1", "p2"]) {
      for (const unit of unitsOwnedBy(pid)) {
        const tags = unit.tags || [];
        if (!tags.includes("魔法") || !tags.includes("機械")) continue;
        if (!unit.keywords) unit.keywords = [];
        for (const kw of ability.keywords || []) {
          if (!unit.keywords.some((k) => k.id === kw.id)) unit.keywords.push({ ...kw });
        }
      }
    }
  },
  damageAllEnemiesAndPushBack({ game, playerId, ability, card }) {
    return runDamageAllEnemiesAndPushBack(game, playerId, ability, card, 0, 0);
  },
  reviveStructFromDump({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    const idx = player.dump.findIndex((c) => c.type === "struct");
    if (idx < 0) {
      if (ability.fallback) return abilityEffects[ability.fallback.effect]?.({ game, playerId, card, ability: ability.fallback });
      return;
    }
    const [struct] = player.dump.splice(idx, 1);
    player.structs.push(struct);
    log(game, `${player.name}: 墓地から「${struct.name}」を建設`);
  },
  buffFriendlyUnitsAtk({ game, playerId, ability }) {
    for (const row of game.board) {
      for (const unit of row) {
        if (unit?.owner === playerId) unit.atk += ability.amount;
      }
    }
    log(game, `${game.players[playerId].name}: 味方ユニットATK +${ability.amount}`);
  },
  descentEffect({ game, playerId }) {
    clearDescentGodEffects(game, playerId);
    if (!game.globalEffects) game.globalEffects = [];
    game.globalEffects.push({ type: "healingHealOnTurnEnd", playerId });
    log(game, `${game.players[playerId].name}: [降臨] 場にいる間に現れたユニットは破壊時に手札へ戻る、全ユニットにターン終了時：治療数×2回復`);
  },
  searchUnitToCostHand({ game, playerId, ability }) {
    const player = game.players[playerId];
    const amount = ability.amount || 1;
    const maxCost = ability.maxCost || 99;
    const tag = ability.tag || null;
    let found = 0;
    for (let i = 0; i < player.mainDeck.length && found < amount; i++) {
      const deckCard = player.mainDeck[i];
      if (deckCard.type !== "unit") continue;
      if (tag && !(deckCard.tags || []).includes(tag)) continue;
      if (totalCostAmount(deckCard.cost || {}) > maxCost) continue;
      player.hand.push(player.mainDeck.splice(i, 1)[0]);
      found++;
      i--;
    }
    if (found) log(game, `${player.name}: コスト${maxCost}以下${tag ? `[${tag}]` : ""}ユニットを${found}枚手札に`);
  },
  searchCardToHand({ game, playerId, ability }) {
    const player = game.players[playerId];
    const amount = ability.amount || 1;
    let found = 0;
    for (let i = 0; i < player.mainDeck.length && found < amount; i++) {
      const deckCard = player.mainDeck[i];
      const match = ability.cardName
        ? (deckCard.name === ability.cardName || (deckCard.name || "").includes(ability.cardName))
        : ability.tags
          ? ability.tags.some((tag) => (deckCard.tags || []).includes(tag))
        : ability.tag
          ? (deckCard.tags || []).includes(ability.tag)
          : false;
      if (match) {
        player.hand.push(player.mainDeck.splice(i, 1)[0]);
        found++;
        i--;
      }
    }
    if (found) log(game, `${player.name}: 「${ability.cardName || ability.tag}」を${found}枚手札に`);
  },
  searchDeckPick({ game, playerId, card, ability, source }) {
    const player = game.players[playerId];
    const filters = ability.filters || [];
    const matchesDeckSearchFilter = (deckCard) => filters.some((filter) => {
      if (filter.cardType && deckCard.type !== filter.cardType) return false;
      if (filter.tag && !(deckCard.tags || []).includes(filter.tag)) return false;
      return true;
    });
    const candidates = player.mainDeck.filter((deckCard) => matchesDeckSearchFilter(deckCard));
    if (!candidates.length) {
      log(game, `${player.name}: 条件に合うカードがデッキにありません`);
      return;
    }
    if (candidates.length === 1) {
      const deckIdx = player.mainDeck.indexOf(candidates[0]);
      if (deckIdx < 0) return;
      const [picked] = player.mainDeck.splice(deckIdx, 1);
      player.hand.push(picked);
      log(game, `${player.name}: 「${picked.name}」を手札に加えた`);
      return;
    }
    game.pendingChoice = {
      type: "searchDeckPick",
      playerId,
      candidates,
      queueItem: { playerId, card, ability, source },
    };
    game.selected = { kind: "choice", choice: "searchDeckPick" };
    game.message = "デッキから1枚選んで手札に加えてください。";
    return "pending";
  },
  summonGolemFromDeckOrDump({ game, playerId, card, ability }) {
    summonGolemFromZones(game, playerId, {
      maxCost: ability.maxCost || 3,
      row: ability.row,
      sourceCardName: card.name,
    });
  },
  summonGolemToSameRow({ game, playerId, card, ability }) {
    summonGolemFromZones(game, playerId, {
      maxCost: ability.maxCost || 3,
      row: card.row,
      sourceCardName: card.name,
    });
  },
  tactToStructOverStruct({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    const requiredName = ability.requiredStructName || "覆没の迷宮";
    const hasRequiredStruct = player.structs.some((struct) => struct.id === ability.requiredStructId || struct.name === requiredName);
    if (!hasRequiredStruct) {
      log(game, `${player.name}: ${requiredName} がないため ${card.name} を施設化できません`);
      return;
    }
    const tactIndex = player.tactZone.indexOf(card);
    if (tactIndex >= 0) player.tactZone.splice(tactIndex, 1);
    const structCard = cloneCard(card);
    structCard.type = "struct";
    structCard.rested = false;
    structCard.abilities = [
      {
        trigger: "onStructurePhase",
        effect: "chooseSummonGolem",
        maxCost: ability.maxCost || 3,
        costOptions: ability.costOptions || [
          { resource: "ore", amount: 2 },
          { resource: "magic", amount: 1 },
        ],
      },
    ];
    player.structs.push(structCard);
    log(game, `${player.name}: ${card.name} をストラクトとして配置`);
  },
  summonSelfFromDumpMobile({ game, playerId, card }) {
    const player = game.players[playerId];
    const dumpIdx = player.dump.findLastIndex((c) => c.id === card.id);
    if (dumpIdx < 0) return;
    player.dump.splice(dumpIdx, 1);
    notifyDumpChanged(game, playerId);
    const summonRow = player.summonRow;
    for (let col = 0; col < COLS; col++) {
      if (!game.board[summonRow][col]) {
        const unit = makeUnit(card.id, playerId, summonRow, col, { fromDump: true });
        if (!unit.keywords) unit.keywords = [];
        if (!unit.keywords.some((k) => k.id === "mobile")) unit.keywords.push({ id: "mobile" });
        commitUnitToBoard(game, unit, summonRow, col);
        log(game, `${player.name}: 「${card.name}」が墓地から[機動]付きで出た`);
        triggerAbilities(game, playerId, unit, "onSummon", { fromDump: true });
        return;
      }
    }
    player.dump.push(card);
  },
  mysticCapture({ game, playerId, card, ability, source }) {
    game.pendingChoice = {
      type: "mysticCapture",
      playerId,
      cardName: card.name,
      queueItem: { playerId, card, ability, source },
      selectedHandIndexes: [],
    };
    game.selected = { kind: "choice", choice: "mysticCapture" };
    game.message = "神秘捕縛: 神秘ユニットを選択してください。";
    return "pending";
  },
  damageEnemyCore({ game, playerId, ability }) {
    const opponent = opponentOf(playerId);
    game.players[opponent].core.hp -= ability.amount;
    log(game, `${game.players[playerId].name}: 敵コアに ${ability.amount} ダメージ`);
    checkWinner(game);
  },
  damageTargetUnit({ game, target, ability, card, source }) {
    if (!target) return;
    const result = dealDamageToUnit(game, target, ability.amount, { source: card || source }, { cleanup: true, effectAttack: true });
    log(game, `${target.name}: ${result.damage}ダメージ`);
    if (result.pending) return "pending";
  },
  grantDestroyGain({ game, playerId, ability, target }) {
    if (!target || target.owner !== playerId) return;
    if (!target.abilities) target.abilities = [];
    // 保険金効果は「次のターンの始めまで」という期間制限がある
    // playerId のターンが終わるまで有効
    target.abilities.push({
      trigger: "onDestroy",
      effect: "gainResource",
      resource: ability.resource,
      amount: ability.amount,
      untilPlayerTurnEnd: playerId
    });
    log(game, `${game.players[playerId].name}: 「${target.name}」に保険（破壊時：${RESOURCE_LABELS[ability.resource] || ability.resource}+${ability.amount}、${game.players[playerId].name}のターン終了まで）`);
  },
  chooseExchange({ game, card, ability }) {
    if (!game.pendingStructPhase) return;
    game.pendingStructPhase.pendingResourceChoice = {
      costOptions: ability.costOptions,
      produces: ability.produces,
      cardName: card.name,
    };
    return "pending";
  },
  chooseProduceResource({ game, card, ability }) {
    if (!game.pendingStructPhase) return;
    game.pendingStructPhase.pendingResourceChoice = {
      type: "chooseProduceResource",
      options: ability.options || [],
      cardName: card.name,
      multiActivate: Boolean(ability.multiActivate),
    };
    return "pending";
  },
  chooseSummonGolem({ game, card, ability }) {
    if (!game.pendingStructPhase) return;
    game.pendingStructPhase.pendingResourceChoice = {
      options: (ability.costOptions || []).map((opt) => ({
        id: opt.resource,
        label: `${RESOURCE_LABELS[opt.resource] || opt.resource}${opt.amount}`,
        cost: { [opt.resource]: opt.amount },
        action: { effect: "summonGolemFromDeckOrDump", maxCost: ability.maxCost || 3 },
      })),
      cardName: card.name,
    };
    return "pending";
  },
  destroySelf({ game, card }) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const unit = game.board[row][col];
        if (unit && unit.instanceId === card.instanceId) {
          unit.currentHp = 0;
          cleanupAllDestroyed();
          log(game, `${card.name}: 自壊`);
          return;
        }
      }
    }
  },
  searchDeckByType({ game, playerId, ability }) {
    const player = game.players[playerId];
    const amount = ability.amount || 1;
    let found = 0;
    for (let i = 0; i < player.mainDeck.length && found < amount; i++) {
      const c = player.mainDeck[i];
      if (c.type === ability.cardType) {
        player.hand.push(player.mainDeck.splice(i, 1)[0]);
        found++;
        i--;
      }
    }
    if (found) log(game, `${player.name}: デッキから${ability.cardType}を${found}枚手札に`);
  },
  searchDeckMinCostToHand({ game, playerId, ability }) {
    const player = game.players[playerId];
    const minCost = ability.minCost || 18;
    const amount = ability.amount || 1;
    let found = 0;
    for (let i = 0; i < player.mainDeck.length && found < amount; ) {
      if (totalCostAmount(player.mainDeck[i].cost || {}) >= minCost) {
        const card = player.mainDeck.splice(i, 1)[0];
        player.hand.push(card);
        log(game, `${player.name}: デッキからコスト総量${minCost}以上「${card.name}」を手札に`);
        found += 1;
      } else {
        i += 1;
      }
    }
    if (!found) {
      log(game, `${player.name}: コスト総量${minCost}以上のカードがデッキにありません`);
    }
  },
  revealTopNPick({ game, playerId, card, ability, source }) {
    const player = game.players[playerId];
    const n = ability.amount || 3;
    const revealed = [];
    for (let i = 0; i < n && player.mainDeck.length > 0; i++) {
      revealed.push(player.mainDeck.shift());
    }
    if (!revealed.length) {
      log(game, `${player.name}: デッキが空のため公開できない`);
      return;
    }
    game.pendingChoice = {
      type: "revealPick",
      playerId,
      revealed,
      tagFilter: ability.tagFilter || null,
      shuffleToBottom: ability.shuffleToBottom || false,
      queueItem: { playerId, card, ability, source },
    };
    game.selected = { kind: "choice", choice: "revealPick" };
    game.message = "公開されたカードから1枚選んで手札に加えてください。";
    return "pending";
  },
  payResourceOrCoreDamage({ game, playerId, card, ability, source }) {
    const player = game.players[playerId];
    const canAfford = (player.resources[ability.resource] || 0) >= ability.amount;
    if (canAfford) {
      game.pendingChoice = {
        type: "payOrDamage",
        playerId,
        cardName: card.name,
        resource: ability.resource,
        amount: ability.amount,
        damage: ability.damage,
        queueItem: { playerId, card, ability, source },
      };
      game.selected = { kind: "choice", choice: "payOrDamage" };
      game.message = `${RESOURCE_LABELS[ability.resource]}${ability.amount}を支払うか、コアに${ability.damage}ダメージを受けますか？`;
      return "pending";
    }
    player.core.hp -= ability.damage;
    log(game, `${player.name}: 「${card.name}」支払えず → コアに${ability.damage}ダメージ`);
    checkWinner(game);
  },
  gainShockOrAlert({ game, playerId, card }) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const unit = game.board[row][col];
        if (unit && unit.instanceId === card.instanceId) {
          if (!unit.keywords) unit.keywords = [];
          const hasShock = hasKeyword(unit, "shock");
          const hasAlert = hasKeyword(unit, "alert");
          const hasMultiStrike = hasKeyword(unit, "multiStrike");
          if (hasShock && hasAlert) {
            unit.keywords = unit.keywords.filter((k) => k.id !== "shock" && k.id !== "alert" && k.id !== "multiStrike");
            unit.keywords.push({ id: "multiStrike", value: 3 });
            log(game, `${unit.name}: [衝撃]+[警戒] → [連撃③]`);
          } else if (hasMultiStrike) {
            unit.keywords = unit.keywords.filter((k) => k.id !== "multiStrike");
            unit.keywords.push({ id: "shock" });
            log(game, `${unit.name}: [連撃③]解除 → [衝撃]を得る`);
          } else if (!hasShock) {
            unit.keywords.push({ id: "shock" });
            log(game, `${unit.name}: [衝撃]を得る`);
          } else {
            unit.keywords.push({ id: "alert" });
            log(game, `${unit.name}: [警戒]を得る`);
          }
          return;
        }
      }
    }
  },
  grantKeywordsToEnemyRelativeRow({ game, playerId, ability }) {
    const opponent = opponentOf(playerId);
    const oppInfo = PLAYERS[opponent];
    const targetRow = oppInfo.summonRow + (ability.row - 1) * oppInfo.forward;
    let count = 0;
    if (targetRow < 0 || targetRow >= ROWS) return;
    for (let col = 0; col < COLS; col++) {
      const unit = game.board[targetRow]?.[col];
      if (unit && unit.owner === opponent) {
        if (!unit.keywords) unit.keywords = [];
        for (const kw of (ability.keywords || [])) {
          if (!unit.keywords.some((k) => k.id === kw)) {
            unit.keywords.push({ id: kw });
            count++;
          }
        }
      }
    }
    const kwLabels = (ability.keywords || []).map((k) => KEYWORD_DEFINITIONS[k]?.label || k).join("・");
    log(game, `${game.players[playerId].name}: 敵第${ability.row}行に[${kwLabels}]付与（${count}体）`);
  },
  destroySelfIfUnrested({ game, card }) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const unit = game.board[row][col];
        if (unit && unit.instanceId === card.instanceId) {
          if (!unit.rested) {
            unit.currentHp = 0;
            cleanupAllDestroyed();
            log(game, `${card.name}: アンレスト状態のため自壊`);
          }
          return;
        }
      }
    }
  },
  summonToken({ game, playerId, ability }) {
    const TOKEN_DEFS = {
      quartzToken: { name: "クォーツトークン", atk: 0, hp: 3, keywords: [{ id: "immobile" }, { id: "raid" }], text: "[不動][奇襲]" },
    };
    const def = TOKEN_DEFS[ability.tokenId];
    if (!def) return;
    const player = game.players[playerId];
    const hasRaid = (def.keywords || []).some((k) => k.id === "raid");
    const validRows = [];
    for (let row = 0; row < ROWS; row++) {
      if (isOpponentSummonRow(playerId, row)) continue;
      if (hasRaid && row === player.summonRow + player.forward && !enemyInRow(playerId, row)) {
        validRows.push(row);
      } else if (row === player.summonRow) {
        validRows.push(row);
      }
    }
    game.pendingChoice = {
      type: "summonToken",
      playerId,
      tokenDef: def,
      tokenId: ability.tokenId,
      validRows,
      hasRaid,
    };
    game.selected = { kind: "choice", choice: "summonToken" };
    game.message = `「${def.name}」を出すマスをクリックしてください`;
    return "pending";
  },
  gainActCostResources({ game, playerId, card, target }) {
    if (!target) return;
    const player = game.players[playerId];
    for (const [res, amount] of Object.entries(target.actCost || {})) {
      if (amount > 0) addResources(player, res, 1);
    }
    const costLabel = Object.entries(target.actCost || {}).filter(([, a]) => a > 0).map(([r]) => RESOURCE_LABELS[r] || r).join("・");
    if (costLabel) log(game, `${card.name}: 「${target.name}」アクトコスト（${costLabel}）の資源を獲得`);
  },
  reviveUnitFromDump({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    const maxCost = ability.maxCost || 1;
    const filterTag = ability.tag || null;
    const eligible = player.dump.filter(
      (c) => c.type === "unit"
        && totalCostAmount(c.cost || {}) <= maxCost
        && (!filterTag || (c.tags || []).includes(filterTag))
    );
    if (!eligible.length) {
      log(game, `${player.name}: 「${card.name}」— 墓地に対象ユニットがいない`);
      return;
    }
    game.pendingChoice = {
      type: "reviveFromDump",
      playerId,
      eligible,
      maxCost,
      grantTag: ability.grantTag || null,
      queueItem: { playerId, card, ability, source: { zone: "struct" } },
    };
    game.selected = { kind: "choice", choice: "reviveFromDump" };
    game.message = `墓地から蘇生するユニット（コスト総量${maxCost}以下${filterTag ? `・[${filterTag}]` : ""}）を選んでください。`;
    return "pending";
  },
  restTargetNoUnrest({ game, target }) {
    if (!target) return;
    target.rested = true;
    target.lockedRestTurns = (target.lockedRestTurns || 0) + 1;
    log(game, `${target.name}: レスト（次のターン解除不可）`);
  },
  produceResourceCostHP({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    const hpCost = ability.hpCost || 3;
    if (player.core.hp <= hpCost) {
      log(game, `${player.name}: コアHPが不足しているため「${card.name}」のHP起動を使えない`);
      return;
    }
    player.core.hp -= hpCost;
    addResources(player, ability.resource, ability.amount || 1);
    log(game, `${player.name}: 「${card.name}」ライフ${hpCost}支払い → ${RESOURCE_LABELS[ability.resource] || ability.resource}+${ability.amount}`);
    checkWinner(game);
  },
  produceResourceCostHuman({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    const humanCost = ability.humanCost || 1;
    if ((player.resources.human || 0) < humanCost) {
      log(game, `${player.name}: 人資源が不足しているため「${card.name}」を使えない`);
      return;
    }
    addResources(player, "human", -humanCost);
    card.rested = true;
    addResources(player, ability.resource, ability.amount || 1);
    log(game, `${player.name}: 「${card.name}」人${humanCost}支払い → ${RESOURCE_LABELS[ability.resource] || ability.resource}+${ability.amount}`);
  },
  deployNamedFromDecks({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    const max = ability.maxTotal || 3;
    let placed = 0;
    // メインデッキから指定ユニット名を自動配置
    for (let i = 0; i < player.mainDeck.length && placed < max; i++) {
      if (player.mainDeck[i].name !== ability.unitName) continue;
      const emptyCol = findFirstEmptyColInRow(game, player.summonRow);
      if (emptyCol < 0) break;
      const unitCard = player.mainDeck.splice(i, 1)[0];
      const unit = makeUnit(unitCard.id, playerId, player.summonRow, emptyCol, { rested: false });
      commitUnitToBoard(game, unit, player.summonRow, emptyCol);
      log(game, `${player.name}: 「${card.name}」効果 — 「${unitCard.name}」出撃`);
      placed++;
      i--;
    }
    // ストラクトデッキから指定施設名を建設
    for (let i = 0; i < player.structDeck.length && placed < max; i++) {
      if (player.structDeck[i].name !== ability.structName) continue;
      const sc = player.structDeck.splice(i, 1)[0];
      player.structs.push(sc);
      log(game, `${player.name}: 「${card.name}」効果 — 「${sc.name}」建設`);
      placed++;
      i--;
    }
    if (placed === 0) log(game, `${player.name}: 「${card.name}」— 対象カードが見つからない`);
  },
  grantTactPeopleDiscount({ game, playerId, card, ability }) {
    if (!game.globalEffects) game.globalEffects = [];
    game.globalEffects.push({
      type: "tactPeopleDiscount",
      playerId,
      amount: ability.amount || 2,
      untilPlayerTurnEnd: playerId,
    });
    log(game, `${game.players[playerId].name}: ${card.name} tact people cost -${ability.amount || 2}`);
  },
  adjacentTagBuff({ game, playerId, card, ability }) {
    if (!card || card.adjacentBuffApplied) return;
    const tag = ability.tag;
    const count = adjacentCells(card.row, card.col).filter(([row, col]) => {
      const unit = game.board[row]?.[col];
      return unit?.owner === playerId && (!tag || (unit.tags || []).includes(tag));
    }).length;
    if (count < (ability.min || 1)) return;
    card.atk = (card.atk || 0) + (ability.atk || 0);
    card.maxHp = (card.maxHp || card.hp || 0) + (ability.hp || 0);
    card.currentHp = (card.currentHp || card.hp || 0) + (ability.hp || 0);
    card.adjacentBuffApplied = true;
    log(game, `${game.players[playerId].name}: ${card.name} adjacent buff +${ability.atk || 0}/+${ability.hp || 0}`);
  },
  grantMobileIfAnyTag({ game, playerId, card, ability }) {
    const tag = ability.tag;
    const exists = ["p1", "p2"].some((pid) => unitsOwnedBy(pid).some((unit) => (unit.tags || []).includes(tag)));
    if (!exists) return;
    ensureKeyword(card, "mobile");
    log(game, `${game.players[playerId].name}: ${card.name} gains mobile`);
  },
  grantConditionalKeywordsByCounter({ game, playerId, card, ability }) {
    if ((card.counters || 0) <= 0) return;
    for (const keyword of ability.keywords || []) ensureKeyword(card, keyword.id || keyword, keyword.value ?? null);
    log(game, `${game.players[playerId].name}: ${card.name} counter keywords applied`);
  },
  goldGolemStrike({ game, playerId, card, target }) {
    if (!target || target.owner === playerId) return;
    const damage = calculateAttackDamage(card, target);
    const result = dealDamageToUnit(game, target, damage, { source: card }, { cleanup: true, killer: card, effectAttack: true });
    log(game, `${game.players[playerId].name}: ${card.name} special strike ${target.name} ${result.damage}`);
    if (result.pending) return "pending";
  },
  payDestroyUpToEnemyCards({ game, playerId, card, ability }) {
    game.pendingChoice = {
      type: "selectDestroyCards",
      playerId,
      cardName: card.name,
      amount: ability.amount || 3,
      cost: ability.cost || {},
      selected: [],
      queueItem: { playerId, card, ability, source: { zone: "board" } },
    };
    game.selected = { kind: "choice", choice: "selectDestroyCards" };
    game.message = `${card.name}: 破壊するカードを選んでください。`;
    return "pending";
  },
  registerDumpLifeGain({ game, playerId, card }) {
    if (!game.globalEffects) game.globalEffects = [];
    if (!game.globalEffects.some((e) => e.type === "dumpLifeGain" && e.playerId === playerId && e.cardId === card.id)) {
      game.globalEffects.push({ type: "dumpLifeGain", playerId, cardId: card.id });
    }
    log(game, `${game.players[playerId].name}: ${card.name} watches dump changes`);
  },
  enterRestedLocked({ game, playerId, card, ability }) {
    card.rested = true;
    card.lockedRestTurns = ability.turns ?? 999;
    log(game, `${game.players[playerId].name}: ${card.name} enters locked-rest`);
  },
  unrestSelf({ game, playerId, card }) {
    card.rested = false;
    card.lockedRestTurns = 0;
    log(game, `${game.players[playerId].name}: ${card.name} unrests`);
  },
  summonTagFromDumpAndRest({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    const tag = ability.tag;
    const idx = player.dump.findIndex((c) => c.type === "unit" && (c.tags || []).includes(tag));
    if (idx < 0) return;
    const col = findFirstEmptyColInRow(game, player.summonRow);
    if (col < 0) return;
    const [unitCard] = player.dump.splice(idx, 1);
    notifyDumpChanged(game, playerId);
    const unit = makeUnit(unitCard.id, playerId, player.summonRow, col, { rested: false, fromDump: true });
    commitUnitToBoard(game, unit, player.summonRow, col);
    card.rested = true;
    triggerAbilities(game, playerId, unit, "onSummon", { fromDump: true });
    log(game, `${player.name}: ${card.name} summons ${unit.name} from dump`);
  },
  summonHandUnitToOpponent({ game, playerId, card }) {
    const player = game.players[playerId];
    const opponentId = opponentOf(playerId);
    const opponent = game.players[opponentId];
    const idx = player.hand.findIndex((c) => c.type === "unit");
    if (idx < 0) return;
    const col = findFirstEmptyColInRow(game, opponent.summonRow);
    if (col < 0) return;
    const [unitCard] = player.hand.splice(idx, 1);
    const unit = makeUnit(unitCard.id, opponentId, opponent.summonRow, col, { rested: false });
    commitUnitToBoard(game, unit, opponent.summonRow, col);
    triggerAbilities(game, opponentId, unit, "onSummon");
    log(game, `${game.players[playerId].name}: ${card.name} gives ${unit.name} to opponent`);
  },
  kaijuAwaken({ game, playerId, card }) {
    const player = game.players[playerId];
    const hasUnit = unitsOwnedBy(playerId).some((unit) => unit.instanceId !== card.instanceId);
    if (!hasUnit || !player.structs.length || !player.hand.length) {
      log(game, `${player.name}: ${card.name} awaken cost unavailable`);
      return;
    }
    game.pendingChoice = {
      type: "kaijuAwaken",
      playerId,
      cardName: card.name,
      unitInstanceId: card.instanceId,
      selectedUnitInstanceId: null,
      selectedStructIndex: null,
      selectedHandIndex: null,
      queueItem: { playerId, card, ability: { effect: "kaijuAwaken" }, source: { zone: "board" } },
    };
    game.selected = { kind: "choice", choice: "kaijuAwaken" };
    game.message = `${card.name}: 除外するユニット・施設・手札を選んでください。`;
    return "pending";
  },
  damageOwnCore({ game, playerId, ability }) {
    game.players[playerId].core.hp -= ability.amount || 1;
    log(game, `${game.players[playerId].name}: own core ${ability.amount || 1} damage`);
    checkWinner(game);
  },
  redirectDamageToOther({ game, playerId, card }) {
    if (!card || card.redirectingDamage) return;
    const lost = (card.maxHp || card.hp || 0) - (card.currentHp || 0);
    if (lost <= 0) return;
    card.redirectingDamage = true;
    card.currentHp += lost;
    const other = [...unitsOwnedBy(playerId), ...unitsOwnedBy(opponentOf(playerId))].find((unit) => unit.instanceId !== card.instanceId);
    if (other) {
      const result = dealDamageToUnit(game, other, lost, { source: card }, { cleanup: false, effectAttack: true });
      log(game, `${card.name}: redirects ${lost} damage to ${other.name}`);
      card.redirectingDamage = false;
      if (result.pending) return "pending";
      cleanupAllDestroyed(card, game);
      return;
    }
    card.redirectingDamage = false;
    game.players[opponentOf(playerId)].core.hp -= lost;
    log(game, `${card.name}: redirects ${lost} damage to opponent core`);
    checkWinner(game);
  },
  revealTagsForResources({ game, playerId, card, ability }) {
    const player = game.players[playerId];
    const tagGroups = (ability.tagGroups || ["純人間", "獣", "龍"]).map((tag) => ({
      tag,
      cards: player.hand.filter((c) => (c.tags || []).includes(tag)),
    }));
    // 必須：[勇者]を見せる（ログのみ、手札に存在は play 時チェック済み）
    const heroCond2 = ability.cond || (ability.requireTagInHand ? { tag: ability.requireTagInHand } : null);
    const heroCard = heroCond2 ? player.hand.find((c) => matchesCond(c, heroCond2)) : null;
    if (heroCard) log(game, `${player.name}: 「${heroCard.name}」を相手に見せた`);
    game.pendingChoice = {
      type: "revealTagsForResources",
      playerId,
      cardName: card.name,
      tagGroups,
      resourcePer: ability.resourcePer || 3,
      resources: ability.resources || ["people", "funds"],
      selected: {},
    };
    return "pending";
  },
  surviveDamageAndOptionalBuff({ game, playerId, card, ability }) {
    // 被ダメージ時：資源を支払える場合のみ発動
    const resource = ability.resource || "magic";
    const amount = ability.amount || 1;
    const player = game.players[playerId];
    console.log(`surviveDamageAndOptionalBuff: card=${card.name}, resource=${resource}, amount=${amount}, curRes=${player.resources[resource] || 0}, ability=${JSON.stringify(ability)}`);

    // 資源が不足していれば、この処理中も破壊される（食いしばり発動しない）
    if ((player.resources[resource] || 0) < amount) {
      console.log(`Resource insufficient for buff: need ${amount} ${resource}, have ${player.resources[resource] || 0}`);
      return;
    }

    // 資源が十分：食いしばり発動 + 修正選択UI表示
    if ((card.currentHp || 0) <= 0) {
      card.currentHp = 1;
      log(game, `${game.players[playerId].name}: 「${card.name}」は被ダメージで破壊されない（${resource}${amount}を支払う予定）`);
    }

    const pendingChoice = {
      type: "payForBuff",
      playerId,
      cardName: card.name,
      unitRow: card.row,
      unitCol: card.col,
      resource,
      amount,
      atkBuff: ability.atkBuff || 1,
      hpBuff: ability.hpBuff || 2,
    };
    game.pendingChoice = pendingChoice;
    console.log(`Setting pendingChoice:`, pendingChoice);
    console.log(`game.pendingChoice after set:`, game.pendingChoice);
    return "pending";
  },
};

function findFirstEmptyColInRow(game, row) {
  if (row < 0 || row >= ROWS) return -1;
  for (const col of unitFieldColsForRow(row)) {
    if (!game.board[row][col]) return col;
  }
  return -1;
}

function unitFieldColsForRow(row) {
  // 召喚行: col0-2=資源/Grand等, col3-5=SF左, col6=Core, col7-9=SF右, col10-12=Dump/Out/Grand等
  if (row === PLAYERS.p1.summonRow) return [3, 4, 5, 7, 8, 9];
  if (row === PLAYERS.p2.summonRow) return [3, 4, 5, 7, 8, 9];
  // 戦闘行: col3-9=Standard (ユニット配置可能領域)
  return [3, 4, 5, 6, 7, 8, 9];
}

function isUnitFieldCell(row, col) {
  return unitFieldColsForRow(row).includes(col);
}

function summonRowsForCard(card, player) {
  const rows = [player.summonRow];
  const raidRow = player.summonRow + player.forward;
  if (hasKeyword(card, "raid") && !isOpponentSummonRow(player.id, raidRow) && !enemyInRow(player.id, raidRow)) {
    rows.unshift(raidRow);
  }
  return rows;
}

function findSummonPlacement(game, playerId, card) {
  const player = game.players[playerId];
  for (const row of summonRowsForCard(card, player)) {
    if (!canSummonToRow(card, player, row) || !canSummonUnitTo(playerId, row)) continue;
    const col = findFirstEmptyColInRow(game, row);
    if (col >= 0) return { row, col };
  }
  return null;
}

function isGolemCard(card, maxCost = 3) {
  return card?.type === "unit" && (card.tags || []).includes("ゴーレム") && totalCostAmount(card.cost || {}) <= maxCost;
}

function summonGolemFromZones(game, playerId, { maxCost = 3, row = null, sourceCardName = "効果" } = {}) {
  const player = game.players[playerId];
  const targetRow = Number.isInteger(row) ? row : player.summonRow;
  const col = findFirstEmptyColInRow(game, targetRow);
  if (col < 0) {
    log(game, `${sourceCardName}: ゴーレムを出す空きマスがありません`);
    return false;
  }

  let zone = "mainDeck";
  let index = player.mainDeck.findIndex((card) => isGolemCard(card, maxCost));
  if (index < 0) {
    zone = "dump";
    index = player.dump.findIndex((card) => isGolemCard(card, maxCost));
  }
  if (index < 0) {
    log(game, `${sourceCardName}: コスト総量${maxCost}以下のゴーレムが見つかりません`);
    return false;
  }

  const [card] = player[zone].splice(index, 1);
  const unit = makeUnit(card.id, playerId, targetRow, col, { rested: false });
  commitUnitToBoard(game, unit, targetRow, col);
  log(game, `${sourceCardName}: ${card.name} を場に出しました`);
  triggerAbilities(game, playerId, unit, "onSummon", { from: zone });
  return true;
}

const cardCatalog = {
  cores: {
    frontierCore: {
      id: "frontierCore",
      type: "core",
      name: "前線司令部",
      faction: "ニュートラル",
      flavor: "戦線を支える標準司令部。どの戦略にも適応しやすい。",
      hp: 22,
      initialHand: 4,
      draw: 1,
      handLimit: 7,
      deckSize: "40\u301c60",
      deckMin: 40,
      deckMax: 60,
      startResources: { funds: 3, people: 2, nature: 1, ore: 0, fuel: 0, electric: 0, magic: 0 },
      income: { funds: 2, people: 1 },
      specialRequirements: [],
      text: "標準的なコア。毎ターン資金2・人的1を得る。",
    },
    tradeCityCore: {
      id: "tradeCityCore",
      type: "core",
      name: "商業都市コア",
      faction: "ニュートラル",
      flavor: "交易と徴税で軍を動かす都市国家型コア。",
      hp: 20,
      initialHand: 4,
      draw: 1,
      handLimit: 7,
      deckSize: "40\u301c60",
      deckMin: 40,
      deckMax: 60,
      startResources: { funds: 4, people: 1, nature: 0, ore: 0, fuel: 0, electric: 0, magic: 0 },
      income: { funds: 3 },
      specialRequirements: ["資金コストを含むカードを4枚以上入れる"],
      text: "資金供給に優れるがHPは低い。毎ターン資金3を得る。",
    },
    mobilizationCore: {
      id: "mobilizationCore",
      type: "core",
      name: "動員司令部",
      faction: "ニュートラル",
      flavor: "人員を素早く集め、継戦能力で押し切る司令部。",
      hp: 24,
      initialHand: 5,
      draw: 1,
      handLimit: 8,
      deckSize: "40\u301c60",
      deckMin: 40,
      deckMax: 60,
      startResources: { funds: 2, people: 3, nature: 1, ore: 0, fuel: 0, electric: 0, magic: 0 },
      income: { funds: 1, people: 2 },
      specialRequirements: ["歩兵または純人間タグのカードを3枚以上入れる"],
      text: "人的資源に優れる。毎ターン資金1・人的2を得る。",
    },
    arcaneReactorCore: {
      id: "arcaneReactorCore",
      type: "core",
      name: "魔導炉心",
      faction: "ニュートラル",
      flavor: "魔力炉を中枢に据えた高出力だが脆いコア。",
      hp: 18,
      initialHand: 3,
      draw: 2,
      handLimit: 6,
      deckSize: "40\u301c60",
      deckMin: 40,
      deckMax: 60,
      startResources: { funds: 2, people: 1, nature: 0, ore: 0, fuel: 0, electric: 1, magic: 1 },
      income: { funds: 1, electric: 1, magic: 1 },
      specialRequirements: ["魔法または電気コストを含むカードを2枚以上入れる"],
      text: "希少資源とドローに優れるが脆い。毎ターン資金1・電気1・魔法1を得る。",
    },
  },
  main: {
    lightInfantry: {
      id: "lightInfantry",
      type: "unit",
      name: "軽歩兵",
      faction: "ニュートラル",
      tags: ["歩兵", "純人間"],
      cost: { people: 1, funds: 1 },
      actCost: {},
      atk: 1,
      hp: 2,
      text: "もっとも安価な部類の歩兵、侮ることはできない。",
      keywords: [{ id: "alert" }],
      abilities: [],
      imageUrl: "assets/cards/lightInfantry.jpeg",
    },
    smallFieldGunFuel: {
      id: "smallFieldGunFuel",
      type: "unit",
      name: "小さな野戦砲",
      faction: "ニュートラル",
      tags: ["砲", "純人間", "機械"],
      variant: "燃料牽引型",
      cost: { ore: 1, funds: 1 },
      actCost: { ore: 1, fuel: 1 },
      atk: 1,
      hp: 2,
      text: "小さな野戦砲だが、砲としての機能はしっかり持ち合わせている。",
      keywords: [{ id: "shock" }, { id: "arc", value: 1 }],
      abilities: [],
    },
    commonArmoredCar: {
      id: "commonArmoredCar",
      type: "unit",
      name: "ありふれた装甲車",
      faction: "ニュートラル",
      tags: ["機甲", "車両", "機械"],
      cost: { ore: 1, funds: 1 },
      actCost: { ore: 1, fuel: 1 },
      atk: 3,
      hp: 2,
      text: "何処にでもあるような装甲車だが歩兵からすれば十分脅威だ",
      keywords: [{ id: "armor", value: 1 }, { id: "mobile" }],
      abilities: [],
    },
    antiArmorMageTeam328: {
      id: "antiArmorMageTeam328",
      type: "unit",
      name: "328-野戦対装甲魔導士隊",
      faction: "ユニフォール",
      tags: ["歩兵", "純人間", "魔法"],
      cost: { people: 2, funds: 1, nature: 1 },
      actCost: { magic: 1 },
      atk: 4,
      hp: 2,
      text: "強襲、攻撃、破壊、魔法により得られる可能性は大きい。",
      keywords: [{ id: "raid" }, { id: "pierce", value: 1 }],
      abilities: [],
    },
    peoplesReconForce: {
      id: "peoplesReconForce",
      type: "unit",
      name: "人民威力偵察部隊",
      faction: "ヘルメネアの大地",
      tags: ["歩兵", "純人間", "魔法", "獣"],
      cost: { people: 2, funds: 2 },
      actCost: { people: 1 },
      atk: 2,
      hp: 3,
      text: "血を流し、人を消耗する、そして…次の作戦とその術が与えられる。",
      keywords: [],
      abilities: [
        { trigger: "onDestroyEnemyUnit", effect: "drawCards", amount: 1 },
        { trigger: "onDestroyEnemyUnit", effect: "gainResource", resource: "funds", amount: 3 },
      ],
    },
    lifeFairy: {
      id: "lifeFairy",
      type: "unit",
      name: "生命妖精",
      faction: "ニュートラル",
      tags: ["神秘", "妖精"],
      cost: { magic: 1 },
      actCost: {},
      atk: 0,
      hp: 1,
      text: "生命の妖精は多くの命を強化する",
      keywords: [],
      abilities: [{ trigger: "onSummon", effect: "buffFriendlyUnitsHp", amount: 1 }],
      imageUrl: "assets/cards/lifeFairy.jpeg",
    },
    knowledgeFairy: {
      id: "knowledgeFairy",
      type: "unit",
      name: "知識妖精",
      faction: "ニュートラル",
      tags: ["神秘", "妖精"],
      cost: { magic: 1 },
      actCost: {},
      atk: 0,
      hp: 1,
      text: "妖精でさえも知恵を貸してくれる",
      keywords: [],
      abilities: [{ trigger: "onSummon", effect: "drawCards", amount: 2 }],
      imageUrl: "assets/cards/knowledgeFairy.jpeg",
    },
    mischievousFairy: {
      id: "mischievousFairy",
      type: "unit",
      name: "悪戯妖精",
      faction: "ニュートラル",
      tags: ["神秘", "妖精"],
      cost: { magic: 1 },
      actCost: {},
      atk: 1,
      hp: 1,
      text: "いたずらでは済まない。妖精の攻撃は意外と危険",
      keywords: [],
      abilities: [{ trigger: "onSummon", effect: "damageTargetUnit", target: "enemyUnit", amount: 2 }],
      imageUrl: "assets/cards/mischievousFairy.jpeg",
    },
    militia: {
      id: "militia",
      type: "unit",
      name: "民兵分隊",
      fixture: true,
      cost: { funds: 1, people: 1 },
      actCost: { funds: 1 },
      atk: 2,
      hp: 4,
      text: "基礎歩兵。低コストで前線を作る。",
      abilities: [],
    },
    armoredCar: {
      id: "armoredCar",
      type: "unit",
      name: "装甲車",
      fixture: true,
      cost: { funds: 2, people: 1, fuel: 1 },
      actCost: { fuel: 1 },
      atk: 4,
      hp: 5,
      text: "燃料で行動する軽装甲ユニット。",
      keywords: [{ id: "armor", value: 1 }, { id: "mobile" }],
      abilities: [],
    },
    mageBattery: {
      id: "mageBattery",
      type: "unit",
      name: "魔導砲兵",
      fixture: true,
      tags: ["神秘", "砲", "魔法"],
      cost: { funds: 2, people: 1, magic: 1 },
      actCost: { magic: 1 },
      atk: 5,
      hp: 3,
      text: "高火力だが魔法資源を要求する。",
      keywords: [{ id: "arc", value: 2 }, { id: "cleave", value: 1 }],
      abilities: [{ trigger: "onSummon", effect: "damageEnemyCore", amount: 1 }],
    },
    shockTrooper: {
      id: "shockTrooper",
      type: "unit",
      name: "衝撃歩兵",
      fixture: true,
      cost: { funds: 2, people: 1, electric: 1 },
      actCost: { funds: 1 },
      atk: 3,
      hp: 4,
      text: "衝撃で与ダメージ時に対象をレストする。",
      keywords: [{ id: "shock" }, { id: "pierce", value: 1 }],
      abilities: [],
    },
    reconPlane: {
      id: "reconPlane",
      type: "unit",
      name: "偵察機",
      fixture: true,
      cost: { funds: 2, fuel: 1 },
      actCost: { fuel: 1 },
      atk: 2,
      hp: 3,
      text: "航空を持つ偵察攻撃ユニット。",
      keywords: [{ id: "flying", value: 3 }],
      abilities: [],
    },
    guardian: {
      id: "guardian",
      type: "unit",
      name: "戦列守備兵",
      fixture: true,
      cost: { funds: 2, people: 2 },
      actCost: { funds: 1 },
      atk: 2,
      hp: 6,
      text: "両隣の味方を通常攻撃から守る。",
      keywords: [{ id: "guard" }, { id: "alert" }],
      abilities: [],
    },
    raidBike: {
      id: "raidBike",
      type: "unit",
      name: "奇襲バイク",
      fixture: true,
      cost: { funds: 1, people: 1, fuel: 1 },
      actCost: { fuel: 1 },
      atk: 2,
      hp: 2,
      text: "敵支配下でなければ第2行に出撃できる。",
      keywords: [{ id: "raid" }, { id: "mobile" }],
      abilities: [],
    },
    bombDrone: {
      id: "bombDrone",
      type: "unit",
      name: "自爆ドローン",
      fixture: true,
      cost: { funds: 1, electric: 1 },
      actCost: { electric: 1 },
      atk: 1,
      hp: 1,
      text: "破壊時、隣接ユニットにダメージ。",
      keywords: [{ id: "selfDestruct", value: 2 }, { id: "noAttack" }],
      abilities: [],
    },
    chargedLancer: {
      id: "chargedLancer",
      type: "unit",
      name: "帯電槍兵",
      fixture: true,
      cost: { funds: 2, people: 1, electric: 1 },
      actCost: { funds: 1 },
      atk: 3,
      hp: 4,
      text: "帯電攻撃で装甲を無視する。",
      keywords: [{ id: "charge" }],
      abilities: [],
    },
    rapidGunner: {
      id: "rapidGunner",
      type: "unit",
      name: "連撃射手",
      fixture: true,
      cost: { funds: 2, people: 1 },
      actCost: { funds: 1 },
      atk: 1,
      hp: 3,
      text: "2回攻撃してからレストする。",
      keywords: [{ id: "multiStrike", value: 2 }],
      abilities: [],
    },
    bunker: {
      id: "bunker",
      type: "unit",
      name: "掩体壕",
      fixture: true,
      cost: { funds: 2, ore: 1 },
      actCost: { funds: 1 },
      atk: 2,
      hp: 7,
      text: "移動できない防衛ユニット。",
      keywords: [{ id: "immobile" }, { id: "armor", value: 2 }],
      abilities: [],
    },
    soulMage: {
      id: "soulMage",
      type: "unit",
      name: "魂術師",
      fixture: true,
      tags: ["神秘", "魔法"],
      cost: { funds: 1, magic: 2 },
      actCost: { magic: 1 },
      atk: 3,
      hp: 3,
      text: "不足した魔法資源を墓地除外で支払える。",
      keywords: [{ id: "soulPay" }],
      abilities: [],
    },
    legendaryAce: {
      id: "legendaryAce",
      type: "unit",
      name: "伝説のエース",
      fixture: true,
      cost: { funds: 3, people: 1, fuel: 1 },
      actCost: { fuel: 1 },
      atk: 5,
      hp: 5,
      text: "デッキに1枚しか入れられない伝説ユニット。",
      keywords: [{ id: "legendary" }, { id: "flying", value: 4 }],
      abilities: [],
    },
    fieldOrder: {
      id: "fieldOrder",
      type: "tact",
      name: "野戦命令",
      faction: "ニュートラル",
      tags: ["補給", "命令"],
      cost: { funds: 1 },
      text: "デッキからカードを1枚引く。",
      flavor: "「前線からの通信です。カード1枚なんかよりも燃を寄越せと…」\n「通信兵の頭がおかしくなった様だな。衛生兵を送れ。」",
      imageUrl: "assets/cards/fieldOrder.jpeg",
      abilities: [{ trigger: "onPlay", effect: "drawCards", amount: 1 }],
    },
    precisionStrike: {
      id: "precisionStrike",
      type: "tact",
      name: "精密攻撃",
      cost: { funds: 1, electric: 1 },
      text: "敵ユニット1体に2ダメージ。対象を選択する。",
      abilities: [{ trigger: "onPlay", effect: "damageTargetUnit", target: "enemyUnit", amount: 2 }],
    },
    mysticCapture: {
      id: "mysticCapture",
      type: "tact",
      name: "神秘捕縛",
      faction: "万神世界",
      tags: ["地球", "バベル社", "アメリカ理神論連邦"],
      cost: { electric: 1 },
      text: "手札から神秘タグを持つユニットを好きなだけ捨て、その登場時効果を発動する。追加で除外し、もう一度その効果を発動する。各カードの呼び出しコスト合計を電気で支払う。不足分は自分のコアがダメージを受ける。",
      flavor: "いかなる神秘も\"人類\"の元に",
      imageUrl: "assets/cards/mysticCapture.jpeg",
      abilities: [{ trigger: "onPlay", effect: "mysticCapture" }],
    },
    hiddenSupply: {
      id: "hiddenSupply",
      type: "wild",
      name: "隠匿補給",
      cost: { funds: 2 },
      text: "このカードを Wild Zone に裏側で配置する。補給としてカードを1枚引き、自然2と燃料1を得る。",
      abilities: [
        { trigger: "onPlay", effect: "drawCards", amount: 1 },
        { trigger: "onPlay", effect: "gainResource", resource: "nature", amount: 2 },
        { trigger: "onPlay", effect: "gainResource", resource: "fuel", amount: 1 },
      ],
    },
    grandMandate: {
      id: "grandMandate",
      type: "grand",
      name: "大号令",
      cost: { funds: 4, people: 2 },
      text: "このカードを Grand Zone に表側で配置する。味方ユニット全体のATKとHPを+1し、カードを1枚引く。",
      abilities: [
        { trigger: "onPlay", effect: "buffFriendlyUnitsAtk", amount: 1 },
        { trigger: "onPlay", effect: "buffFriendlyUnitsHp", amount: 1 },
        { trigger: "onPlay", effect: "drawCards", amount: 1 },
      ],
    },
  },
  structs: {
    town: {
      id: "town",
      type: "struct",
      name: "村",
      cost: { funds: 1 },
      text: "Structure Phase: 人的資源 +1",
      abilities: [{ trigger: "onStructurePhase", effect: "produceResource", resource: "people", amount: 1 }],
    },
    grove: {
      id: "grove",
      type: "struct",
      name: "小規模農場",
      tags: ["産業"],
      cost: { funds: 1 },
      text: "Structure Phase: 自然資源 +1",
      abilities: [{ trigger: "onStructurePhase", effect: "produceResource", resource: "nature", amount: 1 }],
    },
    mine: {
      id: "mine",
      type: "struct",
      name: "小規模鉱山",
      tags: ["産業"],
      cost: { funds: 1, people: 1 },
      text: "Structure Phase: 鉱石 +1",
      abilities: [{ trigger: "onStructurePhase", effect: "produceResource", resource: "ore", amount: 1 }],
    },
    refinery: {
      id: "refinery",
      type: "struct",
      name: "精製所",
      tags: ["産業"],
      cost: { funds: 2, ore: 1 },
      text: "Structure Phase: 燃料 +2",
      abilities: [{ trigger: "onStructurePhase", effect: "produceResource", resource: "fuel", amount: 2 }],
    },
    powerPlant: {
      id: "powerPlant",
      type: "struct",
      name: "風力発電所",
      tags: ["産業"],
      cost: { funds: 3, ore: 1 },
      text: "Structure Phase: 電気 +2",
      abilities: [{ trigger: "onStructurePhase", effect: "produceResource", resource: "electric", amount: 2 }],
    },
    magicWell: {
      id: "magicWell",
      type: "struct",
      name: "魔力井戸",
      cost: { funds: 3, nature: 2 },
      text: "Structure Phase: 魔法 +1",
      abilities: [{ trigger: "onStructurePhase", effect: "produceResource", resource: "magic", amount: 1 }],
    },
    rearFortress: {
      id: "rearFortress",
      type: "struct",
      name: "後方要塞",
      faction: "ニュートラル",
      tags: ["要塞"],
      cost: { ore: 2 },
      keywords: [{ id: "structTaunt", value: 1 }, { id: "effectProtect", value: 1 }],
      text: "[構造挑発①] 相手がストラクトを選ぶ時、[構造挑発]値が最も高いカードの中から選ぶ必要がある。このカードは[効果保護①]を得る。（[効果貫通①]以上を持つカード以外から効果を受けない）",
      abilities: [],
    },
  },
  // ユニットカード（攪乱工兵）はmainに追加
};

// 攪乱工兵をmainに追加
cardCatalog.main.disruptionEngineer = {
  id: "disruptionEngineer",
  type: "unit",
  name: "攪乱工兵",
  faction: "ユニフォール",
  tags: ["歩兵", "純人間", "魔法"],
  cost: { people: 1, magic: 2 },
  actCost: {},
  atk: 1,
  hp: 3,
  text: "このユニットに隣接する味方ユニットは[効果保護①]を得る。",
  keywords: [],
  abilities: [{ trigger: "onSummon", effect: "grantEffectProtectToAdjacent", value: 1 }],
  imageUrl: "assets/cards/disruptionEngineer.jpeg",
};

cardCatalog.main.turbulentRepatriation = {
  id: "turbulentRepatriation",
  type: "tact",
  name: "思想魔法 『濁流送還』",
  faction: "ユニフォール",
  tags: ["送還主義", "魔法", "厄災"],
  cost: { magic: 9 },
  actCost: {},
  text: "場のすべての世界が「ユニフォール」、「ニュートラル」でもないユニットを除外する。",
  flavor: "ああ、もう還るしかないのだな。",
  keywords: [],
  abilities: [{ trigger: "onPlay", effect: "exileAllNonNeutralNonUnifall" }],
};

cardCatalog.main.precipitousFall = {
  id: "precipitousFall",
  type: "tact",
  name: "『墜落』",
  faction: "ユニフォール",
  tags: ["厄災"],
  cost: { magic: 5 },
  actCost: {},
  text: "自分・相手の除外されているユニットから一つ選び、自分の第一行に出す。",
  flavor: "望むかどうかに関わらず、世界への墜落は突然起こりうる。",
  keywords: [],
  abilities: [{ trigger: "onPlay", effect: "reviveFromExile" }],
};

let nextInstanceId = 1;
const hitRegions = [];
const hoverRegions = [];
const wheelRegions = [];
let appHoveredCard = null;
const cardImageCache = new Map();
let onlineSocket = null;
let onlineOpenCallbacks = [];
let applyingRemoteState = false;
let nextOnlineOpId = 1;
let queuedOnlineAction = null;
loadCustomCardsIntoCatalog();
loadBundledDeckData();
const app = createAppState();
const state = createGame(app.deck.main, app.deck.struct);

// Hidden input for deck builder text search
const HIDDEN_INPUT_CSS = "position:fixed;left:-9999px;top:0;width:200px;height:24px;opacity:0;pointer-events:none;";

const searchInput = document.createElement("input");
searchInput.type = "text";
searchInput.id = "deck-search-input";
searchInput.name = "deck-search-input";
searchInput.autocomplete = "off";
searchInput.style.cssText = HIDDEN_INPUT_CSS;
document.body.appendChild(searchInput);
searchInput.addEventListener("input", () => {
  app.deckBuilder.searchText = searchInput.value;
  app.deckBuilder.libraryScroll = 0;
  render();
});
searchInput.addEventListener("blur", () => {
  app.deckBuilder.searchFocused = false;
  render();
});

const roomCodeInput = document.createElement("input");
roomCodeInput.type = "text";
roomCodeInput.id = "room-code-input";
roomCodeInput.name = "room-code-input";
roomCodeInput.autocomplete = "off";
roomCodeInput.style.cssText = HIDDEN_INPUT_CSS;
document.body.appendChild(roomCodeInput);
roomCodeInput.addEventListener("input", () => {
  app.match.roomCode = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  render();
});
roomCodeInput.addEventListener("blur", () => {
  app.match.roomCodeFocused = false;
  render();
});

function normalizeResourceObject(resources = {}) {
  const normalized = emptyResources();
  for (const [rawKey, rawAmount] of Object.entries(resources || {})) {
    const amount = Number(rawAmount) || 0;
    if (!amount) continue;
    const mappedKey = rawKey === "food" ? "nature" : rawKey;
    if (RESOURCE_KEYS.includes(mappedKey)) normalized[mappedKey] += amount;
  }
  return normalized;
}

function normalizeCardResources(card) {
  if (!card || typeof card !== "object") return card;
  card.cost = normalizeResourceObject(card.cost || {});
  card.actCost = normalizeResourceObject(card.actCost || {});
  if (card.type === "core") applyCoreDefaults(card);
  if (card.startResources) card.startResources = normalizeResourceObject(card.startResources);
  if (card.income) card.income = normalizeResourceObject(card.income);
  for (const ability of card.abilities || []) {
    if (ability.resource === "food") ability.resource = "nature";
  }
  return card;
}

function applyCoreDefaults(core) {
  const fallback = cardCatalog?.cores?.[DEFAULT_CORE_ID] || {};
  const hasResourceValue = (resources) => Object.values(resources || {}).some((amount) => Number(amount));
  core.hp = Number(core.hp) || Number(fallback.hp) || 20;
  core.initialHand = Number(core.initialHand) || Number(fallback.initialHand) || 4;
  core.draw = Number(core.draw ?? core.drawCount ?? core.drawPerTurn) || Number(fallback.draw) || 1;
  core.handLimit = Number(core.handLimit ?? core.maxHandSize ?? core.handMax) || Number(fallback.handLimit) || 7;
  core.deckSize = core.deckSize || fallback.deckSize || "40\u301c60";
  core.deckMin = Number(core.deckMin) || Number(fallback.deckMin) || 40;
  core.deckMax = Number(core.deckMax) || Number(fallback.deckMax) || 60;
  core.startResources = normalizeResourceObject(hasResourceValue(core.startResources) ? core.startResources : fallback.startResources || {});
  if (hasResourceValue(core.income)) {
    core.income = normalizeResourceObject(core.income);
  } else if (core.name === "\u738b\u57ce\u30ce\u30fc\u30d9\u30eb\u30b0" && core.description === "(\u52b9\u679c\u7121\u3057)") {
    core.income = {};
  } else if (core.id === "card_1753611174564" || core.name === "\u8089\u306e\u738b\u57ce") {
    core.income = {};
  } else {
    core.income = normalizeResourceObject(fallback.income || {});
  }
  core.specialRequirements = Array.isArray(core.specialRequirements) ? core.specialRequirements : [];
  core.flavor = core.flavor || core.text || fallback.flavor || "";
  return core;
}

function normalizeGameResources(gameState) {
  for (const player of Object.values(gameState?.players || {})) {
    player.resources = normalizeResourceObject(player.resources || {});
    normalizeCardResources(player.core);
    for (const group of ["mainDeck", "structDeck", "hand", "structs", "tactZone", "wildZone", "grandZone", "dump", "exileZone"]) {
      for (const card of player[group] || []) normalizeCardResources(card);
    }
  }
  for (const row of gameState?.board || []) {
    for (const unit of row || []) normalizeCardResources(unit);
  }
  return gameState;
}

function loadCustomCardsIntoCatalog() {
  try {
    const raw = localStorage.getItem(CUSTOM_CARD_STORE_KEY);
    if (!raw) return 0;
    const groups = JSON.parse(raw);
    return registerImportedCards(groups);
  } catch {
    return 0;
  }
}

function loadBundledDeckData() {
  const rawCards = [
    ...(Array.isArray(deckData?.cards) ? deckData.cards : []),
    ...(Array.isArray(supplementalCards) ? supplementalCards : []),
  ];
  // deck_data.js may contain duplicate ids; keep the last (newest) export per id.
  const cardsById = new Map();
  for (const deckmakerCard of rawCards) {
    if (deckmakerCard?.id) cardsById.set(deckmakerCard.id, deckmakerCard);
  }
  const cards = [...cardsById.values()];
  for (const deckmakerCard of cards) {
    try {
      const card = fromDeckmakerCard(deckmakerCard);
      if (!card) continue;
      const group = catalogGroupForCard(card);
      // Bundled cards usually don't overwrite user-customized versions already in catalog.
      // Core cards are refreshed from Deckmaker source so corrected initialResources
      // migrate even when an older imported copy is still stored in localStorage.
      if (
        !cardCatalog[group][card.id]
        || FORCE_BUNDLED_CARD_IDS.has(card.id)
        || (group === "structs" && BUNDLED_PRODUCTION_STRUCT_IDS.has(card.id))
        || (group === "cores" && deckmakerCard.initialResources)
      ) {
        cardCatalog[group][card.id] = card;
      }
    } catch (e) {
      console.warn("loadBundledDeckData: error processing card", deckmakerCard?.id, e);
    }
  }
  // キーワードが未設定のカードを修正
  ensureAllCardKeywords();
  refreshCatalogCompatibility(cardCatalog);
}

async function loadFirebaseCardsIntoCatalog() {
  if (!app) return false;
  app.cardSync = { status: "loading", count: 0, error: null, updatedAt: null };
  try {
    const cards = await fetchAllFirebaseCards();
    let count = 0;
    for (const deckmakerCard of cards) {
      try {
        const card = fromDeckmakerCard(deckmakerCard);
        if (!card || card.fixture) continue;
        const group = catalogGroupForCard(card);
        cardCatalog[group][card.id] = card;
        count += 1;
      } catch (e) {
        console.warn("loadFirebaseCardsIntoCatalog: error processing card", deckmakerCard?.id, e);
      }
    }
    ensureAllCardKeywords();
    applySupplementalCardOverrides();
    refreshCatalogCompatibility(cardCatalog);
    app.cardSync = { status: "ok", count, error: null, updatedAt: Date.now() };
    if (app.screen === "deckBuilder") {
      app.deckBuilder.message = `Firebaseからカード${count}枚を同期しました。`;
    }
    return true;
  } catch (error) {
    console.warn("loadFirebaseCardsIntoCatalog failed:", error);
    app.cardSync = { status: "error", count: 0, error: String(error.message || error), updatedAt: Date.now() };
    if (app.screen === "deckBuilder" && !app.deckBuilder.message?.includes("同期")) {
      app.deckBuilder.message = "Firebase同期に失敗しました。バンドルデータを使用しています。";
    }
    return false;
  }
}

function applySupplementalCardOverrides() {
  if (!Array.isArray(supplementalCards)) return 0;
  let count = 0;
  for (const deckmakerCard of supplementalCards) {
    if (!deckmakerCard?.id) continue;
    try {
      const card = fromDeckmakerCard(deckmakerCard);
      if (!card) continue;
      cardCatalog[catalogGroupForCard(card)][card.id] = card;
      count += 1;
    } catch (e) {
      console.warn("applySupplementalCardOverrides:", deckmakerCard?.id, e);
    }
  }
  return count;
}

function ensureAllCardKeywords() {
  for (const group of ["main", "structs"]) {
    for (const card of Object.values(cardCatalog[group] || {})) {
      if (!card?.description) continue;
      // keywordsが設定されていない、または空の場合は自動生成
      if (!card.keywords || card.keywords.length === 0) {
        card.keywords = parseDeckmakerKeywords(card);
      }
    }
  }
}

function persistCustomCards(groups) {
  try {
    localStorage.setItem(CUSTOM_CARD_STORE_KEY, JSON.stringify(groups));
  } catch (e) {
    console.warn("persistCustomCards: localStorage quota exceeded, clearing old data and retrying", e);
    try {
      localStorage.removeItem(CUSTOM_CARD_STORE_KEY);
      localStorage.setItem(CUSTOM_CARD_STORE_KEY, JSON.stringify(groups));
    } catch {
      // give up silently — cards are still in memory for this session
    }
  }
}

function catalogGroupForCard(card) {
  if (card.type === "core") return "cores";
  if (card.type === "struct") return "structs";
  return "main";
}

function registerImportedCards(groups = {}) {
  let count = 0;
  for (const group of ["cores", "main", "structs"]) {
    for (const card of Object.values(groups[group] || {})) {
      if (!card?.id) continue;
      cardCatalog[group][card.id] = applyCardCompatibility(normalizeCardResources(card));
      count += 1;
    }
  }
  return count;
}

function persistedCustomCardGroups() {
  try {
    const raw = localStorage.getItem(CUSTOM_CARD_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      cores: parsed.cores || {},
      main: parsed.main || {},
      structs: parsed.structs || {},
    };
  } catch {
    return { cores: {}, main: {}, structs: {} };
  }
}

function deckmakerTypeToLocal(cardOrType) {
  const type = typeof cardOrType === "object" ? cardOrType?.type : cardOrType;
  const value = String(type || "").trim().toLowerCase();
  if (["core", "コア"].includes(value)) return "core";
  if (["unit", "ユニット", "fort", "フォート"].includes(value)) return "unit";
  if (["tact", "tactic", "command", "指令", "タクト"].includes(value)) return "tact";
  if (["wild"].includes(value)) return "wild";
  if (["grand", "グランド"].includes(value)) return "grand";
  if (["struct", "structure", "施設", "ストラクト"].includes(value)) return "struct";
  if (typeof cardOrType === "object") {
    if (cardOrType.attack != null || cardOrType.defense != null) return "unit";
    if (Object.values(cardOrType.generates || {}).some((amount) => Number(amount))) return "struct";
  }
  return "tact";
}

function parseActivationCostFromText(costText) {
  const cost = {};
  const RES_MAP = { 人: "people", 自: "nature", 鉱: "ore", 燃: "fuel", 電: "electric", 魔: "magic", 金: "funds" };
  const re = /([人自鉱燃電魔金])([①②③④⑤⑥⑦⑧⑨0-9０-９]+)/g;
  let m;
  while ((m = re.exec(costText)) !== null) {
    const res = RES_MAP[m[1]];
    if (res) cost[res] = (cost[res] || 0) + (parseDeckmakerKeywordValue(m[2]) || 1);
  }
  return cost;
}

function fromDeckmakerCosts(costs = {}) {
  const result = emptyResources();
  for (const [deckmakerKey, amount] of Object.entries(costs || {})) {
    const localKey = DECKMAKER_TO_RESOURCE_KEYS[deckmakerKey] || deckmakerKey;
    if (RESOURCE_KEYS.includes(localKey)) result[localKey] += Number(amount) || 0;
  }
  return Object.fromEntries(Object.entries(result).filter(([, amount]) => amount));
}

function parseDeckmakerKeywordValue(raw = "") {
  const text = String(raw);
  const match = text.match(/[0-9０-９①②③④⑤⑥⑦⑧⑨⑩⓵⓶⓷⓸⓹⓺⓻⓼⓽⓾]+/);
  if (!match) return undefined;
  const token = match[0];
  const circled = {
    "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9, "⑩": 10,
    "⓵": 1, "⓶": 2, "⓷": 3, "⓸": 4, "⓹": 5, "⓺": 6, "⓻": 7, "⓼": 8, "⓽": 9, "⓾": 10,
  };
  if (circled[token]) return circled[token];
  return Number(token.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))) || undefined;
}

function parseDeckmakerKeywords(card) {
  // Scan both the leading [keyword] block and ability text in description
  // Leading block: [装甲②][機動] etc. — these are unconditional
  // Ability text: 被ダメージ時：[衝撃]を得る など — these are conditional and should NOT be added as unconditional keywords
  const descKeywordBlock = (card.description || "").match(/^(?:\s*\[[^\]]+\])+/)?.[0] || "";

  // IMPORTANT: Do NOT scan [keywords] from ability text (trigger:effect descriptions)
  // These are CONDITIONAL and would incorrectly add them as unconditional base keywords
  // Example: "墓地から出たこのユニットは[機動]を得る" should NOT add mobile to base keywords
  // because the mobile keyword is only active when summoned from graveyard

  const text = `${descKeywordBlock}\n${(card.keywords || []).join(" ")}`;
  const NUM = String.raw`[①②③④⑤⑥⑦⑧⑨⑩⓵⓶⓷⓸⓹⓺⓻⓼⓽⓾0-9０-９]*`;
  const numRe = (label) => new RegExp(`${label}${NUM}`, "g");
  const patterns = [
    ["armor", numRe("装甲")],
    ["pierce", numRe("貫通")],
    ["shock", /衝撃/g],
    ["charge", /帯電/g],
    ["mobile", /機動/g],
    ["multiStrike", numRe("連撃")],
    ["flying", numRe("航空")],
    ["antiAir", numRe("対空")],
    ["arc", numRe("曲射")],
    ["legendary", /伝説/g],
    ["alert", /警戒/g],
    ["guard", /守護/g],
    ["selfDestruct", numRe("自爆")],
    ["raid", /奇襲/g],
    ["immobile", /不動/g],
    ["noAttack", /不攻/g],
    ["soulPay", /魂/g],
    ["cleave", numRe("巨撃")],
    ["oneDamage", /ダメージを1[づず]つしか受けない/g],
  ];
  const keywords = [];
  const seen = new Set();
  for (const [id, regex] of patterns) {
    for (const match of text.matchAll(regex)) {
      const key = `${id}:${match[0]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const value = parseDeckmakerKeywordValue(match[0]);
      keywords.push(value ? { id, value } : { id });
    }
  }
  return keywords;
}

function parseDeckmakerAbilities(card, localType) {
  const abilities = [];
  const text = String(card.description || "");
  if (localType === "struct") {
    const generates = fromDeckmakerCosts(card.generates || {});
    const negEntries = Object.entries(generates).filter(([, a]) => a < 0);
    const posEntries = Object.entries(generates).filter(([, a]) => a > 0);
    if (negEntries.length >= 1 && posEntries.length > 0) {
      abilities.push({
        trigger: "onStructurePhase",
        effect: "chooseExchange",
        costOptions: negEntries.map(([resource, amount]) => ({ resource, amount: Math.abs(amount) })),
        produces: Object.fromEntries(posEntries),
      });
    } else {
      for (const [resource, amount] of Object.entries(generates)) {
        if (Number(amount) > 0) {
          abilities.push({ trigger: "onStructurePhase", effect: "produceResource", resource, amount });
        }
      }
    }
    if (!abilities.some((a) => STRUCT_PHASE_TRIGGERS.includes(a.trigger))) {
      const phaseText = String(card.description || "");
      const phaseMatch = phaseText.match(/ストラクチャーフェーズ[：:]([^\n。]+)/);
      const sourceText = phaseMatch ? phaseMatch[1] : phaseText;
      const structPhaseGains = [
        [/金([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "funds"],
        [/人([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "people"],
        [/自([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "nature"],
        [/鉱([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "ore"],
        [/燃([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "fuel"],
        [/電([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "electric"],
        [/魔([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "magic"],
      ];
      for (const [pattern, resource] of structPhaseGains) {
        const match = sourceText.match(pattern);
        if (match) {
          abilities.push({
            trigger: "onStructurePhase",
            effect: "produceResource",
            resource,
            amount: parseDeckmakerKeywordValue(match[1]) || 1,
          });
        }
      }
    }
    const structDestroyEnemyMatch = text.match(/燃([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を支払[^。\n]*相手のストラクト(?:カード)?を([0-9０-９①②③④⑤⑥⑦⑧⑨]+)枚破壊/);
    if (structDestroyEnemyMatch && !abilities.some((a) => a.effect === "destroyEnemyStructs")) {
      abilities.push({
        trigger: "onStructurePhase",
        effect: "destroyEnemyStructs",
        fuelCost: parseDeckmakerKeywordValue(structDestroyEnemyMatch[1]) || 1,
        amount: parseDeckmakerKeywordValue(structDestroyEnemyMatch[2]) || 1,
      });
    }
  }
  const baseTrigger = localType === "unit" ? "onSummon" : "onPlay";

  // Draw patterns: "カードをX枚引く", "デッキからX枚ドロー", "X枚ドロー"
  const drawMatch = text.match(/(?:カードを|デッキから)([0-9０-９一二三四五六七八九]+)枚(?:引く|ドロー)/)
    || text.match(/([0-9０-９一二三四五六七八九]+)枚ドロー/);
  if (drawMatch) {
    const amount = parseDeckmakerKeywordValue(drawMatch[1]) || 1;
    abilities.push({ trigger: baseTrigger, effect: "drawCards", amount });
  }

  const buffAllHpMatch = text.match(/出撃時[：:].*?味方ユニット全体.*?HP.*?[＋+]([0-9０-９①②③④⑤⑥⑦⑧⑨]+)/s);
  if (buffAllHpMatch) {
    abilities.push({ trigger: "onSummon", effect: "buffFriendlyUnitsHp", amount: parseDeckmakerKeywordValue(buffAllHpMatch[1]) || 1 });
  }
  const dmgEnemyOnSummonMatch = text.match(/出撃時[：:].*?敵ユニット1体に([0-9０-９①②③④⑤⑥⑦⑧⑨]+)ダメージ/s);
  if (dmgEnemyOnSummonMatch) {
    abilities.push({
      trigger: "onSummon",
      effect: "damageTargetUnit",
      target: "enemyUnit",
      amount: parseDeckmakerKeywordValue(dmgEnemyOnSummonMatch[1]) || 1,
    });
  }

  const destroyStructsOnPlayMatch = text.match(/相手のストラクトカードを([0-9０-９①②③④⑤⑥⑦⑧⑨]+)枚破壊/);
  if (destroyStructsOnPlayMatch && localType === "tact") {
    abilities.push({
      trigger: "onPlay",
      effect: "destroyEnemyStructsOnPlay",
      amount: parseDeckmakerKeywordValue(destroyStructsOnPlayMatch[1]) || 1,
    });
  }

  // Mill pattern: "デッキの上からX枚を墓地へ送る" (出撃時 or baseTrigger)
  const millOnSummonMatch = text.match(/出撃時[：:].*?デッキの上から([0-9０-９①②③④⑤⑖⑦⑧⑨一二三四五六七八九]+)枚を墓地へ送る/s);
  if (millOnSummonMatch) {
    abilities.push({ trigger: "onSummon", effect: "millCards", amount: parseDeckmakerKeywordValue(millOnSummonMatch[1]) || 1 });
  } else {
    const millMatch = text.match(/デッキの上から([0-9０-９①②③④⑤⑥⑦⑧⑨一二三四五六七八九]+)枚を墓地へ送る/);
    if (millMatch && !/破壊された時/.test(text)) {
      abilities.push({ trigger: baseTrigger, effect: "millCards", amount: parseDeckmakerKeywordValue(millMatch[1]) || 1 });
    }
  }

  // On-destroy mill: "破壊された時：デッキの上からX枚を墓地へ送る"
  const onDestroyMillMatch = text.match(/破壊された時[：:].*?デッキの上から([0-9０-９①②③④⑤⑥⑦⑧⑨一二三四五六七八九]+)枚を墓地へ送る/s);
  if (onDestroyMillMatch) {
    abilities.push({ trigger: "onDestroy", effect: "millCards", amount: parseDeckmakerKeywordValue(onDestroyMillMatch[1]) || 1 });
  }

  // On-mill summon self: "デッキから墓地へ送られた時：このカードを場に出す"
  if (/デッキから墓地へ送られた時[：:].*場に出す/.test(text)) {
    abilities.push({ trigger: "onMill", effect: "summonSelfFromDump" });
  }

  // Destroy all enemy units: "すべての相手ユニットを破壊"
  if (/すべての相手ユニットを破壊/.test(text)) {
    abilities.push({ trigger: baseTrigger, effect: "destroyAllEnemyUnits" });
  }

  // Destroy all: "場のすべてのユニット・タクト・ストラクトを破壊"
  if (/すべてのユニット.*タクト.*ストラクトを破壊/.test(text) || /すべてのユニット.*破壊する/.test(text)) {
    abilities.push({ trigger: baseTrigger, effect: "destroyAll" });
  }

  // Search self to hand: "デッキから「<self>」をX枚まで手札に加える"
  const searchSelfMatch = text.match(/デッキから「(.+?)」を([0-9０-９①②③④⑤⑥⑦⑧⑨一二三四五六七八九]+)枚まで手札に加える/);
  if (searchSelfMatch && card.name) {
    const searched = searchSelfMatch[1].trim();
    const cardName = String(card.name).trim();
    if (cardName === searched || cardName.startsWith(searched) || cardName.includes(searched)) {
      abilities.push({ trigger: "onSummon", effect: "searchSelfToHand", amount: parseDeckmakerKeywordValue(searchSelfMatch[2]) || 1 });
    }
  }

  // Destroy target enemy struct: "フィールドの相手の施設カードを1枚選び、破壊する"
  if (/相手.*施設.*破壊/.test(text) || /フィールドの相手.*施設/.test(text)) {
    abilities.push({ trigger: baseTrigger, effect: "destroyTargetStruct" });
  }

  // Buff tag units ATK: "X[タグ]ユニット全ては+Y/±0の修正"
  const buffTagMatch = text.match(/\[([^\]]+)\]ユニット全ては[＋+]([0-9０-９①②③④⑤⑥⑦⑧⑨]+)\/[±＋+0０][0-9]*/);
  if (buffTagMatch) {
    const amount = parseDeckmakerKeywordValue(buffTagMatch[2]) || 1;
    abilities.push({ trigger: baseTrigger, effect: "buffTagUnitsAtk", tag: buffTagMatch[1], amount });
  }

  // "「破壊された時：金③を得る」を与える" → grant onDestroy gainResource to target unit
  const DESC_RESOURCE_MAP_LOCAL = { 人: "people", 自: "nature", 鉱: "ore", 燃: "fuel", 電: "electric", 魔: "magic", 金: "funds" };
  const grantDestroyGainMatch = text.match(/「破壊された時[：:]([人自鉱燃電魔金])([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る」を与える/);
  if (grantDestroyGainMatch) {
    const resource = DESC_RESOURCE_MAP_LOCAL[grantDestroyGainMatch[1]] || "funds";
    const amount = parseDeckmakerKeywordValue(grantDestroyGainMatch[2]) || 1;
    abilities.push({ trigger: "onPlay", effect: "grantDestroyGain", target: "friendlyUnit", resource, amount });
  }

  // Simple resource gain for non-struct tact/unit cards (exclude quoted ability grants)
  if (localType !== "struct" && localType !== "core") {
    const textForGain = text
      .replace(/「[^」]*」を与える/g, "")
      .replace(/(?:相手.*?破壊|敵撃破時)[^。\n]*/g, "")
      .replace(/与ダメージ時[^。\n]*/g, "");
    const resourceGainPatterns = [
      [/金([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "funds"],
      [/人([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "people"],
      [/自([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "nature"],
      [/鉱([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "ore"],
      [/燃([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "fuel"],
      [/電([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "electric"],
      [/魔([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "magic"],
    ];
    for (const [pattern, resource] of resourceGainPatterns) {
      const match = textForGain.match(pattern);
      if (match) {
        const amount = parseDeckmakerKeywordValue(match[1]) || 1;
        abilities.push({ trigger: baseTrigger, effect: "gainResource", resource, amount });
      }
    }
  }

  // onDestroyEnemyUnit resource gain (structs and units): "相手ユニットを破壊するたび" / "敵撃破時"
  const destroyGainPatterns = [
    [/(?:相手.*?破壊|敵撃破時)[^。\n]*?人([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "people"],
    [/(?:相手.*?破壊|敵撃破時)[^。\n]*?金([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "funds"],
    [/(?:相手.*?破壊|敵撃破時)[^。\n]*?自([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "nature"],
    [/(?:相手.*?破壊|敵撃破時)[^。\n]*?鉱([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "ore"],
    [/(?:相手.*?破壊|敵撃破時)[^。\n]*?燃([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "fuel"],
    [/(?:相手.*?破壊|敵撃破時)[^。\n]*?電([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "electric"],
    [/(?:相手.*?破壊|敵撃破時)[^。\n]*?魔([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "magic"],
  ];
  for (const [pattern, resource] of destroyGainPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseDeckmakerKeywordValue(match[1]) || 1;
      abilities.push({ trigger: "onDestroyEnemyUnit", effect: "gainResource", resource, amount });
    }
  }

  // onDamageDealt resource gain: "与ダメージ時：鉱Xと燃Yを得る"
  const dealDamageGainPatterns = [
    [/与ダメージ時[^。\n]*?金([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "funds"],
    [/与ダメージ時[^。\n]*?人([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "people"],
    [/与ダメージ時[^。\n]*?自([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "nature"],
    [/与ダメージ時[^。\n]*?鉱([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "ore"],
    [/与ダメージ時[^。\n]*?燃([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "fuel"],
    [/与ダメージ時[^。\n]*?電([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "electric"],
    [/与ダメージ時[^。\n]*?魔([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/, "magic"],
  ];
  for (const [pattern, resource] of dealDamageGainPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseDeckmakerKeywordValue(match[1]) || 1;
      abilities.push({ trigger: "onDamageDealt", effect: "gainResource", resource, amount });
    }
  }

  // 手札の[tag]/「name」を見せて発動 + タグカードを見せて人・金×N
  const revealHeroTagMatch = text.match(/手札の\[([^\]]+)\]ユニットを相手に見せて発動/);
  const revealHeroNameMatch = text.match(/手札の「([^」]+)」ユニットを相手に見せて発動/);
  const revealTagGainMatch = text.match(/手札から(.+?)カードをそれぞれ、1枚まで.*?見せてもよい.*?枚数×([0-9０-９①②③④⑤⑥⑦⑧⑨⑩]*)だけ([人金自鉱燃電魔]+)と([人金自鉱燃電魔]+)を得る/);
  const revealHeroMatch = revealHeroTagMatch || revealHeroNameMatch;
  if (revealHeroMatch && revealTagGainMatch) {
    const heroCond = revealHeroTagMatch
      ? { tag: revealHeroTagMatch[1] }
      : { nameContains: revealHeroNameMatch[1] };
    const tagStr = revealTagGainMatch[1];
    const tagGroups = tagStr.match(/\[([^\]]+)\]/g)?.map((t) => t.slice(1, -1)) || [];
    const per = parseDeckmakerKeywordValue(revealTagGainMatch[2]) || 3;
    const resMap = { 人: "people", 金: "funds", 自: "nature", 鉱: "ore", 燃: "fuel", 電: "electric", 魔: "magic" };
    const res1 = resMap[revealTagGainMatch[3]] || "people";
    const res2 = resMap[revealTagGainMatch[4]] || "funds";
    abilities.push({ trigger: baseTrigger, effect: "revealTagsForResources", cond: heroCond, tagGroups, resourcePer: per, resources: [res1, res2] });
  }

  // 被ダメージ時：破壊されず + 資源支払いで+N/+M または +N/M
  let takeDamageSurviveBuff = text.match(/被ダメージ時[^。\n]*?破壊されず[^。\n]*?([金人自鉱燃電魔])を支払うことで[^。\n]*?\+([0-9０-９①②③④⑤⑥⑦⑧⑨⑩⓵⓶⓷⓸⓹⓺⓻⓼⓽⓾]*)\/\+?([0-9０-９①②③④⑤⑥⑦⑧⑨⑩⓵⓶⓷⓸⓹⓺⓻⓼⓽⓾]*)/);
  if (!takeDamageSurviveBuff) {
    // フォールバック：より柔軟なパターンを試す（+N/M形式にも対応）
    takeDamageSurviveBuff = text.match(/被ダメージ時[^。\n]*?破壊されず[^。\n]*?([金人自鉱燃電魔])を支払[^。\n]*?\+([0-9０-９①②③④⑤⑥⑦⑧⑨⑩⓵⓶⓷⓸⓹⓺⓻⓼⓽⓾]*)\/(\+)?([0-9０-９①②③④⑤⑥⑦⑧⑨⑩⓵⓶⓷⓸⓹⓺⓻⓼⓽⓾]*)/);
  }
  if (takeDamageSurviveBuff) {
    const resMap = { 金: "funds", 人: "people", 自: "nature", 鉱: "ore", 燃: "fuel", 電: "electric", 魔: "magic" };
    const resource = resMap[takeDamageSurviveBuff[1]] || "magic";
    const atkBuff = parseDeckmakerKeywordValue(takeDamageSurviveBuff[2]) || 1;
    // フォールバック時は[3]がoptional +、[4]がHP値。通常時は[3]がHP値
    const hpIndex = takeDamageSurviveBuff[4] !== undefined ? 4 : 3;
    const hpBuff = parseDeckmakerKeywordValue(takeDamageSurviveBuff[hpIndex]) || 2;
    abilities.push({ trigger: "onDamageReceived", effect: "surviveDamageAndOptionalBuff", resource, amount: 1, atkBuff, hpBuff });
  }

  // [降臨]: treat as onSummon trigger + descentEffect
  if (/\[降臨\]/.test(text)) {
    abilities.push({ trigger: "onSummon", effect: "descentEffect" });
  }

  // Search other card by name to hand: "デッキから「X」を1枚まで手札に加える" (not self)
  const searchOtherMatch = text.match(/デッキから「(.+?)」を([0-9０-９①②③④⑤⑥⑦⑧⑨一二三四五六七八九]+)枚まで手札に加える/);
  if (searchOtherMatch && card.name) {
    const searched = searchOtherMatch[1].trim();
    const cardName = String(card.name).trim();
    if (cardName !== searched && !cardName.startsWith(searched) && !cardName.includes(searched)) {
      abilities.push({ trigger: baseTrigger, effect: "searchCardToHand", cardName: searched, amount: parseDeckmakerKeywordValue(searchOtherMatch[2]) || 1 });
    }
  }

  // Search by cost limit to hand: "デッキからコスト総量X以下の[タグ]ユニットカードを手札に加える"
  const searchCostMatch = text.match(/デッキからコスト総量([0-9０-９①②③④⑤⑥⑦⑧⑨一二三四五六七八九]+)以下(?:の\[([^\]]+)\])?ユニット.*手札に加える/);
  if (searchCostMatch) {
    const maxCost = parseDeckmakerKeywordValue(searchCostMatch[1]) || 1;
    const tag = searchCostMatch[2] || null;
    abilities.push({ trigger: baseTrigger, effect: "searchUnitToCostHand", maxCost, tag, amount: 1 });
  }

  // Search min total cost to hand: "コスト18以上のカードを2枚、手札に加える"
  const searchMinCostMatch = text.match(/コスト([0-9０-９①②③④⑤⑥⑦⑧⑨]+)以上のカードを([0-9０-９①②③④⑤⑥⑦⑧⑨]+)枚[、,]?手札に加える/);
  if (searchMinCostMatch) {
    abilities.push({
      trigger: baseTrigger,
      effect: "searchDeckMinCostToHand",
      minCost: parseDeckmakerKeywordValue(searchMinCostMatch[1]) || 18,
      amount: parseDeckmakerKeywordValue(searchMinCostMatch[2]) || 1,
    });
  }

  // vs-tag attack bonus: "「歩兵」タグを持っているユニットに対し与攻撃時：ATK+①"
  const vsTagAtkMatch = text.match(/「([^」]+)」タグを持っているユニットに対し与攻撃時[：:]ATK\+([①②③④⑤⑥⑦⑧⑨0-9０-９]+)の修正を得る/);
  if (vsTagAtkMatch && localType === "unit") {
    abilities.push({
      effect: "vsTagAtkBonus",
      vsTag: vsTagAtkMatch[1],
      atkBonus: parseDeckmakerKeywordValue(vsTagAtkMatch[2]) || 1,
    });
  }

  // vs-armor attack bonus: "[装甲]効果を持っているユニットに対し与攻撃時：ATK+②"
  const vsArmorAtkMatch = text.match(/\[装甲\]効果を持っているユニットに対し与攻撃時[：:]ATK\+([①②③④⑤⑥⑦⑧⑨0-9０-９]+)の修正を得る/);
  if (vsArmorAtkMatch && localType === "unit") {
    abilities.push({
      effect: "vsArmorAtkBonus",
      atkBonus: parseDeckmakerKeywordValue(vsArmorAtkMatch[1]) || 1,
    });
  }

  // onMill summonSelfFromDumpMobile: "デッキから墓地へ送られた時：…[機動]を得る"
  if (/デッキから墓地へ送られた時[：:].*場に出す/.test(text) && /\[機動\]/.test(text)) {
    const existingMill = abilities.findIndex((a) => a.trigger === "onMill" && a.effect === "summonSelfFromDump");
    if (existingMill >= 0) abilities.splice(existingMill, 1);
    abilities.push({ trigger: "onMill", effect: "summonSelfFromDumpMobile" });
  }

  // ---- New patterns ----

  // onTurnStart: "ターン開始時：このユニットを破壊"
  if (/ターン開始時[：:].*このユニットを破壊/.test(text)) {
    abilities.push({ trigger: "onTurnStart", effect: "destroySelf" });
  }

  // onTurnStart: "ターン開始時：人Xを支払うか、コアにYダメージ" (幾龍)
  const turnStartPayMatch = text.match(/ターン開始時[：:]([人自鉱燃電魔金])([①②③④⑤⑥⑦⑧⑨0-9０-９]+)を支払うか[、,].*?コアに([0-9０-９①②③④⑤⑥⑦⑧⑨]+)ダメージ/);
  if (turnStartPayMatch) {
    const DESC_RES = { 人: "people", 自: "nature", 鉱: "ore", 燃: "fuel", 電: "electric", 魔: "magic", 金: "funds" };
    const resource = DESC_RES[turnStartPayMatch[1]] || "people";
    const amount = parseDeckmakerKeywordValue(turnStartPayMatch[2]) || 1;
    const damage = parseDeckmakerKeywordValue(turnStartPayMatch[3]) || 1;
    abilities.push({ trigger: "onTurnStart", effect: "payResourceOrCoreDamage", resource, amount, damage });
  }

  // onTurnStart: "自ターン開始時：[衝撃]か[警戒]を得る" (編剣)
  if (/[自]?ターン開始時[：:]\[衝撃\]か\[警戒\]を得る/.test(text)) {
    abilities.push({ trigger: "onTurnStart", effect: "gainShockOrAlert" });
  }

  // Reveal top N and pick 1: "デッキの上からN枚を...公開し、1枚を...手札に加える"
  const revealPickMatch = text.match(/デッキの上から([0-9０-９①②③④⑤⑥⑦⑧⑨一二三四五六七八九]+)枚.*公開.*(?:1枚|一枚).*手札に加える/s);
  if (revealPickMatch) {
    const amount = parseDeckmakerKeywordValue(revealPickMatch[1]) || 3;
    const tagFilterMatch = text.match(/\[([^\]]+)\](?:カード)?(?:があれば|のカードを)/);
    const tagFilter = tagFilterMatch ? tagFilterMatch[1] : null;
    abilities.push({ trigger: baseTrigger, effect: "revealTopNPick", amount, tagFilter });
  }

  // Search deck by card type: "デッキからタクトカードを手札に加える" (without quotes, not already matched, not in activation block)
  if (!/デッキから「/.test(text) && !/デッキからコスト総量/.test(text) && !/レストする[：:].*デッキから/.test(text)) {
    const searchTypeMatch = text.match(/デッキから([^「\n(（]+?)カードを手札に加える/);
    if (searchTypeMatch) {
      const typeText = searchTypeMatch[1];
      let cardType = null;
      if (/タクト|指令/.test(typeText)) cardType = "tact";
      else if (/ストラクト|施設/.test(typeText)) cardType = "struct";
      if (cardType) abilities.push({ trigger: baseTrigger, effect: "searchDeckByType", cardType, amount: 1 });
    }
  }

  // Grant keywords to enemy relative row: "自身の第N行の敵ユニット全てに...を付与"
  const grantEnemyRowMatch = text.match(/自身の第([0-9一二三四五六七八九]+)行.*敵ユニット全てに.*を付与/);
  if (grantEnemyRowMatch) {
    const row = parseDeckmakerKeywordValue(grantEnemyRowMatch[1]) || 2;
    const keywords = [];
    if (/\[不動\]/.test(text)) keywords.push("immobile");
    if (/\[不攻\]/.test(text)) keywords.push("noAttack");
    if (/\[衝撃\]/.test(text)) keywords.push("shock");
    if (/\[警戒\]/.test(text)) keywords.push("alert");
    if (keywords.length) abilities.push({ trigger: baseTrigger, effect: "grantKeywordsToEnemyRelativeRow", row, keywords });
  }

  // onTurnEnd: "ターン終了時：アンレスト状態なら破壊"
  if (/ターン終了時[：:].*アンレスト.*(?:破壊|自壊)/.test(text)) {
    abilities.push({ trigger: "onTurnEnd", effect: "destroySelfIfUnrested" });
  }

  // onDamageDealt: "このユニットが敵ユニットへ攻撃でダメージを与えた時...アクトコスト...資源を１得る"
  if (/攻撃.*ダメージを与えた時.*アクトコスト.*資源を.*得る|敵ユニットへ攻撃でダメージを与えた時.*資源.*得る/.test(text)) {
    abilities.push({ trigger: "onDamageDealt", effect: "gainActCostResources" });
  }

  // onFirstDraw (struct): "ターンで始めてカードを引いた時...コスト総量N以下のユニット...フィールドに出す"
  const firstDrawReviveMatch = text.match(/ターンで始めてカードを引いた時.*?コスト総量([0-9０-９①②③④⑤⑥⑦⑧⑨一二三四五六七八九]+)以下のユニットカードを.*フィールドに出す.*?(?:\[([^\]]+)\]を与える)?/s);
  if (firstDrawReviveMatch) {
    const maxCost = parseDeckmakerKeywordValue(firstDrawReviveMatch[1]) || 1;
    const grantTag = firstDrawReviveMatch[2] || "屍人";
    abilities.push({ trigger: "onFirstDraw", effect: "reviveUnitFromDump", maxCost, grantTag });
  }

  const payHpBuffMatch = text.match(/自([①②③④⑤⑥⑦⑧⑨0-9０-９]+)を支払う[：:]HP([①②③④⑤⑥⑦⑧⑨0-9０-９]+)の修正を得る/);
  if (payHpBuffMatch && localType === "unit") {
    abilities.push({
      trigger: "onActivate",
      effect: "gainStatBuff",
      activationCost: { nature: parseDeckmakerKeywordValue(payHpBuffMatch[1]) || 2 },
      atkBuff: 0,
      hpBuff: parseDeckmakerKeywordValue(payHpBuffMatch[2]) || 5,
      noRest: true,
    });
  }

  const payAtkBuffMatch = text.match(/([人自鉱燃電魔金])([①②③④⑤⑥⑦⑧⑨0-9０-９]+)を支払う[：:]ATK\+([①②③④⑤⑥⑦⑧⑨0-9０-９]+)を得る/);
  if (payAtkBuffMatch && localType === "unit") {
    const DESC_RES = { 人: "people", 自: "nature", 鉱: "ore", 燃: "fuel", 電: "electric", 魔: "magic", 金: "funds" };
    abilities.push({
      trigger: "onActivate",
      effect: "buffSelfAtk",
      activationCost: { [DESC_RES[payAtkBuffMatch[1]] || "ore"]: parseDeckmakerKeywordValue(payAtkBuffMatch[2]) || 1 },
      amount: parseDeckmakerKeywordValue(payAtkBuffMatch[3]) || 1,
    });
  }

  // onActivate: "任意の資源①を支払い、このユニットをレストする：...ユニットをレストする"
  if (localType === "unit" && /任意の資源([①②③④⑤⑥⑦⑧⑨0-9]+)を支払い.*レストする/.test(text)) {
    const amountStr = text.match(/任意の資源([①②③④⑤⑥⑦⑧⑨0-9]+)/)?.[1] || "①";
    const amount = parseDeckmakerKeywordValue(amountStr) || 1;
    abilities.push({ trigger: "onActivate", effect: "restTargetNoUnrest", activationCostType: "anyOne", activationCostAmount: amount });
  }

  // struct HP-cost ability: "ライフをN支払う(1ターンに1度)：資源X得る" — uses onStructurePhaseHP (separate from normal rest activation)
  if (localType === "struct") {
    const hpCostMatch = text.match(/ライフを([0-9０-９①②③④⑤⑥⑦⑧⑨]+)支払う.*?[：:]([人自鉱燃電魔金])([①②③④⑤⑥⑦⑧⑨0-9０-９]*)を得る/);
    if (hpCostMatch) {
      const DESC_RES2 = { 人: "people", 自: "nature", 鉱: "ore", 燃: "fuel", 電: "electric", 魔: "magic", 金: "funds" };
      const hpCost = parseDeckmakerKeywordValue(hpCostMatch[1]) || 3;
      const resource = DESC_RES2[hpCostMatch[2]] || "nature";
      const amount = parseDeckmakerKeywordValue(hpCostMatch[3]) || 1;
      abilities.push({ trigger: "onStructurePhaseHP", effect: "produceResourceCostHP", resource, amount, hpCost });
    }
  }

  // onActivate: "X(cost) を支払い、このカードをレストする：effect" (unit cards only)
  if (localType === "unit") {
    const activateMatch = text.match(/(?:([^。\n\r]*?)(?:を支払い|を消費)[、,\s]*)?(?:このカードを|このユニットを)?レストする[：:](.*?)(?=[。]|$)/ms);
    if (activateMatch) {
      const costText = activateMatch[1] || "";
      const effectText = (activateMatch[2] || "").trim();
      const activationCost = parseActivationCostFromText(costText);
      if (/デッキから.*タクトカード/.test(effectText) || /デッキからタクト/.test(effectText)) {
        abilities.push({ trigger: "onActivate", effect: "searchDeckByType", cardType: "tact", amount: 1, activationCost });
      } else if (/クォーツトークン/.test(effectText)) {
        abilities.push({ trigger: "onActivate", effect: "summonToken", tokenId: "quartzToken", activationCost });
      } else if (/デッキからコスト総量/.test(effectText)) {
        const m2 = effectText.match(/コスト総量([0-9０-９①②③④⑤⑥⑦⑧⑨一二三四五六七八九]+)以下(?:の\[([^\]]+)\])?ユニット/);
        if (m2) {
          abilities.push({ trigger: "onActivate", effect: "searchUnitToCostHand", maxCost: parseDeckmakerKeywordValue(m2[1]) || 3, tag: m2[2] || null, amount: 1, activationCost });
        }
      }
    }
  }

  // onActivate (no rest): "X(cost) を支払い、レストせずに：effect" (unit cards only)
  if (localType === "unit") {
    const noRestMatch = text.match(/(?:([^。\n\r]*?)(?:を支払い|を消費)[、,\s]*)?(?:レストせずに|レストしない)[：:](.*?)(?=[。]|$)/ms);
    if (noRestMatch) {
      const costText = noRestMatch[1] || "";
      const effectText = (noRestMatch[2] || "").trim();
      const activationCost = parseActivationCostFromText(costText);
      if (/デッキから.*タクトカード/.test(effectText) || /デッキからタクト/.test(effectText)) {
        abilities.push({ trigger: "onActivate", effect: "searchDeckByType", cardType: "tact", amount: 1, activationCost, noRest: true });
      } else if (/クォーツトークン/.test(effectText)) {
        abilities.push({ trigger: "onActivate", effect: "summonToken", tokenId: "quartzToken", activationCost, noRest: true });
      } else if (/デッキからコスト総量/.test(effectText)) {
        const m2 = effectText.match(/コスト総量([0-9０-９①②③④⑤⑥⑦⑧⑨一二三四五六七八九]+)以下(?:の\[([^\]]+)\])?ユニット/);
        if (m2) {
          abilities.push({ trigger: "onActivate", effect: "searchUnitToCostHand", maxCost: parseDeckmakerKeywordValue(m2[1]) || 3, tag: m2[2] || null, amount: 1, activationCost, noRest: true });
        }
      }
    }
  }

  if (card.id === "card_1755655012242") {
    abilities.length = 0;
    abilities.push({
      trigger: "onStructurePhase",
      effect: "chooseProduceResource",
      options: [
        { id: "magic", label: "\u9b541", cost: {}, produces: { magic: 1 } },
        { id: "ore", label: "\u92712", cost: {}, produces: { ore: 2 } },
        { id: "funds", label: "\u91d12", cost: {}, produces: { funds: 2 } },
      ],
    });
  }

  if (card.id === "card_1753660736818") {
    abilities.push({
      trigger: "onPlay",
      effect: "tactToStructOverStruct",
      requiredStructId: "card_1753661462969",
      requiredStructName: "\u8986\u6ca1\u306e\u8ff7\u5bae",
      maxCost: 3,
      costOptions: [
        { resource: "ore", amount: 2 },
        { resource: "magic", amount: 1 },
      ],
    });
  }

  if (card.id === "card_1753611167885") {
    abilities.push({ trigger: "onAttack", effect: "summonGolemToSameRow", maxCost: 3 });
  }

  // 農業協同組合: 建設時に農民・農場を合計3枚まで場に出す
  if (card.id === "card_1753683067735") {
    abilities.push({
      trigger: "onPlay",
      effect: "deployNamedFromDecks",
      unitName: "農民",
      structName: "農場",
      maxTotal: 3,
    });
  }

  if (card.id === "card_1753611174564") {
    abilities.push({ trigger: "onFriendlyUnitDestroyed", effect: "coreDeathCounter", threshold: 4, resource: "people", amount: 1 });
  }

  if (card.id === "card_1753660083940") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "controlEnemyUnitToSummonRow", target: "enemyUnit" });
  }

  if (card.id === "card_1753659816385") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "searchUnitToCostHand", maxCost: 4, tag: "歩兵", amount: 1 });
  }

  if (card.id === "card_1753661091291") {
    abilities.length = 0;
    abilities.push({
      trigger: "onPlay",
      effect: "chooseGainResource",
      options: [
        { id: "nature", label: "自3", cost: {}, produces: { nature: 3 } },
        { id: "ore", label: "鉱3", cost: {}, produces: { ore: 3 } },
        { id: "fuel", label: "燃3", cost: {}, produces: { fuel: 3 } },
      ],
    });
    abilities.push({ trigger: "onPlay", effect: "opponentDiscard", amount: 1 });
  }

  if (card.id === "card_1753661560335") {
    abilities.length = 0;
    abilities.push({
      trigger: "onPlay",
      effect: "searchDeckPick",
      filters: [
        { cardType: "tact", tag: "\u5100\u5f0f" },
        { cardType: "unit", tag: "\u964d\u81e8" },
      ],
      amount: 1,
    });
  }

  if (card.id === "card_1753660371468") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "buffTagUnitsAtk", tag: "機械", amount: 2 });
    abilities.push({ trigger: "onPlay", effect: "grantIndestructibleToTagUnits", tag: "機械" });
  }

  if (card.id === "card_1753659109009") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "destroyFriendlyUnitDraw", target: "friendlyUnit", amount: 1 });
  }

  if (card.id === "card_1753659571381") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "prohibitOpponentTact" });
  }

  if (card.id === "card_1753683637865") {
    abilities.length = 0;
    abilities.push({ trigger: "onDestroyEnemyUnit", effect: "gainResource", resource: "people", amount: 1 });
  }

  if (card.id === "card_1753664991902") {
    abilities.length = 0;
    abilities.push({ trigger: "onActivate", effect: "buffSelfAtk", activationCost: { nature: 1 }, amount: 1 });
  }

  if (card.id === "card_1753904806388") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "gainResourcePlusPerStructTag", resource: "funds", baseAmount: 2, tag: "鉱山", amountPer: 1 });
  }

  if (card.id === "card_1753904622342") {
    abilities.length = 0;
    abilities.push({
      trigger: "onStructurePhase",
      effect: "chooseExchange",
      costOptions: [{ resource: "people", amount: 1 }],
      produces: { ore: 2 },
    });
  }

  // マイサータ貿易港: 金③を支払う→リソース選択（金がある限り複数回実行可能）
  if (card.id === "card_1782226154092") {
    abilities.length = 0;
    abilities.push({
      trigger: "onStructurePhase",
      effect: "chooseProduceResource",
      multiActivate: true,  // 複数回激活を許可
      options: [
        { id: "people", label: "人③", cost: { funds: 3 }, produces: { people: 3 } },
        { id: "nature", label: "自③", cost: { funds: 3 }, produces: { nature: 3 } },
        { id: "ore", label: "鉱③", cost: { funds: 3 }, produces: { ore: 3 } },
        { id: "fuel", label: "燃③", cost: { funds: 3 }, produces: { fuel: 3 } },
      ],
    });
  }

  if (card.id === "card_1753716897980") {
    abilities.push({ trigger: "onSummon", effect: "buffSelfHpFromTagCount", tag: "農民" });
  }

  if (card.id === "card_1753760240197") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "drawPlusPayResource", resource: "ore", baseDraw: 1, maxPay: 99 });
  }

  if (card.id === "card_1753660887452") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "revealTopNPick", amount: 3 });
  }

  if (card.id === "card_1753659473530") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "revealTopNPick", amount: 3, tagFilter: "\u30c0\u30f3\u30b8\u30e7\u30f3" });
  }

  if (card.id === "card_1753775442028") {
    abilities.push({ trigger: "onSummon", effect: "addCounters", amount: 2 });
    abilities.push({ trigger: "onFriendlyUnitDestroyed", effect: "healSelfAndRemoveCounter", amount: 1 });
  }

  if (card.id === "card_1755612018710") {
    abilities.length = 0;
    abilities.push({ trigger: "onStructurePhase", effect: "produceResource", resource: "magic", amount: 1 });
    abilities.push({ trigger: "onStructurePhaseHP", effect: "produceResourceCostHP", resource: "nature", amount: 1, hpCost: 3 });
  }

  if (card.id === "card_1755654825932") {
    abilities.length = 0;
    abilities.push({ trigger: "onStructurePhase", effect: "produceResource", resource: "magic", amount: 1 });
    abilities.push({ trigger: "onStructurePhaseHP", effect: "produceResourceCostHP", resource: "people", amount: 2, hpCost: 3 });
  }

  if (card.id === "card_1782229916488") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "destroyEnemyStructsOnPlay", amount: 15 });
  }

  if (card.id === "card_1755655390809") {
    abilities.length = 0;
    abilities.push({ trigger: "onStructurePhase", effect: "produceResource", resource: "magic", amount: 1 });
    abilities.push({ trigger: "onStructurePhaseHP", effect: "produceResourceCostHP", resource: "electric", amount: 1, hpCost: 3 });
  }

  if (card.id === "card_1755656642598") {
    abilities.length = 0;
    abilities.push({ trigger: "onStructurePhase", effect: "reviveStructFromDump", fallback: { effect: "produceResource", resource: "magic", amount: 2 } });
  }

  if (card.id === "card_1755648239499") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "grantKeywordsToAllMagicMachines", keywords: [{ id: "shock" }, { id: "pierce", value: 2 }] });
  }

  if (card.id === "card_1753662513755") {
    abilities.length = 0;
    abilities.push({
      trigger: "onPlay",
      effect: "summonNamedFromHand",
      cardId: "card_1753662603276",
      cardName: "再生の真なる神",
      lifeCounterFromPeople: true,
      maxLifeCounters: 5,
    });
  }

  if (card.id === "card_1753662124367") {
    abilities.push({ trigger: "onPlay", effect: "millCards", amount: 3 });
    abilities.push({ trigger: "onPlay", effect: "reviveTagUnitsUpToCost", tag: "屍人", maxTotalCost: 4 });
  }

  if (card.id === "card_1755906183709") {
    abilities.push({ trigger: "onAttack", effect: "damageAllEnemiesAndPushBack", amount: 3 });
  }

  if (card.id === "card_1755925813924") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "grantKeywordsToEnemyRelativeRow", row: 2, keywords: ["immobile", "noAttack"] });
  }

  if (card.id === "card_1755670731207") {
    abilities.push({ trigger: "onSummon", effect: "damageRestedTarget", target: "anyUnit", amount: 2 });
    abilities.push({ trigger: "onTurnStart", effect: "destroySelf" });
  }

  if (card.id === "card_1762416434855") {
    abilities.push({ trigger: "onTurnStart", effect: "gainShockOrAlert" });
  }

  if (card.id === "card_1766737979616") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "exileTargetNonNeutralNonUnifall", target: "enemyUnit" });
  }

  if (card.id === "card_1753660200559") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "grantTactPeopleDiscount", amount: 2 });
  }

  if (card.id === "card_1753680748888") {
    abilities.length = 0;
  }

  if (card.id === "card_1753664708023") {
    for (let i = abilities.length - 1; i >= 0; i--) {
      if (abilities[i].trigger === "onStructurePhase") abilities.splice(i, 1);
    }
    abilities.push({ trigger: "onActivate", effect: "goldGolemStrike", target: "enemyUnit", activationCost: { funds: 4, magic: 1 } });
  }

  if (card.id === "card_1753664097092") {
    abilities.push({ trigger: "onSummon", effect: "grantMobileIfAnyTag", tag: "\u5c4d\u4eba" });
  }

  // \u7b2c\u4e8c\u5893\u6a19: \u6bce\u30bf\u30fc\u30f3\u6700\u521d\u306e\u30c9\u30ed\u30fc\u6642\u306b\u30b3\u30b9\u30c81\u4ee5\u4e0b\u306e\u30e6\u30cb\u30c3\u30c8\u3092\u8607\u751f\u3057\u5c4d\u4eba\u30bf\u30b0\u4ed8\u4e0e
  if (card.id === "card_1753681080997") {
    abilities.length = 0;
    abilities.push({ trigger: "onFirstDraw", effect: "reviveUnitFromDump", maxCost: 1, grantTag: "\u5c4d\u4eba" });
  }

  if (card.id === "card_1753775442028") {
    abilities.push({ trigger: "onSummon", effect: "grantConditionalKeywordsByCounter", keywords: [{ id: "immobile" }, { id: "noAttack" }] });
    abilities.push({ trigger: "onTurnStart", effect: "grantConditionalKeywordsByCounter", keywords: [{ id: "immobile" }, { id: "noAttack" }] });
  }

  if (card.id === "card_1753970684315") {
    abilities.push({ trigger: "onSummon", effect: "payDestroyUpToEnemyCards", cost: { fuel: 1, magic: 3 }, amount: 3 });
  }

  if (card.id === "card_1755657552300") {
    abilities.length = 0;
    abilities.push({ trigger: "onStructurePhase", effect: "produceResource", resource: "magic", amount: 1 });
    abilities.push({ trigger: "onPlay", effect: "registerDumpLifeGain" });
  }

  if (card.id === "card_1755701443493") {
    abilities.length = 0;
    abilities.push({ trigger: "onSummon", effect: "enterRestedLocked", turns: 999 });
    abilities.push({ trigger: "onDestroyEnemyUnit", effect: "unrestSelf" });
    abilities.push({ trigger: "onActivate", effect: "summonTagFromDumpAndRest", tag: "\u602a\u7570" });
  }

  if (card.id === "card_1755671140352") {
    abilities.push({ trigger: "onSummon", effect: "summonHandUnitToOpponent" });
  }

  if (card.id === "card_1755671320457") {
    abilities.push({ trigger: "onActivate", effect: "kaijuAwaken", activationCost: {} });
    abilities.push({ trigger: "onDestroy", effect: "damageOwnCore", amount: 5 });
  }

  if (card.id === "card_1757041693503") {
    abilities.push({ trigger: "onDamageReceived", effect: "redirectDamageToOther" });
  }

  if (card.id === "card_1761808048476") {
    abilities.length = 0;
    abilities.push({ trigger: "onTurnStart", effect: "payResourceOrCoreDamage", resource: "people", amount: 7, damage: 7 });
  }

  if (card.id === "card_1782330000000") {
    abilities.length = 0;
    abilities.push({ trigger: "onAttack", effect: "payGoldAndDeployHero", cond: { tag: "勇者" } });
  }

  if (card.id === "card_1782180616372") {
    abilities.length = 0;
    abilities.push({ trigger: "onFriendlyUnitDestroyed", effect: "addCounterIfTagDestroyed", cond: { tag: "純人間" }, amount: 1 });
    abilities.push({ trigger: "onActivate", effect: "spendCountersForBuff", costCounters: 5, atkBuff: 5, hpBuff: 5, noRest: true });
    abilities.push({ effect: "selfCounterDeathShield", cost: 2 });
  }

  if (card.id === "card_1782182910548") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "discardForDraw", cond: { tag: "純人間" } });
    abilities.push({ trigger: "onPlay", effect: "grantCounterArmor", armorValue: 2 });
  }
  if (card.id === "card_1782192967652") {
    abilities.length = 0;
    abilities.push({ trigger: "onAttack", effect: "addCounterOnFirstAttack", amount: 1 });
    // 隣接2体[純人間]で+2/±0は refreshContinuousEffects で処理
  }

  if (card.id === "card_1782152241822") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "bigConstructionPlanPlay" });
    // レスト：金3鉱5燃2 / 5回後TACTゾーンから破壊 / 破壊時コスト総量18以上を手札
  }

  if (card.id === "card_1782239599000") {
    abilities.length = 0;
    abilities.push({ trigger: "onDamageReceived", effect: "revealTopNPick", amount: 5, tagFilter: "王国勇者主義", shuffleToBottom: true });
    // [衝撃]は keywords から自動付与
  }

  if (card.id === "card_1782450000000") {
    abilities.length = 0;
    abilities.push({ trigger: "onStructurePhaseStart", effect: "coreStructStartDiscardOrHP", gainOnDiscard: { funds: 1, people: 2 }, gainOnDecline: { magic: 1 }, hpCostOnDecline: 2 });
  }

  if (card.id === "card_1782500000000") {
    abilities.length = 0;
    abilities.push({ trigger: "onActivate", effect: "gainStatBuff", activationCost: { nature: 1, fuel: 1 }, atkBuff: 2, hpBuff: 0 });
  }

  if (card.id === "card_1782520000000") {
    abilities.push({ trigger: "onFriendlyUnitDestroyed", effect: "defeatIfNamedUnitDestroyed", targetName: "北東軍最高司令官" });
  }

  if (card.id === "card_1782600000000") {
    abilities.length = 0;
    abilities.push({ trigger: "onPlay", effect: "warTimeBondPlay" });
  }

  if (card.id === "card_1782610000000") {
    abilities.length = 0;
    abilities.push({ trigger: "onDestroyEnemyUnit", effect: "addCoreTermCounter", amount: 1 });
    abilities.push({ trigger: "onDestroyEnemyUnit", effect: "gainResource", resource: "funds", amount: 1 });
  }

  if (card.id === "card_1782315551233" && !abilities.some((a) => a.effect === "drawCards")) {
    abilities.push({ trigger: "onSummon", effect: "drawCards", amount: 2 });
  }

  if (Array.isArray(card.abilities)) {
    for (const imported of card.abilities) {
      if (!imported?.effect || !imported?.trigger) continue;
      const duplicate = abilities.some(
        (a) => a.trigger === imported.trigger && a.effect === imported.effect,
      );
      if (!duplicate) abilities.push({ ...imported });
    }
  }

  return abilities;
}

function fromDeckmakerCard(card) {
  if (!card?.id || !card?.name) return null;
  const localType = deckmakerTypeToLocal(card);
  const base = {
    id: String(card.id),
    type: localType,
    name: String(card.name),
    faction: card.world || "ニュートラル",
    tags: Array.isArray(card.tags) ? card.tags.filter(Boolean) : [],
    cost: fromDeckmakerCosts(card.costs?.play || card.cost || {}),
    actCost: fromDeckmakerCosts(card.costs?.act || card.actCost || {}),
    text: card.description || "",
    flavor: card.flavorText || card.flavor || card.description || "—",
    imageUrl: typeof card.imageUrl === "string" && !card.imageUrl.startsWith("data:") ? card.imageUrl : (card.id ? `assets/cards/${card.id}.png` : ""),
    keywords: parseDeckmakerKeywords(card),
    abilities: parseDeckmakerAbilities(card, localType),
  };
  if (localType === "unit") {
    base.atk = Number(card.attack) || 0;
    base.hp = Number(card.defense) || 1;
    if (/\[降臨\]/.test(base.text || "") || card.id === "card_1753662603276") {
      base.summonOnlyViaTact = true;
    }
    if (card.id === "card_1753611167885") {
      base.requiredStructId = "card_1753660736818";
      base.requiredStructName = "\u8986\u6ca1\u306e\u5927\u66b4\u8d70";
    }
    if (card.id === "card_1753905404273") base.requiredSacrificeName = "炎使いの剣士";
    if (card.id === "card_1753968998785") base.requiredSacrificeName = "炎使いの騎士";
    if (card.id === "card_1753970684315") base.requiredSacrificeName = "炎の英傑";
    if (card.id === "card_1761808048476") ensureKeyword(base, "oneDamage");
    if (card.id === "card_1753664097092") removeKeywords(base, ["mobile"]);
  }
  if (localType === "core") {
    base.hp = Number(card.defense || card.hp) || 20;
    base.initialHand = Number(card.initialHand) || 4;
    base.draw = Number(card.draw ?? card.drawCount ?? card.drawPerTurn) || 1;
    base.handLimit = Number(card.handLimit ?? card.maxHandSize ?? card.handMax) || 7;
    base.deckSize = card.deckSize || "40\u301c60";
    base.deckMin = Number(card.deckMin) || 40;
    base.deckMax = Number(card.deckMax) || 60;
    base.startResources = fromDeckmakerCosts(card.startResources || card.initialResources || {});
    base.income = fromDeckmakerCosts(card.income || card.generates || {});
    base.specialRequirements = Array.isArray(card.specialRequirements) ? card.specialRequirements : [];
    base.armor = Number(card.armor) || 0;
    if (card.id === "card_1782287759412") {
      const dtoTags = ["アトラス北東軍", "グラダナ連邦共和国", "ルディワ公国"];
      base.passiveBuffTags = dtoTags;
      base.passiveBuffAtk = 1;
      base.deckRestriction = { tags: dtoTags, maxPlayCost: 5, minCount: 20 };
      base.defeatCondition = card.defeatCondition || "このカードが破壊される。";
      base.specialRequirements = [
        "[アトラス北東軍][グラダナ連邦共和国][ルディワ公国]タグ・プレイコスト5以下のカードを20枚以上",
      ];
    }
    if (card.id === "card_1782520000000") {
      base.requiredDeckCardIds = ["card_1782225519182"];
      if (!base.specialRequirements?.length) {
        base.specialRequirements = [
          "「北東軍最高司令官」ユニットがデッキに含まれていない場合、このカードは使用できない。",
        ];
      }
    }
  }
  return applyCardCompatibility(normalizeCardResources(base));
}

function importDeckmakerAllData(payload) {
  const isDeck = payload?.mainDeckCardIds != null || payload?.structDeckCardIds != null || payload?.coreCardId != null;
  const cards = isDeck ? [] : Array.isArray(payload?.cards) ? payload.cards : payload?.id && payload?.name ? [payload] : [];
  if (!cards.length) return importDeckmakerDeckData(payload);

  const groups = persistedCustomCardGroups();
  let importedCards = 0;
  for (const deckmakerCard of cards) {
    const card = fromDeckmakerCard(deckmakerCard);
    if (!card) continue;
    const group = catalogGroupForCard(card);
    // For FORCE_BUNDLED cards, always use the bundled imageUrl.
    // Deckmaker exports base64 imageUrls which fromDeckmakerCard strips to a wrong fallback path.
    if (FORCE_BUNDLED_CARD_IDS.has(card.id)) {
      const bundled = cardCatalog[group][card.id];
      if (bundled?.imageUrl) card.imageUrl = bundled.imageUrl;
    }
    groups[group][card.id] = card;
    cardCatalog[group][card.id] = card;
    importedCards += 1;
  }
  persistCustomCards(groups);

  let importedDecks = 0;
  const mergedMissing = { core: [], main: [], struct: [] };
  const nameIndex = buildDeckmakerNameIndex(payload);
  const importedSavedDecks = [];
  for (const deck of Array.isArray(payload?.decks) ? payload.decks : []) {
    const result = convertDeckmakerDeck(deck, nameIndex);
    if (!result.ok || !result.deck) continue;
    importedDecks += 1;
    if (result.missing) {
      mergedMissing.core.push(...result.missing.core);
      mergedMissing.main.push(...result.missing.main);
      mergedMissing.struct.push(...result.missing.struct);
    }
    importedSavedDecks.push({
      id: `deckmaker-${Date.now().toString(36)}-${importedDecks}`,
      name: result.name,
      deck: result.deck,
      updatedAt: new Date().toISOString(),
    });
  }
  if (importedSavedDecks.length) {
    app.savedDecks = [...importedSavedDecks, ...app.savedDecks.filter((entry) => !importedSavedDecks.some((deck) => deck.name === entry.name))].slice(0, 8);
    app.deck = importedSavedDecks[0].deck;
    app.deckName = importedSavedDecks[0].name;
    localStorage.setItem(SAVED_DECK_KEY, JSON.stringify(currentDeckPayload()));
    persistSavedDeckLibrary();
  }
  app.deckBuilder.deckScroll = 0;
  app.deckBuilder.selectedCardId = null;
  setDeckBuilderImportMessage(`Deckmaker全データ読込: カード${importedCards}枚 / デッキ${importedDecks}個`, mergedMissing);
  return true;
}

function createAppState() {
  const savedDeck = loadSavedDeck();
  const savedDecks = loadSavedDeckLibrary();
  return {
    screen: "login",
    auth: { provider: null, signedIn: false, name: "未ログイン", email: null },
    deckName: savedDecks[0]?.name || "未保存デッキ",
    savedDecks,
    deck: {
      core: savedDeck?.core || DEFAULT_CORE_ID,
      main: savedDeck?.main || [...DEFAULT_MAIN_DECK_IDS],
      struct: savedDeck?.struct || [...DEFAULT_STRUCT_DECK_IDS],
    },
    deckBuilder: {
      selectedCardId: null,
      libraryType: "all",
      libraryScroll: 0,
      deckScroll: 0,
      searchPreset: "all",
      searchText: "",
      searchFocused: false,
      tagFilter: "all",
      tagScroll: 0,
      sortBy: "name",
      testDraw: [],
      detailOpen: false,
      coreDropdownOpen: false,
      message: "カードを選んでデッキを調整できます。",
      missingCardsLines: [],
    },
    match: {
      status: "offline",
      mode: "未開始",
      roomCode: "",
      role: "host",
      connection: "offline",
      message: "オンライン対戦は未接続です。",
      players: [],
      selectedDeckId: null,
    },
    dismissedCardRevealIds: [],
    localCardPopup: null,
    lastFieldClick: null,
    structDeckScroll: 0,
    cardSync: { status: "idle", count: 0, error: null, updatedAt: null },
  };
}

function loadSavedDeck() {
  try {
    const raw = localStorage.getItem(SAVED_DECK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeDeckData(parsed);
  } catch {
    return null;
  }
}

function normalizeDeckData(deck) {
  if (!deck || !Array.isArray(deck.main) || !Array.isArray(deck.struct)) return null;
  return {
    core: cardCatalog.cores[deck.core] ? deck.core : DEFAULT_CORE_ID,
    main: deck.main.filter((id) => cardCatalog.main[id] && !cardCatalog.main[id].fixture),
    struct: deck.struct.filter((id) => cardCatalog.structs[id]),
  };
}

function deckmakerCardRef(value) {
  if (value == null) return "";
  const raw = typeof value === "string" ? value : value?.id || value?.cardId || value?.name;
  return raw ? String(raw).trim() : "";
}

function buildDeckmakerNameIndex(payload) {
  const byId = new Map();
  const register = (card) => {
    if (!card?.id || !card?.name) return;
    byId.set(String(card.id).trim(), String(card.name).trim());
  };
  if (Array.isArray(payload?.cards)) payload.cards.forEach(register);
  if (payload?.id && payload?.name) register(payload);
  return byId;
}

function looksLikeDeckmakerCardId(ref) {
  return /^card_[0-9]+$/i.test(ref) || /^[a-z][a-zA-Z0-9_]*$/i.test(ref);
}

function deckmakerMissingDisplayName(item, ref, nameIndex) {
  if (typeof item === "object" && item != null && item.name) {
    return String(item.name).trim();
  }
  const indexed = nameIndex?.get(ref);
  if (indexed) return indexed;
  if (ref && !looksLikeDeckmakerCardId(ref)) return ref;
  return "（名前不明）";
}

function resolveDeckmakerDeckSection(sources, type, nameIndex) {
  const ids = [];
  const missing = [];
  if (!Array.isArray(sources)) return { ids, missing };
  const lookup = deckmakerCardLookup(type);
  for (const item of sources) {
    const ref = deckmakerCardRef(item);
    if (!ref) continue;
    const id = lookup.byId.get(ref) || lookup.byName.get(ref);
    if (id) ids.push(id);
    else missing.push(deckmakerMissingDisplayName(item, ref, nameIndex));
  }
  return { ids, missing };
}

function summarizeMissingDeckmakerRefs(refs) {
  const counts = new Map();
  for (const ref of refs || []) {
    counts.set(ref, (counts.get(ref) || 0) + 1);
  }
  return [...counts.entries()].map(([ref, count]) => (count > 1 ? `${ref}×${count}` : ref));
}

function formatMissingDeckmakerRefList(refs, maxKinds = 6) {
  const items = summarizeMissingDeckmakerRefs(refs);
  if (!items.length) return "";
  if (items.length <= maxKinds) return items.join("、");
  return `${items.slice(0, maxKinds).join("、")} 他${items.length - maxKinds}種`;
}

function buildDeckmakerMissingLines(missing) {
  const sections = [
    ["コア", missing?.core],
    ["メイン", missing?.main],
    ["施設", missing?.struct],
  ];
  const totalMissing = sections.reduce((sum, [, refs]) => sum + (refs?.length || 0), 0);
  if (!totalMissing) return [];
  const lines = [`未登録 ${totalMissing}枚（カタログに無いため除外）`];
  for (const [label, refs] of sections) {
    if (!refs?.length) continue;
    lines.push(`${label}: ${formatMissingDeckmakerRefList(refs)}`);
  }
  return lines.slice(0, 4);
}

function setDeckBuilderImportMessage(message, missing) {
  app.deckBuilder.message = message;
  app.deckBuilder.missingCardsLines = buildDeckmakerMissingLines(missing);
  if (app.deckBuilder.missingCardsLines.length) {
    console.warn("[Deckmaker] missing cards on import:", missing);
  }
}

function getDeckListCoreDropdownLayout() {
  const x = 84;
  const panelY = 216;
  const missingLines = app.deckBuilder.missingCardsLines || [];
  const missingBlockH = missingLines.length ? 12 + missingLines.length * 15 : 0;
  const coreLabelY = panelY + 48 + 20 + missingBlockH;
  const ddX = x;
  const ddY = coreLabelY + 6;
  const ddW = 430;
  const ddH = 32;
  const listHeaderY = ddY + 54;
  const listStartY = listHeaderY + 20;
  return { x, panelY, missingLines, coreLabelY, ddX, ddY, ddW, ddH, listHeaderY, listStartY };
}

function deckmakerCardLookup(type) {
  const catalog = type === "struct" ? cardCatalog.structs : type === "core" ? cardCatalog.cores : cardCatalog.main;
  const byId = new Map();
  const byName = new Map();
  for (const [id, card] of Object.entries(catalog)) {
    if (card.fixture) continue;
    byId.set(id, id);
    byName.set(String(card.name || "").trim(), id);
  }
  return { byId, byName };
}

function resolveDeckmakerCardId(value, type) {
  const raw = typeof value === "string" ? value : value?.id || value?.cardId || value?.name;
  if (!raw) return null;
  const key = String(raw).trim();
  const lookup = deckmakerCardLookup(type);
  return lookup.byId.get(key) || lookup.byName.get(key) || null;
}

function extractDeckmakerDeck(payload) {
  if (!payload) return null;
  if (payload.deckData) return extractDeckmakerDeck(payload.deckData);
  if (Array.isArray(payload.decks)) return payload.decks[0] || null;
  if (payload.currentDeck) return payload.currentDeck;
  if (payload.coreCardId || payload.mainDeckCardIds || payload.structDeckCardIds) return payload;
  if (payload.deck) return extractDeckmakerDeck(payload.deck);
  return null;
}

function convertDeckmakerDeck(payload, nameIndex = null) {
  const deck = extractDeckmakerDeck(payload);
  if (!deck) return { ok: false, message: "DeckmakerのデッキJSONを見つけられませんでした。" };

  const names = nameIndex || buildDeckmakerNameIndex(payload);
  const coreSource = deck.coreCardId || deck.core || deck.coreId;
  const mainSource = deck.mainDeckCardIds || deck.main || deck.mainDeck || [];
  const structSource = deck.structDeckCardIds || deck.struct || deck.structDeck || [];
  const mainResult = resolveDeckmakerDeckSection(mainSource, "main", names);
  const structResult = resolveDeckmakerDeckSection(structSource, "struct", names);
  const coreRef = deckmakerCardRef(coreSource);
  const coreLookup = deckmakerCardLookup("core");
  const coreId = coreRef ? (coreLookup.byId.get(coreRef) || coreLookup.byName.get(coreRef)) : null;
  const core = coreId || DEFAULT_CORE_ID;
  const missing = {
    core: coreRef && !coreId ? [deckmakerMissingDisplayName(coreSource, coreRef, names)] : [],
    main: mainResult.missing,
    struct: structResult.missing,
  };
  return {
    ok: true,
    name: deck.name || deck.deckName || "Deckmaker読込デッキ",
    deck: normalizeDeckData({ core, main: mainResult.ids, struct: structResult.ids }),
    missing,
    missingMain: missing.main.length,
    missingStruct: missing.struct.length,
  };
}

function importDeckmakerDeckData(payload) {
  const result = convertDeckmakerDeck(payload);
  if (!result.ok || !result.deck) {
    app.deckBuilder.message = result.message || "Deckmakerデッキを読み込めませんでした。";
    return false;
  }
  app.deck = result.deck;
  app.deckName = result.name;
  app.deckBuilder.deckScroll = 0;
  app.deckBuilder.selectedCardId = null;

  const newEntry = {
    id: `deckmaker-${Date.now().toString(36)}`,
    name: result.name,
    deck: result.deck,
    updatedAt: new Date().toISOString(),
  };
  app.savedDecks = [newEntry, ...app.savedDecks.filter((d) => d.name !== result.name)].slice(0, 8);
  persistSavedDeckLibrary();

  setDeckBuilderImportMessage(
    `Deckmakerから "${app.deckName}" を読込・保存: メイン${app.deck.main.length}枚 / 施設${app.deck.struct.length}枚`,
    result.missing
  );
  localStorage.setItem(SAVED_DECK_KEY, JSON.stringify(currentDeckPayload()));
  return true;
}

function importDeckmakerDeckFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || ""));
        importDeckmakerAllData(payload);
      } catch (e) {
        console.error("Deckmaker import error:", e);
        app.deckBuilder.message = `読込エラー: ${e.message || "JSONの解析に失敗しました。"}`;
      }
      render();
    };
    reader.readAsText(file, "utf-8");
  };
  input.click();
}

function safeDeckmakerId(card) {
  return String(card.id || card.name || "card")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

function toDeckmakerCosts(cost = {}) {
  const mapped = {};
  const unsupported = [];
  for (const [key, amount] of Object.entries(cost || {})) {
    if (!amount) continue;
    const deckmakerKey = DECKMAKER_RESOURCE_KEYS[key];
    if (deckmakerKey) mapped[deckmakerKey] = (mapped[deckmakerKey] || 0) + amount;
    else unsupported.push(`${RESOURCE_LABELS[key] || key}${amount}`);
  }
  return { mapped, unsupported };
}

function toDeckmakerCard(card) {
  const play = toDeckmakerCosts(card.cost || {});
  const act = toDeckmakerCosts(card.actCost || {});
  const keywordText = keywordLabels(card).join(" / ");
  const ability = abilityText(card);
  const notes = [];
  if (card.type === "wild") notes.push("元種別: Wild");
  if (play.unsupported.length) notes.push(`未対応プレイコスト: ${play.unsupported.join(" ")}`);
  if (act.unsupported.length) notes.push(`未対応アクトコスト: ${act.unsupported.join(" ")}`);
  if (keywordText) notes.push(`キーワード: ${keywordText}`);
  if (ability) notes.push(`処理: ${ability}`);
  const description = [card.text || "", ...notes].filter(Boolean).join("\n");
  return {
    id: safeDeckmakerId(card),
    name: card.name,
    type: DECKMAKER_TYPE_LABELS[card.type] || "タクト",
    rarity: hasKeyword(card, "legendary") ? "伝説" : "通常",
    world: card.faction || "ニュートラル",
    tags: tagLabels(card),
    roles: [],
    costs: {
      play: play.mapped,
      act: act.mapped,
      choice: [],
      choiceAct: [],
    },
    attack: card.type === "unit" ? card.atk || 0 : 0,
    defense: card.type === "unit" ? card.hp || card.maxHp || 0 : 0,
    description,
    flavorText: card.flavor || "",
    imageUrl: cardImageSource(card) || "",
  };
}

function currentDeckToDeckmaker() {
  return {
    id: `twcg-${Date.now().toString(36)}`,
    name: app.deckName || "TWCG Export Deck",
    description: "Threads World Card Game からDeckmaker形式で出力",
    worlds: [],
    coreCardId: safeDeckmakerId(cardCatalog.cores[app.deck.core] || { id: app.deck.core }),
    mainDeckCardIds: app.deck.main.map((id) => safeDeckmakerId(cardCatalog.main[id] || { id })),
    structDeckCardIds: app.deck.struct.map((id) => safeDeckmakerId(cardCatalog.structs[id] || { id })),
  };
}

function deckmakerAllDataPayload() {
  const cards = [
    ...Object.values(cardCatalog.cores),
    ...Object.values(cardCatalog.main).filter((card) => !card.fixture),
    ...Object.values(cardCatalog.structs),
  ].map(toDeckmakerCard);
  const worlds = [...new Set(cards.map((card) => card.world || "ニュートラル"))].map((name) => ({ id: safeDeckmakerId({ id: name }), name, description: "" }));
  return { cards, decks: [currentDeckToDeckmaker()], worlds };
}

function downloadJsonFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadTextFile(text, filename) {
  const blob = new Blob([String(text || "")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportIncompleteCardData() {
  refreshCatalogCompatibility(cardCatalog);
  const payload = buildIncompleteCardDataPayload(cardCatalog);
  if (!payload.count) {
    app.deckBuilder.message = "不足データのあるカードはありません。";
    render();
    return;
  }
  const stamp = payload.exportedAt.slice(0, 10);
  downloadTextFile(payload.textReport, `twcg_incomplete_cards_${stamp}.txt`);
  setTimeout(() => {
    const { textReport, ...jsonPayload } = payload;
    downloadJsonFile(jsonPayload, `twcg_incomplete_cards_${stamp}.json`);
  }, 300);
  app.deckBuilder.message = `不足データ ${payload.count}枚のテキストとJSONをダウンロードしました。`;
  render();
}

function exportDeckmakerAllData() {
  const payload = deckmakerAllDataPayload();
  downloadJsonFile(payload, "twcg_deckmaker_data.json");
  app.deckBuilder.message = `Deckmaker用JSONを出力しました。カード${payload.cards.length}枚 / デッキ${payload.decks.length}個`;
}

function exportNoImageCustomCards() {
  const groups = persistedCustomCardGroups();
  const allCustom = [
    ...Object.values(groups.cores),
    ...Object.values(groups.main),
    ...Object.values(groups.structs),
  ];
  const noImage = allCustom.filter((c) => !c.imageUrl && !c.image);
  if (!noImage.length) {
    app.deckBuilder.message = "画像なしのカスタムカードはありません。";
    render();
    return;
  }
  noImage.forEach((card, i) => {
    setTimeout(() => {
      const dm = toDeckmakerCard(card);
      downloadJsonFile(dm, `${dm.id || safeDeckmakerId(card)}.json`);
    }, i * 400);
  });
  app.deckBuilder.message = `画像なしカード ${noImage.length} 枚をダウンロード中...`;
  render();
}

function currentDeckPayload() {
  return {
    core: app.deck.core,
    main: [...app.deck.main],
    struct: [...app.deck.struct],
  };
}

function loadSavedDeckLibrary() {
  try {
    const raw = localStorage.getItem(SAVED_DECK_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({ ...entry, deck: normalizeDeckData(entry.deck) }))
      .filter((entry) => entry.id && entry.name && entry.deck)
      .slice(0, 8);
  } catch {
    return [];
  }
}

function persistSavedDeckLibrary() {
  localStorage.setItem(SAVED_DECK_LIBRARY_KEY, JSON.stringify(app.savedDecks));
}

function deckServerUserKey() {
  if (!app.auth?.signedIn) return "";
  if (app.auth.sub) return `google:${app.auth.sub}`;
  if (app.auth.email) return `email:${app.auth.email}`;
  return `${app.auth.provider || "guest"}:${app.auth.name || "guest"}`;
}

async function syncDecksFromServer() {
  const userKey = deckServerUserKey();
  if (!userKey) return false;
  try {
    const response = await fetch(`${SERVER_BASE}/api/decks?user=${encodeURIComponent(userKey)}`);
    if (!response.ok) return false;
    const payload = await response.json();
    const decks = (payload.decks || []).map((entry) => ({ ...entry, deck: normalizeDeckData(entry.deck) })).filter((entry) => entry.deck);
    if (decks.length) {
      app.savedDecks = decks;
      persistSavedDeckLibrary();
      app.deckBuilder.message = "サーバー保存デッキを読み込みました。";
    }
    return true;
  } catch {
    return false;
  }
}

async function persistDecksToServer() {
  const userKey = deckServerUserKey();
  if (!userKey) return false;
  try {
    const response = await fetch(`${SERVER_BASE}/api/decks?user=${encodeURIComponent(userKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decks: app.savedDecks }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function saveDeck(name) {
  const deckName = typeof name === "string" ? name.trim() : prompt("デッキ名", app.deckName || "新規デッキ")?.trim();
  if (!deckName) {
    app.deckBuilder.message = "デッキ保存をキャンセルしました。";
    return false;
  }
  app.deckName = deckName;
  const payload = currentDeckPayload();
  localStorage.setItem(SAVED_DECK_KEY, JSON.stringify(payload));
  const existing = app.savedDecks.find((entry) => entry.name === deckName);
  if (existing) {
    existing.deck = payload;
    existing.updatedAt = new Date().toISOString();
    app.match.selectedDeckId = existing.id;
  } else {
    const entry = {
      id: `deck-${Date.now().toString(36)}`,
      name: deckName,
      deck: payload,
      updatedAt: new Date().toISOString(),
    };
    app.savedDecks.unshift(entry);
    app.match.selectedDeckId = entry.id;
    app.savedDecks = app.savedDecks.slice(0, 8);
  }
  persistSavedDeckLibrary();
  app.deckBuilder.message = `${deckName} を保存しました。`;
  persistDecksToServer().then((ok) => {
    app.deckBuilder.message = ok ? `${deckName} をサーバーにも保存しました。` : `${deckName} をブラウザに保存しました。サーバー保存は未同期です。`;
    render();
  });
  return true;
}

function loadNamedDeck(deckId) {
  const entry = app.savedDecks.find((item) => item.id === deckId);
  if (!entry) return false;
  const deck = normalizeDeckData(entry.deck);
  if (!deck) return false;
  app.deck = deck;
  app.deckName = entry.name;
  localStorage.setItem(SAVED_DECK_KEY, JSON.stringify(deck));
  app.deckBuilder.deckScroll = 0;
  app.deckBuilder.message = `${entry.name} を読み込みました。`;
  return true;
}

function selectMatchDeck(deckId) {
  const loaded = loadNamedDeck(deckId);
  if (!loaded) {
    app.match.message = "保存済みデッキを読み込めませんでした。";
    return false;
  }
  app.match.selectedDeckId = deckId;
  app.match.message = `${app.deckName} を使用デッキに選択しました。`;
  return true;
}

async function loadServerConfig() {
  if (!SERVER_BASE && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    // GitHub Pages などの外部ホストで ?ws= なし → サーバー不明、Google ログイン無効
    googleSignInEnabled = false;
    return;
  }
  try {
    const response = await fetch(`${SERVER_BASE}/config`);
    if (!response.ok) return;
    const config = await response.json();
    googleClientId = config.googleClientId || "";
    googleSignInEnabled = Boolean(config.googleSignInEnabled);
    render();
  } catch {
    googleSignInEnabled = false;
  }
}

let googleInitialized = false;
let googleScriptLoading = null;
function loadGoogleClientScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptLoading) return googleScriptLoading;
  googleScriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in script failed to load."));
    document.head.appendChild(script);
  });
  return googleScriptLoading;
}
async function signInWithGoogle() {
  if (googleSignInEnabled && googleClientId) {
    try {
      console.log("Starting Google Sign-In...");
      await loadGoogleClientScript();
      console.log("Google script loaded, window.google:", !!window.google);
      if (!window.google?.accounts?.id) throw new Error("Google client unavailable.");
      if (!googleInitialized) {
        console.log("Initializing Google with client_id:", googleClientId);
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCredential,
        });
        googleInitialized = true;
      }
      console.log("Trying Google One Tap prompt...");
      let promptShown = false;
      window.google.accounts.id.prompt((notification) => {
        const status = {
          isNotDisplayed: notification.isNotDisplayed(),
          isSkippedMoment: notification.isSkippedMoment(),
          isDismissedMoment: notification.isDismissedMoment(),
          isDisplayMoment: notification.isDisplayMoment(),
        };
        console.log("Google prompt notification:", status);

        // 実際に表示されたかどうかを判定
        const actuallyDisplayed = !status.isNotDisplayed && status.isDisplayMoment;
        if (actuallyDisplayed) {
          promptShown = true;
          console.log("✓ One Tap displayed successfully");
        } else {
          console.warn("✗ One Tap not displayed:", {
            reason: status.isNotDisplayed ? "isNotDisplayed" : "other",
            willShowButton: true,
          });
        }
      });

      // One Tap表示状態を確認してから、ボタン表示に切り替え
      setTimeout(() => {
        if (!promptShown) {
          console.log("Falling back to Google Sign-In button (showing in 500ms)");
          showGoogleSignInButton();
        }
      }, 500);
      return;
    } catch (error) {
      console.error("Google Sign-In error:", error);
      app.auth = {
        provider: null,
        signedIn: false,
        name: "未ログイン",
        email: null,
        message: `Googleログイン準備に失敗しました: ${error.message}`,
      };
      render();
      return;
    }
  }
  console.warn("Google Sign-In not enabled. googleSignInEnabled:", googleSignInEnabled, "googleClientId:", !!googleClientId);
  app.auth = {
    provider: null,
    signedIn: false,
    name: "未ログイン",
    email: null,
    message: "Googleログインにはサーバー環境変数 GOOGLE_CLIENT_ID の設定が必要です。",
  };
  render();
}

function showGoogleSignInButton() {
  if (!window.google?.accounts?.id) return;

  // HTMLキャンバスの上にボタンコンテナを配置
  let container = document.getElementById("google-signin-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "google-signin-container";
    container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 9999;
      background: rgba(10, 20, 50, 0.95);
      padding: 30px;
      border-radius: 12px;
      border: 2px solid rgba(40, 80, 200, 0.6);
      text-align: center;
      font-family: 'Yu Gothic UI', sans-serif;
      box-shadow: 0 0 20px rgba(32, 96, 255, 0.5);
    `;
    document.body.appendChild(container);
  }

  // メッセージを表示
  container.innerHTML = `
    <div style="color: #c0d8ff; font-size: 18px; font-weight: 700; margin-bottom: 20px;">
      Googleでログイン
    </div>
    <div id="google-button-wrapper"></div>
  `;

  try {
    window.google.accounts.id.renderButton(
      document.getElementById("google-button-wrapper"),
      {
        type: "standard",
        size: "large",
        theme: "outline",
        text: "signin_with",
      }
    );
    console.log("Google Sign-In button rendered successfully");
  } catch (error) {
    console.error("Failed to render Google button:", error);
    container.innerHTML = `
      <div style="color: #ff6060; font-size: 14px;">
        Googleボタンの表示に失敗しました。<br>
        ブラウザのコンソールでエラーを確認してください。
      </div>
    `;
  }
}

function removeGoogleSignInButton() {
  const container = document.getElementById("google-signin-container");
  if (container) {
    container.remove();
    console.log("Google Sign-In button removed");
  }
}

function renderGoogleSignInButton() {
  const container = document.getElementById("google-signin-button");
  if (container && window.google?.accounts?.id) {
    try {
      window.google.accounts.id.renderButton(container, {
        type: "standard",
        size: "large",
        theme: "outline",
        text: "signin_with",
      });
      console.log("Google sign-in button rendered");
    } catch (error) {
      console.error("Failed to render Google button:", error);
    }
  }
}

async function handleGoogleCredential(response) {
  try {
    const verified = await verifyGoogleCredential(response.credential);
    if (!verified.ok) {
      app.auth = { ...app.auth, message: verified.message || "Googleログインに失敗しました。" };
      render();
      return;
    }
    app.auth = verified.user;
    app.screen = "home";
    // ログイン完了後、Googleボタンコンテナを削除
    removeGoogleSignInButton();
    await syncDecksFromServer();
  } catch {
    app.auth = { ...app.auth, message: "Googleログイン検証に失敗しました。" };
  }
  render();
}

async function verifyGoogleCredential(credential) {
  const serverResult = await fetch(`${SERVER_BASE}/api/auth/google`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  const payload = await serverResult.json();
  if (serverResult.ok && payload.ok) return payload;
  return { ok: false, message: payload.message || "Google IDトークンを検証できませんでした。" };
}

function parseJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(base64))));
  } catch {
    return null;
  }
}

function signInWithGoogleDemo() {
  app.auth = { provider: "google", signedIn: true, name: "Google Player", email: "player@example.com", demo: true };
  app.screen = "home";
  syncDecksFromServer();
}

function signInAsGuest() {
  app.auth = { provider: "guest", signedIn: true, name: "Guest Player", email: null };
  app.screen = "home";
  syncDecksFromServer();
}

function signOut() {
  app.auth = { provider: null, signedIn: false, name: "未ログイン", email: null };
  app.screen = "login";
}

function openDeckBuilder() {
  app.screen = "deckBuilder";
  app.deckBuilder.message = "カードを選んでデッキを調整できます。";
}

function openMatchLobby() {
  app.screen = "matchLobby";
}

function resetMatchGame(p2Deck) {
  const d2 = p2Deck || app.deck;
  Object.assign(state, createGame(
    app.deck.main, app.deck.struct, app.deck.core,
    {},
    d2.main, d2.struct, d2.core,
  ));
  nextInstanceId = 1;
  queuedOnlineAction = null;
  app.match.pendingOpId = null;
}

function startLocalMatch() {
  const core = cardCatalog.cores[app.deck.core] || cardCatalog.cores[DEFAULT_CORE_ID];
  const requirementIssues = coreDeckRequirementIssues(core, app.deck.main);
  if (requirementIssues.length) {
    app.match.message = `デッキ条件を満たしていません: ${requirementIssues.join("、")}`;
    render();
    return;
  }
  const selectedDeckId = app.match.selectedDeckId;
  resetMatchGame();
  app.match = { status: "local", mode: "ローカル対戦", roomCode: "", role: "host", connection: "offline", message: "同じブラウザ内で対戦中です。", players: [], selectedDeckId };
  app.screen = "game";
}

function createRoomMatch() {
  if (!prepareSelectedDeckForMatch()) return;
  const roomCode = makeRoomCode();
  const hostDeck = normalizeDeckData(currentDeckPayload());
  const selectedDeckId = app.match.selectedDeckId || null;
  app.match = {
    status: "connecting",
    mode: "??????????",
    roomCode,
    role: "host",
    connection: "connecting",
    message: "??????????????????",
    players: [],
    selectedDeckId,
    hostDeck,
  };
  app.screen = "matchLobby";
  connectOnline(() =>
    sendOnline({
      type: "create",
      roomCode,
      playerName: app.auth.name,
      deck: hostDeck || app.deck,
    }),
  );
}

function joinRoomMatch() {
  const requestedCode = (app.match.roomCode || "").trim().toUpperCase();
  if (!requestedCode) {
    app.match.message = "????????????????????????????";
    app.match.roomCodeFocused = true;
    roomCodeInput.value = "";
    setTimeout(() => roomCodeInput.focus(), 0);
    render();
    return;
  }
  if (!prepareSelectedDeckForMatch()) return;
  const guestDeck = normalizeDeckData(currentDeckPayload());
  const selectedDeckId = app.match.selectedDeckId || null;
  app.match = {
    status: "connecting",
    mode: "??????????",
    roomCode: requestedCode,
    role: "guest",
    connection: "connecting",
    message: "??????????????????",
    players: [],
    selectedDeckId,
    guestDeck,
  };
  app.screen = "matchLobby";
  connectOnline(() =>
    sendOnline({
      type: "join",
      roomCode: requestedCode,
      playerName: app.auth.name,
      deck: guestDeck || app.deck,
    }),
  );
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function copyRoomCode() {
  const code = app.match.roomCode;
  if (!code) {
    app.match.message = "コピーできるルームコードがありません。";
    return false;
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(code);
    app.match.message = `ルームコード ${code} をコピーしました。`;
    return true;
  } catch {
    const copied = copyTextLegacy(code);
    if (!copied) {
      try {
        window.prompt("ルームコードをコピーしてください", code);
      } catch {
        // Some embedded browser test surfaces disable prompt(); the message still exposes the code.
      }
    }
    app.match.message = copied ? `ルームコード ${code} をコピーしました。` : `ルームコード: ${code}`;
    return copied;
  }
}

function copyTextLegacy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  document.body.removeChild(area);
  return copied;
}

function connectOnline(onOpen) {
  if (!window.WebSocket) {
    app.match.connection = "unsupported";
    app.match.message = "このブラウザはWebSocketに対応していません。";
    return;
  }
  if (onlineSocket?.readyState === WebSocket.OPEN) {
    onOpen?.();
    return;
  }
  if (onOpen) onlineOpenCallbacks.push(onOpen);
  if (onlineSocket?.readyState === WebSocket.CONNECTING) return;

  onlineSocket = new WebSocket(ONLINE_WS_URL);
  onlineSocket.addEventListener("open", () => {
    app.match.connection = "connected";
    app.match.message = "オンラインサーバーに接続しました。";
    const callbacks = onlineOpenCallbacks;
    onlineOpenCallbacks = [];
    callbacks.forEach((callback) => callback());
    render();
  });
  onlineSocket.addEventListener("message", (event) => {
    try {
      handleOnlineMessage(JSON.parse(event.data));
    } catch {
      app.match.message = "オンラインメッセージの解析に失敗しました。";
    }
    render();
  });
  onlineSocket.addEventListener("close", () => {
    if (app.match.status === "online" || app.match.status === "connecting") {
      app.match.connection = "disconnected";
      app.match.message = "オンラインサーバーから切断されました。";
    }
    onlineSocket = null;
    onlineOpenCallbacks = [];
    render();
  });
  onlineSocket.addEventListener("error", () => {
    app.match.connection = "error";
    app.match.message = `オンラインサーバーに接続できません。${ONLINE_WS_URL} を確認してください。`;
    render();
  });
}

function sendOnline(payload) {
  if (onlineSocket?.readyState !== WebSocket.OPEN) {
    app.match.message = "オンラインサーバーへ未接続です。";
    return false;
  }
  const str = JSON.stringify(payload);
  if (ONLINE_DEBUG) {
    const byteLen = new TextEncoder().encode(str).byteLength;
    console.log("[sendOnline]", payload.type, payload.reason || "-", "strLen=", str.length, "byteLen=", byteLen);
  }
  onlineSocket.send(str);
  return true;
}

function sendOnlineStateSnapshot(reason = "action", opId = null) {
  return sendOnline({
    type: "state",
    roomCode: app.match.roomCode,
    reason,
    opId,
    state: serializeGameState(),
  });
}

function requestOnlineStateSync(reason = "manual") {
  if (app.match.status !== "online" || !app.match.roomCode || queuedOnlineAction) return false;
  return sendOnline({ type: "syncRequest", roomCode: app.match.roomCode, reason });
}

setInterval(() => {
  if (app.screen !== "game" || app.match.status !== "online" || queuedOnlineAction) return;
  requestOnlineStateSync("poll");
}, 2500);

function handleOnlineMessage(message) {
  if (message.type === "room") {
    app.match.status = "online";
    app.match.mode = message.role === "host" ? "????????" : "????????";
    app.match.roomCode = message.roomCode;
    app.match.role = message.role;
    app.match.connection = "connected";
    app.match.players = message.players || [];
    syncMatchDecksFromPlayers(app.match.players);
    app.match.message = message.message || "???????????";
    if (message.state) {
      if (message.players) app.match.players = message.players;
      syncMatchDecksFromPlayers(app.match.players);
      if (shouldApplyOnlineState(message.version)) {
        applyRemoteGameState(message.state);
        markOnlineStateApplied(message.version);
        applyOnlinePlayerNames();
        app.screen = "game";
        app.match.mode = "???????";
      }
      render();
    }
    return;
  }
  if (message.type === "presence") {
    app.match.players = message.players || app.match.players;
    syncMatchDecksFromPlayers(app.match.players);
    app.match.message = app.match.players.length >= 2 ? "????????????" : "????????????";
    if (app.screen === "game") applyOnlinePlayerNames();
    render();
    return;
  }
  if (message.type === "start") {
    if (message.players) app.match.players = message.players;
    syncMatchDecksFromPlayers(app.match.players);
    if (!shouldApplyOnlineState(message.version, message.reason === "syncRequest")) return;
    applyRemoteGameState(message.state);
    markOnlineStateApplied(message.version);
    applyOnlinePlayerNames();
    app.match.status = "online";
    app.match.mode = "???????";
    app.screen = "game";
    render();
    return;
  }
  if (message.type === "state") {
    app.match.lastStateMessage = { reason: message.reason || "sync", version: message.version || 0, activePlayer: message.state?.activePlayer, turn: message.state?.turn };
    if (message.players) {
      app.match.players = message.players;
      syncMatchDecksFromPlayers(app.match.players);
    }
    // Clear queued action before version check: a syncRequest poll can advance lastStateVersion
    // to the same version as the action echo, causing the echo to fail shouldApplyOnlineState.
    if (message.opId && queuedOnlineAction?.opId === message.opId) {
      if (queuedOnlineAction.localPopup) app.localCardPopup = queuedOnlineAction.localPopup;
      queuedOnlineAction = null;
      app.match.pendingOpId = null;
    }
    if (!shouldApplyOnlineState(message.version, message.reason === "syncRequest")) {
      render();
      return;
    }
    applyRemoteGameState(message.state);
    markOnlineStateApplied(message.version);
    applyOnlinePlayerNames();
    render();
    return;
  }
  if (message.type === "error") {
    app.match.message = message.message || "????????????????";
  }
}

function shouldApplyOnlineState(version, allowEqual = false) {
  if (!Number.isFinite(Number(version)) || Number(version) <= 0) return true;
  const current = Number(app.match.lastStateVersion) || 0;
  return allowEqual ? Number(version) >= current : Number(version) > current;
}

function markOnlineStateApplied(version) {
  if (!Number.isFinite(Number(version)) || Number(version) <= 0) return;
  app.match.lastStateVersion = Number(version);
}


function syncMatchDecksFromPlayers(players = app.match.players) {
  if (!Array.isArray(players)) return;
  const host = players.find((player) => player.role === "host");
  const guest = players.find((player) => player.role === "guest");
  const hostDeck = normalizeDeckData(host?.deck);
  const guestDeck = normalizeDeckData(guest?.deck);
  if (hostDeck) app.match.hostDeck = hostDeck;
  if (guestDeck) app.match.guestDeck = guestDeck;
}

function startMatchFromLobby() {
  if (!prepareSelectedDeckForMatch()) return;
  if (app.match.status === "online" || app.match.status === "connecting") {
    if ((app.match.players || []).length < 2) {
      app.match.message = "対戦相手が接続するまで開始できません。";
      return;
    }
    startOnlineMatch();
    return;
  }
  startLocalMatch();
}

function prepareSelectedDeckForMatch() {
  const core = cardCatalog.cores[app.deck.core] || cardCatalog.cores[DEFAULT_CORE_ID];
  const requirementIssues = coreDeckRequirementIssues(core, app.deck.main);
  if (requirementIssues.length) {
    app.match.message = `デッキ条件を満たしていません: ${requirementIssues.join("、")}`;
    return false;
  }

  if (!app.match.selectedDeckId) {
    const deck = normalizeDeckData(currentDeckPayload());
    if (!deck) {
      app.match.message = "????????????????????????????????????";
      return false;
    }
    app.deck = deck;
    app.deckName = app.deckName || "??????";
    app.match.selectedDeckId = null;
    app.match.message = String(app.deckName) + " ????????????????";
    return true;
  }

  const selectedId = app.match.selectedDeckId;
  if (!selectedId || !selectMatchDeck(selectedId)) {
    const deck = normalizeDeckData(currentDeckPayload());
    if (!deck) {
      app.match.message = "??????????????????????";
      return false;
    }
    app.deck = deck;
    app.match.selectedDeckId = null;
    app.match.message = String(app.deckName) + " ????????????????";
    return true;
  }
  return true;
}

function startOnlineMatch() {
  syncMatchDecksFromPlayers();
  const hostDeck = normalizeDeckData(app.match.hostDeck || currentDeckPayload());
  const guestDeck = normalizeDeckData(app.match.guestDeck);

  // Require both players to have published decks before starting an online match.
  if (!hostDeck || !guestDeck) {
    app.match.message = "対戦相手のデッキが揃うまで開始できません。";
    return;
  }

  if (hostDeck) app.deck = hostDeck;
  resetMatchGame(guestDeck || null);
  applyOnlinePlayerNames();
  const snapshot = serializeGameState();
  if (!sendOnline({
    type: "start",
    roomCode: app.match.roomCode,
    state: snapshot,
  })) return;
  applyRemoteGameState(snapshot);
  app.match.status = "online";
  app.match.mode = "???????";
  app.match.message = "???????????????";
  app.screen = "game";
}

function stripImageUrls(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripImageUrls);
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "imageUrl" || k === "image") result[k] = "";
    else result[k] = stripImageUrls(v);
  }
  return result;
}

function serializeGameState() {
  return stripImageUrls(JSON.parse(JSON.stringify(state)));
}

function applyRemoteGameState(remoteState) {
  if (!remoteState) return;
  applyingRemoteState = true;
  try {
    Object.assign(state, normalizeGameResources(JSON.parse(JSON.stringify(remoteState))));
    nextInstanceId = Math.max(nextInstanceId, highestInstanceId(state) + 1);
  } finally {
    applyingRemoteState = false;
  }
}

function applyOnlinePlayerNames(targetState = state, players = app.match.players) {
  if (!targetState?.players || !Array.isArray(players)) return;
  const host = players.find((player) => player.role === "host");
  const guest = players.find((player) => player.role === "guest");
  if (host?.name) targetState.players.p1.name = host.name;
  if (guest?.name) targetState.players.p2.name = guest.name;
}

function highestInstanceId(value) {
  if (!value || typeof value !== "object") return 0;
  let max = Number(value.instanceId) || 0;
  if (Array.isArray(value)) {
    for (const item of value) max = Math.max(max, highestInstanceId(item));
    return max;
  }
  for (const item of Object.values(value)) max = Math.max(max, highestInstanceId(item));
  return max;
}

function broadcastOnlineState(reason = "action", senderPlayerId = state.activePlayer) {
  if (applyingRemoteState || app.screen !== "game" || app.match.status !== "online") return false;
  // Only the side that performed the action sends state, preventing stale overwrites.
  if (controlledPlayerId() !== senderPlayerId) return false;
  return sendOnlineStateSnapshot(reason);
}

function syncOnlineAction(reason, playerId = state.activePlayer) {
  if (applyingRemoteState) { console.warn("[sync] blocked: applyingRemoteState", reason); return false; }
  if (app.screen !== "game") { console.warn("[sync] blocked: screen=", app.screen, reason); return false; }
  if (app.match.status !== "online") { console.warn("[sync] blocked: status=", app.match.status, reason); return false; }
  if (controlledPlayerId() !== playerId) { console.warn("[sync] blocked: controlled=", controlledPlayerId(), "playerId=", playerId, reason); return false; }
  const opId = `${app.match.role || "local"}-${Date.now().toString(36)}-${nextOnlineOpId++}`;
  queuedOnlineAction = { opId, reason, playerId };
  app.match.pendingOpId = opId;
  const sent = sendOnlineStateSnapshot(reason, opId);
  if (!sent) console.warn("[sync] sendOnline failed", reason, opId);
  else console.log("[sync] sent", reason, opId);
  return sent;
}

function attachPendingLocalPopup(playerId, card, source) {
  if (!queuedOnlineAction || !card) return;
  queuedOnlineAction.localPopup = buildCardRevealPayload(playerId, card, source, `local-${queuedOnlineAction.opId}`);
}

function addDeckCard(cardId) {
  const card = cardCatalog.main[cardId];
  if (!card || card.fixture) return;
  const currentCount = app.deck.main.filter((id) => id === cardId).length;
  const maxCopies = hasKeyword(card, "legendary") ? 1 : 4;
  if (currentCount >= maxCopies) {
    app.deckBuilder.message = `${card.name} は ${maxCopies}枚までです。`;
    return;
  }
  app.deck.main.push(cardId);
  app.deckBuilder.selectedCardId = cardId;
  app.deckBuilder.message = `${card.name} をメインデッキに追加しました。`;
}

function removeDeckCard(index) {
  const [cardId] = app.deck.main.splice(index, 1);
  const card = cardCatalog.main[cardId];
  app.deckBuilder.message = `${card?.name || "カード"} をメインデッキから外しました。`;
}

function removeDeckCardById(cardId) {
  const index = app.deck.main.lastIndexOf(cardId);
  if (index >= 0) removeDeckCard(index);
}

function addStructDeckCard(cardId) {
  const card = cardCatalog.structs[cardId];
  if (!card) return;
  app.deck.struct.push(cardId);
  app.deckBuilder.selectedCardId = cardId;
  app.deckBuilder.message = `${card.name} をストラクトデッキに追加しました。`;
}

function removeStructDeckCard(index) {
  const [cardId] = app.deck.struct.splice(index, 1);
  const card = cardCatalog.structs[cardId];
  app.deckBuilder.message = `${card?.name || "カード"} をストラクトデッキから外しました。`;
}

function removeStructDeckCardById(cardId) {
  const index = app.deck.struct.lastIndexOf(cardId);
  if (index >= 0) removeStructDeckCard(index);
}

function setDeckBuilderLibrary(type) {
  if (!LIBRARY_TYPE_ORDER.includes(type)) return;
  app.deckBuilder.libraryType = type;
  app.deckBuilder.libraryScroll = 0;
  app.deckBuilder.message = `${CARD_TYPE_LABELS[type]}カードを表示しています。`;
}

function setDeckBuilderSearchPreset(presetId) {
  if (!SEARCH_PRESETS.some((preset) => preset.id === presetId)) return;
  app.deckBuilder.searchPreset = presetId;
  app.deckBuilder.libraryScroll = 0;
  app.deckBuilder.message = `検索プリセット: ${SEARCH_PRESETS.find((preset) => preset.id === presetId).label}`;
}

function setDeckBuilderTagFilter(tag) {
  app.deckBuilder.tagFilter = tag;
  app.deckBuilder.libraryScroll = 0;
  app.deckBuilder.message = tag === "all" ? "タグフィルタを解除しました。" : `タグ: ${tag}`;
}

function changeTagScroll(delta) {
  const tags = ["all", ...popularLibraryTags()];
  const visibleCols = 4;
  const maxScroll = Math.max(0, tags.length - visibleCols);
  app.deckBuilder.tagScroll = Math.max(0, Math.min(maxScroll, (app.deckBuilder.tagScroll || 0) + delta));
}

function cycleDeckBuilderSort() {
  const currentIndex = SORT_OPTIONS.findIndex((option) => option.id === app.deckBuilder.sortBy);
  const next = SORT_OPTIONS[(currentIndex + 1) % SORT_OPTIONS.length];
  app.deckBuilder.sortBy = next.id;
  app.deckBuilder.libraryScroll = 0;
  app.deckBuilder.message = `並び替え: ${next.label}`;
}

function changeLibraryScroll(deltaRows) {
  const cards = filteredLibraryCards();
  const visibleRows = 6;
  const totalRows = Math.max(1, Math.ceil(cards.length / 2));
  const maxScroll = Math.max(0, totalRows - visibleRows);
  app.deckBuilder.libraryScroll = Math.max(0, Math.min(maxScroll, app.deckBuilder.libraryScroll + deltaRows));
}

function changeLibraryPage(delta) {
  changeLibraryScroll(delta * 4);
}

function deckListRows() {
  const rows = [];
  for (const type of MAIN_DECK_SECTION_ORDER) {
    const ids = mainDeckIdsByType(type);
    rows.push({ kind: "mainHeader", type, count: ids.length });
    for (const entry of groupedCardEntries(ids, cardCatalog.main)) {
      rows.push({ kind: "mainCard", entry });
    }
  }
  rows.push({ kind: "structHeader", count: app.deck.struct.length });
  for (const entry of groupedCardEntries(app.deck.struct, cardCatalog.structs)) {
    rows.push({ kind: "structCard", entry });
  }
  return rows;
}

function changeDeckScroll(deltaRows) {
  const visibleRows = 10;
  const maxScroll = Math.max(0, deckListRows().length - visibleRows);
  app.deckBuilder.deckScroll = Math.max(0, Math.min(maxScroll, app.deckBuilder.deckScroll + deltaRows));
}

function testDrawDeck() {
  const core = cardCatalog.cores[app.deck.core] || cardCatalog.cores[DEFAULT_CORE_ID];
  const deck = makeDeck(app.deck.main);
  app.deckBuilder.testDraw = deck.slice(0, core.initialHand || 4).map((card) => card.name);
  app.deckBuilder.message = `テストドロー: ${app.deckBuilder.testDraw.join(" / ") || "カードなし"}`;
}

function exportDeck() {
  const payload = JSON.stringify(
    {
      core: app.deck.core,
      main: app.deck.main,
      struct: app.deck.struct,
      exportedAt: new Date().toISOString(),
    },
    null,
    2,
  );
  const blob = new Blob([payload], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "twcg_deck.json";
  link.click();
  URL.revokeObjectURL(link.href);
  app.deckBuilder.message = "デッキをJSONとしてエクスポートしました。";
}

function groupedCardEntries(ids, catalog) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts.entries()].map(([id, count]) => ({ id, count, card: catalog[id] })).filter((entry) => entry.card);
}

function allLibraryCards() {
  return [
    ...Object.values(cardCatalog.cores),
    ...Object.values(cardCatalog.main).filter((card) => !card.fixture),
    ...Object.values(cardCatalog.structs),
  ];
}

function filteredLibraryCards() {
  const type = app.deckBuilder.libraryType;
  const preset = SEARCH_PRESETS.find((item) => item.id === app.deckBuilder.searchPreset) || SEARCH_PRESETS[0];
  const presetTerm = preset.term.toLowerCase();
  const freeText = (app.deckBuilder.searchText || "").toLowerCase().trim();
  const tag = app.deckBuilder.tagFilter;
  return allLibraryCards()
    .filter((card) => type === "all" || card.type === type)
    .filter((card) => tag === "all" || tagLabels(card).includes(tag))
    .filter((card) => {
      const haystack = [card.name, card.text, card.flavor, ...(tagLabels(card) || []), ...(keywordLabels(card) || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (presetTerm && !haystack.includes(presetTerm)) return false;
      if (freeText && !haystack.includes(freeText)) return false;
      return true;
    })
    .sort(compareLibraryCards);
}

function compareLibraryCards(a, b) {
  if (app.deckBuilder.sortBy === "cost") {
    return totalCostAmount(a.cost || {}) - totalCostAmount(b.cost || {}) || a.name.localeCompare(b.name, "ja");
  }
  if (app.deckBuilder.sortBy === "type") {
    return String(a.type).localeCompare(String(b.type)) || a.name.localeCompare(b.name, "ja");
  }
  return a.name.localeCompare(b.name, "ja");
}

function popularLibraryTags() {
  const counts = {};
  for (const card of allLibraryCards()) {
    for (const tag of tagLabels(card)) counts[tag] = (counts[tag] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .map(([tag]) => tag);
}

function addCardFromLibrary(card) {
  selectCardForDetail(card);
  if (card.type === "core") return selectCoreCard(card.id);
  if (card.type === "struct") return addStructDeckCard(card.id);
  return addDeckCard(card.id);
}

function selectCardForDetail(cardOrId) {
  const card = typeof cardOrId === "string" ? findCatalogCard(cardOrId) : cardOrId;
  if (!card) return null;
  app.deckBuilder.selectedCardId = card.id;
  app.deckBuilder.detailOpen = false;
  return card;
}

function findCatalogCard(cardId) {
  return cardCatalog.main[cardId] || cardCatalog.structs[cardId] || cardCatalog.cores[cardId] || null;
}

function mainDeckIdsByType(type) {
  return app.deck.main.filter((id) => cardCatalog.main[id]?.type === type);
}

function resetDeckBuilder() {
  app.deck.core = DEFAULT_CORE_ID;
  app.deck.main = [...DEFAULT_MAIN_DECK_IDS];
  app.deck.struct = [...DEFAULT_STRUCT_DECK_IDS];
  app.deckName = "未保存デッキ";
  app.deckBuilder.testDraw = [];
  app.deckBuilder.message = "デフォルトデッキに戻しました。";
}

function selectCoreCard(coreId) {
  const core = cardCatalog.cores[coreId];
  if (!core) return;
  selectCardForDetail(core);
  app.deck.core = coreId;
  app.deckBuilder.message = `${core.name} をコアに設定しました。`;
}

function createGame(
  mainDeckIds = DEFAULT_MAIN_DECK_IDS, structDeckIds = DEFAULT_STRUCT_DECK_IDS, coreId = DEFAULT_CORE_ID,
  options = {},
  p2MainDeckIds, p2StructDeckIds, p2CoreId,
) {
  const shuffleMainDeck = options.shuffleMainDeck !== false;
  const game = {
    activePlayer: "p1",
    phase: "main",
    turn: 1,
    winner: null,
    selected: null,
    effectQueue: [],
    globalEffects: [],
    pendingTarget: null,
    pendingChoice: null,
    pendingAttackContinuation: null,
    pendingDamageBatch: null,
    pendingStructPhase: null,
    turnStartSequence: null,
    cardReveal: null,
    cardRevealSeq: 0,
    turnStartSummary: null,
    message: "手札か施設デッキを選択してください。",
    log: [],
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    players: {
      p1: createPlayer("p1", mainDeckIds, structDeckIds, coreId, { shuffleMainDeck }),
      p2: createPlayer("p2", p2MainDeckIds || mainDeckIds, p2StructDeckIds || structDeckIds, p2CoreId || coreId, { shuffleMainDeck }),
    },
  };

  for (const playerId of ["p1", "p2"]) {
    drawCards(game, playerId, game.players[playerId].core.initialHand || 4, false);
  }
  log(game, "ゲーム開始");
  startTurn(game, "p1", { skipDraw: true });
  return game;
}

function createPlayer(id, mainDeckIds = DEFAULT_MAIN_DECK_IDS, structDeckIds = DEFAULT_STRUCT_DECK_IDS, coreId = DEFAULT_CORE_ID, options = {}) {
  const core = cloneCard(cardCatalog.cores[coreId] || cardCatalog.cores[DEFAULT_CORE_ID]);
  return {
    ...PLAYERS[id],
    core,
    resources: normalizeResourceObject(core.startResources || {}),
    mainDeck: makeDeck(mainDeckIds, { shuffle: options.shuffleMainDeck !== false }),
    structDeck: structDeckIds.map((cardId) => cloneCard(cardCatalog.structs[cardId])).filter(Boolean),
    hand: [],
    structs: [],
    tactZone: [],
    wildZone: [],
    grandZone: [],
    dump: [],
    exileZone: [],
  };
}

function makeDeck(ids, options = {}) {
  const usableIds = ids.filter((id) => cardCatalog.main[id] && !cardCatalog.main[id].fixture);
  validateDeck(usableIds);
  const deck = usableIds.map((id) => cloneCard(cardCatalog.main[id]));
  return options.shuffle === false ? deck : shuffleCards(deck);
}

function shuffleCards(cards) {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function cloneCard(card) {
  return JSON.parse(JSON.stringify(card));
}

function makeUnit(cardId, owner, row, col, options = {}) {
  const card = cloneCard(cardCatalog.main[cardId]);
  if (options.fromDump && cardId === "card_1753658925940") {
    card.atk = (card.atk || 0) + 1;
    card.hp = (card.hp || 0) + 1;
  }
  return {
    ...card,
    instanceId: nextInstanceId++,
    owner,
    row,
    col,
    maxHp: card.hp,
    currentHp: options.hp ?? card.hp,
    rested: Boolean(options.rested),
    attacksThisTurn: options.attacksThisTurn || 0,
    mobileMoveUsed: Boolean(options.mobileMoveUsed),
    counters: options.counters || 0,
    fromDump: Boolean(options.fromDump),
  };
}

function validateDeck(ids) {
  const counts = {};
  for (const id of ids) counts[id] = (counts[id] || 0) + 1;
  for (const [id, count] of Object.entries(counts)) {
    const card = cardCatalog.main[id];
    if (count > 1 && hasKeyword(card, "legendary")) {
      throw new Error(`Legendary card duplicated in deck: ${id}`);
    }
  }
  const factions = new Set(
    ids
      .map((id) => cardCatalog.main[id]?.faction)
      .filter((faction) => faction && faction !== "ニュートラル"),
  );
  if (factions.size > 2) {
    throw new Error(`Too many non-neutral factions in deck: ${[...factions].join(", ")}`);
  }
}

function hasKeyword(card, id) {
  return Boolean(getKeyword(card, id));
}

function getKeyword(card, id) {
  return (card?.keywords || []).find((keyword) => keyword.id === id);
}

function ensureKeyword(card, id, value = null) {
  if (!card) return;
  if (!card.keywords) card.keywords = [];
  const existing = card.keywords.find((keyword) => keyword.id === id);
  if (existing) {
    if (value != null) existing.value = value;
    return;
  }
  card.keywords.push(value == null ? { id } : { id, value });
}

function removeKeywords(card, ids = []) {
  if (!card?.keywords) return;
  const blocked = new Set(ids);
  card.keywords = card.keywords.filter((keyword) => !blocked.has(keyword.id));
}

function keywordValue(card, id, fallback = 0) {
  const keyword = getKeyword(card, id);
  if (!keyword) return fallback;
  return typeof keyword.value === "number" ? keyword.value : 1;
}

function keywordLabels(card) {
  return (card?.keywords || []).map((keyword) => {
    const label = KEYWORD_DEFINITIONS[keyword.id]?.label || keyword.id;
    return typeof keyword.value === "number" ? `${label}${keyword.value}` : label;
  });
}

function tagLabels(card) {
  return card?.tags || [];
}

function cardImageSource(card) {
  const src = card?.imageUrl || card?.image;
  if (src) return src;
  if (card?.id) {
    const cat = cardCatalog.main[card.id] || cardCatalog.structs[card.id] || cardCatalog.cores[card.id];
    const fallback = cat?.imageUrl || cat?.image;
    if (fallback) return fallback;
  }
  return null;
}

function getCardImage(card) {
  const src = cardImageSource(card);
  if (!src) return null;
  const cached = cardImageCache.get(src);
  // 失敗したエントリはキャッシュしない（サーバー起動前にロードして失敗した場合にリトライできるよう）
  if (cached && !cached.failed) return cached;
  const image = new Image();
  const entry = { image, loaded: false, failed: false };
  image.onload = () => {
    entry.loaded = true;
    render();
  };
  image.onerror = () => {
    entry.failed = true;
    // 失敗時はキャッシュから削除して次回リトライ可能にする
    cardImageCache.delete(src);
  };
  image.src = src;
  cardImageCache.set(src, entry);
  return entry;
}

function getResourceIcon(key) {
  const src = RESOURCE_ICON_PATHS[key] || RESOURCE_ICON_PATHS.none;
  if (!src) return null;
  if (cardImageCache.has(src)) return cardImageCache.get(src);
  const image = new Image();
  const entry = { image, loaded: false, failed: false };
  image.onload = () => {
    entry.loaded = true;
    render();
  };
  image.onerror = () => {
    entry.failed = true;
    render();
  };
  image.src = src;
  cardImageCache.set(src, entry);
  return entry;
}

function drawResourceIcon(key, x, y, size, options = {}) {
  const entry = getResourceIcon(key);
  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  if (entry?.loaded && !entry.failed) {
    ctx.drawImage(entry.image, x, y, size, size);
  } else {
    const colors = RESOURCE_PILL_COLORS[key] || { bg: "rgba(30,40,70,0.7)", border: "rgba(80,100,180,0.7)", text: "#a0b0d0" };
    roundRect(x, y, size, size, Math.max(3, size * 0.18), colors.bg, colors.border, 1);
    ctx.fillStyle = colors.text || "#c0d0e8";
    ctx.font = `700 ${Math.max(8, Math.floor(size * 0.36))}px 'Yu Gothic UI', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(RESOURCE_LABELS[key] || "-", x + size / 2, y + size / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
}

function drawResourceAmount(key, amount, x, y, size, options = {}) {
  drawResourceIcon(key, x, y, size, options);
  const label = String(amount);
  const badgeW = Math.max(14, Math.min(size, 9 + label.length * 7));
  const badgeH = Math.max(12, Math.floor(size * 0.42));
  const bx = x + size - badgeW + 1;
  const by = y + size - badgeH + 1;
  roundRect(bx, by, badgeW, badgeH, Math.max(3, badgeH / 2), "rgba(4,8,18,0.86)", "rgba(255,255,255,0.32)", 1);
  ctx.fillStyle = "#f4f7ff";
  ctx.font = `800 ${Math.max(9, Math.floor(size * 0.38))}px 'Yu Gothic UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, bx + badgeW / 2, by + badgeH / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawCostIcons(cost = {}, x, y, options = {}) {
  const entries = Object.entries(normalizeResourceObject(cost)).filter(([, amount]) => amount > 0);
  const size = options.size || 18;
  const gap = options.gap ?? 3;
  if (!entries.length) {
    if (options.showNone) drawResourceIcon("none", x, y, size, { alpha: 0.78 });
    return x + (options.showNone ? size : 0);
  }
  entries.forEach(([key, amount], i) => {
    drawResourceAmount(key, amount, x + i * (size + gap), y, size);
  });
  return x + entries.length * (size + gap) - gap;
}

function cardIsAffordable(player, card) {
  if (!player || !card) return false;
  if (card.type === "unit" || card.type === "tact" || card.type === "wild" || card.type === "grand") {
    return canPay(player, effectiveCostForCard(player, card.cost || {}, card));
  }
  if (card.type === "struct") return canPay(player, card.cost || {});
  return false;
}

function emptyResources() {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
}

function addResources(player, key, amount) {
  const resourceKey = key === "food" ? "nature" : key === "mineral" ? "ore" : key;
  player.resources[resourceKey] = (player.resources[resourceKey] || 0) + amount;
}

function notifyDumpChanged(game, changedPlayerId) {
  const effects = (game.globalEffects || []).filter((effect) => effect.type === "dumpLifeGain");
  if (!effects.length) return;
  const timingKey = `${game.turn}:${game.activePlayer}:${changedPlayerId}:${game.log.length}`;
  for (const effect of effects) {
    if (effect.lastTimingKey === timingKey) continue;
    effect.lastTimingKey = timingKey;
    const player = game.players[effect.playerId];
    if (!player?.core) continue;
    player.core.hp += 1;
    log(game, `${player.name}: dump change life +1`);
  }
}

function sameResourceCost(a = {}, b = {}) {
  const left = normalizeResourceObject(a);
  const right = normalizeResourceObject(b);
  return RESOURCE_KEYS.every((key) => (left[key] || 0) === (right[key] || 0));
}

function isPlayBlockedBySadGirl(playerId, card) {
  if (!card || (card.type !== "unit" && card.type !== "tact")) return false;
  const opponent = opponentOf(playerId);
  const sadGirlActive = unitsOwnedBy(opponent).some((unit) => unit.id === "card_1755671140352");
  if (!sadGirlActive) return false;
  return unitsOwnedBy(opponent).some((unit) => sameResourceCost(unit.cost || {}, card.cost || {}));
}

function applyConditionalBuff(unit, key, active, { atk = 0, hp = 0 } = {}) {
  if (!unit) return;
  if (!unit.continuousBuffs) unit.continuousBuffs = {};
  const applied = unit.continuousBuffs[key];
  if (active && !applied) {
    unit.atk = (unit.atk || 0) + atk;
    unit.maxHp = (unit.maxHp || unit.hp || 0) + hp;
    unit.currentHp = (unit.currentHp || unit.hp || 0) + hp;
    unit.continuousBuffs[key] = { atk, hp };
  } else if (!active && applied) {
    unit.atk = (unit.atk || 0) - (applied.atk || 0);
    unit.maxHp = Math.max(1, (unit.maxHp || unit.hp || 1) - (applied.hp || 0));
    unit.currentHp = Math.min(unit.maxHp, Math.max(1, (unit.currentHp || 1) - (applied.hp || 0)));
    delete unit.continuousBuffs[key];
  }
}

function refreshContinuousEffects(game = state) {
  for (const pid of ["p1", "p2"]) {
    const core = game.players[pid]?.core;
    const coreBuffTags = core?.passiveBuffTags;
    const coreBuffAtk = core?.passiveBuffAtk || 0;
    const coreTagSet = coreBuffTags?.length ? new Set(coreBuffTags) : null;
    for (const unit of unitsOwnedBy(pid, game)) {
      if (coreTagSet && coreBuffAtk) {
        const hasTag = (unit.tags || []).some((t) => coreTagSet.has(t));
        applyConditionalBuff(unit, `corePassive_${core.id}`, hasTag, { atk: coreBuffAtk, hp: 0 });
      }
      if (unit.id === "card_1753680748888") {
        const adjacentPureHumans = adjacentCells(unit.row, unit.col).filter(([row, col]) => {
          const adjacent = game.board[row]?.[col];
          return adjacent?.owner === pid && (adjacent.tags || []).includes("\u7d14\u4eba\u9593");
        }).length;
        applyConditionalBuff(unit, "unitedKingdomInfantry", adjacentPureHumans >= 2, { atk: 1, hp: 0 });
      }
      if (unit.id === "card_1753716897980") {
        applyConditionalBuff(unit, "angronaOpponentTurn", game.activePlayer === opponentOf(pid), { atk: 3, hp: 0 });
      }
      if (unit.id === "card_1782192967652") {
        const adjacentPureHumans = adjacentCells(unit.row, unit.col).filter(([row, col]) => {
          const adjacent = game.board[row]?.[col];
          return adjacent?.owner === pid && (adjacent.tags || []).includes("純人間");
        }).length;
        applyConditionalBuff(unit, "108thBattalionBuff", adjacentPureHumans >= 2, { atk: 2, hp: 0 });
      }
    }
    const commander = unitsOwnedBy(pid, game).find((unit) => unit.id === "card_1782225519182");
    if (commander) {
      const hqCore =
        game.players[pid]?.core?.id === "card_1782520000000"
        || game.players[pid]?.core?.name === "北東軍総司令部";
      applyConditionalBuff(commander, "northeastCommanderHqCore", hqCore, { atk: 5, hp: 0 });
      const hasAtlasUnit = unitsOwnedBy(pid, game).some((unit) =>
        (unit.tags || []).includes("アトラス北東軍")
      );
      for (const unit of unitsOwnedBy(pid, game)) {
        applyConditionalBuff(unit, "northeastCommanderFieldAura", hasAtlasUnit, { atk: 3, hp: 0 });
      }
    }
  }
}

function resourceDelta(before = {}, after = {}) {
  const delta = emptyResources();
  for (const key of RESOURCE_KEYS) delta[key] = (after[key] || 0) - (before[key] || 0);
  return delta;
}

function mergeResourceDelta(target, source) {
  for (const key of RESOURCE_KEYS) target[key] = (target[key] || 0) + (source[key] || 0);
  return target;
}

function canPay(player, cost = {}) {
  const normalizedCost = normalizeResourceObject(cost);
  return Object.entries(normalizedCost).every(([key, amount]) => (player.resources[key] || 0) >= amount);
}

function pay(player, cost = {}) {
  const normalizedCost = normalizeResourceObject(cost);
  if (!canPay(player, normalizedCost)) return false;
  for (const [key, amount] of Object.entries(normalizedCost)) {
    player.resources[key] -= amount;
  }
  return true;
}

function findCopperMineReduction(player, card, cost = {}) {
  if (!card || card.type !== "unit") return null;
  if (!(card.tags || []).includes("\u6a5f\u68b0")) return null;
  if ((cost.ore || 0) <= 0) return null;
  return (player.structs || []).find((struct) => struct.id === "card_1753904622342" && !struct.rested) || null;
}

function effectiveCostForCard(player, cost = {}, card = null) {
  const effective = normalizeResourceObject(cost);
  if (!card || !player?.id) return effective;
  if (card.type === "tact") {
    const discount = (state.globalEffects || [])
      .filter((effect) => effect.type === "tactPeopleDiscount" && effect.playerId === player.id)
      .reduce((sum, effect) => sum + (effect.amount || 0), 0);
    if (discount > 0) effective.people = Math.max(0, (effective.people || 0) - discount);
  }
  if (card.id === "card_1753664241159" && (effective.people || 0) > 0) {
    const shortage = Math.max(0, effective.people - (player.resources.people || 0));
    const substitutable = Math.min(shortage, player.resources.electric || 0);
    if (substitutable > 0) {
      effective.people -= substitutable;
      effective.electric = (effective.electric || 0) + substitutable;
    }
  }
  if (findCopperMineReduction(player, card, effective)) {
    effective.ore = Math.max(0, (effective.ore || 0) - 1);
  }
  return effective;
}

function payForCard(player, cost = {}, card = null) {
  const effectiveCost = effectiveCostForCard(player, cost, card);
  const copperReduction = findCopperMineReduction(player, card, normalizeResourceObject(cost));
  if (pay(player, effectiveCost)) {
    if (copperReduction) copperReduction.rested = true;
    return true;
  }
  if (!card || !hasKeyword(card, "soulPay")) return false;

  const payable = { ...effectiveCost };
  const missingMagic = Math.max(0, (payable.magic || 0) - (player.resources.magic || 0));
  if (missingMagic === 0 || player.dump.length < missingMagic) return false;
  payable.magic = (payable.magic || 0) - missingMagic;
  if (!pay(player, payable)) return false;
  player.dump.splice(0, missingMagic);
  return true;
}

function totalCostAmount(cost = {}) {
  return Object.values(cost).reduce((sum, amount) => sum + amount, 0);
}

function canDeployHeroWithGold(player, heroOption, goldToPay = 0) {
  if (!heroOption) return false;
  const pay = goldToPay || 0;
  if ((player.resources.funds || 0) < pay) return false;
  return (heroOption.totalCost || 0) <= pay * 2;
}

function hasDeployableHeroWithGold(heroOptions, goldToPay, availableGold) {
  const pay = goldToPay || 0;
  if (availableGold < pay) return false;
  return (heroOptions || []).some((opt) => (opt.totalCost || 0) <= pay * 2);
}

function countDeckRestrictionCards(mainCards, restriction) {
  if (!restriction?.tags?.length) return 0;
  const tagSet = new Set(restriction.tags);
  return mainCards.filter((card) => {
    if (totalCostAmount(card.cost || {}) > (restriction.maxPlayCost ?? 5)) return false;
    return (card.tags || []).some((tag) => tagSet.has(tag));
  }).length;
}

function coreDeckRequirementIssues(core, mainIds = []) {
  const issues = [];
  for (const cardId of core?.requiredDeckCardIds || []) {
    if (!mainIds.some((id) => id === cardId)) {
      const card = cardCatalog.main[cardId];
      issues.push(`「${card?.name || cardId}」がデッキに必要です`);
    }
  }
  return issues;
}

// 「name」→ 名前に含む、[tag] → タグに含む の条件チェック
function matchesCond(card, cond) {
  if (!cond) return true;
  if (typeof cond === "string") return (card.tags || []).includes(cond); // 旧形式互換
  if (cond.tag) return (card.tags || []).includes(cond.tag);
  if (cond.nameContains) return (card.name || "").includes(cond.nameContains);
  return true;
}

function drawCards(game, playerId, count, announce = true) {
  const player = game.players[playerId];
  const drewAny = player.mainDeck.length > 0 && count > 0;
  for (let i = 0; i < count; i += 1) {
    if (player.mainDeck.length === 0) break;
    if (player.core.handLimit && player.hand.length >= player.core.handLimit) break;
    player.hand.push(player.mainDeck.shift());
  }
  if (announce) log(game, `${player.name}: ${count}枚ドロー`);
  // onFirstDraw: trigger unrested structs with this ability the first time cards are drawn each turn
  if (drewAny && !game.firstDrawFiredFor?.[playerId]) {
    if (!game.firstDrawFiredFor) game.firstDrawFiredFor = {};
    game.firstDrawFiredFor[playerId] = true;
    for (const struct of (player.structs || [])) {
      if (!struct.rested && (struct.abilities || []).some((a) => a.trigger === "onFirstDraw")) {
        struct.rested = true;
        triggerAbilities(game, playerId, struct, "onFirstDraw", { zone: "struct" });
      }
    }
  }
}

function opponentOf(playerId) {
  return playerId === "p1" ? "p2" : "p1";
}

function controlledPlayerId() {
  return app.match.role === "guest" ? "p2" : "p1";
}

function viewerPlayerId() {
  if (app.match.status === "online") return controlledPlayerId();
  return state.activePlayer || "p1";
}

function isViewerFlipped() {
  return viewerPlayerId() === "p2";
}

function visualRowToBoardRow(row) {
  return isViewerFlipped() ? ROWS - 1 - row : row;
}

function boardRowToVisualRow(row) {
  return isViewerFlipped() ? ROWS - 1 - row : row;
}

function clampStructDeckScroll(player) {
  const visibleRows = 2;
  const totalRows = Math.ceil((player?.structDeck?.length || 0) / 3);
  const maxScroll = Math.max(0, totalRows - visibleRows);
  app.structDeckScroll = Math.max(0, Math.min(app.structDeckScroll || 0, maxScroll));
  return { visibleRows, totalRows, maxScroll, scroll: app.structDeckScroll };
}

function changeStructDeckScroll(delta) {
  const player = state.players[viewerPlayerId()];
  const info = clampStructDeckScroll(player);
  app.structDeckScroll = Math.max(0, Math.min(info.maxScroll, info.scroll + delta));
}

function canControlActivePlayer() {
  if (app.match.status !== "online") return true;
  return controlledPlayerId() === state.activePlayer;
}

function canControlChoicePlayer(playerId) {
  return controlledPlayerId() === playerId;
}

function requireActivePlayerControl() {
  if (canControlActivePlayer()) return true;
  state.message = "相手のターンです。操作できません。";
  return false;
}

function triggerAbilities(game, playerId, card, trigger, source = {}) {
  for (const ability of card.abilities || []) {
    if (ability.trigger !== trigger) continue;
    game.effectQueue.push({ playerId, card, ability, source });
  }
  processEffectQueue(game);
  if (game.pendingChoice || game.pendingTarget) return "pending";
}

function processEffectQueue(game) {
  if (game.pendingTarget) return;
  if (game.pendingChoice) return;
  if (game.pendingStructPhase?.pendingResourceChoice) return;
  if (game.pendingStructPhase?.pendingEnemyStructChoice) return;
  game._effectQueueDepth = (game._effectQueueDepth || 0) + 1;
  try {
    while (game.effectQueue.length) {
      const item = game.effectQueue.shift();
      const effect = abilityEffects[item.ability.effect];
      if (!effect) {
        completeAbilitySource(game, item);
        continue;
      }
      if (item.ability.target) {
        if (!hasValidAbilityTarget(game, item)) {
          const message = `${item.card.name}: 対象がいないため効果は発動しませんでした。`;
          game.message = message;
          log(game, message);
          completeAbilitySource(game, item);
          continue;
        }
        game.pendingTarget = item;
        game.selected = { kind: "target", target: item.ability.target };
        game.message = `${item.card.name}: 対象を選択してください。`;
        return;
      }
      const result = effect({ game, playerId: item.playerId, card: item.card, ability: item.ability, source: item.source, target: item.target || null });
      if (result === "pending") {
        cleanupAllDestroyed(null, game);
        return;
      }
      completeAbilitySource(game, item);
    }
    if (!game.pendingChoice && !game.pendingTarget) {
      resumePendingDamageBatch(game);
      if (!game.pendingAttackContinuation) cleanupAllDestroyed(null, game);
    }
  } finally {
    game._effectQueueDepth -= 1;
    if (game._effectQueueDepth === 0) {
      advanceTurnStartSequence(game);
    }
  }
}

function hasValidAbilityTarget(game, item) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const target = game.board[row][col];
      if (isValidAbilityTarget(item, target)) return true;
    }
  }
  return false;
}

function resolvePendingTarget(row, col) {
  const pending = state.pendingTarget;
  if (!pending) return false;
  const target = state.board[row]?.[col];
  if (!isValidAbilityTarget(pending, target)) {
    state.message = "対象にできません。";
    log(state, state.message);
    return true;
  }
  const effect = abilityEffects[pending.ability.effect];
  if (effect) effect({ game: state, playerId: pending.playerId, card: pending.card, ability: pending.ability, target });
  state.pendingTarget = null;
  state.selected = null;
  completeAbilitySource(state, pending);
  processEffectQueue(state);
  syncOnlineAction("resolveTarget", pending.playerId);
  return true;
}

function mysticCaptureChoices(game = state) {
  const pending = game.pendingChoice;
  if (pending?.type !== "mysticCapture") return [];
  const player = game.players[pending.playerId];
  return player.hand
    .map((card, handIndex) => ({ card, handIndex }))
    .filter(({ card }) => card.type === "unit" && tagLabels(card).includes("神秘"));
}

function toggleMysticCaptureChoice(handIndex) {
  const pending = state.pendingChoice;
  if (pending?.type !== "mysticCapture") return;
  const choices = mysticCaptureChoices();
  if (!choices.some((choice) => choice.handIndex === handIndex)) return;
  const selected = new Set(pending.selectedHandIndexes);
  if (selected.has(handIndex)) selected.delete(handIndex);
  else selected.add(handIndex);
  pending.selectedHandIndexes = [...selected].sort((a, b) => a - b);
  state.message = `神秘捕縛: ${pending.selectedHandIndexes.length}枚選択中`;
}

function resolveMysticCaptureChoice({ exile = false } = {}) {
  const pending = state.pendingChoice;
  if (pending?.type !== "mysticCapture") return false;
  const player = state.players[pending.playerId];
  const selectedIndexes = [...pending.selectedHandIndexes].sort((a, b) => b - a);
  const selectedCards = [];
  for (const handIndex of selectedIndexes) {
    const card = player.hand[handIndex];
    if (card?.type === "unit" && tagLabels(card).includes("神秘")) {
      selectedCards.unshift(player.hand.splice(handIndex, 1)[0]);
    }
  }
  // Pay summon cost of selected cards in electric; shortfall deals core damage
  const totalSummonCost = selectedCards.reduce((sum, card) => sum + totalCostAmount(card.cost || {}), 0);
  const available = player.resources.electric || 0;
  const paid = Math.min(available, totalSummonCost);
  const shortfall = totalSummonCost - paid;
  player.resources.electric = available - paid;
  if (shortfall > 0) {
    player.core.hp -= shortfall;
    log(state, `${player.name}: 電気不足 ${shortfall} → コアに ${shortfall} ダメージ`);
    checkWinner(state);
  }

  state.pendingChoice = null;
  state.selected = null;
  for (const card of selectedCards) {
    player.dump.push(card);
    notifyDumpChanged(state, pending.playerId);
    triggerAbilities(state, pending.playerId, card, "onSummon", { zone: "dump" });
    if (exile) {
      const dumpIndex = player.dump.indexOf(card);
      if (dumpIndex >= 0) {
        player.dump.splice(dumpIndex, 1);
        notifyDumpChanged(state, pending.playerId);
      }
      player.exileZone.push(card);
      triggerAbilities(state, pending.playerId, card, "onSummon", { zone: "exile" });
    }
  }
  completeAbilitySource(state, pending.queueItem);
  state.message = `神秘捕縛: ${selectedCards.length}枚${exile ? "除外して2回発動" : "捨てて1回発動"}`;
  log(state, `${player.name}: 神秘捕縛 ${selectedCards.length}枚${exile ? " 除外" : " 捨て"} (電気 ${paid} 支払い${shortfall > 0 ? ` コアダメージ ${shortfall}` : ""})`);
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  return true;
}

function resolveSearchDeckPick(cardIndex) {
  const pending = state.pendingChoice;
  if (pending?.type !== "searchDeckPick") return false;
  if (!canControlChoicePlayer(pending.playerId)) return false;
  const player = state.players[pending.playerId];
  const card = pending.candidates[cardIndex];
  if (!card) return false;
  const deckIdx = player.mainDeck.indexOf(card);
  if (deckIdx < 0) {
    state.message = "そのカードはもうデッキにありません。";
    return false;
  }
  const [picked] = player.mainDeck.splice(deckIdx, 1);
  player.hand.push(picked);
  const qi = pending.queueItem;
  state.pendingChoice = null;
  state.selected = null;
  log(state, `${player.name}: 「${picked.name}」を手札に加えた`);
  completeAbilitySource(state, qi);
  resumePendingAfterChoice();
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  return true;
}

function resolveRevealPick(cardIndex) {
  const pending = state.pendingChoice;
  if (pending?.type !== "revealPick") return false;
  if (!canControlChoicePlayer(pending.playerId)) return false;
  const player = state.players[pending.playerId];
  const card = pending.revealed[cardIndex];
  if (!card) return false;
  if (pending.tagFilter && !(card.tags || []).includes(pending.tagFilter)) {
    state.message = `[${pending.tagFilter}]タグのカードのみ選択できます。`;
    return false;
  }
  pending.revealed.splice(cardIndex, 1);
  player.hand.push(card);
  const rest = pending.shuffleToBottom ? shuffleCards(pending.revealed) : pending.revealed;
  for (const c of rest) player.mainDeck.push(c);
  const qi = pending.queueItem;
  state.pendingChoice = null;
  state.selected = null;
  log(state, `${player.name}: 「${card.name}」を手札に加え、残りをデッキ下へ`);
  completeAbilitySource(state, qi);
  resumePendingAfterChoice();
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  return true;
}

function resolveRevealPickSkip() {
  const pending = state.pendingChoice;
  if (pending?.type !== "revealPick") return false;
  if (!canControlChoicePlayer(pending.playerId)) return false;
  const player = state.players[pending.playerId];
  const rest = pending.shuffleToBottom ? shuffleCards(pending.revealed) : pending.revealed;
  for (const c of rest) player.mainDeck.push(c);
  const qi = pending.queueItem;
  state.pendingChoice = null;
  state.selected = null;
  log(state, `${player.name}: カードを選ばず全てデッキ下へ`);
  completeAbilitySource(state, qi);
  resumePendingAfterChoice();
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  return true;
}

function resumePendingAttackContinuation() {
  const cont = state.pendingAttackContinuation;
  if (!cont || state.pendingChoice || state.pendingTarget) return;
  const unit = state.board[cont.attackerRow]?.[cont.attackerCol];
  if (!unit) {
    state.pendingAttackContinuation = null;
    return;
  }
  const defender = state.board[cont.defenderRow]?.[cont.defenderCol];
  const defenderAlive = defender && defender.owner !== unit.owner;

  if (defenderAlive && !cont.postPrimaryDone) {
    if (cont.damage > 0 && cont.attackerShock) defender.rested = true;
  }
  if (defenderAlive) {
    const cleaveResult = applyCleave(unit, defender, cont.cleaveDeltaIndex || 0);
    if (cleaveResult.pending) {
      state.pendingAttackContinuation = {
        ...cont,
        postPrimaryDone: true,
        attackerShock: false,
        cleaveDeltaIndex: cleaveResult.nextDeltaIndex,
      };
      return;
    }
    if (!cont.postCounterDone && canCounterAttack(defender, unit)) {
      const counterResult = dealDamageToUnit(
        state,
        unit,
        calculateAttackDamage(defender, unit),
        { source: defender },
        { cleanup: false }
      );
      if (counterResult.pending) {
        state.pendingAttackContinuation = {
          ...cont,
          postPrimaryDone: true,
          attackerShock: false,
          postCounterDone: true,
          cleaveDeltaIndex: cleaveResult.nextDeltaIndex,
        };
        return;
      }
    }
  }
  state.pendingAttackContinuation = null;
  if (cont.damage > 0) {
    for (const ability of (unit.abilities || [])) {
      if (ability.trigger === "onDamageDealt") {
        state.effectQueue.push({
          playerId: unit.owner,
          card: unit,
          ability,
          source: { zone: "board" },
          target: defenderAlive ? defender : null,
        });
      }
    }
    processEffectQueue(state);
    if (state.pendingChoice || state.pendingTarget) return;
  }
  if (defenderAlive) {
    startAttackAnimation(unit, cont.attackerRow, cont.attackerCol, cont.defenderRow, cont.defenderCol);
    log(state, `「${unit.name}」が「${defender.name}」を攻撃`);
  } else {
    log(state, `「${unit.name}」の攻撃を完了`);
  }
  afterAttack(unit);
  cleanupAllDestroyed(unit);
  syncOnlineAction("attackUnit", unit.owner);
}

function resolveDestroyEnemyStructChoice(enemyIndex) {
  const pending = state.pendingChoice;
  if (pending?.type !== "destroyEnemyStruct") return false;
  if (!canControlChoicePlayer(pending.playerId)) return false;
  const sourceCard = pending.queueItem?.card;
  const opponent = opponentOf(pending.playerId);
  if (!destroyEnemyStructAt(state, pending.playerId, opponent, enemyIndex, sourceCard, {
    fuelCost: pending.fuelCost || 0,
    cardName: pending.cardName,
  })) {
    state.message = "そのストラクトは選択できません。";
    return false;
  }
  pending.remaining -= 1;
  if (pending.remaining > 0 && getDestroyableEnemyStructEntries(state, opponent, sourceCard).length > 0) {
    state.message = `${pending.cardName}: 破壊する相手ストラクトを選択してください（残り${pending.remaining}枚）`;
    render();
    return true;
  }
  if (pending.remaining > 0) {
    log(state, `${state.players[pending.playerId].name}: これ以上破壊できる相手ストラクトがない`);
  }
  finishDestroyEnemyStructChoice();
  render();
  return true;
}

function resolveDestroyEnemyStructSkip() {
  const pending = state.pendingChoice;
  if (pending?.type !== "destroyEnemyStruct") return false;
  if (!canControlChoicePlayer(pending.playerId)) return false;
  log(state, `${state.players[pending.playerId].name}: ストラクト破壊を終了`);
  finishDestroyEnemyStructChoice();
  render();
  return true;
}

function resolveDumpWarBondReturn(pay) {
  const pending = state.pendingChoice;
  if (pending?.type !== "dumpWarBondReturn") return false;
  if (!canControlChoicePlayer(pending.playerId)) return false;
  const player = state.players[pending.playerId];
  if (pay) {
    if ((player.resources.funds || 0) < pending.amount) {
      state.message = "金が不足しています。";
      return false;
    }
    const dumpIdx = player.dump.indexOf(pending.dumpCardRef);
    if (dumpIdx >= 0) {
      const card = player.dump.splice(dumpIdx, 1)[0];
      addResources(player, pending.resource, -pending.amount);
      player.hand.push(card);
      log(state, `${player.name}: 金${pending.amount}支払い → 墓地の「${card.name}」を手札に`);
    }
  } else {
    log(state, `${player.name}: 「${pending.cardName}」の墓地回収をスキップ`);
  }
  const qi = pending.queueItem;
  state.pendingChoice = null;
  state.selected = null;
  if (qi) completeAbilitySource(state, qi);
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

function resolvePayOrDamage(payChoice) {
  const pending = state.pendingChoice;
  if (pending?.type !== "payOrDamage") return false;
  const player = state.players[pending.playerId];
  if (payChoice) {
    player.resources[pending.resource] = (player.resources[pending.resource] || 0) - pending.amount;
    log(state, `${player.name}: 「${pending.cardName}」${RESOURCE_LABELS[pending.resource]}${pending.amount}を支払う`);
  } else {
    player.core.hp -= pending.damage;
    log(state, `${player.name}: 「${pending.cardName}」支払わず → コアに${pending.damage}ダメージ`);
    checkWinner(state);
  }
  const qi = pending.queueItem;
  state.pendingChoice = null;
  state.selected = null;
  completeAbilitySource(state, qi);
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  return true;
}

function resolvePayForBuff(pay) {
  const pending = state.pendingChoice;
  if (pending?.type !== "payForBuff") return false;
  const player = state.players[pending.playerId];
  if (pay) {
    if ((player.resources[pending.resource] || 0) < pending.amount) {
      state.message = "資源が不足しています。";
      return false;
    }
    addResources(player, pending.resource, -pending.amount);
    const unit = state.board[pending.unitRow]?.[pending.unitCol];
    if (unit) {
      unit.atk = (unit.atk || 0) + (pending.atkBuff || 0);
      unit.currentHp = (unit.currentHp || 0) + (pending.hpBuff || 0);
      unit.maxHp = (unit.maxHp || unit.hp || 0) + (pending.hpBuff || 0);
      log(state, `${player.name}: 「${unit.name}」+${pending.atkBuff}/+${pending.hpBuff}の修正`);
    }
  } else {
    log(state, `${player.name}: 「${pending.cardName}」バフをスキップ`);
  }
  state.pendingChoice = null;
  state.selected = null;
  resumePendingAfterChoice();
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

function resolveRevealTagsForResources(selectedByTag) {
  const pending = state.pendingChoice;
  if (pending?.type !== "revealTagsForResources") return false;
  const player = state.players[pending.playerId];
  const count = Object.values(selectedByTag).filter((v) => v != null).length;
  const amount = count * (pending.resourcePer || 3);
  if (amount > 0) {
    for (const resource of (pending.resources || ["people", "funds"])) {
      addResources(player, resource, amount);
    }
    const names = Object.entries(selectedByTag)
      .filter(([, i]) => i != null)
      .map(([tag, i]) => pending.tagGroups.find((g) => g.tag === tag)?.cards[i]?.name || tag);
    log(state, `${player.name}: 「${pending.cardName}」見せたカード: ${names.join("、")} → 人+${amount} 金+${amount}`);
  } else {
    log(state, `${player.name}: 「${pending.cardName}」カードを見せず`);
  }
  state.pendingChoice = null;
  state.selected = null;
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

function resolveDeployHeroChooseHero(heroIdx) {
  const pending = state.pendingChoice;
  if (pending?.type !== "deployHeroFromAttack" || pending.step !== "chooseHero") return false;
  const opt = pending.heroOptions[heroIdx];
  if (!opt) return false;
  const player = state.players[pending.playerId];
  if (!canDeployHeroWithGold(player, opt, pending.goldToPay)) {
    state.message = `金${pending.goldToPay}では「${opt.card.name}」(総コスト${opt.totalCost})は出撃できません。`;
    return false;
  }
  pending.selectedHeroIdx = heroIdx;
  pending.step = "chooseCell";
  state.message = "出撃させるマスを選択してください。";
  render();
  return true;
}

function resolveDeployHeroCell(row, col) {
  const pending = state.pendingChoice;
  if (pending?.type !== "deployHeroFromAttack" || pending.step !== "chooseCell") return false;
  const isEligible = (pending.adjCells || []).some((c) => c.row === row && c.col === col);
  if (!isEligible) { state.message = "そのマスには出撃できません。"; render(); return false; }
  if (!canSummonUnitTo(pending.playerId, row)) {
    state.message = isOpponentSummonRow(pending.playerId, row)
      ? "相手のサモンフィールドには配置できません。"
      : "敵ユニットが存在する横列には配置できません。";
    render();
    return false;
  }
  const player = state.players[pending.playerId];
  const opt = pending.heroOptions[pending.selectedHeroIdx];
  if (!opt) return false;
  const goldNeeded = pending.goldToPay;
  if (!canDeployHeroWithGold(player, opt, goldNeeded)) {
    state.message = `金${goldNeeded}では「${opt.card.name}」(総コスト${opt.totalCost})は出撃できません。`;
    return false;
  }
  addResources(player, "funds", -goldNeeded);
  const heroCard = player.hand[opt.handIdx];
  player.hand.splice(opt.handIdx, 1);
  // 次の自分のフェーズ終わりに、出撃元プレイヤーの手札へ戻す
  const unit = { ...cloneCard(heroCard), instanceId: nextInstanceId++, owner: pending.playerId,
    row, col, maxHp: heroCard.hp, currentHp: heroCard.hp, rested: false,
    attacksThisTurn: 0, mobileMoveUsed: false, counters: 0,
    handOwnerId: pending.playerId, returnAtPlayer: pending.playerId, returnAtTurn: state.turn + 1 };
  commitUnitToBoard(state, unit, row, col);
  triggerAbilities(state, pending.playerId, unit, "onSummon");
  log(state, `${player.name}: 「${unit.name}」を金${goldNeeded}で出撃（次の${player.name}のフェーズ終わりに手札へ戻る）`);
  state.pendingChoice = null;
  state.selected = null;
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

function resolveDiscardForDraw(index) {
  const pending = state.pendingChoice;
  if (pending?.type !== "discardForDraw") return false;
  const player = state.players[pending.playerId];
  if (index < 0 || index >= player.hand.length) return false;
  const discarded = player.hand.splice(index, 1)[0];
  player.dump.push(discarded);
  log(state, `${player.name}: 「${discarded.name}」を捨てた`);
  drawCards(state, pending.playerId, 1);
  const drawn = player.hand[player.hand.length - 1];
  if (drawn && matchesCond(drawn, pending.bonusCond)) {
    drawCards(state, pending.playerId, 1);
    log(state, `${player.name}: [純人間]を引いたのでもう1枚ドロー`);
  }
  state.pendingChoice = null;
  state.selected = null;
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

function resolveCoreStructStartDiscard(handIndex) {
  if (!canControlActivePlayer()) return false;
  const pending = state.pendingChoice;
  if (pending?.type !== "coreStructStartDiscard") return false;
  const player = state.players[pending.playerId];
  if (handIndex === undefined || !player.hand[handIndex]) return false;
  const discarded = player.hand.splice(handIndex, 1)[0];
  player.dump.push(discarded);
  notifyDumpChanged(state, pending.playerId);
  for (const [res, amt] of Object.entries(pending.gainOnDiscard)) addResources(player, res, amt);
  const label = Object.entries(pending.gainOnDiscard).map(([r, a]) => `${RESOURCE_LABELS[r] || r}+${a}`).join("・");
  log(state, `${player.name}: 「${discarded.name}」捨て → ${label}`);
  state.pendingChoice = null;
  state.selected = null;
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

function resolveSummonToken(row, col) {
  if (!canControlActivePlayer()) return false;
  const pending = state.pendingChoice;
  if (pending?.type !== "summonToken") return false;
  if (!pending.validRows.includes(row)) return false;
  const unit = state.board[row][col];
  if (unit) {
    state.message = "そのマスは空いていません。";
    return false;
  }
  if (!canSummonUnitTo(pending.playerId, row)) {
    state.message = isOpponentSummonRow(pending.playerId, row)
      ? "相手のサモンフィールドには配置できません。"
      : "敵ユニットが存在する横列には配置できません。";
    return false;
  }
  const player = state.players[pending.playerId];
  const tokenUnit = {
    id: pending.tokenId,
    type: "unit",
    name: pending.tokenDef.name,
    faction: "ニュートラル",
    tags: [],
    cost: {},
    actCost: {},
    text: pending.tokenDef.text,
    keywords: pending.tokenDef.keywords.map((k) => ({ ...k })),
    abilities: [],
    atk: pending.tokenDef.atk,
    hp: pending.tokenDef.hp,
    instanceId: nextInstanceId++,
    owner: pending.playerId,
    row,
    col,
    maxHp: pending.tokenDef.hp,
    currentHp: pending.tokenDef.hp,
    rested: true,
    attacksThisTurn: 0,
    mobileMoveUsed: false,
    counters: 0,
    fromDump: false,
    isToken: true,
  };
  state.board[row][col] = tokenUnit;
  log(state, `${player.name}: 「${pending.tokenDef.name}」を生成`);
  state.pendingChoice = null;
  state.selected = null;
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

function resolveCoreStructStartDecline() {
  if (!canControlActivePlayer()) return false;
  const pending = state.pendingChoice;
  if (pending?.type !== "coreStructStartDiscard") return false;
  const player = state.players[pending.playerId];
  player.core.hp -= pending.hpCostOnDecline || 2;
  for (const [res, amt] of Object.entries(pending.gainOnDecline)) addResources(player, res, amt);
  const label = Object.entries(pending.gainOnDecline).map(([r, a]) => `${RESOURCE_LABELS[r] || r}+${a}`).join("・");
  log(state, `${player.name}: 手札を捨てず → コアHP-${pending.hpCostOnDecline}${label ? `、${label}` : ""}`);
  checkWinner(state);
  state.pendingChoice = null;
  state.selected = null;
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

function resolveReviveFromDump(index) {
  const pending = state.pendingChoice;
  if (pending?.type !== "reviveFromDump") return false;
  const player = state.players[pending.playerId];
  const card = pending.eligible[index];
  if (!card) return false;
  const revivedAtk = (card.atk || 0) + (card.id === "card_1753658925940" ? 1 : 0);
  const revivedHp = (card.hp || 0) + (card.id === "card_1753658925940" ? 1 : 0);
  const dumpIdx = player.dump.indexOf(card);
  if (dumpIdx >= 0) player.dump.splice(dumpIdx, 1);
  if (dumpIdx >= 0) notifyDumpChanged(state, pending.playerId);
  const playerInfo = PLAYERS[pending.playerId];
  let placed = false;
  for (let col = 0; col < COLS; col++) {
    if (!state.board[playerInfo.summonRow][col]) {
      const unit = {
        ...cloneCard(card),
        instanceId: nextInstanceId++,
        owner: pending.playerId,
        row: playerInfo.summonRow,
        col,
        atk: revivedAtk,
        hp: revivedHp,
        maxHp: revivedHp,
        currentHp: revivedHp,
        rested: true,
        attacksThisTurn: 0,
        mobileMoveUsed: false,
        counters: 0,
        fromDump: true,
      };
      if (pending.grantTag && !(unit.tags || []).includes(pending.grantTag)) {
        unit.tags = [...(unit.tags || []), pending.grantTag];
      }
      commitUnitToBoard(state, unit, playerInfo.summonRow, col);
      placed = true;
      log(state, `${player.name}: 「${card.name}」を墓地から蘇生${pending.grantTag ? `（[${pending.grantTag}]付与）` : ""}`);
      break;
    }
  }
  if (!placed) {
    log(state, `${player.name}: 場が満員のため「${card.name}」を蘇生できない`);
    player.dump.push(card);
  }
  const qi = pending.queueItem;
  state.pendingChoice = null;
  state.selected = null;
  completeAbilitySource(state, qi);
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  return true;
}

function resolveReviveFromDumpSkip() {
  const pending = state.pendingChoice;
  if (pending?.type !== "reviveFromDump") return false;
  const qi = pending.queueItem;
  state.pendingChoice = null;
  state.selected = null;
  log(state, `${state.players[pending.playerId].name}: 蘇生スキップ`);
  completeAbilitySource(state, qi);
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  return true;
}

function resolveReviveFromExile(index) {
  const pending = state.pendingChoice;
  if (pending?.type !== "reviveFromExile") return false;
  const card = pending.eligible[index];
  if (!card) return false;
  const exileOwner = card._exileOwner;
  if (exileOwner) {
    const ownerExile = state.players[exileOwner]?.exileZone || [];
    const idx = ownerExile.findIndex((c) => c.instanceId === card.instanceId);
    if (idx >= 0) ownerExile.splice(idx, 1);
  }
  const playerInfo = PLAYERS[pending.playerId];
  const player = state.players[pending.playerId];
  let placed = false;
  for (let col = 0; col < COLS; col++) {
    if (!state.board[playerInfo.summonRow][col]) {
      const unit = {
        ...cloneCard(card),
        instanceId: nextInstanceId++,
        owner: pending.playerId,
        row: playerInfo.summonRow,
        col,
        rested: false,
        attacksThisTurn: 0,
        mobileMoveUsed: false,
        counters: 0,
      };
      delete unit._exileOwner;
      commitUnitToBoard(state, unit, playerInfo.summonRow, col);
      placed = true;
      log(state, `${player.name}: 「${card.name}」を除外ゾーンから場に出す`);
      triggerAbilities(state, pending.playerId, unit, "onSummon", { zone: "exile" });
      break;
    }
  }
  if (!placed) {
    log(state, `${player.name}: 場が満員のため「${card.name}」を場に出せない`);
    player.exileZone.push(card);
  }
  state.pendingChoice = null;
  state.selected = null;
  syncOnlineAction("resolveChoice", pending.playerId);
  return true;
}

function resolveReviveFromExileSkip() {
  const pending = state.pendingChoice;
  if (pending?.type !== "reviveFromExile") return false;
  state.pendingChoice = null;
  state.selected = null;
  log(state, `${state.players[pending.playerId].name}: 除外ゾーンからの呼び出しをスキップ`);
  syncOnlineAction("resolveChoice", pending.playerId);
  return true;
}

function resolveChooseActivationResource(resource) {
  const pending = state.pendingChoice;
  if (pending?.type !== "chooseActivationResource") return false;
  const player = state.players[pending.playerId];
  if ((player.resources[resource] || 0) < pending.amount) {
    state.message = "その資源が不足しています。";
    return false;
  }
  addResources(player, resource, -pending.amount);
  const unit = state.board[pending.unitRow]?.[pending.unitCol];
  if (unit && !pending.noRest) unit.rested = true;
  const costLabel = `${RESOURCE_LABELS[resource] || resource}${pending.amount}`;
  log(state, `${player.name}: 「${unit?.name || "?"}」起動（${costLabel}）`);
  state.pendingChoice = null;
  state.selected = null;
  if (pending.abilityEffect === "restTargetNoUnrest" && unit) {
    state.pendingTarget = {
      playerId: pending.playerId,
      card: unit,
      ability: { effect: "restTargetNoUnrest", trigger: "onActivate", target: "enemyUnit" },
      source: { zone: "board" },
    };
    state.selected = { kind: "target", target: "enemyUnit" };
    state.message = `${unit.name}: レストさせる相手ユニットを選択してください。`;
  }
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

function resolveChooseGainResource(optionId) {
  const pending = state.pendingChoice;
  if (pending?.type !== "chooseGainResource") return false;
  const option = (pending.options || []).find((opt) => opt.id === optionId || opt.resource === optionId);
  if (!option) return false;
  const player = state.players[pending.playerId];
  const cost = normalizeResourceObject(option.cost || {});
  if (!pay(player, cost)) {
    state.message = "資源が不足しています。";
    return false;
  }
  for (const [res, amount] of Object.entries(option.produces || {})) {
    addResources(player, res, amount);
  }
  const qi = pending.queueItem;
  state.pendingChoice = null;
  state.selected = null;
  if (qi) completeAbilitySource(state, qi);
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

function lifeCounterMaxPay(player, targetCard, maxLifeCounters = 5) {
  const people = player.resources.people || 0;
  const costPeople = targetCard?.cost?.people || 0;
  return Math.max(0, Math.min(maxLifeCounters, people - costPeople));
}

function resolveLifeCounterPayment(amount) {
  const pending = state.pendingChoice;
  if (pending?.type !== "lifeCounterPayment") return false;
  const player = state.players[pending.playerId];
  const targetCard = player.hand[pending.targetHandIndex];
  if (!targetCard || targetCard.id !== pending.targetCard.id) {
    state.message = "対象カードが手札にありません。";
    return false;
  }
  const payAmount = Math.max(0, Math.min(
    Number(amount) || 0,
    pending.maxLifeCounters || 5,
    lifeCounterMaxPay(player, targetCard, pending.maxLifeCounters || 5),
  ));
  const placement = findSummonPlacement(state, pending.playerId, targetCard);
  if (!placement) {
    state.message = "配置できるマスがありません。";
    return false;
  }
  const { row, col } = placement;
  if (!payForCard(player, targetCard.cost || {}, targetCard)) {
    state.message = "出撃コストが不足しています。";
    return false;
  }
  player.resources.people -= payAmount;
  player.hand.splice(pending.targetHandIndex, 1);
  const unit = makeUnit(targetCard.id, pending.playerId, row, col, { rested: false });
  unit.counters = payAmount;
  unit.lifeCounterUnit = true;
  unit.abilities = [...(unit.abilities || []), { trigger: "onTurnStart", effect: "removeLifeCounterOrBottomDeck" }];
  commitUnitToBoard(state, unit, row, col);
  triggerAbilities(state, pending.playerId, unit, "onSummon");
  log(state, `${player.name}: 「${pending.cardName}」で「${targetCard.name}」を出撃（生命カウンター${payAmount}）`);
  const qi = pending.queueItem;
  state.pendingChoice = null;
  state.selected = { kind: "unit", row, col };
  completeAbilitySource(state, qi);
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

function destroyChoiceItems(pending) {
  const destroyed = [];
  const ordered = [...(pending.selected || [])].sort((a, b) => {
    const [ka, pa, ia] = a.split(":");
    const [kb, pb, ib] = b.split(":");
    if (ka === "struct" && kb === "struct" && pa === pb) return Number(ib) - Number(ia);
    return 0;
  });
  for (const key of ordered) {
    const [kind, a, b] = key.split(":");
    if (kind === "unit") {
      const row = Number(a);
      const col = Number(b);
      const unit = state.board[row]?.[col];
      if (unit) {
        unit.currentHp = 0;
        destroyed.push(unit.name);
      }
    } else if (kind === "struct") {
      const playerId = a;
      const index = Number(b);
      const player = state.players[playerId];
      const struct = player?.structs?.[index];
      if (struct) {
        player.structs.splice(index, 1);
        player.dump.push(struct);
        notifyDumpChanged(state, playerId);
        destroyed.push(struct.name);
      }
    }
  }
  cleanupAllDestroyed();
  return destroyed;
}

function toggleDestroyChoice(key) {
  const pending = state.pendingChoice;
  if (pending?.type !== "selectDestroyCards") return false;
  const selected = new Set(pending.selected || []);
  if (selected.has(key)) selected.delete(key);
  else if (selected.size < (pending.amount || 1)) selected.add(key);
  pending.selected = [...selected];
  render();
  return true;
}

function resolveDestroyChoice({ payCost = true } = {}) {
  const pending = state.pendingChoice;
  if (pending?.type !== "selectDestroyCards") return false;
  const player = state.players[pending.playerId];
  if (payCost && !pay(player, pending.cost || {})) {
    state.message = "追加コストが不足しています。";
    render();
    return false;
  }
  if (payCost) destroyChoiceItems(pending);
  const qi = pending.queueItem;
  state.pendingChoice = null;
  state.selected = null;
  completeAbilitySource(state, qi);
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

function toggleKaijuAwakenChoice(kind, value) {
  const pending = state.pendingChoice;
  if (pending?.type !== "kaijuAwaken") return false;
  if (kind === "unit") pending.selectedUnitInstanceId = pending.selectedUnitInstanceId === value ? null : value;
  if (kind === "struct") pending.selectedStructIndex = pending.selectedStructIndex === value ? null : value;
  if (kind === "hand") pending.selectedHandIndex = pending.selectedHandIndex === value ? null : value;
  render();
  return true;
}

function resolveKaijuAwakenChoice() {
  const pending = state.pendingChoice;
  if (pending?.type !== "kaijuAwaken") return false;
  const player = state.players[pending.playerId];
  const unit = unitsOwnedBy(pending.playerId).find((candidate) => candidate.instanceId === pending.selectedUnitInstanceId);
  const struct = player.structs[pending.selectedStructIndex];
  const handCard = player.hand[pending.selectedHandIndex];
  const kaiju = unitsOwnedBy(pending.playerId).find((candidate) => candidate.instanceId === pending.unitInstanceId);
  if (!unit || !struct || !handCard || !kaiju || unit.instanceId === kaiju.instanceId) {
    state.message = "ユニット・施設・手札を1枚ずつ選んでください。";
    render();
    return false;
  }
  state.board[unit.row][unit.col] = null;
  player.exileZone.push(stripRuntime(unit));
  player.exileZone.push(player.structs.splice(pending.selectedStructIndex, 1)[0]);
  player.exileZone.push(player.hand.splice(pending.selectedHandIndex, 1)[0]);
  removeKeywords(kaiju, ["immobile", "noAttack"]);
  kaiju.noRetreatUntilOpponentTurnEnd = opponentOf(pending.playerId);
  if (!state.globalEffects) state.globalEffects = [];
  state.globalEffects.push({ type: "restoreKaijuLocks", playerId: pending.playerId, instanceId: kaiju.instanceId, untilPlayerTurnEnd: opponentOf(pending.playerId) });
  const qi = pending.queueItem;
  state.pendingChoice = null;
  state.selected = { kind: "unit", row: kaiju.row, col: kaiju.col };
  completeAbilitySource(state, qi);
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", pending.playerId);
  render();
  return true;
}

// Returns the effective effect-protection level of a board unit (own keyword + adjacent aura).
function effectProtectLevel(game, unit) {
  let level = keywordValue(unit, "effectProtect");
  if (unit.row === undefined || unit.col === undefined) return level;
  for (const dc of [-1, 1]) {
    const adj = game.board[unit.row]?.[unit.col + dc];
    if (adj && adj.owner === unit.owner) {
      const aura = (adj.abilities || []).find((a) => a.effect === "grantEffectProtectToAdjacent");
      if (aura) level = Math.max(level, aura.value || 1);
    }
  }
  return level;
}

function effectPenetrateLevel(sourceCard) {
  return keywordValue(sourceCard, "effectPenetrate");
}

function canAffectUnitByEffect(game, target, sourceCard) {
  if (!target) return false;
  const protection = effectProtectLevel(game, target);
  if (protection <= 0) return true;
  return effectPenetrateLevel(sourceCard) >= protection;
}

function structTauntLevel(struct) {
  return keywordValue(struct, "structTaunt");
}

function enemyStructChoicePool(structs) {
  if (!structs.length) return [];
  const maxTaunt = Math.max(...structs.map(structTauntLevel));
  const entries = structs.map((struct, index) => ({ struct, index }));
  if (maxTaunt > 0) return entries.filter(({ struct }) => structTauntLevel(struct) >= maxTaunt);
  return entries;
}

function canDestroyEnemyStructByEffect(sourceCard, struct) {
  const protection = keywordValue(struct, "effectProtect");
  if (protection <= 0) return true;
  const penetration = keywordValue(sourceCard, "effectPenetrate");
  return penetration >= protection;
}

function getDestroyableEnemyStructEntries(game, opponentId, sourceCard) {
  const structs = game.players[opponentId]?.structs || [];
  return enemyStructChoicePool(structs).filter(({ struct }) => canDestroyEnemyStructByEffect(sourceCard, struct));
}

function isValidEnemyStructDestroyIndex(game, opponentId, structIndex, sourceCard) {
  return getDestroyableEnemyStructEntries(game, opponentId, sourceCard).some((entry) => entry.index === structIndex);
}

function offerDestroyEnemyStructChoice(game, playerId, card, ability, source, options = {}) {
  const opponent = opponentOf(playerId);
  const player = game.players[playerId];
  const amount = options.amount ?? 1;
  const fuelCost = options.fuelCost ?? 0;
  if (fuelCost > 0 && (player.resources.fuel || 0) < fuelCost) {
    log(game, `${player.name}: 燃料が不足しているため「${card?.name || "効果"}」を使えない`);
    return;
  }
  if (!game.players[opponent].structs.length) {
    log(game, `${player.name}: 相手のストラクトがないため「${card?.name || "効果"}」は破壊しなかった`);
    return;
  }
  if (!getDestroyableEnemyStructEntries(game, opponent, card).length) {
    log(game, `${player.name}: 効果で破壊できる相手ストラクトがない`);
    return;
  }
  game.pendingChoice = {
    type: "destroyEnemyStruct",
    playerId,
    cardName: card?.name || "効果",
    remaining: amount,
    fuelCost,
    queueItem: { playerId, card, ability, source },
  };
  enemyStructChoiceScroll = 0;
  game.selected = { kind: "choice", choice: "destroyEnemyStruct" };
  const remainLabel = amount > 1 ? `（残り${amount}枚）` : "";
  game.message = `${card?.name || "効果"}: 破壊する相手ストラクトを選択してください${remainLabel}`;
  return "pending";
}

function destroyEnemyStructAt(game, playerId, opponentId, structIndex, sourceCard, { fuelCost = 0, cardName = "効果" } = {}) {
  const player = game.players[playerId];
  const structs = game.players[opponentId].structs;
  if (!isValidEnemyStructDestroyIndex(game, opponentId, structIndex, sourceCard)) return false;
  if (fuelCost > 0) {
    if ((player.resources.fuel || 0) < fuelCost) return false;
    addResources(player, "fuel", -fuelCost);
  }
  const [removed] = structs.splice(structIndex, 1);
  game.players[opponentId].structDeck.push(removed);
  const fuelLabel = fuelCost > 0 ? `燃${fuelCost}支払い → ` : "";
  log(game, `${player.name}: 「${cardName}」${fuelLabel}相手の「${removed.name}」を破壊`);
  return true;
}

function finishDestroyEnemyStructChoice() {
  const pending = state.pendingChoice;
  if (pending?.type !== "destroyEnemyStruct") return false;
  const qi = pending.queueItem;
  const playerId = pending.playerId;
  state.pendingChoice = null;
  state.selected = null;
  completeAbilitySource(state, qi);
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", playerId);
  return true;
}

function isValidAbilityTarget(item, target) {
  if (!target) return false;
  if (item.ability.target === "enemyUnit" && target.owner === item.playerId) return false;
  if (item.ability.target === "friendlyUnit" && target.owner !== item.playerId) return false;
  if (!["enemyUnit", "friendlyUnit", "anyUnit"].includes(item.ability.target)) return false;
  // 効果保護チェック（敵ユニットを対象にする場合）
  if (item.ability.target === "enemyUnit" || item.ability.target === "anyUnit") {
    if (!canAffectUnitByEffect(state, target, item.card)) return false;
  }
  return true;
}

function completeAbilitySource(game, item) {
  if (item.source?.zone !== "tact") return;
  const player = game.players[item.playerId];
  const index = player.tactZone.findIndex((c) =>
    c === item.card || (item.card?.instanceId != null && c.instanceId === item.card.instanceId));
  if (index >= 0) {
    const card = player.tactZone[index];
    // 永続tactカード（text/description に「永続」や「５回目」など複数回の能力がある場合）は削除しない
    const descText = card.description || card.text || "";
    const isPermanent = card.permanentTact ||
                        descText.includes("回目") ||
                        descText.includes("永続") ||
                        descText.includes("まで") ||
                        (card.abilities || []).some((a) => a.isPermanent);
    if (!isPermanent) {
      const [removed] = player.tactZone.splice(index, 1);
      player.dump.push(removed);
      notifyDumpChanged(game, item.playerId);
    }
  }
}

function startTurn(game, playerId, options = {}) {
  game.activePlayer = playerId;
  game.phase = "structure";
  game.turnStartSummary = null;
  game.pendingStructPhase = null;
  const player = game.players[playerId];
  const resourcesBefore = { ...player.resources };
  const handBefore = player.hand.length;
  if (!game.firstDrawFiredFor) game.firstDrawFiredFor = {};
  delete game.firstDrawFiredFor[playerId];
  for (const struct of (player.structs || [])) {
    struct.hpActivatedThisTurn = false;
    struct.rested = false;
    ensureStructPhaseAbilities(struct);
  }
  for (const unit of unitsOwnedBy(playerId, game)) {
    if ((unit.lockedRestTurns || 0) > 0) {
      unit.lockedRestTurns--;
    } else {
      unit.rested = false;
    }
    unit.attacksThisTurn = 0;
    unit.mobileMoveUsed = false;
  }
  for (const [key, amount] of Object.entries(player.core.income || {})) addResources(player, key, amount);
  refreshContinuousEffects(game);
  if (!options.skipDraw) drawCards(game, playerId, player.core.draw);
  game.turnStartSequence = { playerId, resourcesBefore, handBefore, phase: "onTurnStart" };
  // onTurnStart: 全ユニット・タクトの能力をキューに積んでから一括処理
  const turnStartUnits = unitsOwnedBy(playerId, game);
  for (const unit of turnStartUnits) {
    for (const ability of unit.abilities || []) {
      if (ability.trigger === "onTurnStart") {
        game.effectQueue.push({ playerId, card: unit, ability, source: {} });
      }
    }
  }
  for (const tact of (player.tactZone || [])) {
    tact.rested = false;
    for (const ability of tact.abilities || []) {
      if (ability.trigger === "onTurnStart") {
        game.effectQueue.push({ playerId, card: tact, ability, source: {} });
      }
    }
  }
  for (const dumpCard of player.dump) {
    if (dumpCard.id === "card_1782600000000") {
      game.effectQueue.push({
        playerId,
        card: dumpCard,
        ability: { effect: "dumpWarBondReturn", resource: "funds", amount: 3 },
        source: { zone: "dump" },
      });
    }
  }
  processEffectQueue(game);
  advanceTurnStartSequence(game);
}

function advanceTurnStartSequence(game) {
  const seq = game.turnStartSequence;
  if (!seq || game.pendingChoice || game.pendingTarget) return;
  if (game.pendingStructPhase) return;

  if (seq.phase === "onTurnStart") {
    if (game.effectQueue.length) return;
    seq.phase = "onStructurePhaseStart";
    const player = game.players[seq.playerId];
    for (const ability of player.core.abilities || []) {
      if (ability.trigger === "onStructurePhaseStart") {
        game.effectQueue.push({ playerId: seq.playerId, card: player.core, ability, source: {} });
      }
    }
    if (game.effectQueue.length) {
      processEffectQueue(game);
      if (game.pendingChoice || game.pendingTarget || !game.turnStartSequence) return;
    }
    if (!game.turnStartSequence) return;
    seq.phase = "structPhase";
    finishStartTurn(game, seq.playerId, seq.resourcesBefore, seq.handBefore);
    game.turnStartSequence = null;
    return;
  }

  if (seq.phase === "onStructurePhaseStart") {
    if (game.effectQueue.length) return;
    if (!game.turnStartSequence) return;
    seq.phase = "structPhase";
    finishStartTurn(game, seq.playerId, seq.resourcesBefore, seq.handBefore);
    game.turnStartSequence = null;
  }
}

function catalogCardFor(card) {
  if (!card?.id) return null;
  return cardCatalog.structs[card.id] || cardCatalog.main[card.id] || cardCatalog.cores[card.id] || null;
}

function cardHasStructPhaseActivation(card) {
  return (card?.abilities || []).some((a) => STRUCT_PHASE_TRIGGERS.includes(a.trigger));
}

function ensureStructPhaseAbilities(card) {
  if (!card?.id || cardHasStructPhaseActivation(card)) return card;
  const catalogCard = catalogCardFor(card);
  if (!catalogCard?.abilities?.length) return card;
  const missing = catalogCard.abilities.filter((a) => STRUCT_PHASE_TRIGGERS.includes(a.trigger));
  if (!missing.length) return card;
  card.abilities = [...(card.abilities || []), ...cloneCard({ abilities: missing }).abilities];
  return card;
}

function structPhaseActivatables(player) {
  const items = [];
  (player.structs || []).forEach((card, index) => {
    ensureStructPhaseAbilities(card);
    if (cardHasStructPhaseActivation(card)) {
      items.push({ kind: "struct", index, card });
    }
  });
  (player.tactZone || []).forEach((card, index) => {
    ensureStructPhaseAbilities(card);
    if ((card.abilities || []).some((a) => a.trigger === "onStructurePhase")) {
      items.push({ kind: "tact", index, card });
    }
  });
  return items;
}

function destroyTactFromZone(game, playerId, card) {
  const player = game.players[playerId];
  const idx = player.tactZone.findIndex((c) => c.instanceId === card.instanceId);
  if (idx < 0) return false;
  const [removed] = player.tactZone.splice(idx, 1);
  triggerAbilities(game, playerId, removed, "onDestroy");
  player.dump.push(removed);
  notifyDumpChanged(game, playerId);
  return true;
}

function finishStartTurn(game, playerId, resourcesBefore, handBefore) {
  const player = game.players[playerId];
  const activatables = structPhaseActivatables(player);
  if (activatables.length > 0) {
    game.pendingStructPhase = { playerId, activatedIndexes: [], activatedTactIndexes: [], resourcesBefore, handBefore };
    game.message = `${player.name}: ストラクトフェーズ`;
  } else {
    const gained = resourceDelta(resourcesBefore, player.resources);
    const drawn = Math.max(0, player.hand.length - handBefore);
    game.turnStartSummary = {
      id: `${game.turn}-${playerId}`,
      playerId,
      playerName: player.name,
      gained,
      drawn,
      resourcesBefore,
      resourcesAfter: { ...player.resources },
    };
    game.pendingStructPhase = null;
    game.phase = "main";
    game.selected = null;
    game.message = `${player.name}: 行動してください。`;
  }
}

function activateStructHPAbility(index) {
  if (!canControlActivePlayer()) return false;
  if (state.pendingChoice) return false;
  const pending = state.pendingStructPhase;
  if (!pending) return false;
  const player = state.players[pending.playerId];
  const struct = player.structs[index];
  if (!struct) return false;
  const hpAbility = (struct.abilities || []).find((a) => a.trigger === "onStructurePhaseHP");
  if (!hpAbility) return false;
  if (struct.hpActivatedThisTurn) return false;
  if (player.core.hp <= hpAbility.hpCost) return fail("コアHPが不足しています。");
  struct.hpActivatedThisTurn = true;
  const result = abilityEffects[hpAbility.effect]?.({ game: state, playerId: pending.playerId, card: struct, ability: hpAbility });
  syncOnlineAction("activateStructHP", pending.playerId);
  render();
  return true;
}

function activateStructInPhase(index) {
  if (!canControlActivePlayer()) return false;
  if (state.pendingChoice) return false;
  const pending = state.pendingStructPhase;
  if (!pending) return false;
  if (pending.pendingResourceChoice) return false;
  if (pending.pendingEnemyStructChoice) return false;
  const player = state.players[pending.playerId];
  const struct = player.structs[index];
  if (!struct) return false;

  // マイサータなど複数激活が許可されているストラクト以外は、1度激活したら再度激活不可
  const hasMultiActivate = (struct.abilities || []).some((a) => a.multiActivate);
  if (!hasMultiActivate && pending.activatedIndexes.includes(index)) return false;

  if (!canAffordStructActivation(struct, player)) return false;
  if (!hasMultiActivate && !pending.activatedIndexes.includes(index)) {
    pending.activatedIndexes.push(index);
  }
  triggerAbilities(state, pending.playerId, struct, "onStructurePhase");
  syncOnlineAction("structActivate");
  render();
  return true;
}

function activateTactInPhase(tactIndex) {
  if (!canControlActivePlayer()) return false;
  if (state.pendingChoice) return false;
  const pending = state.pendingStructPhase;
  if (!pending) return false;
  if (pending.pendingResourceChoice) return false;
  if (pending.pendingEnemyStructChoice) return false;
  const player = state.players[pending.playerId];
  const tact = player.tactZone[tactIndex];
  if (!tact) return false;
  if (tact.rested) return false;

  const hasMultiActivate = (tact.abilities || []).some((a) => a.multiActivate);
  if (!hasMultiActivate && pending.activatedTactIndexes.includes(tactIndex)) return false;

  if (!canAffordStructActivation(tact, player)) return false;
  if (!hasMultiActivate && !pending.activatedTactIndexes.includes(tactIndex)) {
    pending.activatedTactIndexes.push(tactIndex);
  }
  triggerAbilities(state, pending.playerId, tact, "onStructurePhase");
  syncOnlineAction("tactActivate");
  render();
  return true;
}

function endStructPhase() {
  if (!canControlActivePlayer()) return false;
  if (state.pendingChoice) return false;
  const pending = state.pendingStructPhase;
  if (!pending) return false;
  if (pending.pendingResourceChoice) return false;
  if (pending.pendingEnemyStructChoice) return false;
  const player = state.players[pending.playerId];
  const gained = resourceDelta(pending.resourcesBefore, player.resources);
  const drawn = Math.max(0, player.hand.length - pending.handBefore);
  state.turnStartSummary = {
    id: `${state.turn}-${pending.playerId}`,
    playerId: pending.playerId,
    playerName: player.name,
    gained,
    drawn,
    resourcesBefore: pending.resourcesBefore,
    resourcesAfter: { ...player.resources },
  };
  state.pendingStructPhase = null;
  state.phase = "main";
  state.selected = null;
  state.message = `${player.name}: 行動してください。`;
  syncOnlineAction("structPhaseEnd");
  render();
  return true;
}

function resolveEnemyStructChoice(enemyIndex) {
  if (!canControlActivePlayer()) return;
  const pending = state.pendingStructPhase;
  const choice = pending?.pendingEnemyStructChoice;
  if (!choice) return;
  const opponent = opponentOf(pending.playerId);
  const sourceCard = choice.sourceCard || { name: choice.cardName };
  if (!destroyEnemyStructAt(state, pending.playerId, opponent, enemyIndex, sourceCard, {
    fuelCost: choice.fuelCost,
    cardName: choice.cardName,
  })) {
    state.message = "そのストラクトは選択できません。";
    render();
    return;
  }
  choice.remaining -= 1;
  if (choice.remaining > 0 && getDestroyableEnemyStructEntries(state, opponent, sourceCard).length > 0) {
    pending.pendingEnemyStructChoice = choice;
  } else {
    if (choice.remaining > 0) {
      log(state, `${state.players[pending.playerId].name}: これ以上破壊できる相手ストラクトがない`);
    }
    pending.pendingEnemyStructChoice = null;
    processEffectQueue(state);
  }
  syncOnlineAction("enemyStructChoice");
  render();
}

function resolveMarketChoice(resource) {
  if (!canControlActivePlayer()) return;
  const pending = state.pendingStructPhase;
  if (!pending?.pendingResourceChoice) return;
  const choice = pending.pendingResourceChoice;
  if (Array.isArray(choice.options)) {
    const option = choice.options.find((opt) => opt.id === resource || opt.resource === resource);
    if (!option) return;
    const player = state.players[pending.playerId];
    const cost = normalizeResourceObject(option.cost || {});
    if (!pay(player, cost)) return;
    for (const [res, amt] of Object.entries(option.produces || {})) {
      addResources(player, res, amt);
    }
    if (option.action?.effect) {
      abilityEffects[option.action.effect]?.({
        game: state,
        playerId: pending.playerId,
        card: { name: choice.cardName },
        ability: option.action,
      });
    }
    pending.pendingResourceChoice = null;
    processEffectQueue(state);
    syncOnlineAction("marketChoice");
    render();
    return;
  }
  const option = (choice.costOptions || []).find((o) => o.resource === resource);
  if (!option) return;
  const player = state.players[pending.playerId];
  if ((player.resources[option.resource] || 0) < option.amount) return;
  addResources(player, option.resource, -option.amount);
  for (const [res, amt] of Object.entries(choice.produces || {})) {
    addResources(player, res, amt);
  }
  pending.pendingResourceChoice = null;
  processEffectQueue(state);
  syncOnlineAction("marketChoice");
  render();
}

function processWarBondCountersAtTurnEnd(game, playerId) {
  const core = game.players[playerId]?.core;
  if (!core || (core.termCounter || 0) <= 0) return;
  core.termCounter -= 1;
  log(game, `${game.players[playerId].name}: 期限カウンター -1（残り${core.termCounter}）`);
  if (core.termCounter !== 0 || (core.warBondCounter || 0) <= 0) return;
  const bondAmount = core.warBondCounter;
  core.warBondCounter = 0;
  const player = game.players[playerId];
  const available = player.resources.funds || 0;
  const paid = Math.min(available, bondAmount);
  const shortfall = bondAmount - paid;
  player.resources.funds = available - paid;
  log(game, `${player.name}: 国債償還 金${bondAmount}（不足${shortfall}はLP）`);
  if (shortfall > 0) {
    player.core.hp -= shortfall;
    checkWinner(game);
  }
}

function endTurn() {
  if (!requireActivePlayerControl()) return false;
  if (state.winner) return false;
  if (state.turnStartSequence) return fail("ターン開始処理を完了してください。");
  if (state.pendingStructPhase) return fail("ストラクトフェーズを終了してください。");
  if (state.pendingChoice) return fail("選択を完了してください。");
  const endingPlayer = state.activePlayer;
  const shouldSyncOnline = app.screen === "game" && app.match.status === "online" && !applyingRemoteState;
  // 天撃効果: 指定ターン終了時に持ち主の手札へ返却
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = state.board[r]?.[c];
      if (u && u.returnAtPlayer === endingPlayer && state.turn >= u.returnAtTurn) {
        state.board[r][c] = null;
        const handOwnerId = u.handOwnerId || u.owner;
        state.players[handOwnerId].hand.push(stripRuntime(u));
        log(state, `「${u.name}」→ ${state.players[handOwnerId].name}の手札に戻る（天撃効果）`);
      }
    }
  }
  for (const unit of unitsOwnedBy(endingPlayer)) {
    if (hasKeyword(unit, "alert")) unit.rested = false;
  }
  // [降臨] healingHealOnTurnEnd: each friendly unit heals (count of 治療-tagged cards on board) × 2
  if ((state.globalEffects || []).some((e) => e.type === "healingHealOnTurnEnd" && e.playerId === endingPlayer)) {
    const allUnits = unitsOwnedBy(endingPlayer);
    const healingCount = allUnits.filter((u) => (u.tags || []).includes("治療")).length;
    if (healingCount > 0) {
      const healAmt = healingCount * 2;
      for (const unit of allUnits) {
        unit.currentHp = Math.min(unit.maxHp, unit.currentHp + healAmt);
      }
      log(state, `${state.players[endingPlayer].name}: 降臨ターン終了時回復 +${healAmt}（治療${healingCount}体）`);
    }
  }
  // onTurnEnd: trigger for all owned units (destroySelfIfUnrested, etc.)
  for (const unit of unitsOwnedBy(endingPlayer)) {
    if ((unit.abilities || []).some((a) => a.trigger === "onTurnEnd")) {
      triggerAbilities(state, endingPlayer, unit, "onTurnEnd");
    }
  }
  processWarBondCountersAtTurnEnd(state, endingPlayer);
  for (const unit of unitsOwnedBy(endingPlayer)) {
    if (unit.indestructibleUntilTurnEnd === endingPlayer) delete unit.indestructibleUntilTurnEnd;
    // ターン終了時に期間切れの一時的ability（保険金など）を削除
    if (unit.abilities) {
      unit.abilities = unit.abilities.filter((a) => a.untilPlayerTurnEnd !== endingPlayer);
    }
  }
  for (const effect of (state.globalEffects || []).filter((e) => e.type === "restoreKaijuLocks" && e.untilPlayerTurnEnd === endingPlayer)) {
    const unit = unitsOwnedBy(effect.playerId).find((candidate) => candidate.instanceId === effect.instanceId);
    if (unit) {
      ensureKeyword(unit, "immobile");
      ensureKeyword(unit, "noAttack");
      delete unit.noRetreatUntilOpponentTurnEnd;
    }
  }
  state.globalEffects = (state.globalEffects || []).filter(
    (effect) => effect.untilPlayerTurnEnd !== endingPlayer
  );
  const next = opponentOf(endingPlayer);
  if (endingPlayer === "p2") state.turn += 1;
  log(state, `${state.players[endingPlayer].name}: ターン終了`);
  startTurn(state, next);
  if (shouldSyncOnline) syncOnlineAction("endTurn", endingPlayer);
  render();
  return true;
}

function unitsOwnedBy(playerId, game) {
  const board = (game ?? state).board;
  const units = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const unit = board[row][col];
      if (unit?.owner === playerId) units.push(unit);
    }
  }
  return units;
}

const DESCENT_GOD_CARD_ID = "card_1753662603276";

function isDescentGodUnit(unit) {
  return unit?.id === DESCENT_GOD_CARD_ID
    || (unit?.abilities || []).some((a) => a.effect === "descentEffect");
}

function clearDescentGodEffects(game, playerId) {
  game.globalEffects = (game.globalEffects || []).filter(
    (e) => !(e.type === "healingHealOnTurnEnd" && e.playerId === playerId),
  );
  for (const unit of unitsOwnedBy(playerId, game)) {
    delete unit.descentReturnToHand;
  }
}

function hasDescentGodOnField(game, playerId) {
  return unitsOwnedBy(playerId, game).some((unit) =>
    unit.id === DESCENT_GOD_CARD_ID ||
    (unit.abilities || []).some((a) => a.effect === "descentEffect"),
  );
}

function applyDescentReturnBlessing(game, unit) {
  if (!unit?.owner) return;
  if (hasDescentGodOnField(game, unit.owner)) unit.descentReturnToHand = true;
}

function commitUnitToBoard(game, unit, row, col) {
  const g = game ?? state;
  unit.row = row;
  unit.col = col;
  g.board[row][col] = unit;
  applyDescentReturnBlessing(g, unit);
}

function enemyInRow(playerId, row) {
  return rowHasEnemyUnit(playerId, row);
}

function rowHasEnemyUnit(playerId, row) {
  if (row < 0 || row >= ROWS) return false;
  const enemyId = opponentOf(playerId);
  return state.board[row]?.some((unit) => unit?.owner === enemyId);
}

function canMoveUnitTo(unit, toRow) {
  if (!unit) return false;
  return !rowHasEnemyUnit(unit.owner, toRow);
}

function canSummonUnitTo(playerId, row) {
  if (isOpponentSummonRow(playerId, row)) return false;
  return !rowHasEnemyUnit(playerId, row);
}

function isOpponentSummonRow(playerId, row) {
  return row === PLAYERS[opponentOf(playerId)].summonRow;
}

function canMeetUnitStructRequirement(player, card) {
  if (!card?.requiredStructId && !card?.requiredStructName) return true;
  return player.structs.some((struct) => {
    if (card.requiredStructId && struct.id === card.requiredStructId) return true;
    return card.requiredStructName && struct.name === card.requiredStructName;
  });
}

function requiresTactSummon(card) {
  if (!card || card.type !== "unit") return false;
  if (card.summonOnlyViaTact) return true;
  const text = card.text || card.description || "";
  if (/\[降臨\]/.test(text)) return true;
  return (card.abilities || []).some((a) => a.trigger === "onSummon" && a.effect === "descentEffect");
}

function findRequiredSacrificeUnit(playerId, card) {
  if (!card?.requiredSacrificeName) return null;
  return unitsOwnedBy(playerId).find((unit) => unit.name === card.requiredSacrificeName);
}

function applyUnitSacrificeRequirement(playerId, card) {
  const sacrifice = findRequiredSacrificeUnit(playerId, card);
  if (!sacrifice) return true;
  state.board[sacrifice.row][sacrifice.col] = null;
  state.players[playerId].dump.push(stripRuntime(sacrifice));
  notifyDumpChanged(state, playerId);
  log(state, `${state.players[playerId].name}: 「${sacrifice.name}」を墓地に送った`);
  return true;
}

function placeUnitFromHand(handIndex, row, col) {
  if (!requireActivePlayerControl()) return false;
  const player = state.players[state.activePlayer];
  const card = player.hand[handIndex];
  if (!card || card.type !== "unit") return fail("ユニットカードを選択してください。");
  if (requiresTactSummon(card)) return fail(`「${card.name}」は指令カードからのみ出撃できます。`);
  if (isPlayBlockedBySadGirl(state.activePlayer, card)) return fail("This card is blocked by Unknown Sad Girl.");
  if (!canMeetUnitStructRequirement(player, card)) return fail(`${card.requiredStructName || "\u5fc5\u8981\u30b9\u30c8\u30e9\u30af\u30c8"} \u304c\u306a\u3044\u305f\u3081\u51fa\u6483\u3067\u304d\u307e\u305b\u3093\u3002`);
  if (card.requiredSacrificeName && !findRequiredSacrificeUnit(state.activePlayer, card)) return fail(`${card.requiredSacrificeName} がないため出撃できません。`);
  if (!canSummonToRow(card, player, row)) {
    return fail(isOpponentSummonRow(state.activePlayer, row)
      ? "相手のサモンフィールドには配置できません。"
      : "この行には配置できません。");
  }
  if (state.board[row][col]) return fail("このマスには既にユニットがあります。");
  if (!canSummonUnitTo(state.activePlayer, row)) {
    return fail(isOpponentSummonRow(state.activePlayer, row)
      ? "相手のサモンフィールドには配置できません。"
      : "敵ユニットが存在する横列には配置できません。");
  }
  if (!payForCard(player, card.cost, card)) return fail("資源が不足しています。");

  applyUnitSacrificeRequirement(state.activePlayer, card);
  revealCardUse(state.activePlayer, card, "summon");
  const unit = makeUnit(card.id, state.activePlayer, row, col, { rested: false });
  commitUnitToBoard(state, unit, row, col);
  player.hand.splice(handIndex, 1);
  state.selected = { kind: "unit", row, col };
  state.message = `${card.name} をサモンしました。`;
  log(state, `${player.name}: 「${card.name}」を出撃`);
  triggerAbilities(state, state.activePlayer, unit, "onSummon");
  refreshContinuousEffects(state);
  syncOnlineAction("summon", unit.owner);
  return true;
}

function canSummonToRow(card, player, row) {
  if (isOpponentSummonRow(player.id, row)) return false;
  if (row === player.summonRow) return true;
  const raidRow = player.summonRow + player.forward;
  return hasKeyword(card, "raid") && row === raidRow && !enemyInRow(player.id, raidRow);
}

function playTactFromHand(handIndex) {
  if (!requireActivePlayerControl()) return false;
  const player = state.players[state.activePlayer];
  const card = player.hand[handIndex];
  if (!card || card.type !== "tact") return fail("指令カードを選択してください。");
  if (isPlayBlockedBySadGirl(state.activePlayer, card)) return fail("This card is blocked by Unknown Sad Girl.");
  if ((state.globalEffects || []).some((effect) => effect.type === "noTact" && effect.playerId === state.activePlayer)) {
    return fail("現在、指令カードを使用できません。");
  }
  for (const ability of card.abilities || []) {
    if (ability.trigger === "onPlay" && ability.effect === "summonNamedFromHand") {
      const label = ability.cardName
        || cardCatalog.main[ability.cardId]?.name
        || cardCatalog.structs[ability.cardId]?.name
        || "指定ユニット";
      const hasTarget = player.hand.some((c) => c !== card && (
        (ability.cardId && c.id === ability.cardId) || (ability.cardName && c.name === ability.cardName)
      ));
      if (!hasTarget) return fail(`${card.name}: 手札に「${label}」が必要です。`);
    }
    if (ability.trigger === "onPlay" && ability.target) {
      const fakeItem = { ability, playerId: state.activePlayer, card };
      if (!hasValidAbilityTarget(state, fakeItem)) {
        return fail(`${card.name}: 対象がいないため使用できません。`);
      }
    }
    if (ability.trigger === "onPlay" && (ability.requireTagInHand || ability.cond)) {
      const playCond = ability.cond || { tag: ability.requireTagInHand };
      const hasMatch = player.hand.some((c) => c !== card && matchesCond(c, playCond));
      const condLabel = playCond.tag ? `[${playCond.tag}]` : `「${playCond.nameContains}」`;
      if (!hasMatch) return fail(`${card.name}: 手札に${condLabel}ユニットが必要です。`);
    }
  }
  if (!payForCard(player, card.cost, card)) return fail("資源が不足しています。");
  revealCardUse(state.activePlayer, card, "play");
  player.hand.splice(handIndex, 1);
  if (!card.instanceId) card.instanceId = nextInstanceId++;
  player.tactZone.push(card);
  if (offerIntelAgencyCancel(state.activePlayer, card)) {
    syncOnlineAction("playTact", state.activePlayer);
    return true;
  }
  finishPlayTact(state.activePlayer, card);
  syncOnlineAction("playTact", state.activePlayer);
  return true;
}

function finishPlayTact(tactOwnerId, tactCard) {
  triggerAbilities(state, tactOwnerId, tactCard, "onPlay", { zone: "tact" });
  log(state, `${state.players[tactOwnerId].name}: 「${tactCard.name}」を使用`);
}

function offerIntelAgencyCancel(tactOwnerId, tactCard) {
  const responderId = opponentOf(tactOwnerId);
  const responder = state.players[responderId];
  const hasIntel = (responder.structs || []).some((struct) => struct.id === "card_1753664241159");
  if (!hasIntel) return false;
  const canPayPeople = (responder.resources.people || 0) >= 3;
  const canPayElectric = (responder.resources.electric || 0) >= 3;
  if (!canPayPeople && !canPayElectric) return false;
  state.pendingChoice = {
    type: "intelAgencyCancel",
    playerId: responderId,
    tactOwnerId,
    tactCard,
    tactName: tactCard.name,
    preferPeople: canPayPeople,
  };
  state.message = `${responder.name}: 諜報機関で「${tactCard.name}」を無効化しますか？`;
  return true;
}

function resolveIntelAgencyCancel(useIntel) {
  const pending = state.pendingChoice;
  if (pending?.type !== "intelAgencyCancel") return false;
  const { tactOwnerId, tactCard, playerId: responderId } = pending;
  state.pendingChoice = null;
  state.selected = null;
  if (useIntel) {
    const responder = state.players[responderId];
    const cost = pending.preferPeople ? { people: 3 } : { electric: 3 };
    if (!pay(responder, cost)) {
      state.message = "資源が不足しているため無効化できません。";
      finishPlayTact(tactOwnerId, tactCard);
    } else {
      const owner = state.players[tactOwnerId];
      const index = owner.tactZone.findIndex((c) => c === tactCard || c.instanceId === tactCard.instanceId);
      if (index >= 0) {
        const [cancelled] = owner.tactZone.splice(index, 1);
        owner.dump.push(cancelled);
        notifyDumpChanged(state, tactOwnerId);
      }
      const costLabel = Object.entries(cost).map(([r, a]) => `${RESOURCE_LABELS[r] || r}${a}`).join("");
      log(state, `${responder.name}: 諜報機関で「${tactCard.name}」を無効化（${costLabel}）`);
    }
  } else {
    finishPlayTact(tactOwnerId, tactCard);
  }
  processEffectQueue(state);
  syncOnlineAction("resolveChoice", responderId);
  return true;
}

function tryCancelTactWithIntel(tactOwnerId, tactCard) {
  return offerIntelAgencyCancel(tactOwnerId, tactCard);
}

function playWildFromHand(handIndex) {
  if (!requireActivePlayerControl()) return false;
  const player = state.players[state.activePlayer];
  const card = player.hand[handIndex];
  if (!card || card.type !== "wild") return fail("ワイルドカードを選択してください。");
  if (!payForCard(player, card.cost, card)) return fail("資源が不足しています。");
  revealCardUse(state.activePlayer, card, "set");
  player.hand.splice(handIndex, 1);
  player.wildZone.push({ ...card, faceDown: true });
  state.selected = null;
  state.message = `${card.name}をワイルドゾーンにセット。`;
  triggerAbilities(state, state.activePlayer, card, "onPlay", { zone: "wild" });
  log(state, `${player.name}: 「${card.name}」をワイルドゾーンにセット`);
  syncOnlineAction("playWild", state.activePlayer);
  return true;
}

function playGrandFromHand(handIndex) {
  if (!requireActivePlayerControl()) return false;
  const player = state.players[state.activePlayer];
  const card = player.hand[handIndex];
  if (!card || card.type !== "grand") return fail("グランドカードを選択してください。");
  if (!payForCard(player, card.cost, card)) return fail("資源が不足しています。");
  revealCardUse(state.activePlayer, card, "play");
  player.hand.splice(handIndex, 1);
  player.grandZone.push(card);
  state.selected = null;
  state.message = `${card.name}をグランドゾーンにプレイ。`;
  triggerAbilities(state, state.activePlayer, card, "onPlay", { zone: "grand" });
  log(state, `${player.name}: グランド「${card.name}」を使用`);
  syncOnlineAction("playGrand", state.activePlayer);
  return true;
}

function playStruct(index) {
  if (!requireActivePlayerControl()) return false;
  const player = state.players[state.activePlayer];
  const card = player.structDeck[index];
  if (!card) return;
  if (!payForCard(player, card.cost, card)) return fail("施設のプレイコストが不足しています。");
  revealCardUse(state.activePlayer, card, "build");
  ensureStructPhaseAbilities(card);
  player.structs.push(card);
  player.structDeck.splice(index, 1);
  state.selected = null;
  log(state, `${player.name}: 「${card.name}」を建設`);
  triggerAbilities(state, state.activePlayer, card, "onPlay", { zone: "struct" });
  if (syncOnlineAction("buildStruct", state.activePlayer)) {
    attachPendingLocalPopup(state.activePlayer, card, "build");
  } else {
    app.localCardPopup = buildCardRevealPayload(state.activePlayer, card, "build", `local-build-${Date.now()}`);
  }
  return true;
}

function relocateUnit(unit, toRow, toCol, actionLabel, onlineAction) {
  if (!requireActivePlayerControl()) return false;
  if (!unit) return false;
  const player = state.players[unit.owner];
  if (unit.owner !== state.activePlayer) return fail("現在のプレイヤーのユニットではありません。");
  if (unit.rested) return fail("このユニットはレスト状態です。");
  if (hasKeyword(unit, "immobile")) return fail("このユニットは移動できません。");
  if (state.pendingChoice || state.pendingTarget) return false;
  if (toRow < 0 || toRow >= ROWS || toCol < 0 || toCol >= COLS) return fail("移動先が無効です。");
  if (!isUnitFieldCell(toRow, toCol)) return fail("その行には配置できません。");
  if (state.board[toRow][toCol]) return fail("移動先のマスが埋まっています。");
  if (!canMoveUnitTo(unit, toRow)) {
    return fail("敵ユニットが存在する横列には移動できません。");
  }
  if (!payForCard(player, unit.actCost, unit)) return fail("アクトコストが不足しています。");
  const fromRow = unit.row;
  const fromCol = unit.col;
  state.board[unit.row][unit.col] = null;
  unit.row = toRow;
  unit.col = toCol;
  state.board[unit.row][unit.col] = unit;
  if (hasKeyword(unit, "mobile") && !unit.mobileMoveUsed) {
    unit.mobileMoveUsed = true;
  } else {
    unit.rested = true;
  }
  state.selected = { kind: "unit", row: unit.row, col: unit.col };
  log(state, `${player.name}: 「${unit.name}」が${actionLabel}`);
  refreshContinuousEffects(state);
  startMoveAnimation(unit, fromRow, fromCol, toRow, toCol);
  syncOnlineAction(onlineAction, unit.owner);
  return true;
}

function moveSelectedUnit() {
  if (!requireActivePlayerControl()) return false;
  const unit = selectedUnit();
  if (!unit) return;
  const player = state.players[unit.owner];
  if (unit.owner !== state.activePlayer) return fail("現在のプレイヤーのユニットではありません。");
  if (unit.rested) return fail("このユニットはレスト状態です。");
  if (hasKeyword(unit, "immobile")) return fail("このユニットは移動できません。");
  const toRow = unit.row + player.forward;
  if (toRow < 0 || toRow >= ROWS) return fail("これ以上前進できません。");
  const candidateCols = [unit.col, unit.col - 1, unit.col + 1].filter((c) => c >= 0 && c < COLS);
  const destCol = candidateCols.find((c) => !state.board[toRow][c]);
  if (destCol == null) {
    if (rowHasEnemyUnit(unit.owner, toRow)) return fail("敵ユニットが存在する横列には前進できません。");
    return fail("前方のマスが埋まっています。");
  }
  return relocateUnit(unit, toRow, destCol, "前進", "moveUnit");
}

function retreatSelectedUnit() {
  if (!requireActivePlayerControl()) return false;
  const unit = selectedUnit();
  if (!unit) return;
  const player = state.players[unit.owner];
  if (unit.owner !== state.activePlayer) return fail("現在のプレイヤーのユニットではありません。");
  if (unit.rested) return fail("このユニットはレスト状態です。");
  if (hasKeyword(unit, "immobile")) return fail("このユニットは移動できません。");
  if (unit.noRetreatUntilOpponentTurnEnd) return fail("This unit cannot retreat now.");
  const toRow = unit.row - player.forward;
  if (toRow < 0 || toRow >= ROWS) return fail("これ以上後退できません。");
  const candidateCols = [unit.col, unit.col - 1, unit.col + 1].filter((c) => c >= 0 && c < COLS);
  const destCol = candidateCols.find((c) => !state.board[toRow][c]);
  if (destCol == null) {
    if (rowHasEnemyUnit(unit.owner, toRow)) return fail("敵ユニットが存在する横列には後退できません。");
    return fail("後方のマスが埋まっています。");
  }
  return relocateUnit(unit, toRow, destCol, "後退", "retreatUnit");
}

function activateSelectedUnit() {
  if (!requireActivePlayerControl()) return false;
  if (state.phase !== "main") return fail("メインフェーズのみ起動できます。");
  if (state.pendingChoice || state.pendingTarget) return false;
  const unit = selectedUnit();
  if (!unit) return false;
  if (unit.owner !== state.activePlayer) return fail("自分のユニットのみ起動できます。");
  if (unit.rested) return fail("レスト状態のユニットは起動できません。");
  const activateAbilities = (unit.abilities || []).filter((a) => a.trigger === "onActivate");
  if (!activateAbilities.length) return false;
  const player = state.players[state.activePlayer];
  const ability = activateAbilities[0];
  if (ability.activationCostType === "anyOne") {
    const amount = ability.activationCostAmount || 1;
    const affordable = RESOURCE_KEYS.filter((r) => (player.resources[r] || 0) >= amount);
    if (!affordable.length) return fail("支払える資源がありません。");
    state.pendingChoice = {
      type: "chooseActivationResource",
      playerId: state.activePlayer,
      amount,
      unitRow: unit.row,
      unitCol: unit.col,
      abilityEffect: ability.effect,
      noRest: ability.noRest || false,
    };
    state.selected = { kind: "choice", choice: "chooseActivationResource" };
    state.message = "支払う資源を1種類選んでください。";
    render();
    return true;
  }
  if (ability.costCounters) {
    const counterCost = ability.costCounters;
    if ((unit.counters || 0) < counterCost) return fail(`カウンターが不足しています（必要: ${counterCost}）。`);
    unit.counters -= counterCost;
    unit.atk = (unit.atk || 0) + (ability.atkBuff || 0);
    unit.currentHp = (unit.currentHp || 0) + (ability.hpBuff || 0);
    unit.maxHp = (unit.maxHp || unit.hp || 0) + (ability.hpBuff || 0);
    if (!ability.noRest) unit.rested = true;
    log(state, `${player.name}: 「${unit.name}」カウンター${counterCost}消費 → +${ability.atkBuff || 0}/+${ability.hpBuff || 0}`);
    syncOnlineAction("activateUnit", state.activePlayer);
    render();
    return true;
  }
  const cost = ability.activationCost || {};
  if (!pay(player, cost)) return fail("起動コストが不足しています。");
  if (!ability.noRest) unit.rested = true;
  const costLabel = Object.entries(cost).map(([r, a]) => `${RESOURCE_LABELS[r] || r}${a}`).join("");
  log(state, `${player.name}: 「${unit.name}」起動${costLabel ? `（${costLabel}）` : ""}`);
  triggerAbilities(state, state.activePlayer, unit, "onActivate");
  syncOnlineAction("activateUnit", state.activePlayer);
  render();
  return true;
}

function attackWithSelectedUnit(target, options = {}) {
  if (!requireActivePlayerControl()) return false;
  const unit = selectedUnit();
  if (!unit) return;
  const player = state.players[unit.owner];
  if (unit.owner !== state.activePlayer) return fail("現在のプレイヤーのユニットではありません。");
  if (unit.rested) return fail("このユニットはレスト状態です。");
  if (hasKeyword(unit, "noAttack")) return fail("このユニットは攻撃できません。");

  if (target.kind === "core") {
    const defenderId = target.playerId || opponentOf(unit.owner);
    if (defenderId === unit.owner) return fail("自分のコアは攻撃できません。");
    if (!canAttackCore(unit, defenderId)) return fail("コアへ直接攻撃できる位置ではありません。");
    if (isCoreGuardedFrom(unit, defenderId)) return fail("守護によりコアを攻撃できません。");
    if (!payAttackCosts(player, unit)) return fail("アクトコストが不足しています。");
    triggerAttackAbilities(unit);
    const defender = state.players[defenderId];
    const coreArmor = defender.core.armor || 0;
    const coreDmg = Math.max(0, unit.atk - coreArmor);
    defender.core.hp -= coreDmg;
    if (coreDmg > 0) {
      for (const ability of (unit.abilities || [])) {
        if (ability.trigger === "onDamageDealt") {
          state.effectQueue.push({ playerId: unit.owner, card: unit, ability, source: { zone: "board" } });
        }
      }
      processEffectQueue(state);
    }
    afterAttack(unit);
    log(state, `${player.name}: 「${unit.name}」がコアに${coreDmg}ダメージ${coreArmor > 0 ? `（装甲${coreArmor}軽減）` : ""}`);
    checkWinner(state);
    syncOnlineAction("attackCore", unit.owner);
    return true;
  }

  const defender = state.board[target.row]?.[target.col];
  if (!defender || defender.owner === unit.owner) return fail("攻撃対象がありません。");
  const legality = canAttackUnit(unit, defender);
  if (!legality.ok) return fail(legality.reason);
  if (!options.useChargeChosen && offerChargeAttackChoice(unit, target)) return true;
  return executeUnitAttack(unit, defender, target, { useCharge: options.useCharge });
}

function executeUnitAttack(unit, defender, target, { useCharge = false } = {}) {
  const player = state.players[unit.owner];
  if (!payAttackCosts(player, unit, { useCharge })) return fail("アクトコストが不足しています。");

  triggerAttackAbilities(unit);
  const rawDamage = calculateAttackDamage(unit, defender, { useCharge });
  const { damage, pending } = dealDamageToUnit(state, defender, rawDamage, { source: unit }, { cleanup: false });
  if (pending) {
    state.pendingAttackContinuation = {
      attackerRow: unit.row,
      attackerCol: unit.col,
      defenderRow: defender.row,
      defenderCol: defender.col,
      damage,
      attackerShock: hasKeyword(unit, "shock"),
    };
    render();
    return true;
  }
  if (damage > 0 && hasKeyword(unit, "shock")) defender.rested = true;
  const cleaveResult = applyCleave(unit, defender, 0);
  if (cleaveResult.pending) {
    state.pendingAttackContinuation = {
      attackerRow: unit.row,
      attackerCol: unit.col,
      defenderRow: defender.row,
      defenderCol: defender.col,
      damage,
      attackerShock: false,
      postPrimaryDone: true,
      cleaveDeltaIndex: cleaveResult.nextDeltaIndex,
    };
    render();
    return true;
  }
  if (canCounterAttack(defender, unit)) {
    const counterResult = dealDamageToUnit(
      state,
      unit,
      calculateAttackDamage(defender, unit),
      { source: defender },
      { cleanup: false }
    );
    if (counterResult.pending) {
      state.pendingAttackContinuation = {
        attackerRow: unit.row,
        attackerCol: unit.col,
        defenderRow: defender.row,
        defenderCol: defender.col,
        damage,
        attackerShock: false,
        postPrimaryDone: true,
        postCounterDone: true,
      };
      render();
      return true;
    }
  }
  if (damage > 0) {
    for (const ability of (unit.abilities || [])) {
      if (ability.trigger === "onDamageDealt") {
        state.effectQueue.push({ playerId: unit.owner, card: unit, ability, source: { zone: "board" }, target: defender });
      }
    }
    processEffectQueue(state);
  }
  startAttackAnimation(unit, unit.row, unit.col, defender.row, defender.col);
  afterAttack(unit);
  log(state, `「${unit.name}」が「${defender.name}」を攻撃`);
  cleanupAllDestroyed(unit);
  syncOnlineAction("attackUnit", unit.owner);
  return true;
}

function chargeAttackElectricCost(unit) {
  return hasKeyword(unit, "charge") ? totalCostAmount(unit.actCost || {}) : 0;
}

function canPayChargeAttack(player, unit) {
  const extra = chargeAttackElectricCost(unit);
  return extra > 0 && (player.resources.electric || 0) >= extra;
}

function payAttackCosts(player, unit, { useCharge = false } = {}) {
  const cost = { ...(unit.actCost || {}) };
  if (useCharge && hasKeyword(unit, "charge")) {
    cost.electric = (cost.electric || 0) + chargeAttackElectricCost(unit);
  }
  return payForCard(player, cost, unit);
}

function offerChargeAttackChoice(unit, target) {
  const player = state.players[unit.owner];
  if (!hasKeyword(unit, "charge") || !canPayChargeAttack(player, unit)) return false;
  state.pendingChoice = {
    type: "chargeAttack",
    playerId: unit.owner,
    unitRow: unit.row,
    unitCol: unit.col,
    target,
    electricCost: chargeAttackElectricCost(unit),
    unitName: unit.name,
  };
  state.selected = { kind: "choice", choice: "chargeAttack" };
  state.message = `「${unit.name}」: 帯電攻撃しますか？（電${chargeAttackElectricCost(unit)}で装甲無視）`;
  return true;
}

function resolveChargeAttack(useCharge) {
  const pending = state.pendingChoice;
  if (pending?.type !== "chargeAttack") return false;
  const unit = state.board[pending.unitRow]?.[pending.unitCol];
  const defender = state.board[pending.target.row]?.[pending.target.col];
  state.pendingChoice = null;
  state.selected = { kind: "unit", row: pending.unitRow, col: pending.unitCol };
  if (!unit || unit.owner !== pending.playerId || !defender) return false;
  return executeUnitAttack(unit, defender, pending.target, { useCharge, useChargeChosen: true });
}

function triggerAttackAbilities(unit) {
  for (const ability of unit.abilities || []) {
    if (ability.trigger === "onAttack") {
      state.effectQueue.push({ playerId: unit.owner, card: unit, ability, source: { zone: "board" } });
    }
  }
  processEffectQueue(state);
}

function afterAttack(unit) {
  unit.attacksThisTurn = (unit.attacksThisTurn || 0) + 1;
  const attackLimit = keywordValue(unit, "multiStrike", 1);
  if (unit.attacksThisTurn >= attackLimit) unit.rested = true;
}

function canAttackUnit(attacker, defender) {
  const owner = state.players[attacker.owner];
  const forwardDistance = (defender.row - attacker.row) * owner.forward;
  const maxRows = keywordValue(attacker, "arc", 1);
  if (forwardDistance < 1 || forwardDistance > maxRows) {
    return { ok: false, reason: "攻撃範囲外です。" };
  }
  if (hasKeyword(defender, "flying") && !hasKeyword(attacker, "flying") && !hasKeyword(attacker, "antiAir") && attacker.atk <= keywordValue(defender, "flying")) {
    return { ok: false, reason: "航空ユニットへ攻撃できません。" };
  }
  if (isGuardedFrom(attacker, defender)) {
    return { ok: false, reason: "守護により隣接ユニットを攻撃できません。" };
  }
  return { ok: true };
}

function isGuardedFrom(attacker, defender) {
  if (hasKeyword(attacker, "arc") || hasKeyword(attacker, "flying")) return false;
  if (hasKeyword(defender, "guard")) return false; // 守護ユニット自身は守護で守られない
  for (const delta of [-1, 1]) {
    const guardian = state.board[defender.row]?.[defender.col + delta];
    if (!guardian || guardian.owner !== defender.owner || !hasKeyword(guardian, "guard")) continue;
    // 守護ユニットが航空を持ち、攻撃者がそこへ攻撃できない場合はガード無効
    if (hasKeyword(guardian, "flying") && !hasKeyword(attacker, "flying") && !hasKeyword(attacker, "antiAir") && attacker.atk <= keywordValue(guardian, "flying")) continue;
    return true;
  }
  return false;
}

function defenderArmorValue(defender, attacker, { useCharge = false } = {}) {
  let armorVal = Math.max(keywordValue(defender, "armor"), Number(defender.armor) || 0);
  if (!(useCharge && hasKeyword(attacker, "charge"))) {
    const counterArmorGE = (state.globalEffects || []).find(
      (e) => e.type === "counterArmor" && e.playerId === defender.owner
    );
    if (counterArmorGE && (defender.counters || 0) > 0) {
      armorVal = Math.max(armorVal, counterArmorGE.armorValue || 2);
    }
  }
  return armorVal;
}

function unitHasArmorEffect(unit) {
  if (!unit) return false;
  return keywordValue(unit, "armor") > 0 || Number(unit.armor) > 0;
}

function calculateAttackDamage(attacker, defender, { useCharge = false } = {}) {
  let atk = attacker.atk || 0;
  for (const ability of attacker.abilities || []) {
    if (ability.effect === "vsTagAtkBonus" && ability.vsTag && (defender?.tags || []).includes(ability.vsTag)) {
      atk += ability.atkBonus || 1;
    }
    if (ability.effect === "vsArmorAtkBonus" && unitHasArmorEffect(defender)) {
      atk += ability.atkBonus || 1;
    }
  }
  const ignoresArmor = useCharge && hasKeyword(attacker, "charge");
  const armorVal = defenderArmorValue(defender, attacker, { useCharge });
  const armor = ignoresArmor ? 0 : Math.max(0, armorVal - keywordValue(attacker, "pierce"));
  return Math.max(0, atk - armor);
}

function canCounterAttack(defender, attacker) {
  if (defender.rested) return false;
  if (hasKeyword(attacker, "arc")) return false;
  if (hasKeyword(attacker, "flying") && !hasKeyword(defender, "flying") && defender.atk <= keywordValue(attacker, "flying")) return false;
  return true;
}

function applyCleave(attacker, defender, fromDeltaIndex = 0) {
  const cleaveDamage = keywordValue(attacker, "cleave");
  if (!cleaveDamage) return { pending: false, nextDeltaIndex: 0 };
  const deltas = [-1, 1];
  for (let i = fromDeltaIndex; i < deltas.length; i += 1) {
    const adjacent = state.board[defender.row]?.[defender.col + deltas[i]];
    if (adjacent && adjacent.owner !== attacker.owner) {
      const result = dealDamageToUnit(state, adjacent, cleaveDamage, { source: attacker }, { cleanup: false });
      if (result.pending) return { pending: true, nextDeltaIndex: i + 1 };
    }
  }
  return { pending: false, nextDeltaIndex: deltas.length };
}

function capUnitDamage(target, amount) {
  return hasKeyword(target, "oneDamage") ? Math.min(amount, 1) : amount;
}

function dealDamageToUnit(game, target, rawAmount, source = {}, options = {}) {
  if (!target || rawAmount <= 0) return { damage: 0, pending: false, blocked: false };
  const sourceCard = source?.source;
  if (options.effectAttack && sourceCard && !canAffectUnitByEffect(game, target, sourceCard)) {
    log(game, `「${target.name}」は効果保護により効果ダメージを受けない`);
    return { damage: 0, pending: false, blocked: true };
  }
  const attacker = source?.source;
  if (
    target.id === "card_1782225519182"
    && attacker
    && (attacker.tags || []).includes("アトラス北東軍")
  ) {
    return { damage: 0, pending: false };
  }
  const damage = capUnitDamage(target, rawAmount);
  target.currentHp = (target.currentHp ?? target.maxHp ?? target.hp ?? 0) - damage;
  const triggerResult = triggerAbilities(game, target.owner, target, "onDamageReceived", { ...source, damage });
  const pending = triggerResult === "pending" || !!game.pendingChoice || !!game.pendingTarget;
  cleanupAllDestroyed(options.killer ?? source?.source ?? null, game);
  return { damage, pending };
}

function runDamageAllEnemiesAndPushBack(game, playerId, ability, card, startIndex = 0, pushed = 0) {
  const opponent = opponentOf(playerId);
  const player = game.players[opponent];
  const units = unitsOwnedBy(opponent);
  for (let i = startIndex; i < units.length; i += 1) {
    const unit = units[i];
    if (!unit || unit.currentHp <= 0) continue;
    const result = dealDamageToUnit(game, unit, ability.amount || 3, { source: card }, { cleanup: false, effectAttack: true });
    if (result.pending) {
      game.pendingDamageBatch = { kind: "damageAllEnemiesAndPushBack", playerId, ability, card, startIndex: i + 1, pushed };
      return "pending";
    }
    const toRow = unit.row - player.forward;
    if (toRow >= 0 && toRow < ROWS && !game.board[toRow][unit.col]) {
      game.board[unit.row][unit.col] = null;
      unit.row = toRow;
      game.board[toRow][unit.col] = unit;
      pushed += 1;
    }
  }
  if (pushed > 0 && card?.id === "card_1755906183709") {
    const targets = unitsOwnedBy(playerId).filter((unit) => unit.instanceId !== card.instanceId);
    for (let i = 0; i < pushed && targets.length; i += 1) {
      const target = targets[i % targets.length];
      target.atk = (target.atk || 0) + 1;
      target.maxHp = (target.maxHp || target.hp || 0) + 1;
      target.currentHp = (target.currentHp || target.hp || 0) + 1;
    }
  }
  game.pendingDamageBatch = null;
  cleanupAllDestroyed(card);
}

function resumePendingDamageBatch(game = state) {
  const batch = game.pendingDamageBatch;
  if (!batch || game.pendingChoice || game.pendingTarget) return;
  if (batch.kind === "damageAllEnemiesAndPushBack") {
    const result = runDamageAllEnemiesAndPushBack(
      game,
      batch.playerId,
      batch.ability,
      batch.card,
      batch.startIndex,
      batch.pushed
    );
    if (result === "pending") return;
    game.pendingDamageBatch = null;
    processEffectQueue(game);
  }
}

function resumePendingAfterChoice() {
  resumePendingDamageBatch(state);
  resumePendingAttackContinuation();
}

function shouldDeferUnitDestruction(game, unit) {
  const pending = game.pendingChoice;
  if (!pending || !unit) return false;
  if (pending.type === "payForBuff" && pending.unitRow === unit.row && pending.unitCol === unit.col) return true;
  if (pending.type === "revealPick" && pending.queueItem?.card?.instanceId === unit.instanceId) return true;
  return false;
}

function cleanupAllDestroyed(killer = null, game) {
  const g = game ?? state;
  // 1. HP <= 0 のユニットをすべて集める
  const unitsToDestroy = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const unit = g.board[row][col];
      if (unit?.currentHp <= 0 && !unit.destroyed && !shouldDeferUnitDestruction(g, unit)) {
        unitsToDestroy.push(unit);
      }
    }
  }

  // 2. 破壊不能判定と破壊防止を先に処理
  for (const unit of unitsToDestroy) {
    if (unit.indestructibleUntilTurnEnd) {
      unit.currentHp = Math.max(1, unit.currentHp || 1);
      unit.destroyed = false;
    } else {
      const selfShieldAbility = (unit.abilities || []).find((a) => a.effect === "selfCounterDeathShield");
      if (selfShieldAbility && (unit.counters || 0) >= (selfShieldAbility.cost || 2)) {
        unit.counters -= (selfShieldAbility.cost || 2);
        unit.currentHp = Math.max(1, unit.currentHp || 1);
        unit.destroyed = false;
      } else {
        unit.destroyed = true;
      }
    }
  }

  // 3. 破壊が確定したユニットの onDestroy トリガーを実行
  for (const unit of unitsToDestroy) {
    if (unit.destroyed) {
      finalizePendingDestruction(unit, killer, g);
    }
  }

  // 4. destroyed=true のまま場に残ったゾンビを回収（旧 destroyFriendlyUnitDraw 等）
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const unit = g.board[row][col];
      if (unit?.destroyed && unit.currentHp <= 0) {
        finalizePendingDestruction(unit, killer, g);
      }
    }
  }

  refreshContinuousEffects(g);
}

function isCoreGuardedFrom(attacker, defenderPlayerId) {
  if (hasKeyword(attacker, "arc") || hasKeyword(attacker, "flying")) return false;
  const defender = state.players[defenderPlayerId];
  const row = defender.directRow;
  for (let col = 0; col < COLS; col += 1) {
    const guardian = state.board[row]?.[col];
    if (!guardian || guardian.owner !== defenderPlayerId || !hasKeyword(guardian, "guard")) continue;
    if (hasKeyword(guardian, "flying") && !hasKeyword(attacker, "flying") && !hasKeyword(attacker, "antiAir") && attacker.atk <= keywordValue(guardian, "flying")) continue;
    return true;
  }
  return false;
}

function canAttackCore(unit, corePlayerId) {
  const owner = state.players[unit.owner];
  const defenderId = corePlayerId || opponentOf(unit.owner);
  const defenderInfo = PLAYERS[defenderId];
  const inDirectRow = owner.forward < 0 ? unit.row <= owner.directRow : unit.row >= owner.directRow;
  if (inDirectRow) return true;
  const arcRange = keywordValue(unit, "arc", 0);
  if (arcRange < 1) return false;
  const forwardDistance = (state.players[defenderId].coreRow - unit.row) * owner.forward;
  const coreDepthBeyondFront = (defenderInfo.summonRow - defenderInfo.coreRow) * defenderInfo.forward;
  return forwardDistance >= 1 && forwardDistance <= arcRange + coreDepthBeyondFront;
}

function canTargetCore(attacker, corePlayerId) {
  if (!attacker || attacker.owner !== state.activePlayer) return false;
  if (corePlayerId === attacker.owner) return false;
  if (attacker.rested || hasKeyword(attacker, "noAttack")) return false;
  if (!canAttackCore(attacker, corePlayerId)) return false;
  if (isCoreGuardedFrom(attacker, corePlayerId)) return false;
  return true;
}

function cleanupDestroyed(unit, killer = null) {
  if (!unit || unit.currentHp > 0) return;
  if (unit.destroyed) return;
  if (unit.indestructibleUntilTurnEnd) {
    unit.currentHp = Math.max(1, unit.currentHp || 1);
    log(state, `「${unit.name}」は破壊不能で場に残った`);
    return;
  }
  // 自身のカウンターによる破壊防止（唯字の騎士など）
  const selfShieldAbility = (unit.abilities || []).find((a) => a.effect === "selfCounterDeathShield");
  if (selfShieldAbility && (unit.counters || 0) >= (selfShieldAbility.cost || 2)) {
    unit.counters -= (selfShieldAbility.cost || 2);
    unit.currentHp = Math.max(1, unit.currentHp || 1);
    log(state, `「${unit.name}」唯字論カウンター${selfShieldAbility.cost || 2}消費: 破壊を防いだ`);
    return;
  }
  unit.destroyed = true;
  finalizePendingDestruction(unit, killer);
}

function finalizePendingDestruction(unit, killer = null, game) {
  const g = game ?? state;
  if (!unit || !unit.destroyed || unit._finalizing) return;
  unit._finalizing = true;
  const { row, col } = unit;
  g.board[row][col] = null;
  triggerAbilities(g, unit.owner, unit, "onDestroy");
  if (isDescentGodUnit(unit)) clearDescentGodEffects(g, unit.owner);
  triggerAbilities(g, unit.owner, g.players[unit.owner].core, "onFriendlyUnitDestroyed", { target: unit });
  for (let r = 0; r < g.board.length; r += 1) {
    for (let c = 0; c < (g.board[r] || []).length; c += 1) {
      const ally = g.board[r]?.[c];
      if (ally && ally.owner === unit.owner) {
        triggerAbilities(g, unit.owner, ally, "onFriendlyUnitDestroyed", { target: unit });
      }
    }
  }
  // [降臨] descentReturnToHand: blessed units return to hand instead of dump
  if (unit.descentReturnToHand) {
    g.players[unit.owner].hand.push(stripRuntime(unit));
    log(g, `${unit.name} → 手札に戻る（降臨効果）`);
  } else {
    g.players[unit.owner].dump.push(stripRuntime(unit));
    notifyDumpChanged(g, unit.owner);
    log(g, `「${unit.name}」が破壊された`);
  }
  if (g.selected?.row === row && g.selected?.col === col) g.selected = null;
  // notify structs always; notify only the killing unit (or all units if no specific killer)
  const enemyId = opponentOf(unit.owner);
  for (const struct of g.players[enemyId].structs) {
    triggerAbilities(g, enemyId, struct, "onDestroyEnemyUnit", { target: unit });
  }
  for (const tact of g.players[enemyId].tactZone || []) {
    triggerAbilities(g, enemyId, tact, "onDestroyEnemyUnit", { target: unit });
  }
  if (killer && killer.owner === enemyId) {
    triggerAbilities(g, enemyId, killer, "onDestroyEnemyUnit", { target: unit });
  } else if (!killer) {
    for (const enemyUnit of unitsOwnedBy(enemyId, g)) {
      triggerAbilities(g, enemyId, enemyUnit, "onDestroyEnemyUnit", { target: unit });
    }
  }
  const blast = keywordValue(unit, "selfDestruct");
  if (blast) {
    for (const [adjRow, adjCol] of adjacentCells(row, col)) {
      const adjacent = g.board[adjRow]?.[adjCol];
      if (adjacent) dealDamageToUnit(g, adjacent, blast, { source: unit }, { cleanup: false, effectAttack: true });
    }
    cleanupAllDestroyed(null, g);
  }
}

function adjacentCells(row, col) {
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ].filter(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS);
}

function stripRuntime(unit) {
  const copy = { ...unit };
  delete copy.owner;
  delete copy.row;
  delete copy.col;
  delete copy.rested;
  delete copy.instanceId;
  delete copy.currentHp;
  delete copy.maxHp;
  delete copy.descentReturnToHand;
  return copy;
}

function checkWinner(game) {
  for (const playerId of ["p1", "p2"]) {
    if (game.players[playerId].core.hp <= 0) {
      game.winner = opponentOf(playerId);
      game.message = `${game.players[game.winner].name} wins`;
      log(game, game.message);
    }
  }
}

function selectedUnit() {
  if (state.selected?.kind !== "unit") return null;
  return state.board[state.selected.row]?.[state.selected.col];
}

function selectedHandCard() {
  if (state.selected?.kind !== "hand") return null;
  const playerId = state.selected.playerId || viewerPlayerId();
  return state.players[playerId]?.hand[state.selected.index] || null;
}

function selectedStructDeckCard() {
  if (state.selected?.kind !== "structDeck") return null;
  const playerId = state.selected.playerId || viewerPlayerId();
  return state.players[playerId]?.structDeck[state.selected.index] || null;
}

function selectedPlayableCard() {
  return selectedHandCard() || selectedStructDeckCard();
}

function selectedFieldCard() {
  const selected = state.selected;
  if (!selected?.detailOpen) return null;
  if (selected.kind === "unit") return state.board[selected.row]?.[selected.col] || null;
  if (selected.kind === "fieldStruct") return state.players[selected.playerId]?.structs[selected.index] || null;
  return null;
}

function buildCardRevealPayload(playerId, card, source = "play", id = null) {
  return {
    id: id || `${state.turn}-${state.cardRevealSeq}-${playerId}-${card.id || card.name}`,
    playerId,
    playerName: state.players[playerId]?.name || playerId,
    source,
    card: {
      id: card.id || null,
      name: card.name,
      type: card.type,
      faction: card.faction || "ニュートラル",
      tags: tagLabels(card),
      cost: card.cost || {},
      actCost: card.actCost || null,
      atk: card.atk ?? null,
      hp: card.hp ?? card.maxHp ?? null,
      currentHp: card.currentHp ?? null,
      maxHp: card.maxHp ?? null,
      keywords: keywordLabels(card),
      abilityText: abilityText(card),
      text: card.text || card.flavor || "",
      image: cardImageSource(card),
    },
  };
}

function revealCardUse(playerId, card, source = "play") {
  if (!card) return;
  state.cardRevealSeq = (state.cardRevealSeq || 0) + 1;
  state.cardReveal = buildCardRevealPayload(playerId, card, source);
}

function dismissCardReveal() {
  if (app.localCardPopup) {
    app.localCardPopup = null;
    return;
  }
  const id = state.cardReveal?.id;
  if (id && !app.dismissedCardRevealIds.includes(id)) app.dismissedCardRevealIds.push(id);
  app.dismissedCardRevealIds = app.dismissedCardRevealIds.slice(-24);
}

function useSelectedPlayableCard() {
  if (!requireActivePlayerControl()) return false;
  const selected = state.selected;
  const card = selectedPlayableCard();
  if (!card || !selected) return false;
  if (selected.playerId && selected.playerId !== viewerPlayerId()) return false;
  if (selected.kind === "structDeck") return playStruct(selected.index);
  if (selected.kind !== "hand") return false;
  if (card.type === "tact") return playTactFromHand(selected.index);
  if (card.type === "wild") return playWildFromHand(selected.index);
  if (card.type === "grand") return playGrandFromHand(selected.index);
  if (card.type === "unit") {
    if (requiresTactSummon(card)) return fail(`「${card.name}」は指令カードからのみ出撃できます。`);
    state.selected = { ...selected, confirmed: true };
    state.message = `${card.name}: 配置するサモンフィールドを選択してください。`;
    return true;
  }
  return false;
}

const useSelectedHandCard = useSelectedPlayableCard;

function fail(message) {
  state.message = message;
  log(state, message);
  return false;
}

function log(game, message) {
  game.log.unshift(message);
  game.log = game.log.slice(0, 7);
}

function formatCost(cost = {}) {
  const parts = Object.entries(cost)
    .filter(([, amount]) => amount)
    .map(([key, amount]) => `${RESOURCE_LABELS[key]}${amount}`);
  return parts.length ? parts.join(" ") : "無料";
}

function deckAnalysis() {
  const mainCards = app.deck.main.map((id) => cardCatalog.main[id]).filter(Boolean);
  const structCards = app.deck.struct.map((id) => cardCatalog.structs[id]).filter(Boolean);
  const core = cardCatalog.cores[app.deck.core] || cardCatalog.cores[DEFAULT_CORE_ID];
  const typeCounts = {};
  const tagCounts = {};
  const costTotals = emptyResources();
  const incomeTotals = emptyResources();
  const warnings = [];

  for (const card of mainCards) {
    typeCounts[card.type] = (typeCounts[card.type] || 0) + 1;
    for (const tag of tagLabels(card)) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    for (const [key, amount] of Object.entries(card.cost || {})) costTotals[key] += amount || 0;
  }

  for (const card of structCards) {
    typeCounts.struct = (typeCounts.struct || 0) + 1;
    for (const ability of card.abilities || []) {
      if (ability.effect === "produceResource") incomeTotals[ability.resource] += ability.amount || 0;
    }
  }

  const deckMin = core.deckMin || core.deckSize || 40;
  const deckMax = core.deckMax || core.deckSize || 60;
  if (mainCards.length < deckMin) warnings.push(`メイン ${deckMin - mainCards.length}枚不足`);
  if (mainCards.length > deckMax) warnings.push(`メイン ${mainCards.length - deckMax}枚超過`);
  const nonNeutralFactions = new Set(mainCards.map((card) => card.faction).filter((faction) => faction && faction !== "ニュートラル"));
  if (nonNeutralFactions.size > 2) warnings.push(`非中立陣営 ${nonNeutralFactions.size}/2`);
  for (const entry of groupedCardEntries(app.deck.main, cardCatalog.main)) {
    const maxCopies = hasKeyword(entry.card, "legendary") ? 1 : 4;
    if (entry.count > maxCopies) warnings.push(`${entry.card.name} ${entry.count}/${maxCopies}`);
  }

  if (core.deckRestriction) {
    const restrictedCount = countDeckRestrictionCards(mainCards, core.deckRestriction);
    const need = core.deckRestriction.minCount || 20;
    if (restrictedCount < need) {
      warnings.push(`コア条件: 対象カード ${restrictedCount}/${need}枚`);
    }
  }
  for (const issue of coreDeckRequirementIssues(core, app.deck.main)) {
    warnings.push(`コア条件: ${issue}`);
  }

  const compatibilityWarnings = [];
  const compatibilitySeen = new Set();
  for (const card of [core, ...mainCards, ...structCards]) {
    if (!card?.id || card.fixture || compatibilitySeen.has(card.id)) continue;
    if (!card.compatibilityIssues?.length) continue;
    compatibilitySeen.add(card.id);
    compatibilityWarnings.push(`⚠ ${card.name}: ${compatibilityWarningForCard(card)}`);
  }

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .slice(0, 4)
    .map(([tag, count]) => `${tag}${count}`);

  return { typeCounts, topTags, costTotals, incomeTotals, warnings, compatibilityWarnings };
}

function formatResourceTotals(resources) {
  return RESOURCE_KEYS.filter((key) => resources[key])
    .map((key) => `${RESOURCE_LABELS[key]}${resources[key]}`)
    .join(" ") || "なし";
}

function getPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * W;
  const y = ((event.clientY - rect.top) / rect.height) * H;
  return { x, y };
}

function consumeFieldDoubleClick(key) {
  const now = performance.now();
  const last = app.lastFieldClick;
  const isDouble = last?.key === key && now - last.time <= 360;
  app.lastFieldClick = { key, time: now };
  return isDouble;
}

canvas.addEventListener("pointermove", (event) => {
  const point = getPointer(event);
  let found = null;
  for (let i = hoverRegions.length - 1; i >= 0; i -= 1) {
    const r = hoverRegions[i];
    if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) {
      found = { card: r.card, mx: point.x, my: point.y };
      break;
    }
  }
  const changed = appHoveredCard?.card !== found?.card;
  appHoveredCard = found;
  if (changed) render();
});

canvas.addEventListener("pointerleave", () => {
  if (appHoveredCard) {
    appHoveredCard = null;
    render();
  }
});

canvas.addEventListener("pointerdown", (event) => {
  if (state.winner && app.screen === "game") return;
  const point = getPointer(event);
  for (let i = hitRegions.length - 1; i >= 0; i -= 1) {
    const region = hitRegions[i];
    if (point.x >= region.x && point.x <= region.x + region.w && point.y >= region.y && point.y <= region.y + region.h) {
      const beforeState = app.screen === "game" && app.match.status === "online" ? serializeGameState() : null;
      const beforeOpId = queuedOnlineAction?.opId || null;
      try {
        region.onClick();
      } catch (e) {
        console.error("onClick error:", e);
        state.message = "error: " + e.message;
      }
      const queuedOp = queuedOnlineAction?.opId && queuedOnlineAction.opId !== beforeOpId;
      if (queuedOp && beforeState) {
        const pending = queuedOnlineAction;
        applyRemoteGameState(beforeState);
        queuedOnlineAction = pending;
        app.match.pendingOpId = pending.opId;
        state.message = "SERVER PROCESSING...";
      } else {
        broadcastOnlineState();
      }
      render();
      return;
    }
  }
});

canvas.addEventListener(
  "wheel",
  (event) => {
    const point = getPointer(event);
    for (let i = wheelRegions.length - 1; i >= 0; i -= 1) {
      const region = wheelRegions[i];
      if (point.x >= region.x && point.x <= region.x + region.w && point.y >= region.y && point.y <= region.y + region.h) {
        event.preventDefault();
        region.onWheel(event.deltaY);
        render();
        return;
      }
    }
  },
  { passive: false },
);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && app.deckBuilder.searchFocused) {
    app.deckBuilder.searchFocused = false;
    searchInput.blur();
    render();
    return;
  }
  if (event.key === "Escape" && app.match.roomCodeFocused) {
    app.match.roomCodeFocused = false;
    roomCodeInput.blur();
    render();
    return;
  }
  if (event.key.toLowerCase() === "f" && !app.deckBuilder.searchFocused) toggleFullscreen();
});

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function addHit(x, y, w, h, onClick) {
  hitRegions.push({ x, y, w, h, onClick });
}

function addCardHover(x, y, w, h, card) {
  hoverRegions.push({ x, y, w, h, card });
}

function addWheelRegion(x, y, w, h, onWheel) {
  wheelRegions.push({ x, y, w, h, onWheel });
}

function render() {
  hitRegions.length = 0;
  hoverRegions.length = 0;
  wheelRegions.length = 0;
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  if (app.screen === "login") return drawLoginScreen();
  if (app.screen === "home") return drawHomeScreen();
  if (app.screen === "deckBuilder") return drawDeckBuilderScreen();
  if (app.screen === "matchLobby") return drawMatchLobbyScreen();
  drawHeader();
  const viewer = viewerPlayerId();
  const opp = opponentOf(viewer);
  // 相手エリア (上から: 手札 → struct zone → board)
  drawTopHand();
  drawStructZoneRow(opp,    layout.oppStruct, true);
  drawBoard();
  drawBoardActionButtons();
  // 自分エリア (board → struct zone → hand)
  drawStructZoneRow(viewer, layout.playerStruct, false);
  drawHand();
  drawActionPanel();
  drawLog();
  drawAnimations();
  drawStructPhaseOverlay();
  drawChoiceOverlay();
  drawHandConfirmOverlay();
  drawFieldCardDetailOverlay();
  drawCardRevealOverlay();
  drawZoneViewerOverlay();
  drawOnlinePendingOverlay();
  if (appHoveredCard) drawCardTooltip(appHoveredCard.card, appHoveredCard.mx, appHoveredCard.my);
}

function drawBackground() {
  // Base dark gradient (dark teal-green: 紺に緑を混ぜて目に優しく)
  const grd = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.8);
  grd.addColorStop(0, "#0a1810");
  grd.addColorStop(0.5, "#070e0a");
  grd.addColorStop(1, "#030605");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Field zone tints (only during game)
  if (app.screen === "game" || app.screen === undefined) {
    const bx = layout.board.x, by = layout.board.y;
    const bw = layout.board.w, bh = layout.board.h;
    const midY = by + bh / 2;
    const mg = 3; // board margin (battlefield frame)
    // Battlefield base — clearly distinct from the outer UI background
    ctx.fillStyle = "rgba(18,32,22,0.96)";
    ctx.fillRect(bx + mg, by + mg, bw - mg * 2, bh - mg * 2);
    // Opponent field - crimson tint
    const oppGrd = ctx.createLinearGradient(0, by, 0, midY);
    oppGrd.addColorStop(0, "rgba(90,14,14,0.22)");
    oppGrd.addColorStop(1, "rgba(60,10,10,0.06)");
    ctx.fillStyle = oppGrd;
    ctx.fillRect(bx + mg, by + mg, bw - mg * 2, midY - by - mg);
    // Player field - green tint
    const playerGrd = ctx.createLinearGradient(0, midY, 0, by + bh);
    playerGrd.addColorStop(0, "rgba(14,80,40,0.08)");
    playerGrd.addColorStop(1, "rgba(10,60,30,0.20)");
    ctx.fillStyle = playerGrd;
    ctx.fillRect(bx + mg, midY, bw - mg * 2, bh / 2 - mg);
    // Battlefield border
    ctx.save();
    ctx.strokeStyle = "rgba(60,110,80,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + mg, by + mg, bw - mg * 2, bh - mg * 2);
    ctx.restore();
    // Row divider lines inside board
    ctx.strokeStyle = "rgba(40,90,60,0.18)";
    ctx.lineWidth = 1;
    for (let r = 1; r < ROWS; r++) {
      const ry = by + r * layout.cell.h;
      ctx.beginPath(); ctx.moveTo(bx, ry); ctx.lineTo(bx + bw, ry); ctx.stroke();
    }
    // Column divider lines inside board
    ctx.strokeStyle = "rgba(40,90,60,0.12)";
    for (let c = 1; c < COLS; c++) {
      const cx2 = bx + c * layout.cell.w;
      ctx.beginPath(); ctx.moveTo(cx2, by); ctx.lineTo(cx2, by + bh); ctx.stroke();
    }
  }

  // Hex grid overlay (subtle teal)
  ctx.strokeStyle = "rgba(40, 100, 60, 0.05)";
  ctx.lineWidth = 1;
  const hex = 40;
  const hh = hex * Math.sqrt(3) / 2;
  for (let row = -1; row < H / hh + 2; row++) {
    for (let col = -1; col < W / (hex * 1.5) + 2; col++) {
      const ox = col * hex * 1.5;
      const oy = row * hh * 2 + (col % 2 === 0 ? 0 : hh);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i - Math.PI / 6;
        const px = ox + hex * 0.9 * Math.cos(angle);
        const py = oy + hex * 0.9 * Math.sin(angle);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  // Ambient glow top-center
  const topGlow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 380);
  topGlow.addColorStop(0, "rgba(200, 50, 30, 0.10)");
  topGlow.addColorStop(1, "transparent");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, H);
  // Ambient glow bottom-center (自陣=緑)
  const botGlow = ctx.createRadialGradient(W / 2, H, 0, W / 2, H, 380);
  botGlow.addColorStop(0, "rgba(20, 130, 60, 0.10)");
  botGlow.addColorStop(1, "transparent");
  ctx.fillStyle = botGlow;
  ctx.fillRect(0, 0, W, H);
}

function drawAppTitle(subtitle) {
  ctx.save();
  ctx.shadowColor = "#2060ff";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#b0ccff";
  ctx.font = "700 32px 'Yu Gothic UI', sans-serif";
  ctx.fillText("Threads World Card Game", 72, 66);
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.font = "600 16px 'Yu Gothic UI', sans-serif";
  ctx.fillStyle = "rgba(140,170,230,0.7)";
  ctx.fillText(subtitle, 74, 96);
}

function drawLoginScreen() {
  drawAppTitle("ログインしてデッキ構築と対戦を開始");
  ctx.save();
  ctx.shadowColor = "#2060ff";
  ctx.shadowBlur = 20;
  roundRect(410, 190, 620, 420, 12, "rgba(6,8,22,0.97)", "rgba(40,80,200,0.6)", 2);
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.fillStyle = "#c0d8ff";
  ctx.font = "700 26px 'Yu Gothic UI', sans-serif";
  ctx.fillText("ログイン", 472, 258);
  ctx.font = "600 14px 'Yu Gothic UI', sans-serif";
  ctx.fillStyle = "rgba(140,170,230,0.8)";
  ctx.fillText("Google Identity Services 接続前のデモログインです。", 474, 292);
  ctx.fillText("認証情報を設定すると、この入口を本物のGoogleログインに差し替えられます。", 474, 314, 558);
  ctx.fillText(
    googleSignInEnabled ? "Google OAuth: 設定済み" : app.auth.message || "Google OAuth: GOOGLE_CLIENT_ID 未設定",
    474, 344,
  );
  drawButton(474, 378, 492, 48, googleSignInEnabled ? "Googleでログイン" : "Google設定を確認", signInWithGoogle, null, { accent: "p1" });
  drawButton(474, 436, 492, 48, "ゲストで開始", signInAsGuest);
}

function drawHomeScreen() {
  drawAppTitle("ホーム");
  drawUserBadge();
  ctx.save();
  ctx.shadowColor = "#1040c0";
  ctx.shadowBlur = 16;
  roundRect(260, 190, 920, 420, 12, "rgba(6,8,22,0.97)", "rgba(30,70,180,0.5)", 1.5);
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.fillStyle = "#c0d8ff";
  ctx.font = "700 24px 'Yu Gothic UI', sans-serif";
  ctx.fillText("次に行う操作を選択", 320, 254);
  ctx.font = "600 14px 'Yu Gothic UI', sans-serif";
  ctx.fillStyle = "rgba(140,170,230,0.75)";
  ctx.fillText(`コア ${cardCatalog.cores[app.deck.core]?.name || app.deck.core} / メイン ${app.deck.main.length}枚 / 施設 ${app.deck.struct.length}枚`, 322, 284);
  drawButton(320, 344, 240, 52, "デッキビルダー", openDeckBuilder);
  drawButton(600, 344, 240, 52, "試合ロビー", openMatchLobby);
  drawButton(880, 344, 240, 52, "ローカル対戦開始", startLocalMatch, null, { accent: "p1" });
  drawButton(320, 452, 240, 42, "ログアウト", signOut);
}

function drawUserBadge() {
  roundRect(1040, 42, 320, 54, 8, "rgba(8,12,30,0.85)", "rgba(40,80,180,0.4)", 1.5);
  ctx.fillStyle = "#b0ccf0";
  ctx.font = "700 15px 'Yu Gothic UI', sans-serif";
  ctx.fillText(app.auth.name, 1058, 68);
  ctx.fillStyle = "rgba(100,130,200,0.7)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(app.auth.provider === "google" ? (app.auth.demo ? "Google デモログイン" : "Googleログイン") : "ゲスト", 1058, 86);
}

function drawDeckBuilderScreen() {
  drawAppTitle("デッキビルダー");
  drawUserBadge();
  // Header button row
  const btnY = 118;
  drawButton(74, btnY, 108, 32, "ホーム", () => (app.screen = "home"));
  drawButton(192, btnY, 108, 32, "名前保存", () => saveDeck());
  drawButton(310, btnY, 108, 32, "初期化", resetDeckBuilder);
  drawButton(428, btnY, 118, 32, "テストドロー", testDrawDeck);
  drawButton(556, btnY, 108, 32, "出力", exportDeck);
  drawButton(674, btnY, 108, 32, "試合へ", openMatchLobby, null, { accent: "p1" });
  drawButton(792, btnY, 154, 32, "Deckmaker読込", importDeckmakerDeckFile);
  drawButton(956, btnY, 154, 32, "Deckmaker出力", exportDeckmakerAllData);
  drawButton(1120, btnY, 154, 32, "画像なし出力", exportNoImageCustomCards);
  drawButton(74, btnY + 38, 150, 32, "不足データDL", exportIncompleteCardData);
  drawButton(234, btnY + 38, 118, 32, "カード再同期", () => {
    loadFirebaseCardsIntoCatalog().then(() => render());
  });

  const syncStatus = app.cardSync?.status === "loading"
    ? "カード同期中…"
    : app.cardSync?.status === "ok"
      ? `Firebase同期済 (${app.cardSync.count}枚)`
      : app.cardSync?.status === "error"
        ? "Firebase同期失敗"
        : "";
  if (syncStatus) {
    ctx.fillStyle = app.cardSync?.status === "error" ? "#ff9090" : "rgba(140,180,240,0.75)";
    ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
    ctx.fillText(syncStatus, 360, btnY + 58, 1060);
  }

  roundRect(58, 178, 500, 646, 10, "rgba(14,22,50,0.96)", "rgba(50,90,220,0.6)", 1.5);
  roundRect(572, 178, 442, 646, 10, "rgba(14,22,50,0.96)", "rgba(50,90,220,0.6)", 1.5);
  roundRect(1028, 178, 340, 646, 10, "rgba(14,22,50,0.96)", "rgba(50,90,220,0.6)", 1.5);

  drawDeckListPanel(84, 216);
  drawCardLibraryPanel(600, 216);
  drawDeckAnalysisPanel(1056, 216);
  drawCardDetailOverlay();
  drawCoreDropdownOverlay();
  if (appHoveredCard) drawCardTooltip(appHoveredCard.card, appHoveredCard.mx, appHoveredCard.my);
}

function drawCoreDropdownOverlay() {
  if (!app.deckBuilder.coreDropdownOpen) return;
  const layout = getDeckListCoreDropdownLayout();
  const { x, ddX, ddY, ddW, ddH } = layout;
  const coreList = Object.values(cardCatalog.cores);
  const itemH = 36;
  const listH = coreList.length * itemH;
  const listY = ddY + ddH + 2;
  roundRect(ddX, listY, ddW, listH, 8, "rgba(6,8,22,0.98)", "rgba(40,80,200,0.5)", 1.5);
  coreList.forEach((core, i) => {
    const iy = listY + i * itemH;
    const isActive = core.id === app.deck.core;
    if (isActive) roundRect(ddX + 2, iy + 2, ddW - 4, itemH - 4, 4, "rgba(40,80,180,0.5)", null);
    ctx.fillStyle = isActive ? "#c0d8ff" : "rgba(140,170,220,0.8)";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText(`${core.name}  初${core.initialHand}/引${core.draw}/上${core.handLimit}  HP${core.hp}`, ddX + 10, iy + 23, ddW - 40);
    addHit(ddX, iy, ddW, itemH, () => { selectCoreCard(core.id); app.deckBuilder.coreDropdownOpen = false; });
    addCardHover(ddX, iy, ddW, itemH, core);
  });
  addHit(0, 0, ddX, H, () => { app.deckBuilder.coreDropdownOpen = false; });
  addHit(ddX + ddW, 0, W - ddX - ddW, H, () => { app.deckBuilder.coreDropdownOpen = false; });
  addHit(ddX, listY + listH, ddW, H - listY - listH, () => { app.deckBuilder.coreDropdownOpen = false; });
}

function drawDeckListPanel(x, y) {
  const layout = getDeckListCoreDropdownLayout();
  ctx.fillStyle = "#d0e4ff";
  ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText("デッキリスト", x, y);
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillStyle = "#a8c4e8";
  ctx.fillText(`デッキ名: ${app.deckName}`, x, y + 28, 430);
  ctx.fillStyle = "#90b0d8";
  ctx.fillText(app.deckBuilder.message, x, y + 48, 430);
  if (layout.missingLines.length) {
    ctx.fillStyle = "#e8a090";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    layout.missingLines.forEach((line, i) => {
      ctx.fillText(line, x, y + 66 + i * 15, 430);
    });
  }

  ctx.fillStyle = "#c0d8ff";
  ctx.font = "700 14px 'Yu Gothic UI', sans-serif";
  ctx.fillText("コア", x, layout.coreLabelY);

  const coreList = Object.values(cardCatalog.cores);
  const selectedCore = cardCatalog.cores[app.deck.core] || cardCatalog.cores[DEFAULT_CORE_ID];
  const { ddX, ddY, ddW, ddH, listHeaderY, listStartY } = layout;

  // Dropdown button
  const ddBg = app.deckBuilder.coreDropdownOpen ? "rgba(60,100,200,0.5)" : "rgba(14,24,52,0.85)";
  const ddBorder = app.deckBuilder.coreDropdownOpen ? "#5090ff" : "rgba(50,80,160,0.55)";
  roundRect(ddX, ddY, ddW, ddH, 6, ddBg, ddBorder, 1.5);
  ctx.fillStyle = "#d0e4ff";
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`${selectedCore.name}  初${selectedCore.initialHand}/引${selectedCore.draw}/上${selectedCore.handLimit}`, ddX + 10, ddY + 20, ddW - 30);
  ctx.fillStyle = "#a0bce0";
  ctx.font = "700 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText(app.deckBuilder.coreDropdownOpen ? "▲" : "▼", ddX + ddW - 22, ddY + 20);
  addHit(ddX, ddY, ddW, ddH, () => { app.deckBuilder.coreDropdownOpen = !app.deckBuilder.coreDropdownOpen; });
  addCardHover(ddX, ddY, ddW, ddH, selectedCore);

  // Dropdown list is drawn later (top layer) via drawCoreDropdownOverlay()

  const core = selectedCore;
  const rows = deckListRows();
  const visibleRows = 14;
  const maxScroll = Math.max(0, rows.length - visibleRows);
  app.deckBuilder.deckScroll = Math.max(0, Math.min(maxScroll, app.deckBuilder.deckScroll));
  const visibleRowsData = rows.slice(app.deckBuilder.deckScroll, app.deckBuilder.deckScroll + visibleRows);

  ctx.fillStyle = "#c0d8ff";
  ctx.font = "700 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`カード一覧 メイン ${app.deck.main.length}/${core.deckMin || 40}-${core.deckMax || 60}枚 / 施設 ${app.deck.struct.length}/20枚`, x, layout.listHeaderY, 430);
  drawButton(x + 310, layout.listHeaderY - 20, 52, 26, "上へ", () => changeDeckScroll(-3), null, { micro: true });
  drawButton(x + 370, layout.listHeaderY - 20, 52, 26, "下へ", () => changeDeckScroll(3), null, { micro: true });
  addWheelRegion(x, layout.listStartY - 10, 430, visibleRows * 34, (deltaY) => changeDeckScroll(deltaY > 0 ? 1 : -1));

  addWheelRegion(x, layout.listStartY - 10, 430, visibleRows * 32, (deltaY) => changeDeckScroll(deltaY > 0 ? 1 : -1));
  visibleRowsData.forEach((row, i) => {
    const rowY = layout.listStartY + i * 32;
    if (row.kind === "mainHeader" || row.kind === "structHeader") {
      ctx.strokeStyle = "rgba(40,70,160,0.3)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, rowY + 18); ctx.lineTo(x + 430, rowY + 18); ctx.stroke();
      ctx.fillStyle = "rgba(140,170,230,0.6)";
      ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
      ctx.fillText(row.kind === "mainHeader" ? `${CARD_TYPE_LABELS[row.type]} (${row.count})` : `ストラクト (${row.count})`, x, rowY + 16);
      return;
    }
    const entry = row.entry;
    const isStruct = row.kind === "structCard";
    const cardX = x + 14;
    const theme = CARD_TYPE_THEME[entry.card.type] || CARD_TYPE_THEME.struct;
    roundRect(cardX, rowY + 1, 308, 26, 5, isStruct ? "rgba(80,60,20,0.5)" : "rgba(20,40,80,0.5)", isStruct ? "rgba(160,120,40,0.4)" : "rgba(40,80,180,0.35)", 1);
    ctx.fillStyle = "#d0e4ff";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    const compatWarn = compatibilityWarningForCard(entry.card);
    if (compatWarn) {
      ctx.fillStyle = "#ffb080";
      ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
      ctx.fillText(`⚠ ${entry.card.name} x${entry.count}`, cardX + 8, rowY + 17, 280);
      ctx.fillStyle = "#d0e4ff";
      ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    } else {
      ctx.fillText(`${entry.card.name} x${entry.count}`, cardX + 8, rowY + 17, 280);
    }
    addHit(cardX, rowY + 1, 308, 26, () => selectCardForDetail(entry.id));
    addCardHover(cardX, rowY + 1, 308, 26, entry.card);
    drawButton(cardX + 314, rowY + 1, 26, 26, "-", () => (isStruct ? removeStructDeckCardById(entry.id) : removeDeckCardById(entry.id)), null, { micro: true });
    drawButton(cardX + 346, rowY + 1, 26, 26, "+", () => (isStruct ? addStructDeckCard(entry.id) : addDeckCard(entry.id)), null, { micro: true });
  });
}

function drawCardLibraryPanel(x, y) {
  ctx.fillStyle = "#b0ccf0";
  ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText("カードライブラリ", x, y);
  LIBRARY_TYPE_ORDER.forEach((type, i) => {
    const buttonX = x + (i % 4) * 100;
    const buttonY = y + 24 + Math.floor(i / 4) * 36;
    const isActive = app.deckBuilder.libraryType === type;
    drawButton(buttonX, buttonY, 88, 28, CARD_TYPE_LABELS[type], () => setDeckBuilderLibrary(type), null, isActive ? { accent: "p1" } : { micro: true });
  });

  // Free text search box
  const sbX = x, sbY = y + 100, sbW = 320, sbH = 28;
  const focused = app.deckBuilder.searchFocused;
  roundRect(sbX, sbY, sbW, sbH, 6, focused ? "rgba(20,50,120,0.8)" : "rgba(10,16,40,0.8)", focused ? "#5090ff" : "rgba(40,70,160,0.5)", focused ? 2 : 1);
  ctx.fillStyle = app.deckBuilder.searchText ? "#b0ccf0" : "rgba(80,110,180,0.6)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(app.deckBuilder.searchText || "カード名・テキスト・タグで検索…", sbX + 10, sbY + 18, sbW - 40);
  if (app.deckBuilder.searchText) {
    drawButton(sbX + sbW - 28, sbY + 2, 24, 24, "✕", () => {
      app.deckBuilder.searchText = "";
      searchInput.value = "";
      app.deckBuilder.libraryScroll = 0;
    }, null, { micro: true });
  }
  addHit(sbX, sbY, sbW - (app.deckBuilder.searchText ? 28 : 0), sbH, () => {
    app.deckBuilder.searchFocused = true;
    searchInput.value = app.deckBuilder.searchText;
    setTimeout(() => searchInput.focus(), 0);
  });

  SEARCH_PRESETS.forEach((preset, i) => {
    const buttonX = x + i * 96;
    const buttonY = y + 134;
    const isActive = app.deckBuilder.searchPreset === preset.id;
    drawButton(buttonX, buttonY, 84, 26, preset.label, () => setDeckBuilderSearchPreset(preset.id), null, isActive ? { accent: "p1" } : { micro: true });
  });

  const allTags = ["all", ...popularLibraryTags()];
  const visibleTagCols = 4;
  const tagScroll = app.deckBuilder.tagScroll || 0;
  const canScrollLeft = tagScroll > 0;
  const canScrollRight = tagScroll + visibleTagCols < allTags.length;
  drawButton(x, y + 166, 20, 24, "◀", () => changeTagScroll(-1), null, { micro: true });
  drawButton(x + 410, y + 166, 20, 24, "▶", () => changeTagScroll(1), null, { micro: true });
  addWheelRegion(x, y + 162, 430, 28, (dy) => changeTagScroll(dy > 0 ? 1 : -1));
  allTags.slice(tagScroll, tagScroll + visibleTagCols).forEach((tag, i) => {
    const buttonX = x + 24 + i * 96;
    const label = tag === "all" ? "全タグ" : tag;
    const isActive = app.deckBuilder.tagFilter === tag;
    drawButton(buttonX, y + 166, 88, 24, label, () => setDeckBuilderTagFilter(tag), null, isActive ? { accent: "p1" } : { micro: true });
  });
  ctx.fillStyle = "rgba(80,110,180,0.6)";
  ctx.font = "600 10px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`${tagScroll + 1}–${Math.min(tagScroll + visibleTagCols, allTags.length)} / ${allTags.length}タグ`, x + 24, y + 204);

  const cards = filteredLibraryCards();
  const visibleRows = 6;
  const totalRows = Math.max(1, Math.ceil(cards.length / 2));
  const maxScroll = Math.max(0, totalRows - visibleRows);
  app.deckBuilder.libraryScroll = Math.max(0, Math.min(maxScroll, app.deckBuilder.libraryScroll));
  const startIndex = app.deckBuilder.libraryScroll * 2;
  const visibleCards = cards.slice(startIndex, startIndex + visibleRows * 2);

  ctx.fillStyle = "rgba(100,130,200,0.7)";
  ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
  const sortLabel = SORT_OPTIONS.find((option) => option.id === app.deckBuilder.sortBy)?.label || app.deckBuilder.sortBy;
  const visibleStart = cards.length ? startIndex + 1 : 0;
  const visibleEnd = Math.min(cards.length, startIndex + visibleCards.length);
  ctx.fillText(`${cards.length}枚 / ${visibleStart}-${visibleEnd} / ${sortLabel}`, x, y + 222);
  drawButton(x + 178, y + 202, 64, 26, "並替", cycleDeckBuilderSort, null, { micro: true });
  drawButton(x + 250, y + 202, 64, 26, "上へ", () => changeLibraryScroll(-3), null, { micro: true });
  drawButton(x + 322, y + 202, 64, 26, "下へ", () => changeLibraryScroll(3), null, { micro: true });
  addWheelRegion(x, y + 232, 400, visibleRows * 56, (deltaY) => changeLibraryScroll(deltaY > 0 ? 1 : -1));

  visibleCards.forEach((card, i) => {
    const cardX = x + (i % 2) * 206;
    const cardY = y + 232 + Math.floor(i / 2) * 56;
    const cTheme = CARD_TYPE_THEME[card.type] || CARD_TYPE_THEME.struct;
    roundRect(cardX, cardY, 196, 48, 6, cTheme.grad[0], cTheme.accent, 1.5);
    ctx.fillStyle = "#e0f0ff";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    const compatWarn = compatibilityWarningForCard(card);
    ctx.fillStyle = compatWarn ? "#ffb080" : "#e0f0ff";
    ctx.fillText(compatWarn ? `⚠ ${card.name}` : card.name, cardX + 8, cardY + 18, 176);
    ctx.fillStyle = "#a0c0e0";
    ctx.font = "600 10px 'Yu Gothic UI', sans-serif";
    const subline = card.type === "core"
      ? `初${card.initialHand} 引${card.draw}`
      : `${CARD_TYPE_LABELS[card.type] || card.type} / ${formatCost(card.cost)}`;
    ctx.fillText(compatWarn ? "処理不可カード" : subline, cardX + 8, cardY + 38, 180);
    addHit(cardX, cardY, 196, 48, () => addCardFromLibrary(card));
    addCardHover(cardX, cardY, 196, 48, card);
  });
}

function drawDeckAnalysisPanel(x, y) {
  const analysis = deckAnalysis();
  const typeText = Object.entries(analysis.typeCounts)
    .map(([type, count]) => `${CARD_TYPE_LABELS[type] || type}:${count}`)
    .join(" / ") || "なし";

  const SECTION_LABEL = "#8aacdc";
  const SECTION_DATA = "#d0e4ff";
  ctx.fillStyle = "#b0ccf0";
  ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText("デッキ分析", x, y);
  ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
  ctx.fillStyle = SECTION_LABEL;
  ctx.fillText("カード種類分布", x, y + 38);
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillStyle = SECTION_DATA;
  ctx.fillText(typeText, x, y + 56, 286);
  ctx.fillStyle = SECTION_LABEL; ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText("トップタグ", x, y + 90);
  ctx.fillStyle = SECTION_DATA; ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(analysis.topTags.join(" / ") || "なし", x, y + 108, 286);
  ctx.fillStyle = SECTION_LABEL; ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText("コスト集計", x, y + 142);
  ctx.fillStyle = SECTION_DATA; ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(formatResourceTotals(analysis.costTotals), x, y + 160, 286);
  ctx.fillStyle = SECTION_LABEL; ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText("資源収支分析", x, y + 194);
  ctx.fillStyle = SECTION_DATA; ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`生産 ${formatResourceTotals(analysis.incomeTotals)}`, x, y + 212, 286);
  ctx.fillStyle = SECTION_LABEL; ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText("枚数管理", x, y + 246);
  ctx.fillStyle = analysis.warnings.length ? "#ff8080" : "#60c080";
  ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText(analysis.warnings.join(" / ") || "問題なし", x, y + 264, 286);
  ctx.fillStyle = SECTION_LABEL; ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText("処理不可カード", x, y + 286);
  drawButton(x + 188, y + 270, 98, 22, "不足DL", exportIncompleteCardData, null, { micro: true });
  ctx.fillStyle = analysis.compatibilityWarnings.length ? "#ffb080" : "#60c080";
  ctx.font = "600 10px 'Yu Gothic UI', sans-serif";
  const compatLines = analysis.compatibilityWarnings.length ? analysis.compatibilityWarnings : ["問題なし"];
  let compatY = y + 302;
  for (const line of compatLines.slice(0, 4)) {
    ctx.fillText(line, x, compatY, 286);
    compatY += 13;
  }
  if (analysis.compatibilityWarnings.length > 4) {
    ctx.fillText(`他 ${analysis.compatibilityWarnings.length - 4}件`, x, compatY, 286);
    compatY += 13;
  }
  ctx.fillStyle = SECTION_LABEL; ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText("テストドロー", x, compatY + 8);
  const drawText = app.deckBuilder.testDraw.length ? app.deckBuilder.testDraw.join(" / ") : "未実行";
  ctx.fillStyle = SECTION_DATA; ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText(drawText, x, compatY + 26, 286);
  drawSavedDeckList(x, compatY + 40);
  drawSelectedCardDetail(x, compatY + 118);
}

function drawSavedDeckList(x, y) {
  ctx.fillStyle = "rgba(120,150,210,0.6)";
  ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText("保存済みデッキ", x, y);
  ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
  if (!app.savedDecks.length) {
    ctx.fillStyle = "rgba(100,130,180,0.5)";
    ctx.fillText("名前保存で追加", x, y + 20, 286);
    return;
  }
  app.savedDecks.slice(0, 2).forEach((entry, i) => {
    const by = y + 14 + i * 24;
    const isActive = app.deckName === entry.name;
    drawButton(x, by, 286, 20, entry.name, () => loadNamedDeck(entry.id), null, isActive ? { accent: "p1" } : { micro: true });
  });
}

function drawSelectedCardDetail(x, y) {
  const card = findCatalogCard(app.deckBuilder.selectedCardId);
  ctx.fillStyle = "rgba(120,150,210,0.6)";
  ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText("カード詳細", x, y);
  if (!card) {
    ctx.fillStyle = "rgba(100,130,180,0.5)";
    ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
    ctx.fillText("カードをクリックすると全文を表示", x, y + 20, 286);
    return;
  }
  const cdTheme = CARD_TYPE_THEME[card.type] || CARD_TYPE_THEME.struct;
  ctx.fillStyle = cdTheme.text;
  ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`${CARD_TYPE_LABELS[card.type] || card.type} / ${card.name}`, x, y + 20, 286);
  ctx.fillStyle = "rgba(140,170,220,0.8)";
  ctx.font = "600 10px 'Yu Gothic UI', sans-serif";
  const lines = [
    `陣営: ${card.faction || "なし"}`,
    `タグ: ${tagLabels(card).join(" / ") || "なし"}`,
    `コスト: ${formatCost(card.cost)} / アクト: ${formatCost(card.actCost)}`,
  ];
  if (card.type === "unit") lines.push(`ATK/HP: ${card.atk}/${card.hp}`);
  const keywordText = keywordLabels(card).join(" / ");
  if (keywordText) lines.push(`効果語: ${keywordText}`);
  let nextY = y + 38;
  for (const line of lines) {
    ctx.fillText(line, x, nextY, 286);
    nextY += 14;
  }
  const effectText = abilityText(card);
  if (effectText) drawWrappedText(`効果: ${effectText}`, x, nextY, 286, 14, 2);
  const compatWarn = compatibilityWarningForCard(card);
  if (compatWarn) {
    drawWrappedText(`警告: ${compatWarn}`, x, y + 88, 286, 13, 3);
  }
  drawButton(x, y + (compatWarn ? 126 : 104), 120, 26, "全文表示", () => (app.deckBuilder.detailOpen = true), null, { micro: true });
}

function drawCardDetailOverlay() {
  if (!app.deckBuilder.detailOpen) return;
  const card = findCatalogCard(app.deckBuilder.selectedCardId);
  if (!card) return;
  ctx.fillStyle = "rgba(0, 0, 10, 0.72)";
  ctx.fillRect(0, 0, W, H);
  const x = 382;
  const y = 168;
  const w = 676;
  const h = 520;
  const ctheme = CARD_TYPE_THEME[card.type] || CARD_TYPE_THEME.struct;
  ctx.save();
  ctx.shadowColor = ctheme.glow;
  ctx.shadowBlur = 20;
  roundRect(x, y, w, h, 12, "rgba(6,8,22,0.98)", ctheme.accent, 2);
  ctx.shadowBlur = 0;
  ctx.restore();
  const cStripe = ctx.createLinearGradient(x, y, x + w, y);
  cStripe.addColorStop(0, "transparent"); cStripe.addColorStop(0.2, ctheme.accent); cStripe.addColorStop(0.8, ctheme.accent); cStripe.addColorStop(1, "transparent");
  ctx.fillStyle = cStripe; ctx.fillRect(x, y, w, 3);
  drawCardArt(x + 16, y + 16, 180, 220, card);
  ctx.fillStyle = "#d8e8ff";
  ctx.font = "700 22px 'Yu Gothic UI', sans-serif";
  ctx.fillText(card.name, x + 210, y + 40, w - 226);
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillStyle = ctheme.text;
  let nextY = y + 62;
  const lines = [
    `種類: ${CARD_TYPE_LABELS[card.type] || card.type}`,
    `陣営: ${card.faction || "なし"}`,
    `タグ: ${tagLabels(card).join(" / ") || "なし"}`,
  ];
  if (card.type === "unit") lines.push(`ATK/HP: ${card.atk}/${card.hp}`);
  const keywordText = keywordLabels(card).join(" / ");
  if (keywordText) lines.push(`効果語: ${keywordText}`);
  ctx.fillStyle = "rgba(160,190,240,0.85)";
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  for (const line of lines) {
    ctx.fillText(line, x + 210, nextY, w - 226);
    nextY += 20;
  }
  // コスト: アイコン表示
  ctx.fillStyle = "rgba(160,190,240,0.85)";
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText("コスト:", x + 210, nextY);
  let cixEnd = drawCostIcons(card.cost || {}, x + 260, nextY - 14, { size: 16, showNone: true });
  if (card.actCost && Object.values(card.actCost).some((v) => v > 0)) {
    ctx.fillText("アクト:", cixEnd + 6, nextY);
    drawCostIcons(card.actCost, cixEnd + 54, nextY - 14, { size: 16 });
  }
  nextY += 20;
  const effectText = abilityText(card);
  if (effectText) {
    ctx.fillStyle = "rgba(140,170,220,0.6)";
    ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("効果", x + 210, nextY + 10);
    ctx.fillStyle = "#90b8e0";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    nextY = drawWrappedText(effectText, x + 210, nextY + 24, w - 226, 18, 6);
  }
  const fullText = card.text || card.flavor || "";
  if (fullText) {
    ctx.fillStyle = "rgba(140,170,220,0.6)";
    ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("テキスト", x + 210, nextY + 10);
    ctx.fillStyle = "rgba(180,200,240,0.7)";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    drawWrappedText(fullText, x + 210, nextY + 26, w - 226, 18, 10);
  }
  drawButton(x + w - 140, y + h - 50, 116, 34, "閉じる", () => (app.deckBuilder.detailOpen = false));
}

function drawMatchLobbyScreen() {
  drawAppTitle("試合ロビー");
  drawUserBadge();
  drawButton(74, 126, 108, 34, "ホーム", () => (app.screen = "home"), "#575f72");
  drawButton(194, 126, 150, 34, "デッキ編集", openDeckBuilder, "#6a5632");
  roundRect(300, 200, 840, 520, 10, "rgba(6,8,22,0.95)", "rgba(40,80,200,0.5)", 1.5);
  ctx.fillStyle = "#c0d8ff";
  ctx.font = "700 24px 'Yu Gothic UI', sans-serif";
  ctx.fillText("試合設定", 360, 260);
  ctx.font = "600 14px 'Yu Gothic UI', sans-serif";
  ctx.fillStyle = "rgba(160,190,240,0.85)";
  ctx.fillText(`ログイン: ${app.auth.name}`, 362, 296);
  ctx.fillText(`コア: ${cardCatalog.cores[app.deck.core]?.name || app.deck.core}`, 362, 318);
  ctx.fillText(`使用デッキ: ${app.deckName} / メイン ${app.deck.main.length}枚 / 施設 ${app.deck.struct.length}枚`, 362, 340, 720);
  drawMatchDeckSelector(362, 362);
  ctx.fillStyle = "rgba(140,170,220,0.75)";
  ctx.fillText(`状態: ${app.match.mode}`, 362, 448);
  // Room code display / input
  const rcFocused = app.match.roomCodeFocused;
  const rcValue = app.match.roomCode || "";
  roundRect(362, 454, 260, 32, 6, rcFocused ? "rgba(20,50,120,0.8)" : "rgba(10,16,40,0.7)", rcFocused ? "#5090ff" : "rgba(40,70,160,0.45)", rcFocused ? 2 : 1);
  ctx.fillStyle = rcValue ? "#d0e8ff" : "rgba(80,110,180,0.5)";
  ctx.font = "700 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText(rcValue || "ルームコードを入力…", 374, 474, 230);
  addHit(362, 454, 260, 32, () => {
    app.match.roomCodeFocused = true;
    roomCodeInput.value = app.match.roomCode || "";
    setTimeout(() => roomCodeInput.focus(), 0);
  });
  drawButton(634, 454, 100, 32, "コードコピー", copyRoomCode, null, { micro: true });
  ctx.fillText(`接続: ${app.match.connection || "offline"}`, 362, 496);
  ctx.fillText(`参加者: ${(app.match.players || []).map((player) => player.name).join(" / ") || "なし"}`, 362, 516);
  drawButton(362, 552, 210, 50, "ローカル対戦", startLocalMatch, null, { accent: "p1" });
  drawButton(606, 552, 210, 50, "ルーム作成", createRoomMatch);
  drawButton(850, 552, 210, 50, "ルーム参加", joinRoomMatch);
  const waitingForOpponent = app.match.status === "online" && (app.match.players || []).length < 2;
  if (app.match.status === "online" || app.match.status === "connecting") {
    drawButton(850, 614, 210, 50, waitingForOpponent ? "相手待ち" : "オンライン開始", startMatchFromLobby, null, waitingForOpponent ? {} : { accent: "p1" });
  }
  ctx.fillStyle = "rgba(120,150,200,0.65)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(app.match.message || "保存済みデッキを選択し、ルームを作成するか参加してください。", 362, 640, 760);
}

function drawMatchDeckSelector(x, y) {
  ctx.fillStyle = "rgba(120,150,210,0.6)";
  ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText("保存デッキ選択", x, y);
  if (!app.savedDecks.length) {
    ctx.fillStyle = "rgba(100,130,180,0.5)";
    ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
    ctx.fillText("保存済みデッキなし。デッキビルダーで名前保存してください。", x, y + 22, 720);
    return;
  }
  app.savedDecks.slice(0, 4).forEach((entry, i) => {
    const bx = x + i * 178;
    const selected = app.match.selectedDeckId === entry.id;
    drawButton(bx, y + 16, 166, 26, entry.name, () => selectMatchDeck(entry.id), null, selected ? { accent: "p1" } : { micro: true });
  });
}

function drawHeader() {
  // Slim header bar (60px)
  const grd = ctx.createLinearGradient(0, 0, 0, 60);
  grd.addColorStop(0, "rgba(8,14,30,0.99)");
  grd.addColorStop(1, "rgba(5,10,22,0.95)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, 60);
  ctx.strokeStyle = "rgba(30,70,160,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(W, 60); ctx.stroke();

  // Logo
  ctx.save();
  ctx.shadowColor = "#2060ff"; ctx.shadowBlur = 10;
  ctx.fillStyle = "#c0d8ff";
  ctx.font = "800 22px 'Yu Gothic UI', sans-serif";
  ctx.fillText("TWCG", 14, 38);
  ctx.shadowBlur = 0; ctx.restore();

  // Turn / phase pill (center)
  const canEndTurn = canControlActivePlayer()
    && !state.turnStartSequence
    && !state.pendingStructPhase
    && !state.pendingChoice;
  const activePlayer = state.players[state.activePlayer];
  const isP1Active = state.activePlayer === "p1";
  const pillColor = isP1Active ? "rgba(16,56,180,0.80)" : "rgba(160,20,20,0.80)";
  const pillBorder = isP1Active ? "#4090e0" : "#e04444";
  roundRect(180, 8, 560, 44, 8, pillColor, pillBorder, 1.5);
  ctx.fillStyle = "rgba(200,220,255,0.6)";
  ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`TURN ${state.turn} ·`, 200, 26);
  const phaseLabel = state.phase === "structure" ? "STRUCTURE PHASE" : state.phase === "main" ? "MAIN PHASE" : state.phase === "end" ? "END" : (state.phase || "").toUpperCase();
  ctx.fillText(phaseLabel, 268, 26);
  ctx.fillStyle = "#e8f2ff";
  ctx.font = "700 20px 'Yu Gothic UI', sans-serif";
  ctx.fillText(activePlayer.name, 200, 46);

  // Message (right of turn pill)
  ctx.fillStyle = "rgba(160,190,240,0.75)";
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText(state.message || "", 760, 36, 440);

  drawButton(996, 12, 90, 36, "ロビー", openMatchLobby, null, { dark: true });
  drawButton(1096, 12, 200, 36, canEndTurn ? "END TURN" : "相手のターン", canEndTurn ? endTurn : () => requestOnlineStateSync("turnButton"), null, { accent: canEndTurn ? "p1" : "dim" });
  drawButton(1308, 12, 120, 36, "HOME", () => (app.screen = "home"), null, { dark: true });
}

function drawBoardCard(cx, cy, cellW, cellH, unit) {
  const isSelected = selectedUnit() === unit;
  const padX = 6, padY = 4;
  const statsH = 22;
  const avW = cellW - padX * 2;
  const avH = cellH - padY * 2 - statsH;

  // レスト・非レスト共通の同一カードサイズ (63:88)
  const cardH = Math.min(avH, avW / CARD_ASPECT);
  const cardW = cardH * CARD_ASPECT;

  const centerX = cx + padX + avW / 2;
  const centerY = cy + padY + avH / 2;
  const isEnemy = unit.owner !== viewerPlayerId();

  if (unit.rested) {
    // レスト: 同一サイズのカードを 90° 回転して表示
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(Math.PI / 2);
    drawCard(-cardW / 2, -cardH / 2, cardW, cardH, unit, {
      selected: isSelected, noHover: true, artOnly: true,
    });
    ctx.restore();
    if (isEnemy) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#ff2020";
      // 回転後の視覚領域: centerX ± cardH/2, centerY ± cardW/2
      ctx.fillRect(centerX - cardH / 2, centerY - cardW / 2, cardH, cardW);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  } else {
    const offX = centerX - cardW / 2;
    const offY = centerY - cardH / 2;
    drawCard(offX, offY, cardW, cardH, unit, { selected: isSelected, artOnly: true });
    if (isEnemy) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#ff2020";
      ctx.fillRect(offX, offY, cardW, cardH);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  addCardHover(cx, cy, cellW, cellH, unit);

  // ATK / HP / HP bar をカードの外（セル下部）に表示
  if (unit.type === "unit") {
    const maxHp = unit.maxHp ?? unit.hp;
    const curHp = unit.currentHp ?? unit.hp;
    const hpRatio = maxHp > 0 ? Math.max(0, curHp / maxHp) : 0;
    const hpCol = hpRatio > 0.5 ? "#30c060" : hpRatio > 0.25 ? "#e0a020" : "#e02020";
    const sy = cy + cellH - statsH;
    ctx.fillStyle = "rgba(4,8,20,0.82)";
    ctx.fillRect(cx + 2, sy, cellW - 4, statsH);
    // ATK
    ctx.fillStyle = "#a0c8ff";
    ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
    ctx.fillText(`⚔${unit.atk}`, cx + 5, sy + 14);
    // HP
    ctx.textAlign = "right";
    ctx.fillStyle = hpCol;
    ctx.fillText(`♥${curHp}`, cx + cellW - 5, sy + 14);
    ctx.textAlign = "left";
    // HP bar
    const barY = sy + statsH - 5;
    const barW = cellW - 8;
    ctx.fillStyle = "rgba(20,20,40,0.8)";
    ctx.fillRect(cx + 4, barY, barW, 4);
    ctx.fillStyle = hpCol;
    ctx.fillRect(cx + 4, barY, barW * hpRatio, 4);
  }
}

// 召喚行 Core Card: 通常カードと同じ描画スタイル
function drawCoreInBoardCell(cx, cy, cW, cH, playerId) {
  const player = state.players[playerId];
  const isP1 = playerId === "p1";
  const hp = player.core.hp, maxHp = player.core.maxHp || 20;
  const ratio = Math.max(0, hp / maxHp);
  const hpColor = ratio > 0.5 ? (isP1 ? "#50d080" : "#ff6050") : ratio > 0.25 ? "#e0a020" : "#ff2020";

  const coreCard = {
    ...player.core,
    type: player.core.type || "core",
    currentHp: hp,
    maxHp,
    hp: maxHp,
  };

  const padX = 5, padY = 3;
  const statsH = 18;
  const avW = cW - padX * 2;
  const avH = cH - padY * 2 - statsH;
  const cardH = Math.min(avH, avW / CARD_ASPECT);
  const cardW = cardH * CARD_ASPECT;
  const cardX = cx + padX + (avW - cardW) / 2;
  const cardY = cy + padY + (avH - cardH) / 2;

  ctx.save(); ctx.shadowColor = hpColor; ctx.shadowBlur = 12;
  drawCard(cardX, cardY, cardW, cardH, coreCard, { noHover: true, artOnly: true });
  ctx.shadowBlur = 0; ctx.restore();

  const sy = cy + cH - statsH;
  ctx.fillStyle = "rgba(4,8,20,0.84)";
  ctx.fillRect(cx + 2, sy, cW - 4, statsH);
  ctx.fillStyle = "#c8d8ff";
  ctx.font = "700 10px 'Yu Gothic UI', sans-serif";
  ctx.fillText("LP", cx + 5, sy + 12);
  ctx.textAlign = "right";
  ctx.fillStyle = hpColor;
  ctx.fillText(`${hp}`, cx + cW - 5, sy + 12);
  ctx.textAlign = "left";
  const barY = sy + statsH - 5;
  const barW = cW - 8;
  ctx.fillStyle = "rgba(20,20,40,0.8)";
  ctx.fillRect(cx + 4, barY, barW, 4);
  ctx.fillStyle = hpColor;
  ctx.fillRect(cx + 4, barY, barW * ratio, 4);

  addCardHover(cx, cy, cW, cH, coreCard);
  const attacker = selectedUnit();
  if (canTargetCore(attacker, playerId)) {
    addHit(cx, cy, cW, cH, () => attackWithSelectedUnit({ kind: "core", playerId }));
  } else {
    addHit(cx, cy, cW, cH, () => { state.message = `${player.name} Core HP: ${hp}/${maxHp}`; });
  }
}

// 召喚行 Deck側セル: DECK + GY
function drawDeckGYInBoardCell(cx, cy, cW, cH, playerId) {
  const player = state.players[playerId];
  const half = Math.floor(cW / 2);
  roundRect(cx + 2, cy + 2, half - 3, cH - 4, 4, "rgba(10,20,54,0.88)", "rgba(50,90,200,0.5)", 1);
  ctx.fillStyle = "#7098c8"; ctx.font = "700 8px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("DECK", cx + half / 2, cy + 16);
  ctx.fillStyle = "#c0d8ff"; ctx.font = `700 ${Math.round(cH * 0.22)}px 'Yu Gothic UI', sans-serif`;
  ctx.fillText(player.mainDeck.length, cx + half / 2, cy + cH / 2 + 8);

  const gyX = cx + half;
  roundRect(gyX + 1, cy + 2, half - 3, cH - 4, 4, "rgba(14,36,14,0.88)", "rgba(40,130,60,0.5)", 1);
  ctx.fillStyle = "#70b880"; ctx.font = "700 8px 'Yu Gothic UI', sans-serif";
  ctx.fillText("DUMP", gyX + half / 2, cy + 16);
  ctx.fillStyle = "#c0e8d0"; ctx.font = `700 ${Math.round(cH * 0.22)}px 'Yu Gothic UI', sans-serif`;
  ctx.fillText(player.dump.length, gyX + half / 2, cy + cH / 2 + 8);
  ctx.textAlign = "left";
  addHit(gyX + 1, cy + 2, half - 3, cH - 4, () => { zoneViewerState = { playerId, zone: "dump", scroll: 0 }; });
}

// 召喚行 DUMP セル (1マス)
function drawDumpInBoardCell(cx, cy, cW, cH, playerId) {
  const player = state.players[playerId];
  roundRect(cx + 2, cy + 2, cW - 4, cH - 4, 4, "rgba(14,36,14,0.88)", "rgba(40,130,60,0.5)", 1);
  ctx.fillStyle = "#70b880"; ctx.font = "700 8px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("DUMP", cx + cW / 2, cy + 16);
  ctx.fillStyle = "#c0e8d0"; ctx.font = `700 ${Math.round(cH * 0.22)}px 'Yu Gothic UI', sans-serif`;
  ctx.fillText((player.dump || []).length, cx + cW / 2, cy + cH / 2 + 8);
  ctx.textAlign = "left";
  addHit(cx + 2, cy + 2, cW - 4, cH - 4, () => { zoneViewerState = { playerId, zone: "dump", scroll: 0 }; });
}

// 召喚行 OUT (Exile) セル (1マス)
function drawOutInBoardCell(cx, cy, cW, cH, playerId) {
  const player = state.players[playerId];
  roundRect(cx + 2, cy + 2, cW - 4, cH - 4, 4, "rgba(50,30,10,0.88)", "rgba(180,120,30,0.5)", 1);
  ctx.fillStyle = "#d0a040"; ctx.font = "700 8px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("OUT", cx + cW / 2, cy + 16);
  ctx.fillStyle = "#e8d080"; ctx.font = `700 ${Math.round(cH * 0.22)}px 'Yu Gothic UI', sans-serif`;
  ctx.fillText((player.exileZone || []).length, cx + cW / 2, cy + cH / 2 + 8);
  ctx.textAlign = "left";
  addHit(cx + 2, cy + 2, cW - 4, cH - 4, () => { zoneViewerState = { playerId, zone: "exile", scroll: 0 }; });
}

// 召喚行 Command側セル: Wild/Grand カウント
function drawCmdZoneInBoardCell(cx, cy, cW, cH, playerId) {
  const player = state.players[playerId];
  roundRect(cx + 2, cy + 2, cW - 4, cH - 4, 4, "rgba(60,20,90,0.65)", "rgba(160,80,200,0.5)", 1);
  ctx.fillStyle = "rgba(180,100,220,0.7)";
  ctx.font = "600 8px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("COMMAND", cx + cW / 2, cy + 16);
  ctx.fillStyle = "rgba(220,160,255,0.8)";
  ctx.font = `600 ${Math.round(cH * 0.11)}px 'Yu Gothic UI', sans-serif`;
  ctx.fillText(`Wild  ${(player.wildZone || []).length}`, cx + cW / 2, cy + cH / 2 - 4);
  ctx.fillText(`Grand ${(player.grandZone || []).length}`, cx + cW / 2, cy + cH / 2 + Math.round(cH * 0.13) + 2);
  ctx.textAlign = "left";
}

function drawResourceInBoardCell(cx, cy, cW2, cH, playerId) {
  const player = state.players[playerId];
  const isP1 = playerId === "p1";
  roundRect(cx + 1, cy + 1, cW2 - 2, cH - 2, 4,
    isP1 ? "rgba(4,18,10,0.90)" : "rgba(22,4,4,0.90)",
    isP1 ? "rgba(40,160,90,0.45)" : "rgba(180,40,40,0.45)", 1);

  const padX = 6, padY = 5;
  const innerW = cW2 - padX * 2;
  const innerH = cH - padY * 2;
  const cols2 = 2;
  const rows2 = Math.ceil(RESOURCE_KEYS.length / cols2); // 4行
  const pillW = Math.floor((innerW - (cols2 - 1) * 3) / cols2);
  const pillH = Math.floor((innerH - (rows2 - 1) * 3) / rows2);

  RESOURCE_KEYS.forEach((key, i) => {
    const ci = i % cols2;
    const ri = Math.floor(i / cols2);
    const px = cx + padX + ci * (pillW + 3);
    const py = cy + padY + ri * (pillH + 3);
    const colors = RESOURCE_PILL_COLORS[key] || { bg: "rgba(30,40,70,0.6)", border: "rgba(80,100,180,0.5)", text: "#a0b0d0", glow: "#6080c0" };
    const amt = player.resources?.[key] || 0;
    roundRect(px, py, pillW, pillH, 2, colors.bg, colors.border, 0.8);
    const iconSize = Math.min(pillH - 2, 22);
    // アイコン + ×n 形式で常に数量を表示
    drawResourceIcon(key, px + 3, py + Math.max(0, (pillH - iconSize) / 2), iconSize, {});
    const numSize = Math.max(11, Math.floor(pillH * 0.55));
    ctx.fillStyle = "#f4f7ff";
    ctx.font = `800 ${numSize}px 'Yu Gothic UI', sans-serif`;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(String(amt), px + pillW - 4, py + pillH / 2);
    ctx.textBaseline = "alphabetic";
  });
  ctx.textAlign = "left";
}

function drawBoard() {
  const { x, y, w, h } = layout.board;
  const cW = layout.cell.w;
  const cH = layout.cell.h;
  const viewer = viewerPlayerId();

  // Center divider (間の境界線)
  const midY = y + h / 2;
  ctx.strokeStyle = "rgba(180,180,255,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, midY); ctx.lineTo(x + w, midY); ctx.stroke();
  // Phase badge
  const phBadge = state.phase === "structure" ? "STRUCT" : state.phase === "main" ? "MAIN" : "END";
  const badgeW = 72;
  roundRect(x + w / 2 - badgeW / 2, midY - 10, badgeW, 20, 5, "rgba(6,10,28,0.92)", "rgba(60,80,180,0.5)", 1);
  ctx.fillStyle = "rgba(140,160,220,0.8)";
  ctx.font = "700 9px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(phBadge, x + w / 2, midY + 3);
  ctx.textAlign = "left";

  // 非フリップ時: p1は戦闘行から下向きに描画、p2は召喚行から下向きに描画
  // フリップ時 (p2視点): p1は召喚行から、p2は戦闘行から
  const drawP1ResFromBattle = !isViewerFlipped();

  for (let visualRow = 0; visualRow < ROWS; visualRow += 1) {
    const row = visualRowToBoardRow(visualRow);
    // p1 占有は board rows 2-3 (p1.summonRow=3, p2.summonRow=0)
    const isP1Row = row >= ROWS / 2;
    const isViewerRow = isP1Row ? viewer === "p1" : viewer === "p2";

    for (let col = 0; col < COLS; col += 1) {
      const cx = x + col * cW;
      const cy = y + visualRow * cH;

      // ゾーン判定 (COLS=13)
      // p1戦闘行: [0-2 Resource一体化][3-9 Standard][10-12 Tact]  (battle+summon 2行分のパネル)
      // p2戦闘行: [0-2 Tact][3-9 Standard][10-12 Resource一体化]
      const isP1Summon = row === PLAYERS.p1.summonRow;
      const isP2Summon = row === PLAYERS.p2.summonRow;
      const isSummon   = isP1Summon || isP2Summon;

      const isTactZone    = !isSummon && ((isP1Row && col >= 10 && col <= 12) || (!isP1Row && col >= 0 && col <= 2));
      const isGrandZone   = false;
      const isTactSummon  = isSummon && ((isP1Summon && col >= 10 && col <= 12) || (isP2Summon && col >= 0 && col <= 2));
      const isGrandSummon = isSummon && ((isP1Summon && col === 12) || (isP2Summon && col === 0));

      // 資源一体化パネル: 戦闘行+召喚行 を 2*cH の高さで1枚描画
      // 描画元の行 (上側) だけ描き、下側行はスキップ
      if (!isSummon && isP1Row && col <= 2) {
        // p1 戦闘行 左端 → drawP1ResFromBattle のときここから2行分描く
        if (col === 0 && drawP1ResFromBattle)
          drawResourceInBoardCell(cx, cy, cW * 3, cH * 2, "p1");
        continue;
      }
      if (!isSummon && !isP1Row && col >= 10) {
        // p2 戦闘行 右端 → フリップ時ここから2行分描く
        if (col === 10 && !drawP1ResFromBattle)
          drawResourceInBoardCell(cx, cy, cW * 3, cH * 2, "p2");
        continue;
      }

      // 召喚行: [0-2 Resource(下側スキップ or フリップ時上側描画)][3-5 SF][6 Core][7-9 SF][10 Dump][11 Out][12 Grand]  (p1)
      //        [0 Grand][1 Out][2 Dump][3-5 SF][6 Core][7-9 SF][10-12 Resource(下側スキップ or 非フリップ時上側描画)]  (p2)
      if (isSummon) {
        const sId = isP1Summon ? "p1" : "p2";
        const resColStart = isP1Summon ? 0 : 10;
        const dumpCol = isP1Summon ? 10 : 2;
        const outCol  = isP1Summon ? 11 : 1;
        if (col === resColStart) {
          // 非フリップ: p2召喚行は上側なので描画。p1召喚行は下側なのでスキップ。
          // フリップ時: p1召喚行が上側→描画。p2召喚行は下側→スキップ。
          const shouldDraw = isP1Summon ? !drawP1ResFromBattle : drawP1ResFromBattle;
          if (shouldDraw) drawResourceInBoardCell(cx, cy, cW * 3, cH * 2, sId);
          continue;
        }
        if (col === resColStart + 1 || col === resColStart + 2) continue;
        if (col === 6) {
          drawCoreInBoardCell(cx, cy, cW, cH, sId); continue;
        }
        if (col === dumpCol) {
          drawDumpInBoardCell(cx, cy, cW, cH, sId); continue;
        }
        if (col === outCol) {
          drawOutInBoardCell(cx, cy, cW, cH, sId); continue;
        }
        // col 3-5 / 7-9: Summon Field → falls through to regular cell rendering
        // col 12 (p1) / 0 (p2): Grand Zone → falls through
      }

      // 通常セル背景色 (p1=緑, p2=赤, Grand=金)
      // isTactSummon は通常の召喚フィールドと同じ扱い (戦闘行Tact Zoneと区別するため)
      let cellFill;
      if (isTactZone)
        cellFill = isP1Row ? "rgba(210,230,220,0.22)" : "rgba(230,215,215,0.22)";
      else if (isGrandZone || isGrandSummon)
        cellFill = "rgba(30,24,5,0.68)";
      else if (isP1Summon) cellFill = "rgba(8,35,20,0.80)";
      else if (isP2Summon) cellFill = "rgba(35,8,8,0.80)";
      else cellFill = isP1Row ? "rgba(6,22,13,0.72)" : "rgba(22,6,6,0.72)";
      ctx.fillStyle = cellFill;
      ctx.fillRect(cx + 1, cy + 1, cW - 2, cH - 2);

      // セルボーダー
      ctx.save();
      ctx.strokeStyle = isTactZone
        ? (isP1Row ? "rgba(80,180,120,0.75)" : "rgba(210,80,70,0.75)")
        : (isGrandZone || isGrandSummon) ? "rgba(200,160,45,0.55)"
        : isP1Summon ? "rgba(50,190,110,0.65)"
        : isP2Summon ? "rgba(220,70,60,0.55)"
        : (isP1Row ? "rgba(40,160,90,0.32)" : "rgba(200,50,50,0.32)");
      ctx.lineWidth = (isSummon || isGrandZone || isTactZone) ? 1.5 : 1;
      ctx.strokeRect(cx + 2, cy + 2, cW - 4, cH - 4);
      ctx.restore();

      // ゾーンラベル (空きセルのみ)
      const unit = state.board[row][col];
      if (!unit) {
        const label = (isGrandZone || isGrandSummon) ? "Grand Zone"
          : isTactZone ? "Tact Zone"
          : isSummon ? "Summon Field" : "";
        if (label) {
          ctx.fillStyle = (isGrandZone || isGrandSummon) ? "rgba(200,160,50,0.30)"
            : isTactZone ? (isP1Row ? "rgba(50,190,110,0.30)" : "rgba(220,80,70,0.30)")
            : (isP1Row ? "rgba(50,180,100,0.22)" : "rgba(200,70,60,0.22)");
          ctx.font = "500 10px 'Yu Gothic UI', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(label, cx + cW / 2, cy + cH / 2 + 4);
          ctx.textAlign = "left";
        }
      }

      // トークン出現選択中のマスをハイライト
      if (state.pendingChoice?.type === "summonToken") {
        const pending = state.pendingChoice;
        const isValidRow = pending.validRows.includes(row);
        const isFreeCell = !unit;
        if (isValidRow && isFreeCell) {
          ctx.save();
          ctx.shadowColor = "#ffff00";
          ctx.shadowBlur = 8;
          roundRect(cx + 2, cy + 2, cW - 4, cH - 4, 4, "rgba(255,255,0,0.15)", "#ffff00", 2);
          ctx.restore();
        }
      }

      addHit(cx, cy, cW, cH, () => handleCellClick(row, col));
      if (unit) drawBoardCard(cx, cy, cW, cH, unit);

      // Standard|Tact 境界 (戦闘行のみ, col10)
      const isSummonRowCheck = (row === PLAYERS.p1.summonRow || row === PLAYERS.p2.summonRow);
      if (!isSummonRowCheck && col === 9) {
        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = isP1Row ? "rgba(50,190,110,0.40)" : "rgba(220,70,60,0.40)";
        const bx2 = cx + cW;
        const cy0 = y + visualRow * cH;
        ctx.beginPath(); ctx.moveTo(bx2, cy0); ctx.lineTo(bx2, cy0 + cH); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

  }
}

// コマンドローを描画 (Core Card, Summon Field, Deck/Dump)
function drawCommandRow(playerId, box, mirrored) {
  const player = state.players[playerId];
  const isP1 = playerId === "p1";
  const cW = layout.cell.w;
  const { x, y, w, h } = box;

  // 背景
  const bg = isP1 ? "rgba(6,12,34,0.92)" : "rgba(34,6,6,0.88)";
  const border = isP1 ? "rgba(40,90,220,0.5)" : "rgba(220,40,40,0.5)";
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = border; ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  // 列位置: mirrored=true のとき左右反転 (相手)
  const deckCol  = mirrored ? 0 : 6;
  const cmdCol   = mirrored ? 6 : 0;
  const coreCol  = 3;
  const sfL1 = mirrored ? 4 : 1;
  const sfL2 = mirrored ? 5 : 2;
  const sfR1 = mirrored ? 1 : 4;
  const sfR2 = mirrored ? 2 : 5;

  // Core Card セル (col 3)
  const coreX = x + coreCol * cW;
  const hp = player.core.hp;
  const maxHp = player.core.maxHp || 20;
  const ratio = Math.max(0, hp / maxHp);
  const hpColor = ratio > 0.5 ? (isP1 ? "#4090ff" : "#ff5040") : ratio > 0.25 ? "#e0a020" : "#ff2020";
  ctx.save();
  ctx.shadowColor = hpColor; ctx.shadowBlur = 12;
  roundRect(coreX + 2, y + 2, cW - 4, h - 4, 6, isP1 ? "rgba(10,25,70,0.95)" : "rgba(70,12,12,0.95)", hpColor, 1.5);
  ctx.shadowBlur = 0; ctx.restore();
  ctx.fillStyle = "rgba(200,215,255,0.55)";
  ctx.font = "600 9px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CORE CARD", coreX + cW / 2, y + 13);
  ctx.fillStyle = hpColor;
  ctx.font = `800 26px 'Yu Gothic UI', sans-serif`;
  ctx.fillText(`${hp}`, coreX + cW / 2, y + h - 10);
  ctx.fillStyle = "rgba(160,180,230,0.5)";
  ctx.font = "500 8px 'Yu Gothic UI', sans-serif";
  ctx.fillText(player.name, coreX + cW / 2, y + 24);
  ctx.textAlign = "left";
  // HP bar
  const barY = y + h - 5; const barW = cW - 16;
  ctx.fillStyle = "rgba(20,20,40,0.7)"; ctx.fillRect(coreX + 8, barY, barW, 4);
  ctx.fillStyle = hpColor; ctx.fillRect(coreX + 8, barY, barW * ratio, 4);

  // Command Zone セル (col 0 or 6)
  const cmdX = x + cmdCol * cW;
  const wildCount = (player.wildZone || []).length;
  const grandCard = (player.grandZone || [])[0];
  roundRect(cmdX + 2, y + 2, cW - 4, h - 4, 4, "rgba(60,20,90,0.6)", "rgba(160,80,200,0.4)", 1);
  ctx.fillStyle = "rgba(180,100,220,0.55)";
  ctx.font = "600 8px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("COMMAND", cmdX + cW / 2, y + 13);
  ctx.fillStyle = "rgba(220,160,255,0.65)";
  ctx.font = "500 9px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`Wild ${wildCount}`, cmdX + cW / 2, y + 28);
  ctx.fillStyle = "rgba(180,210,255,0.5)";
  ctx.fillText(grandCard ? grandCard.name.slice(0, 8) : `Grand ${(player.grandZone || []).length}`, cmdX + cW / 2, y + 42);
  ctx.textAlign = "left";

  // Deck / Dump セル (col 6 or 0)
  const dkX = x + deckCol * cW;
  roundRect(dkX + 2, y + 2, (cW - 4) / 2 - 1, h - 4, 4, "rgba(10,20,54,0.85)", "rgba(50,90,200,0.5)", 1);
  ctx.fillStyle = "#7098c8"; ctx.font = "700 8px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("DECK", dkX + (cW / 4), y + 13);
  ctx.fillStyle = "#c0d8ff"; ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText(player.mainDeck.length, dkX + (cW / 4), y + h - 8);
  const gyX = dkX + cW / 2;
  roundRect(gyX + 1, y + 2, (cW - 4) / 2 - 1, h - 4, 4, "rgba(14,36,14,0.85)", "rgba(40,130,60,0.5)", 1);
  ctx.fillStyle = "#70b880"; ctx.font = "700 8px 'Yu Gothic UI', sans-serif";
  ctx.fillText("DUMP", gyX + cW / 4, y + 13);
  ctx.fillStyle = "#c0e8d0"; ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText(player.dump.length, gyX + cW / 4, y + h - 8);
  ctx.textAlign = "left";
  addHit(gyX + 1, y + 2, (cW - 4) / 2, h - 4, () => { zoneViewerState = { playerId, zone: "dump", scroll: 0 }; });

  // Summon Field ラベル (cols 1-2 and 4-5)
  for (const sc of [sfL1, sfL2, sfR1, sfR2]) {
    const sx = x + sc * cW;
    ctx.strokeStyle = "rgba(80,130,200,0.2)"; ctx.lineWidth = 1;
    ctx.strokeRect(sx + 2, y + 2, cW - 4, h - 4);
    ctx.fillStyle = "rgba(80,130,200,0.18)";
    ctx.font = "500 9px 'Yu Gothic UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Summon Field", sx + cW / 2, y + h / 2 + 3);
    ctx.textAlign = "left";
  }
}

// ストラクトゾーン行を描画 (Structure Deck / Field Structs / GY)
function drawStructZoneRow(playerId, box, mirrored) {
  const player = state.players[playerId];
  const isP1 = playerId === "p1";
  const cW = layout.cell.w;
  const { x, y, w, h } = box;
  const isViewer = playerId === viewerPlayerId();

  const bg = isP1 ? "rgba(4,18,10,0.90)" : "rgba(22,4,4,0.88)";
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = isP1 ? "rgba(40,160,90,0.4)" : "rgba(180,40,40,0.38)"; ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  // Structure Deck インジケーター (player=左端col0, opp=右端col12)
  const sdCol = mirrored ? 12 : 0;
  const sdX = x + sdCol * cW;
  const sdCount = player.structDeck.length;
  roundRect(sdX + 2, y + 2, cW - 4, h - 4, 4, "rgba(20,40,80,0.85)", "rgba(60,100,200,0.5)", 1);
  ctx.fillStyle = "#90acd8"; ctx.font = "700 8px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("STRUCT DECK", sdX + cW / 2, y + 13);
  ctx.fillStyle = "#c0d8ff"; ctx.font = `700 ${Math.round(h * 0.42)}px 'Yu Gothic UI', sans-serif`;
  ctx.fillText(sdCount, sdX + cW / 2, y + h - 4);
  ctx.textAlign = "left";
  // struct deckをクリックして選択
  if (isViewer) {
    addHit(sdX + 2, y + 2, cW - 4, h - 4, () => {
      if (!requireActivePlayerControl()) return;
      if (player.structDeck.length === 0) return;
      // struct deck viewer を開く
      zoneViewerState = { playerId, zone: "structDeck", scroll: 0 };
    });
  }

  // フィールドストラクト表示 (cols 1-11, 両端のデッキ指標の間)
  const structAreaStartCol = 1;
  const structAreaEndCol   = 11;
  const structStartX = x + structAreaStartCol * cW;
  const structEndX   = x + (structAreaEndCol + 1) * cW;
  const cardH = h - 6;
  const cardW = Math.round(cardH * CARD_ASPECT);
  const gap = 4;
  const stride = cardW + gap;

  player.structs.forEach((card, i) => {
    const cx2 = structStartX + i * stride;
    if (cx2 + cardW > structEndX) return;
    const selected = state.selected?.kind === "fieldStruct" && state.selected.playerId === playerId && state.selected.index === i;
    drawCard(cx2, y + 3, cardW, cardH, card, { selected, small: true, artOnly: true });
    addHit(cx2, y + 3, cardW, cardH, () => {
      const detailOpen = consumeFieldDoubleClick(`fieldStruct:${playerId}:${i}`);
      state.selected = { kind: "fieldStruct", playerId, index: i, detailOpen };
      state.message = detailOpen ? `${card.name}: detail` : `${card.name} を選択`;
    });
  });

  // Struct zone label (empty area)
  if (player.structs.length === 0) {
    ctx.fillStyle = "rgba(100,130,200,0.18)";
    ctx.font = "500 9px 'Yu Gothic UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Structure Zone", structStartX + (structEndX - structStartX) / 2, y + h / 2 + 3);
    ctx.textAlign = "left";
  }

  // Main Deck インジケーター (player=右端col12, opp=左端col0)
  const mdCol = mirrored ? 0 : 12;
  const mdX = x + mdCol * cW;
  roundRect(mdX + 2, y + 2, cW - 4, h - 4, 4, "rgba(14,30,60,0.85)", "rgba(40,80,180,0.4)", 1);
  ctx.fillStyle = "#7090c0"; ctx.font = "700 8px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("MAIN DECK", mdX + cW / 2, y + 13);
  ctx.fillStyle = "#b0c8f0"; ctx.font = `700 ${Math.round(h * 0.42)}px 'Yu Gothic UI', sans-serif`;
  ctx.fillText(player.mainDeck.length, mdX + cW / 2, y + h - 4);
  ctx.textAlign = "left";
}

function drawCore(playerId, x, y, w, h) {
  const player = state.players[playerId];
  const isP1 = playerId === "p1";
  const accentColor = isP1 ? "#3080ff" : "#ff4030";
  const bgColor = isP1 ? "rgba(10,25,70,0.88)" : "rgba(70,12,12,0.88)";

  ctx.save();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 16;
  roundRect(x, y, w, h, 10, bgColor, accentColor, 1.5);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Player name
  ctx.fillStyle = "#c8d8ff";
  ctx.font = "700 15px 'Yu Gothic UI', sans-serif";
  ctx.fillText(player.name, x + 16, y + 22);

  // Core name
  ctx.fillStyle = "rgba(180,200,255,0.6)";
  ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText(player.core.name, x + 16, y + 40);

  const termCounter = player.core.termCounter || 0;
  const warBondCounter = player.core.warBondCounter || 0;
  if (termCounter > 0 || warBondCounter > 0) {
    ctx.fillStyle = "rgba(255,220,140,0.85)";
    ctx.font = "600 10px 'Yu Gothic UI', sans-serif";
    const counterParts = [];
    if (termCounter > 0) counterParts.push(`期限${termCounter}`);
    if (warBondCounter > 0) counterParts.push(`国債${warBondCounter}`);
    ctx.fillText(counterParts.join(" / "), x + 16, y + 54);
  }

  // HP
  const maxHp = player.core.maxHp || 20;
  const hpRatio = Math.max(0, player.core.hp / maxHp);
  const barX = x + 16;
  const barY = y + h - 18;
  const barW = w - 100;
  const barH = 8;
  // bar bg
  ctx.fillStyle = "rgba(20,20,40,0.8)";
  roundRect(barX, barY, barW, barH, 4, "rgba(20,20,40,0.8)", null);
  // bar fill
  const hpColor = hpRatio > 0.5 ? accentColor : hpRatio > 0.25 ? "#e0a020" : "#ff2020";
  ctx.save();
  ctx.shadowColor = hpColor;
  ctx.shadowBlur = 6;
  roundRect(barX, barY, barW * hpRatio, barH, 4, hpColor, null);
  ctx.shadowBlur = 0;
  ctx.restore();

  // HP number
  ctx.fillStyle = "#e8f0ff";
  ctx.font = "700 22px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${player.core.hp}`, x + w - 16, y + h - 8);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(160,180,220,0.7)";
  ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`LP`, x + w - 16 - ctx.measureText(`${player.core.hp}`).width - 26, y + h - 10);

  if (playerId !== state.activePlayer && selectedUnit()) addHit(x, y, w, h, () => attackWithSelectedUnit({ kind: "core" }));
}

function handleCellClick(row, col) {
  const selected = state.selected;
  const unit = state.board[row][col];
  if (state.pendingChoice?.type === "summonToken") {
    if (!requireActivePlayerControl()) return;
    resolveSummonToken(row, col);
    return;
  }
  if (state.pendingChoice?.type === "deployHeroFromAttack" && state.pendingChoice.step === "chooseCell") {
    if (!requireActivePlayerControl()) return;
    resolveDeployHeroCell(row, col);
    return;
  }
  if (state.pendingTarget) {
    if (!requireActivePlayerControl()) return;
    resolvePendingTarget(row, col);
    return;
  }
  if (selected?.kind === "hand" && selected.confirmed && (!selected.playerId || selected.playerId === state.activePlayer)) {
    if (!requireActivePlayerControl()) return;
    const card = state.players[state.activePlayer].hand[selected.index];
    if (card?.type === "unit") {
      if (!isUnitFieldCell(row, col)) return fail("ユニットフィールドに配置してください。");
      return placeUnitFromHand(selected.index, row, col);
    }
  }
  if (selected?.kind === "unit" && !unit) {
    const unitCard = selectedUnit();
    if (unitCard && unitCard.owner === state.activePlayer) {
      const player = state.players[unitCard.owner];
      const forwardRow = unitCard.row + player.forward;
      const retreatRow = unitCard.row - player.forward;
      const colDiff = Math.abs(col - unitCard.col);
      if (colDiff <= 1 && row === forwardRow && canMoveUnitTo(unitCard, row)) {
        return relocateUnit(unitCard, row, col, "前進", "moveUnit");
      }
      if (colDiff <= 1 && row === retreatRow && canMoveUnitTo(unitCard, row)) {
        return relocateUnit(unitCard, row, col, "後退", "retreatUnit");
      }
    }
  }
  if (selected?.kind === "unit" && unit?.owner !== state.activePlayer) {
    if (!requireActivePlayerControl()) return;
    return attackWithSelectedUnit({ kind: "unit", row, col });
  }
  if (unit) {
    const detailOpen = consumeFieldDoubleClick(`unit:${row}:${col}`);
    state.selected = { kind: "unit", row, col, detailOpen };
    state.message = `${unit.name} selected`;
  } else {
    if (!requireActivePlayerControl()) return;
    state.selected = null;
  }
}

function drawSidePanel(playerId, box) {
  const player = state.players[playerId];
  const isP1 = playerId === "p1";
  const accentColor = isP1 ? "rgba(30,80,200,0.5)" : "rgba(200,30,30,0.4)";
  const borderColor = isP1 ? "rgba(40,90,220,0.7)" : "rgba(220,40,40,0.6)";

  // Glass panel
  roundRect(box.x, box.y, box.w, box.h, 10, "rgba(14,20,45,0.95)", borderColor, 1.5);
  // Top accent stripe
  ctx.fillStyle = accentColor;
  roundRect(box.x, box.y, box.w, 3, 2, accentColor, null);

  // Player name
  ctx.fillStyle = "#e0eeff";
  ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText(player.name, box.x + 14, box.y + 28);

  // Deck / Dump / Exile compact row
  const zoneY = box.y + 36;
  const zW = (box.w - 24) / 3;
  roundRect(box.x + 8, zoneY, zW, 22, 4, "rgba(20,40,100,0.6)", "rgba(60,100,200,0.4)", 1);
  ctx.fillStyle = "#90b0e0"; ctx.font = "600 10px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`D ${player.mainDeck.length}`, box.x + 13, zoneY + 15);
  roundRect(box.x + 8 + zW + 4, zoneY, zW, 22, 4, "rgba(40,80,60,0.5)", "rgba(60,160,100,0.4)", 1);
  ctx.fillStyle = "#80e0a0";
  ctx.fillText(`DMP ${player.dump.length}`, box.x + 13 + zW + 4, zoneY + 15);
  addHit(box.x + 8 + zW + 4, zoneY, zW, 22, () => { zoneViewerState = { playerId, zone: "dump", scroll: 0 }; });
  roundRect(box.x + 8 + (zW + 4) * 2, zoneY, zW, 22, 4, "rgba(60,50,20,0.5)", "rgba(180,140,40,0.4)", 1);
  ctx.fillStyle = "#e0c060";
  ctx.fillText(`OUT ${player.exileZone.length}`, box.x + 13 + (zW + 4) * 2, zoneY + 15);
  addHit(box.x + 8 + (zW + 4) * 2, zoneY, zW, 22, () => { zoneViewerState = { playerId, zone: "exile", scroll: 0 }; });

  // Resources (compact 2-col) - only for viewer player, opponent resources visible too
  drawResourceList(player, box.x + 8, box.y + 66);

  // Wild / Grand compact row
  const wgY = box.y + 200;
  const wgW = (box.w - 16) / 2 - 2;
  drawMiniCard(box.x + 8, wgY, wgW, 22, `Wild ${player.wildZone.length}`, "rgba(60,30,90,0.7)");
  drawMiniCard(box.x + 8 + wgW + 4, wgY, wgW, 22, player.grandZone[0]?.name?.split(" ")[0] || `Grand ${player.grandZone.length}`, "rgba(20,60,100,0.7)");

  // Separator
  ctx.strokeStyle = "rgba(40,70,160,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(box.x + 8, box.y + 230); ctx.lineTo(box.x + box.w - 8, box.y + 230); ctx.stroke();

  // STRUCT DECK — カード画像で全て表示（viewer のみ）
  if (playerId === viewerPlayerId()) {
    const deckTitleY = box.y + 242;
    const deckCardsY = box.y + 256;
    ctx.fillStyle = "rgba(160,180,230,0.7)";
    ctx.font = "700 10px 'Yu Gothic UI', sans-serif";
    ctx.fillText(`STRUCT DECK (${player.structDeck.length})`, box.x + 8, deckTitleY);
    // カード幅: パネル幅に3列で並べる
    const panelBottom = box.y + box.h - 6;
    const cols = 3;
    const cW = Math.floor((box.w - 12 - (cols - 1) * 3) / cols);
    const cH = Math.round(cW / CARD_ASPECT);
    const stride = cW + 3;
    addWheelRegion(box.x + 6, deckCardsY, box.w - 12, panelBottom - deckCardsY, (deltaY) => changeStructDeckScroll(deltaY > 0 ? 1 : -1));
    const scrollInfo = clampStructDeckScroll(player);
    const startIndex = scrollInfo.scroll * cols;
    player.structDeck.forEach((card, absI) => {
      if (absI < startIndex) return;
      const vi = absI - startIndex;
      const col = vi % cols;
      const row = Math.floor(vi / cols);
      const bx = box.x + 6 + col * stride;
      const by = deckCardsY + row * (cH + 3);
      if (by + cH > panelBottom) return;
      const selected = state.selected?.kind === "structDeck" && state.selected.playerId === playerId && state.selected.index === absI;
      const canAfford = cardIsAffordable(player, card);
      drawCard(bx, by, cW, cH, card, { selected, small: true, artOnly: true, affordable: canAfford });
      if (!canAfford) {
        ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(bx, by, cW, cH);
      } else if (!selected) {
        ctx.save();
        ctx.shadowColor = "#ffd84a"; ctx.shadowBlur = 10;
        roundRect(bx, by, cW, cH, 5, null, "rgba(255,220,50,0.85)", 2);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
      addHit(bx, by, cW, cH, () => {
        if (!requireActivePlayerControl()) return;
        state.selected = { kind: "structDeck", playerId, index: absI, confirmed: false };
        state.message = `${card.name}: カード確認後に設置できます。`;
      });
    });
    drawButton(box.x + box.w - 58, deckTitleY - 12, 24, 16, "↑", () => changeStructDeckScroll(-1), null, { micro: true });
    drawButton(box.x + box.w - 30, deckTitleY - 12, 24, 16, "↓", () => changeStructDeckScroll(1), null, { micro: true });
  }
}

const CARD_TYPE_THEME = {
  unit:   { grad: ["#1a3060", "#0a1830"], accent: "#3080e0", glow: "#2060c0", text: "#80c0ff" },
  tact:   { grad: ["#2a1650", "#120830"], accent: "#8040d0", glow: "#6020a0", text: "#c080ff" },
  wild:   { grad: ["#102a18", "#081610"], accent: "#30a050", glow: "#208040", text: "#60d080" },
  grand:  { grad: ["#0e2038", "#061020"], accent: "#2070b0", glow: "#1050a0", text: "#60a0e0" },
  struct: { grad: ["#141e2a", "#0a1018"], accent: "#507080", glow: "#305060", text: "#80b0b8" },
  core:   { grad: ["#1e1a08", "#0e0c04"], accent: "#c0a030", glow: "#a08020", text: "#e0d080" },
};

const RESOURCE_PILL_COLORS = {
  electric: { bg: "rgba(20,60,140,0.65)", border: "rgba(60,130,255,0.6)", text: "#70b4ff", glow: "#3070ff" },
  heat:     { bg: "rgba(140,40,10,0.65)", border: "rgba(255,100,50,0.6)", text: "#ff9060", glow: "#ff5020" },
  kinetic:  { bg: "rgba(20,100,50,0.65)", border: "rgba(50,200,100,0.6)", text: "#60e090", glow: "#30c060" },
  mystic:   { bg: "rgba(80,20,130,0.65)", border: "rgba(160,60,255,0.6)", text: "#c070ff", glow: "#9030ff" },
  bio:      { bg: "rgba(10,100,80,0.65)", border: "rgba(30,200,160,0.6)", text: "#50e0c0", glow: "#20c0a0" },
};

function drawResourceList(player, x, y) {
  const gained = state.turnStartSummary?.playerId === player.id ? state.turnStartSummary.gained || {} : {};
  const pillW = 82; const pillH = 28;
  RESOURCE_KEYS.forEach((key, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const rx = x + col * (pillW + 4);
    const ry = y + row * (pillH + 4);
    const colors = RESOURCE_PILL_COLORS[key] || { bg: "rgba(30,40,70,0.6)", border: "rgba(80,100,180,0.5)", text: "#a0b0d0", glow: "#6080c0" };
    const amt = player.resources[key] || 0;
    roundRect(rx, ry, pillW, pillH, 5, colors.bg, colors.border, 1);
    ctx.save(); ctx.shadowColor = colors.glow || "#6080c0"; ctx.shadowBlur = 3;
    drawResourceAmount(key, amt, rx + 5, ry + 4, 20);
    if (gained[key] > 0) {
      ctx.textAlign = "right";
      ctx.font = "700 10px 'Yu Gothic UI', sans-serif";
      ctx.fillStyle = colors.text || "#a0b0d0";
      ctx.fillText(`+${gained[key]}`, rx + pillW - 4, ry + 23);
      ctx.textAlign = "left";
    }
    ctx.shadowBlur = 0; ctx.restore();
  });
}

function drawHand() {
  const player = state.players[viewerPlayerId()];
  // Dark hand zone
  const hx = layout.hand.x, hy = layout.hand.y, hw = layout.hand.w, hh = layout.hand.h;
  const grd = ctx.createLinearGradient(hx, hy, hx, hy + hh);
  grd.addColorStop(0, "rgba(16,26,58,0.96)");
  grd.addColorStop(1, "rgba(10,18,42,0.98)");
  roundRect(hx, hy, hw, hh, 8, grd, "rgba(50,90,220,0.5)", 1.5);
  // Top accent line
  ctx.fillStyle = "rgba(30,80,200,0.5)";
  roundRect(hx, hy, hw, 2, 1, "rgba(30,80,200,0.5)", null);

  ctx.fillStyle = "rgba(140,170,230,0.7)";
  ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText("HAND", hx + 16, hy + 16);
  ctx.fillStyle = "rgba(80,110,180,0.6)";
  ctx.fillText(`${player.hand.length}枚`, hx + 60, hy + 16);

  const cardH = hh - 24;
  const cardW = Math.round(cardH * CARD_ASPECT);   // 縦横比維持
  const stride = cardW + 5;
  player.hand.forEach((card, i) => {
    const cx = hx + 12 + i * stride;
    const cy = hy + 18;
    if (cx + cardW > hx + hw - 8) return;
    const isSelected = state.selected?.kind === "hand" && state.selected.playerId === player.id && state.selected.index === i;
    drawCard(cx, cy, cardW, cardH, card, { selected: isSelected, small: false, artOnly: true, affordable: cardIsAffordable(player, card) });
    addHit(cx, cy, cardW, cardH, () => {
      if (!requireActivePlayerControl()) return;
      state.selected = { kind: "hand", playerId: player.id, index: i, confirmed: false };
      // 自分の手札の場合のみメッセージを表示（相手の見ているカードを隠すため）
      if (player.id === viewerPlayerId()) {
        state.message = `${card.name}: カード確認後に使用できます。`;
      }
    });
  });
}

function drawTopHand() {
  const oppId = opponentOf(viewerPlayerId());
  const opponent = state.players[oppId];
  const { x, y, w, h } = layout.topHand;

  // 背景
  roundRect(x, y, w, h, 6, "rgba(34,6,6,0.88)", "rgba(180,40,40,0.45)", 1);

  // 手札エリア (左 ~480px)
  const handAreaW = 480;
  ctx.fillStyle = "rgba(220,140,140,0.55)";
  ctx.font = "700 10px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`HAND  ${opponent.hand.length}枚`, x + 12, y + 16);
  const cardW = 28, cardH = h - 10;
  for (let i = 0; i < opponent.hand.length; i++) {
    const cx2 = x + 80 + i * (cardW + 2);
    if (cx2 + cardW > x + handAreaW - 4) break;
    drawCardBack(cx2, y + 5, cardW, cardH);
  }

  ctx.textAlign = "left";
}

function drawLPDisplay(playerId, x, y, w, h) {
  const player = state.players[playerId];
  const isP1 = playerId === "p1";
  const hp = player.core.hp;
  const maxHp = player.core.maxHp || 20;
  const ratio = Math.max(0, hp / maxHp);
  const barColor = ratio > 0.5 ? (isP1 ? "#4090ff" : "#ff5040") : ratio > 0.25 ? "#e0a020" : "#ff2020";
  const bg = isP1 ? "rgba(10,24,70,0.92)" : "rgba(70,12,12,0.92)";
  roundRect(x, y, w, h, 5, bg, barColor, 1.5);
  // Player name
  ctx.fillStyle = "rgba(200,215,255,0.65)";
  ctx.font = "600 10px 'Yu Gothic UI', sans-serif";
  ctx.fillText(player.name, x + 7, y + 13);
  // LP label
  ctx.fillStyle = "rgba(160,180,230,0.6)";
  ctx.font = "700 9px 'Yu Gothic UI', sans-serif";
  ctx.fillText("LP", x + 7, y + 26);
  // HP number (big)
  ctx.save();
  ctx.shadowColor = barColor; ctx.shadowBlur = 8;
  ctx.fillStyle = "#f0f4ff";
  ctx.font = `800 ${hp >= 10 ? 28 : 32}px 'Yu Gothic UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${hp}`, x + w / 2, y + h - 16);
  ctx.shadowBlur = 0; ctx.restore();
  // HP bar at bottom
  const barY = y + h - 8; const barW = w - 10;
  ctx.fillStyle = "rgba(20,20,40,0.75)";
  ctx.fillRect(x + 5, barY, barW, 5);
  ctx.save();
  ctx.shadowColor = barColor; ctx.shadowBlur = 4;
  ctx.fillStyle = barColor;
  ctx.fillRect(x + 5, barY, barW * ratio, 5);
  ctx.shadowBlur = 0; ctx.restore();
  // Make core clickable
  if (playerId !== state.activePlayer && selectedUnit()) addHit(x, y, w, h, () => attackWithSelectedUnit({ kind: "core" }));
}

function drawStructBar(playerId, x, y, w, h) {
  const player = state.players[playerId];
  const isP1 = playerId === "p1";
  const accentColor = isP1 ? "rgba(40,90,220,0.6)" : "rgba(220,40,40,0.6)";
  const bg = isP1 ? "rgba(6,12,34,0.88)" : "rgba(34,6,6,0.88)";
  roundRect(x, y, w, h, 6, bg, accentColor, 1);

  // LP display (compact left)
  const lpW = 90;
  drawLPDisplay(playerId, x + 2, y + 2, lpW, h - 4);

  // Deck + GY (right side, compact)
  const pileW = 44; const pileH = h - 6;
  const gyX = x + w - pileW - 2;
  const deckX = gyX - pileW - 4;

  roundRect(deckX, y + 3, pileW, pileH, 3, "rgba(10,20,54,0.85)", "rgba(50,90,200,0.5)", 1);
  ctx.fillStyle = "#7098c8"; ctx.font = "700 8px 'Yu Gothic UI', sans-serif"; ctx.textAlign = "center";
  ctx.fillText("DECK", deckX + pileW / 2, y + 13);
  ctx.font = "700 16px 'Yu Gothic UI', sans-serif"; ctx.fillStyle = "#c0d8ff";
  ctx.fillText(String(player.mainDeck.length), deckX + pileW / 2, y + pileH - 2);

  roundRect(gyX, y + 3, pileW, pileH, 3, "rgba(14,36,14,0.85)", "rgba(40,130,60,0.5)", 1);
  ctx.fillStyle = "#70b880"; ctx.font = "700 8px 'Yu Gothic UI', sans-serif";
  ctx.fillText("GY", gyX + pileW / 2, y + 13);
  ctx.font = "700 16px 'Yu Gothic UI', sans-serif"; ctx.fillStyle = "#c0e8d0";
  ctx.fillText(String(player.dump.length), gyX + pileW / 2, y + pileH - 2);
  ctx.textAlign = "left";
  addHit(gyX, y + 3, pileW, pileH, () => { zoneViewerState = { playerId, zone: "dump", scroll: 0 }; });

  // Struct zone cards — art-only, portrait ratio, as many as fit
  const structStartX = x + lpW + 6;
  const structEndX = deckX - 4;
  const structAreaW = structEndX - structStartX;
  const cardH = h - 6;
  const cardW = Math.round(cardH * CARD_ASPECT);
  const gap = 2;
  const stride = cardW + gap;

  player.structs.forEach((card, i) => {
    const cx2 = structStartX + i * stride;
    if (cx2 + cardW > structEndX) return;
    const selected = state.selected?.kind === "fieldStruct" && state.selected.playerId === playerId && state.selected.index === i;
    drawCard(cx2, y + 3, cardW, cardH, card, { selected, small: true, artOnly: true });
    addHit(cx2, y + 3, cardW, cardH, () => {
      const detailOpen = consumeFieldDoubleClick(`fieldStruct:${playerId}:${i}`);
      state.selected = { kind: "fieldStruct", playerId, index: i, detailOpen };
      state.message = detailOpen ? `${card.name}: detail` : `${card.name} を選択`;
    });
  });
}

function drawResourceBar() {
  const viewer = viewerPlayerId();
  const player = state.players[viewer];
  const { x, y, w, h } = layout.resourceBar;
  const gained = state.turnStartSummary?.playerId === viewer ? state.turnStartSummary.gained || {} : {};
  roundRect(x, y, w, h, 5, "rgba(6,10,28,0.92)", "rgba(30,60,160,0.4)", 1);
  const pillW = 132; const pillH = h - 8;
  RESOURCE_KEYS.forEach((key, i) => {
    const px = x + 6 + i * (pillW + 3);
    const py = y + 4;
    const colors = RESOURCE_PILL_COLORS[key] || { bg: "rgba(30,40,70,0.6)", border: "rgba(80,100,180,0.5)", text: "#a0b0d0", glow: "#6080c0" };
    const amt = player.resources[key] || 0;
    roundRect(px, py, pillW, pillH, 4, colors.bg, colors.border, 1);
    ctx.save(); ctx.shadowColor = colors.glow || "#6080c0"; ctx.shadowBlur = 3;
    drawResourceAmount(key, amt, px + 6, py + 5, Math.min(28, Math.max(18, pillH - 2)));
    if (gained[key] > 0) {
      ctx.textAlign = "right";
      ctx.font = "700 11px 'Yu Gothic UI', sans-serif";
      ctx.fillStyle = colors.text || "#a0b0d0";
      ctx.fillText(`+${gained[key]}`, px + pillW - 4, py + 27);
      ctx.textAlign = "left";
    }
    ctx.shadowBlur = 0; ctx.restore();
  });
}

function drawOnlinePendingOverlay() {
  if (app.screen !== "game" || app.match.status !== "online" || !queuedOnlineAction) return;
  const x = W / 2 - 150;
  const y = 92;
  const label = queuedOnlineAction.reason || "sync";
  ctx.save();
  ctx.shadowColor = "#4080ff";
  ctx.shadowBlur = 18;
  roundRect(x, y, 300, 44, 8, "rgba(8,16,38,0.94)", "rgba(70,130,255,0.85)", 2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#d8e8ff";
  ctx.font = "700 14px 'Yu Gothic UI', sans-serif";
  ctx.fillText("SERVER PROCESSING", x + 18, y + 19);
  ctx.fillStyle = "rgba(150,185,255,0.82)";
  ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText(label, x + 18, y + 34, 264);
  ctx.restore();
}

function drawActionPanel() {
  // ボタンはカードの近くに表示するため(drawBoardActionButtons)、ここでは何もしない
}

function drawBoardActionButtons() {
  const unit = selectedUnit();
  if (!unit || unit.owner !== state.activePlayer || !canControlActivePlayer()) return;

  const player = state.players[unit.owner];
  const visualRow = boardRowToVisualRow(unit.row);
  const cellX = layout.board.x + unit.col * layout.cell.w;
  const cellY = layout.board.y + visualRow * layout.cell.h;
  const cW = layout.cell.w;
  const cH = layout.cell.h;
  const isViewerUnit = unit.owner === viewerPlayerId();

  const btnH = 28;
  const gap = 3;
  const panelW = 340;
  const panelH = btnH * 2 + gap + 8;

  let panelX = Math.round(cellX + cW / 2 - panelW / 2);
  panelX = Math.max(layout.board.x + 2, Math.min(panelX, layout.board.x + layout.board.w - panelW - 2));

  let panelY = isViewerUnit ? cellY + cH + 3 : cellY - panelH - 3;
  if (panelY + panelH > layout.board.y + layout.board.h) panelY = cellY - panelH - 3;
  if (panelY < layout.board.y) panelY = cellY + cH + 3;

  const canMoveFwd = !unit.rested && !hasKeyword(unit, "immobile");
  const canMoveBck = canMoveFwd && !unit.noRetreatUntilOpponentTurnEnd;
  const fwdRow = unit.row + player.forward;
  const bkRow = unit.row - player.forward;

  function cellOpen(row, col) {
    return row >= 0 && row < ROWS && col >= 0 && col < COLS && !state.board[row]?.[col];
  }

  function rowHasEnemy(row) {
    return rowHasEnemyUnit(unit.owner, row);
  }

  function dirBtn(label, row, col, logLabel, action, canBase) {
    const valid = canBase && cellOpen(row, col) && !rowHasEnemy(row);
    return {
      label,
      fn: valid ? () => relocateUnit(unit, row, col, logLabel, action) : null,
      dim: !valid,
    };
  }

  const hasActivate = (unit.abilities || []).some((a) => a.trigger === "onActivate");

  const advBtns = [
    dirBtn("↖", fwdRow, unit.col - 1, "前進", "moveUnit", canMoveFwd),
    dirBtn("↑前進", fwdRow, unit.col, "前進", "moveUnit", canMoveFwd),
    dirBtn("↗", fwdRow, unit.col + 1, "前進", "moveUnit", canMoveFwd),
    { label: "攻撃", fn: () => { state.message = "敵ユニットか敵コアを選択"; }, accent: "p1" },
  ];

  const retBtns = [
    dirBtn("↙", bkRow, unit.col - 1, "後退", "retreatUnit", canMoveBck),
    dirBtn("↓後退", bkRow, unit.col, "後退", "retreatUnit", canMoveBck),
    dirBtn("↘", bkRow, unit.col + 1, "後退", "retreatUnit", canMoveBck),
    ...(hasActivate ? [{ label: "起動", fn: activateSelectedUnit, accent: "p2" }] : [{ label: "", fn: null, dim: true }]),
  ];

  ctx.save();
  ctx.shadowColor = "#4080ff";
  ctx.shadowBlur = 10;
  roundRect(panelX, panelY, panelW, panelH, 6, "rgba(4,10,28,0.94)", "rgba(50,100,220,0.8)", 1.5);
  ctx.shadowBlur = 0;
  ctx.restore();

  function drawRow(btns, rowY) {
    const bw = Math.floor((panelW - 6 - (btns.length - 1) * gap) / btns.length);
    let bx = panelX + 3;
    for (const btn of btns) {
      const opts = btn.accent ? { accent: btn.accent } : btn.dim ? { accent: "dim" } : {};
      if (btn.label) drawButton(bx, rowY, bw, btnH, btn.label, btn.fn, null, opts);
      bx += bw + gap;
    }
  }

  drawRow(advBtns, panelY + 4);
  drawRow(retBtns, panelY + 4 + btnH + gap);
}

function drawTurnStartSummaryPanel() {
  const summary = state.turnStartSummary;
  if (!summary) return;
  const x = 560;
  const y = 160;
  const w = 320;
  const h = 58;
  const isViewer = summary.playerId === viewerPlayerId();
  const bg = isViewer ? "rgba(10,30,80,0.92)" : "rgba(80,10,10,0.92)";
  const border = isViewer ? "rgba(50,120,255,0.7)" : "rgba(220,50,50,0.7)";
  ctx.save();
  ctx.shadowColor = isViewer ? "#2060ff" : "#ff2020";
  ctx.shadowBlur = 12;
  roundRect(x, y, w, h, 8, bg, border, 1.5);
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.fillStyle = "#d0e8ff";
  ctx.font = "700 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`TURN START: ${summary.playerName}`, x + 14, y + 20, w - 28);
  ctx.fillStyle = "rgba(160,190,240,0.8)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`資源 +${formatResourceTotals(summary.gained)} / ドロー ${summary.drawn}枚`, x + 14, y + 42, w - 28);
}

function drawChoiceOverlay() {
  const pending = state.pendingChoice;
  if (!pending) return;
  // deployHeroFromAttack/chooseCell overlays on top of board without darkening
  if (pending.type === "deployHeroFromAttack" && pending.step === "chooseCell") {
    drawDeployHeroFromAttackPanel(pending);
    return;
  }
  ctx.fillStyle = "rgba(0, 0, 8, 0.75)";
  ctx.fillRect(0, 0, W, H);
  if (pending.type === "mysticCapture") drawMysticCapturePanel(pending);
  else if (pending.type === "revealPick") drawRevealPickPanel(pending);
  else if (pending.type === "searchDeckPick") drawSearchDeckPickPanel(pending);
  else if (pending.type === "payOrDamage") drawPayOrDamagePanel(pending);
  else if (pending.type === "dumpWarBondReturn") drawDumpWarBondReturnPanel(pending);
  else if (pending.type === "reviveFromDump") drawReviveFromDumpPanel(pending);
  else if (pending.type === "reviveFromExile") drawReviveFromExilePanel(pending);
  else if (pending.type === "chooseActivationResource") drawChooseActivationResourcePanel(pending);
  else if (pending.type === "chooseGainResource") drawChooseGainResourcePanel(pending);
  else if (pending.type === "lifeCounterPayment") drawLifeCounterPaymentPanel(pending);
  else if (pending.type === "selectDestroyCards") drawSelectDestroyCardsPanel(pending);
  else if (pending.type === "kaijuAwaken") drawKaijuAwakenPanel(pending);
  else if (pending.type === "payForBuff") drawPayForBuffPanel(pending);
  else if (pending.type === "revealTagsForResources") drawRevealTagsForResourcesPanel(pending);
  else if (pending.type === "discardForDraw") drawDiscardForDrawPanel(pending);
  else if (pending.type === "coreStructStartDiscard") drawCoreStructStartDiscardPanel(pending);
  else if (pending.type === "deployHeroFromAttack") drawDeployHeroFromAttackPanel(pending);
  else if (pending.type === "intelAgencyCancel") drawIntelAgencyCancelPanel(pending);
  else if (pending.type === "destroyEnemyStruct") drawDestroyEnemyStructPanel(pending);
  else if (pending.type === "chargeAttack") drawChargeAttackPanel(pending);
}

function drawChoicePanelBase(x, y, w, h, accentColor, shadowColor) {
  ctx.save();
  ctx.shadowColor = shadowColor || "#8040ff";
  ctx.shadowBlur = 30;
  roundRect(x, y, w, h, 12, "rgba(8,10,28,0.97)", accentColor, 2);
  ctx.shadowBlur = 0;
  ctx.restore();
  const acGrd = ctx.createLinearGradient(x, y, x + w, y);
  acGrd.addColorStop(0, "transparent");
  acGrd.addColorStop(0.3, accentColor);
  acGrd.addColorStop(0.7, accentColor);
  acGrd.addColorStop(1, "transparent");
  ctx.fillStyle = acGrd;
  ctx.fillRect(x, y, w, 2);
}

function drawSelectableChoiceCard(x, y, cardW, cardH, card, { selected = false, disabled = false, label = "", onClick = null } = {}) {
  drawCard(x, y, cardW, cardH, card, { selected, small: true, affordable: !disabled });
  if (disabled) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, cardW, cardH);
  }
  if (selected) {
    ctx.save();
    ctx.shadowColor = "#ffd84a";
    ctx.shadowBlur = 12;
    roundRect(x - 3, y - 3, cardW + 6, cardH + 6, 8, null, "#ffd84a", 3);
    ctx.restore();
  }
  if (label) {
    const ly = y + cardH + 4;
    roundRect(x, ly, cardW, 20, 5, selected ? "rgba(110,78,18,0.90)" : "rgba(8,14,32,0.88)", selected ? "#ffd84a" : "rgba(70,100,180,0.45)", 1);
    ctx.fillStyle = selected ? "#fff2b0" : "#c8d8f0";
    ctx.font = "700 10px 'Yu Gothic UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x + cardW / 2, ly + 14, cardW - 8);
    ctx.textAlign = "left";
  }
  if (onClick && !disabled) addHit(x, y, cardW, cardH + (label ? 24 : 0), onClick);
}

function drawMysticCapturePanel(pending) {
  const x = 388, y = 202, w = 664, h = 392;
  drawChoicePanelBase(x, y, w, h, "rgba(100,50,200,0.7)");
  ctx.fillStyle = "#d0b0ff";
  ctx.font = "700 22px 'Yu Gothic UI', sans-serif";
  ctx.fillText("神秘捕縛", x + 28, y + 38);
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillStyle = "rgba(180,160,220,0.8)";
  ctx.fillText("手札の神秘タグユニットを選択します。捨てると1回、除外すると2回、登場時効果を発動します。", x + 28, y + 64, w - 56);
  const choices = mysticCaptureChoices();
  if (!choices.length) {
    ctx.fillStyle = "rgba(180,160,220,0.8)";
    ctx.font = "700 15px 'Yu Gothic UI', sans-serif";
    ctx.fillText("選択できる神秘ユニットがありません。", x + 28, y + 126);
  }
  choices.forEach(({ card, handIndex }, i) => {
    const cardX = x + 28 + (i % 2) * 304;
    const cardY = y + 98 + Math.floor(i / 2) * 62;
    const selected = pending.selectedHandIndexes.includes(handIndex);
    const fill = selected ? "rgba(100,60,200,0.7)" : "rgba(20,24,60,0.7)";
    const border = selected ? "rgba(160,100,255,0.9)" : "rgba(60,70,160,0.5)";
    roundRect(cardX, cardY, 282, 48, 6, fill, border, selected ? 2 : 1);
    ctx.fillStyle = selected ? "#d0b0ff" : "#8090c0";
    ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
    ctx.fillText(`${selected ? "✓ " : ""}${card.name}`, cardX + 10, cardY + 20, 260);
    ctx.fillStyle = "rgba(140,130,180,0.7)";
    ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
    ctx.fillText(`${tagLabels(card).join("/")} / ${formatCost(card.cost)}`, cardX + 10, cardY + 38, 260);
    addHit(cardX, cardY, 282, 48, () => toggleMysticCaptureChoice(handIndex));
  });
  const selectedCount = pending.selectedHandIndexes.length;
  ctx.fillStyle = "rgba(180,160,220,0.8)";
  ctx.font = "700 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`${selectedCount}枚選択中`, x + 28, y + h - 82);
  drawButton(x + 28, y + h - 58, 150, 36, "選ばず解決", () => resolveMysticCaptureChoice({ exile: false }));
  drawButton(x + 196, y + h - 58, 180, 36, "捨てて1回発動", () => resolveMysticCaptureChoice({ exile: false }));
  drawButton(x + 394, y + h - 58, 210, 36, "除外して2回発動", () => resolveMysticCaptureChoice({ exile: true }), null, { accent: "p1" });
}

function drawSearchDeckPickPanel(pending) {
  const cards = pending.candidates || [];
  const colW = 200, colH = 80, cols = Math.min(cards.length, 3);
  const rows = Math.ceil(cards.length / cols);
  const panelW = Math.max(500, cols * (colW + 16) + 56);
  const panelH = Math.max(350, rows * (colH + 16) + 120);
  const x = Math.round((W - panelW) / 2);
  const y = Math.round((H - panelH) / 2);
  drawChoicePanelBase(x, y, panelW, panelH, "rgba(120,80,180,0.7)", "#8040ff");
  ctx.fillStyle = "#d0b8ff";
  ctx.font = "700 20px 'Yu Gothic UI', sans-serif";
  ctx.fillText("デッキ検索：1枚選んで手札に", x + 24, y + 36);
  const isController = canControlChoicePlayer(pending.playerId);
  cards.forEach((card, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const cx = x + 28 + col * (colW + 16);
    const cy = y + 72 + row * (colH + 16);
    roundRect(cx, cy, colW, colH, 6, "rgba(30,20,50,0.8)", "rgba(140,100,220,0.8)", 2);
    ctx.fillStyle = "#e8d8ff";
    ctx.font = "700 13px 'Yu Gothic UI', sans-serif";
    ctx.fillText(card.name, cx + 8, cy + 22, colW - 16);
    ctx.fillStyle = "rgba(180,160,220,0.7)";
    ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
    ctx.fillText(card.type + (card.tags?.length ? "  " + card.tags.slice(0, 2).join("/") : ""), cx + 8, cy + 40, colW - 16);
    ctx.fillText(formatCost(card.cost || {}), cx + 8, cy + 56, colW - 16);
    if (isController) addHit(cx, cy, colW, colH, () => { resolveSearchDeckPick(i); render(); });
  });
}

function drawRevealPickPanel(pending) {
  const cards = pending.revealed || [];
  const colW = 200, colH = 80, cols = Math.min(cards.length, 3);
  const rows = Math.ceil(cards.length / cols);
  const panelW = Math.max(500, cols * (colW + 16) + 56);
  const panelH = Math.max(350, rows * (colH + 16) + 140);
  const x = Math.round((W - panelW) / 2);
  const y = Math.round((H - panelH) / 2);
  drawChoicePanelBase(x, y, panelW, panelH, "rgba(40,120,200,0.7)", "#2060ff");
  ctx.fillStyle = "#a0d0ff";
  ctx.font = "700 20px 'Yu Gothic UI', sans-serif";
  ctx.fillText("デッキ公開：1枚選んで手札に", x + 24, y + 36);
  if (pending.tagFilter) {
    ctx.fillStyle = "rgba(160,200,255,0.7)";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText(`[${pending.tagFilter}]タグのカードのみ選択可`, x + 24, y + 56);
  }
  const isController = canControlChoicePlayer(pending.playerId);
  cards.forEach((card, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const cx = x + 28 + col * (colW + 16);
    const cy = y + 72 + row * (colH + 16);
    const pickable = !pending.tagFilter || (card.tags || []).includes(pending.tagFilter);
    const fill = pickable ? "rgba(20,50,100,0.8)" : "rgba(30,20,40,0.6)";
    const border = pickable ? "rgba(60,140,220,0.8)" : "rgba(80,60,100,0.4)";
    roundRect(cx, cy, colW, colH, 6, fill, border, pickable ? 2 : 1);
    ctx.fillStyle = pickable ? "#d0eeff" : "#706080";
    ctx.font = "700 13px 'Yu Gothic UI', sans-serif";
    ctx.fillText(card.name, cx + 8, cy + 22, colW - 16);
    ctx.fillStyle = "rgba(160,180,220,0.7)";
    ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
    ctx.fillText(card.type + (card.tags?.length ? "  " + card.tags.slice(0, 2).join("/") : ""), cx + 8, cy + 40, colW - 16);
    ctx.fillText(formatCost(card.cost || {}), cx + 8, cy + 56, colW - 16);
    if (isController && pickable) addHit(cx, cy, colW, colH, () => { resolveRevealPick(i); render(); });
  });
  if (isController) {
    drawButton(x + panelW - 220, y + panelH - 52, 196, 36, "選ばずデッキ下へ", () => { resolveRevealPickSkip(); render(); });
  }
}

function drawIntelAgencyCancelPanel(pending) {
  const x = 420, y = 280, w = 600, h = 220;
  drawChoicePanelBase(x, y, w, h, "rgba(60,100,180,0.7)", "#4080ff");
  ctx.fillStyle = "#d0e8ff";
  ctx.font = "700 20px 'Yu Gothic UI', sans-serif";
  ctx.fillText("諜報機関", x + 28, y + 36);
  ctx.fillStyle = "rgba(180,210,255,0.85)";
  ctx.font = "600 14px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`相手が「${pending.tactName}」を使用しました。無効化しますか？`, x + 28, y + 66, w - 56);
  const costLabel = pending.preferPeople ? "人③" : "電③";
  ctx.fillText(`無効化する場合：${costLabel}を支払います。`, x + 28, y + 92);
  const isController = canControlChoicePlayer(pending.playerId);
  if (isController) {
    drawButton(x + 28, y + h - 58, 240, 36, `${costLabel}で無効化`, () => { resolveIntelAgencyCancel(true); render(); }, null, { accent: "p1" });
    drawButton(x + 290, y + h - 58, 220, 36, "効果を通す", () => { resolveIntelAgencyCancel(false); render(); });
  }
}

function drawChargeAttackPanel(pending) {
  const x = 420, y = 280, w = 600, h = 220;
  drawChoicePanelBase(x, y, w, h, "rgba(60,120,200,0.75)", "#60a0ff");
  ctx.fillStyle = "#d0e8ff";
  ctx.font = "700 20px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`「${pending.unitName}」の攻撃`, x + 28, y + 36);
  ctx.fillStyle = "rgba(190,220,255,0.9)";
  ctx.font = "600 14px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`帯電攻撃：電${pending.electricCost}を追加支払い、装甲を無視`, x + 28, y + 64);
  ctx.fillText("通常攻撃：追加コストなし（装甲適用）", x + 28, y + 86);
  const isController = canControlChoicePlayer(pending.playerId);
  if (isController) {
    drawButton(x + 28, y + h - 58, 240, 36, `帯電攻撃（電${pending.electricCost}）`, () => { resolveChargeAttack(true); render(); }, null, { accent: "p1" });
    drawButton(x + 290, y + h - 58, 220, 36, "通常攻撃", () => { resolveChargeAttack(false); render(); });
  }
}

function drawDestroyEnemyStructPanel(pending) {
  const opponentId = opponentOf(pending.playerId);
  const structs = state.players[opponentId].structs || [];
  const sourceCard = pending.queueItem?.card;
  const validIndices = new Set(getDestroyableEnemyStructEntries(state, opponentId, sourceCard).map((entry) => entry.index));
  const tauntRequired = enemyStructChoicePool(structs).length < structs.length;
  const cardW = 96;
  const cardH = Math.round(cardW / CARD_ASPECT);
  const gap = 14;
  const maxCols = 5;
  enemyStructChoiceScroll = Math.max(0, Math.min(enemyStructChoiceScroll, Math.max(0, structs.length - maxCols)));
  const visibleStructs = structs
    .map((struct, index) => ({ struct, index }))
    .slice(enemyStructChoiceScroll, enemyStructChoiceScroll + maxCols);
  const cols = Math.max(visibleStructs.length, 1);
  const panelW = Math.max(520, cols * (cardW + gap) + 96);
  const panelH = 300;
  const x = Math.round((W - panelW) / 2);
  const y = Math.round((H - panelH) / 2);
  drawChoicePanelBase(x, y, panelW, panelH, "rgba(180,60,60,0.75)", "#ff4040");
  ctx.fillStyle = "#ffc0c0";
  ctx.font = "700 20px 'Yu Gothic UI', sans-serif";
  const remainLabel = pending.remaining > 1 ? `（残り${pending.remaining}枚）` : "";
  ctx.fillText(`${pending.cardName}: 破壊するストラクトを選択${remainLabel}`, x + 24, y + 34);
  ctx.fillStyle = "rgba(255,190,190,0.85)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  let hint = "クリックで破壊するストラクトを選んでください。";
  if (tauntRequired) hint += " [構造挑発]があるストラクトのみ選択可。";
  if (structs.some((s) => keywordValue(s, "effectProtect") > 0)) hint += " [効果保護]は[効果貫通]以上が必要。";
  ctx.fillText(hint, x + 24, y + 56, panelW - 48);
  const isController = canControlChoicePlayer(pending.playerId);
  const canPayFuel = !pending.fuelCost || (state.players[pending.playerId].resources.fuel || 0) >= pending.fuelCost;
  const startX = x + 28;
  const startY = y + 78;
  if (!structs.length) {
    ctx.fillStyle = "rgba(220,180,180,0.8)";
    ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
    ctx.fillText("相手のストラクトがありません", startX, startY + 24);
  } else {
    visibleStructs.forEach(({ struct, index: idx }, visIdx) => {
      const cx = startX + visIdx * (cardW + gap);
      const cy = startY;
      const selectable = validIndices.has(idx);
      let label = "";
      if (!selectable) {
        if (!canDestroyEnemyStructByEffect(sourceCard, struct)) label = "効果保護";
        else if (tauntRequired) label = "挑発対象外";
        else label = "選択不可";
      }
      drawSelectableChoiceCard(cx, cy, cardW, cardH, struct, {
        disabled: !selectable,
        label,
        onClick: isController && selectable && canPayFuel
          ? () => { resolveDestroyEnemyStructChoice(idx); }
          : null,
      });
    });
    if (structs.length > maxCols) {
      const navY = startY + cardH + 28;
      if (enemyStructChoiceScroll > 0) {
        drawButton(x + 20, navY, 48, 24, "◀", () => { enemyStructChoiceScroll--; render(); });
      }
      ctx.fillStyle = "rgba(255,200,200,0.8)";
      ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${enemyStructChoiceScroll + 1}〜${Math.min(enemyStructChoiceScroll + maxCols, structs.length)} / ${structs.length}`, x + panelW / 2, navY + 16);
      ctx.textAlign = "left";
      if (enemyStructChoiceScroll + maxCols < structs.length) {
        drawButton(x + panelW - 68, navY, 48, 24, "▶", () => { enemyStructChoiceScroll++; render(); });
      }
    }
  }
  if (isController) {
    if (pending.fuelCost > 0) {
      ctx.fillStyle = canPayFuel ? "rgba(255,210,210,0.85)" : "#ff9090";
      ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
      ctx.fillText(`破壊ごとに燃${pending.fuelCost}が必要`, x + 24, y + panelH - 62);
    }
    if (pending.remaining > 1) {
      drawButton(x + panelW - 220, y + panelH - 52, 196, 36, "破壊を終了", () => { resolveDestroyEnemyStructSkip(); render(); });
    }
  }
}

function drawPayOrDamagePanel(pending) {
  const x = 420, y = 280, w = 600, h = 240;
  drawChoicePanelBase(x, y, w, h, "rgba(180,60,60,0.7)", "#ff4040");
  ctx.fillStyle = "#ffb0b0";
  ctx.font = "700 20px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`「${pending.cardName}」ターン開始時効果`, x + 28, y + 36);
  ctx.fillStyle = "rgba(255,180,180,0.85)";
  ctx.font = "600 14px 'Yu Gothic UI', sans-serif";
  const resLabel = RESOURCE_LABELS[pending.resource] || pending.resource;
  ctx.fillText(`${resLabel}を${pending.amount}支払うか、自分のコアに${pending.damage}ダメージを受けてください。`, x + 28, y + 66, w - 56);
  const player = state.players[pending.playerId];
  const curRes = player.resources[pending.resource] || 0;
  ctx.fillStyle = "rgba(255,200,180,0.7)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`現在の${resLabel}: ${curRes}  /  コアHP: ${player.core.hp}`, x + 28, y + 92);
  const isController = canControlActivePlayer() && pending.playerId === controlledPlayerId();
  if (isController) {
    drawButton(x + 28, y + h - 58, 240, 36, `${resLabel}${pending.amount}を支払う`, () => { resolvePayOrDamage(true); render(); }, null, { accent: "p1" });
    drawButton(x + 290, y + h - 58, 220, 36, `コアに${pending.damage}ダメージ`, () => { resolvePayOrDamage(false); render(); });
  }
}

function drawRevealTagsForResourcesPanel(pending) {
  const isController = canControlActivePlayer() && pending.playerId === controlledPlayerId();
  const sel = pending.selected || {};
  const tagGroups = pending.tagGroups || [];
  const cardW = 80, cardH = 112, gap = 8;
  const groupW = Math.max(cardW + 20, 110);
  const pw = Math.max(500, tagGroups.length * (groupW + gap) + 60);
  const ph = 320;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  drawChoicePanelBase(px, py, pw, ph, "rgba(180,150,40,0.7)", "#e0c030");
  ctx.fillStyle = "#fff8c0";
  ctx.font = "700 17px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`「${pending.cardName}」— タグを公開して資源を得る`, px + 20, py + 30);
  ctx.fillStyle = "rgba(240,220,160,0.85)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  const count = Object.values(sel).filter((v) => v != null).length;
  const gain = count * (pending.resourcePer || 3);
  ctx.fillText(`各タグのカードを1枚まで選択して公開。公開枚数×${pending.resourcePer || 3}の人・金を得る。（現在${count}枚 → 人+${gain} 金+${gain}）`, px + 20, py + 52, pw - 40);
  let gx = px + 20;
  const cardsY = py + 70;
  for (const group of tagGroups) {
    ctx.fillStyle = "#e8d870";
    ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText(`[${group.tag}]`, gx, cardsY - 4);
    if (group.cards.length === 0) {
      ctx.fillStyle = "rgba(180,160,80,0.5)";
      ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
      ctx.fillText("なし", gx + 4, cardsY + 20);
    } else {
      group.cards.slice(0, 3).forEach((card, i) => {
        const cx = gx + i * (cardW + 4);
        const isSelected = sel[group.tag] === i;
        if (isController) {
          addHit(cx, cardsY, cardW, cardH, () => {
            if (sel[group.tag] === i) delete pending.selected[group.tag];
            else pending.selected[group.tag] = i;
            render();
          });
        }
        drawCard(cx, cardsY, cardW, cardH, card, { selected: isSelected, small: true });
      });
    }
    gx += groupW + gap;
  }
  if (isController) {
    drawButton(px + pw - 250, py + ph - 48, 110, 34, "確定", () => resolveRevealTagsForResources({ ...sel }), null, { accent: "p1" });
    drawButton(px + pw - 130, py + ph - 48, 110, 34, "何も見せない", () => resolveRevealTagsForResources({}));
  }
}

function drawDeployHeroFromAttackPanel(pending) {
  const isController = canControlActivePlayer() && pending.playerId === controlledPlayerId();
  if (pending.step === "chooseGold") {
    // Gold selection step
    const player = state.players[pending.playerId];
    const availableGold = player.resources.funds || 0;
    const maxGold = Math.max(...(pending.heroOptions || []).map(h => h.minGold || 1));
    const px = W / 2 - 240, py = H / 2 - 120;
    const pw = 480, ph = 240;
    drawChoicePanelBase(px, py, pw, ph, "rgba(200,160,20,0.7)", "#d4a020");
    ctx.fillStyle = "#fff4c0";
    ctx.font = "700 17px 'Yu Gothic UI', sans-serif";
    ctx.fillText(`「${pending.cardName}」— 支払う金を選択`, px + 20, py + 30);
    ctx.fillStyle = "rgba(230,200,120,0.85)";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText(`現在の金: ${availableGold} | 支払う金: ${pending.goldToPay}`, px + 20, py + 56);
    const btnW = 60, btnH = 28, btnGap = 8;
    const startX = px + 20;
    for (let g = 0; g <= maxGold && g <= availableGold; g++) {
      const btnX = startX + (g % 8) * (btnW + btnGap);
      const btnY = py + 80 + Math.floor(g / 8) * (btnH + btnGap);
      const goldValid = hasDeployableHeroWithGold(pending.heroOptions, g, availableGold);
      if (isController) {
        drawButton(btnX, btnY, btnW, btnH, `${g}`, goldValid ? () => {
          pending.goldToPay = g;
          pending.step = "chooseHero";
          render();
        } : null, null, pending.goldToPay === g ? { accent: "p1" } : goldValid ? {} : { accent: "dim" });
      } else {
        drawButton(btnX, btnY, btnW, btnH, `${g}`, null, null, {});
      }
    }
    return;
  }
  if (pending.step === "chooseCell") {
    // Highlight eligible cells on board (drawn over the board overlay)
    const { adjCells } = pending;
    for (const { row, col } of (adjCells || [])) {
      const visualRow = boardRowToVisualRow(row);
      const cx2 = layout.board.x + col * layout.cell.w;
      const cy2 = layout.board.y + visualRow * layout.cell.h;
      const cw2 = layout.cell.w, ch2 = layout.cell.h;
      ctx.save();
      ctx.shadowColor = "#40ff80";
      ctx.shadowBlur = 8;
      roundRect(cx2 + 2, cy2 + 2, cw2 - 4, ch2 - 4, 4, "rgba(40,200,80,0.18)", "#40ff80", 3);
      ctx.restore();
      if (isController) {
        addHit(cx2, cy2, cw2, ch2, () => resolveDeployHeroCell(row, col));
      }
    }
    const px = W / 2 - 200, py = 20;
    roundRect(px, py, 400, 36, 6, "rgba(8,20,8,0.92)", "#40ff80", 1.5);
    ctx.fillStyle = "#a0ffb0";
    ctx.font = "700 14px 'Yu Gothic UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("出撃させるマスをクリックしてください", W / 2, py + 24);
    ctx.textAlign = "left";
    return;
  }
  // step === "chooseHero"
  const player = state.players[pending.playerId];
  const heroOptions = pending.heroOptions || [];
  const cardW = 80, cardH = 112, gap = 8;
  const cols = Math.max(1, heroOptions.length);
  const pw = Math.max(400, cols * (cardW + gap) + 60);
  const ph = 300;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  drawChoicePanelBase(px, py, pw, ph, "rgba(200,160,20,0.7)", "#d4a020");
  ctx.fillStyle = "#fff4c0";
  ctx.font = "700 17px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`「${pending.cardName}」— 出撃させる[勇者]を選択`, px + 20, py + 30);
  ctx.fillStyle = "rgba(230,200,120,0.85)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText("金を払って[勇者]ユニットを隣接マスに出撃。次の自分のターン終了時に手札へ戻る。", px + 20, py + 52, pw - 40);
  const cardsY = py + 68;
  heroOptions.forEach((opt, i) => {
    const cx = px + 20 + i * (cardW + gap);
    const canAfford = canDeployHeroWithGold(player, opt, pending.goldToPay);
    const isSelected = pending.selectedHeroIdx === i;
    if (isController && canAfford) {
      addHit(cx, cardsY, cardW, cardH, () => resolveDeployHeroChooseHero(i));
    }
    drawCard(cx, cardsY, cardW, cardH, opt.card, { selected: isSelected, small: true, dim: !canAfford });
    ctx.fillStyle = canAfford ? "#ffe060" : "#888";
    ctx.font = `600 10px 'Yu Gothic UI', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`金${opt.minGold}必要 (支払${pending.goldToPay})`, cx + cardW / 2, cardsY + cardH + 14);
    ctx.textAlign = "left";
  });
  if (isController) {
    const hasSelected = pending.selectedHeroIdx != null;
    drawButton(px + 20, py + ph - 48, 110, 34, "決定", hasSelected ? () => resolveDeployHeroChooseHero(pending.selectedHeroIdx) : null, null, hasSelected ? { accent: "p1" } : { accent: "dim" });
    drawButton(px + pw - 130, py + ph - 48, 110, 34, "スキップ", () => {
      state.pendingChoice = null;
      state.selected = null;
      processEffectQueue(state);
      syncOnlineAction("resolveChoice", pending.playerId);
      render();
    });
  }
}

function drawDiscardForDrawPanel(pending) {
  const isController = canControlActivePlayer() && pending.playerId === controlledPlayerId();
  const player = state.players[pending.playerId];
  const hand = player.hand;
  const cardW = 80, cardH = 112, gap = 8;
  const cols = Math.min(hand.length, 8);
  const pw = Math.max(400, cols * (cardW + gap) + 40);
  const ph = 270;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  const sel = pending.selectedIdx;
  drawChoicePanelBase(px, py, pw, ph, "rgba(80,40,140,0.7)", "#9060e0");
  ctx.fillStyle = "#e8d0ff";
  ctx.font = "700 17px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`「${pending.cardName}」— 捨てるカードを1枚選んでください`, px + 20, py + 30);
  ctx.fillStyle = "rgba(200,170,255,0.8)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText("捨てた後1枚ドロー。[純人間]ならさらに1枚ドロー。", px + 20, py + 52);
  const cardsY = py + 68;
  hand.forEach((card, i) => {
    const cx = px + 20 + i * (cardW + gap);
    if (isController) {
      addHit(cx, cardsY, cardW, cardH, () => {
        pending.selectedIdx = (pending.selectedIdx === i) ? undefined : i;
        render();
      });
    }
    drawCard(cx, cardsY, cardW, cardH, card, { selected: sel === i, small: true });
  });
  if (isController && sel !== undefined) {
    drawButton(px + pw / 2 - 60, py + ph - 48, 120, 34, "捨てる", () => resolveDiscardForDraw(sel), null, { accent: "p1" });
  }
}

function drawCoreStructStartDiscardPanel(pending) {
  const isController = canControlActivePlayer() && pending.playerId === controlledPlayerId();
  const player = state.players[pending.playerId];
  const hand = player.hand;
  const cardW = 80, cardH = 112, gap = 8;
  const cols = Math.min(hand.length, 8);
  const pw = Math.max(500, cols * (cardW + gap) + 40);
  const ph = 310;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  const sel = pending.selectedIdx;
  drawChoicePanelBase(px, py, pw, ph, "rgba(40,80,160,0.7)", "#4060c0");
  ctx.fillStyle = "#c0d8ff";
  ctx.font = "700 17px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`「${pending.cardName}」— ストラクトフェーズ開始時`, px + 20, py + 30);
  ctx.fillStyle = "rgba(180,210,255,0.9)";
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  const discardLabel = Object.entries(pending.gainOnDiscard).map(([r, a]) => `${RESOURCE_LABELS[r] || r}+${a}`).join("・");
  const declineLabel = Object.entries(pending.gainOnDecline).map(([r, a]) => `${RESOURCE_LABELS[r] || r}+${a}`).join("・");
  ctx.fillText(`捨てた場合：${discardLabel}`, px + 20, py + 54);
  ctx.fillText(`捨てない場合：コアHP-${pending.hpCostOnDecline}${declineLabel ? `、${declineLabel}` : ""}`, px + 20, py + 74);
  const cardsY = py + 94;
  hand.forEach((card, i) => {
    const cx = px + 20 + i * (cardW + gap);
    if (isController) {
      addHit(cx, cardsY, cardW, cardH, () => {
        pending.selectedIdx = pending.selectedIdx === i ? undefined : i;
        render();
      });
    }
    drawCard(cx, cardsY, cardW, cardH, card, { selected: sel === i, small: true });
  });
  if (isController) {
    if (sel !== undefined) {
      drawButton(px + pw / 2 - 135, py + ph - 48, 120, 34, "捨てる", () => resolveCoreStructStartDiscard(sel), null, { accent: "p1" });
    }
    drawButton(px + pw / 2 + (sel !== undefined ? 5 : -100), py + ph - 48, 210, 34, `スキップ（コアHP-${pending.hpCostOnDecline}）`, () => resolveCoreStructStartDecline());
  }
}

function drawDumpWarBondReturnPanel(pending) {
  const x = 420, y = 300, w = 600, h = 220;
  drawChoicePanelBase(x, y, w, h, "rgba(120,90,40,0.85)", "#d0a040");
  ctx.fillStyle = "#fff0d0";
  ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`墓地の「${pending.cardName}」`, x + 28, y + 36);
  ctx.fillStyle = "rgba(255,240,210,0.95)";
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`金${pending.amount}を支払って手札に加えますか？`, x + 28, y + 64, w - 56);
  const player = state.players[pending.playerId];
  const curFunds = player.resources.funds || 0;
  ctx.fillStyle = "rgba(220,200,160,0.8)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`現在の金: ${curFunds}`, x + 28, y + 96);
  const isController = canControlChoicePlayer(pending.playerId);
  if (isController) {
    const canPay = curFunds >= pending.amount;
    drawButton(
      x + 20,
      y + h - 52,
      270,
      38,
      `金${pending.amount}を支払う`,
      canPay ? () => resolveDumpWarBondReturn(true) : null,
      null,
      canPay ? { accent: "p1" } : { accent: "dim" },
    );
    drawButton(x + 310, y + h - 52, 270, 38, "スキップ", () => resolveDumpWarBondReturn(false));
  }
}

function drawPayForBuffPanel(pending) {
  console.log(`drawPayForBuffPanel called:`, pending);
  const x = 420, y = 300, w = 600, h = 260;
  drawChoicePanelBase(x, y, w, h, "rgba(40,80,140,0.85)", "#5090ff");
  ctx.fillStyle = "#e0f0ff";
  ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`「${pending.cardName}」被ダメージ時効果`, x + 28, y + 36);
  ctx.fillStyle = "rgba(200,230,255,0.95)";
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  const resLabel = RESOURCE_LABELS[pending.resource] || pending.resource;
  ctx.fillText(
    `${resLabel}を${pending.amount}支払うことで、+${pending.atkBuff}/+${pending.hpBuff}の修正を得ます。`,
    x + 28, y + 64, w - 56
  );
  const player = state.players[pending.playerId];
  const curRes = player.resources[pending.resource] || 0;
  ctx.fillStyle = "rgba(180,220,255,0.8)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`現在の${resLabel}: ${curRes}`, x + 28, y + 100);
  // ボタンを表示する条件：このプレイヤーを操作しているユーザーか
  // （相手のターン中に自分が被ダメージを受けた場合、activePlayer ≠ pending.playerId なため、
  //  canControlActivePlayer() は false になる。そのため、単純に playerId チェックのみ）
  const isController = canControlChoicePlayer(pending.playerId);
  console.log(`drawPayForBuffPanel: isController=${isController}, playerId=${pending.playerId}, controlled=${controlledPlayerId()}`);
  if (isController) {
    const canPay = curRes >= pending.amount;
    console.log(`drawPayForBuffPanel buttons: canPay=${canPay}, curRes=${curRes}, amount=${pending.amount}`);
    drawButton(x + 20, y + h - 52, 270, 38, `${resLabel}${pending.amount}を支払い強化`, canPay ? () => resolvePayForBuff(true) : null, null, canPay ? { accent: "p1" } : { accent: "dim" });
    drawButton(x + 310, y + h - 52, 270, 38, "スキップ", () => resolvePayForBuff(false));
  } else {
    console.log(`Controller check failed: cannot draw buttons`);
  }
}

function drawReviveFromDumpPanel(pending) {
  const eligible = pending.eligible || [];
  const cardW = 108, cardH = 150, gap = 16;
  const cols = Math.min(eligible.length, 5);
  const w = Math.max(480, cols * (cardW + gap) + gap + 60);
  const h = 280;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawChoicePanelBase(x, y, w, h, "rgba(80,40,140,0.75)", "#c060ff");
  ctx.fillStyle = "#d8b0ff";
  ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`墓地から蘇生（コスト総量${pending.maxCost}以下）`, x + 24, y + 32);
  ctx.fillStyle = "rgba(190,160,240,0.8)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText("蘇生するユニットを選んでください。", x + 24, y + 54);
  const isController = canControlActivePlayer() && pending.playerId === controlledPlayerId();
  const startX = x + 30;
  const cardsY = y + 70;
  eligible.forEach((card, i) => {
    const cx = startX + i * (cardW + gap);
    drawCard(cx, cardsY, cardW, cardH, card, { selected: false });
    if (isController) addHit(cx, cardsY, cardW, cardH, () => { resolveReviveFromDump(i); render(); });
  });
  if (isController) {
    drawButton(x + w - 120, y + h - 44, 100, 30, "スキップ", () => { resolveReviveFromDumpSkip(); render(); });
  }
}

function drawReviveFromExilePanel(pending) {
  const eligible = pending.eligible || [];
  const cardW = 108, cardH = 150, gap = 16;
  const cols = Math.min(eligible.length, 5);
  const w = Math.max(480, cols * (cardW + gap) + gap + 60);
  const h = 300;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawChoicePanelBase(x, y, w, h, "rgba(100,20,60,0.85)", "#ff4080");
  ctx.fillStyle = "#ffc0d8";
  ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText("除外ゾーンから召喚", x + 24, y + 32);
  ctx.fillStyle = "rgba(255,200,220,0.9)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText("場に出すユニットを選んでください。（自分の第一行に出る）", x + 24, y + 54);
  const isController = canControlActivePlayer() && pending.playerId === controlledPlayerId();
  const startX = x + 30;
  const cardsY = y + 70;
  eligible.forEach((card, i) => {
    const cx = startX + i * (cardW + gap);
    drawCard(cx, cardsY, cardW, cardH, card, { selected: false });
    if (isController) addHit(cx, cardsY, cardW, cardH, () => { resolveReviveFromExile(i); render(); });
  });
  if (isController) {
    drawButton(x + w - 120, y + h - 44, 100, 30, "スキップ", () => { resolveReviveFromExileSkip(); render(); });
  }
}

function drawChooseActivationResourcePanel(pending) {
  const player = state.players[pending.playerId];
  const affordable = RESOURCE_KEYS.filter((r) => (player.resources[r] || 0) >= pending.amount);
  const btnW = 100, btnH = 44, gap = 12;
  const w = Math.max(500, affordable.length * (btnW + gap) + gap * 2);
  const h = 180;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawChoicePanelBase(x, y, w, h, "rgba(40,80,160,0.8)", "#4080ff");
  ctx.fillStyle = "#a0c8ff";
  ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText("起動コスト: 支払う資源を選択", x + 24, y + 34);
  ctx.fillStyle = "rgba(160,200,255,0.8)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`いずれか${pending.amount}を支払ってください。`, x + 24, y + 58);
  const isController = canControlActivePlayer() && pending.playerId === controlledPlayerId();
  if (isController) {
    affordable.forEach((res, i) => {
      const bx = x + gap + i * (btnW + gap);
      const by = y + h - btnH - 20;
      const label = `${RESOURCE_LABELS[res] || res}（${player.resources[res]}）`;
      drawButton(bx, by, btnW, btnH, label, () => { resolveChooseActivationResource(res); render(); }, null, { accent: "p1" });
    });
  }
}

function drawChooseGainResourcePanel(pending) {
  const options = pending.options || [];
  const btnW = 120, btnH = 44, gap = 12;
  const w = Math.max(460, options.length * (btnW + gap) + gap * 2);
  const h = 184;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawChoicePanelBase(x, y, w, h, "rgba(40,140,100,0.8)", "#30c080");
  ctx.fillStyle = "#a8ffd0";
  ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`${pending.cardName || "効果"}: 得る資源を選択`, x + 24, y + 34);
  ctx.fillStyle = "rgba(180,230,210,0.8)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText("使用する選択肢を選んでください。", x + 24, y + 58);
  const isController = canControlActivePlayer() && pending.playerId === controlledPlayerId();
  if (isController) {
    options.forEach((opt, i) => {
      const bx = x + gap + i * (btnW + gap);
      const by = y + h - btnH - 22;
      const label = opt.label || Object.entries(opt.produces || {}).map(([r, a]) => `${RESOURCE_LABELS[r] || r}${a}`).join(" ");
      drawButton(bx, by, btnW, btnH, label, () => resolveChooseGainResource(opt.id || opt.resource), null, { accent: "p1" });
    });
  }
}

function drawLifeCounterPaymentPanel(pending) {
  const x = 430, y = 250, w = 580, h = 270;
  drawChoicePanelBase(x, y, w, h, "rgba(40,120,200,0.75)", "#4080ff");
  const player = state.players[pending.playerId];
  const maxPay = lifeCounterMaxPay(player, pending.targetCard, pending.maxLifeCounters || 5);
  ctx.fillStyle = "#b8dcff";
  ctx.font = "700 20px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`${pending.cardName}: 生命カウンター`, x + 28, y + 38);
  ctx.fillStyle = "rgba(190,220,255,0.85)";
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`${pending.targetCard.name} の出撃コスト支払い後、追加で支払う人資源を選んでください。（最大${maxPay}）`, x + 28, y + 68, w - 56);
  const isController = canControlChoicePlayer(pending.playerId);
  const btnW = 76, btnH = 42, gap = 12;
  const totalW = (maxPay + 1) * btnW + maxPay * gap;
  const startX = x + Math.max(28, Math.floor((w - totalW) / 2));
  for (let amount = 0; amount <= maxPay; amount++) {
    const bx = startX + amount * (btnW + gap);
    const by = y + 122;
    drawButton(bx, by, btnW, btnH, `${amount}`, isController ? () => resolveLifeCounterPayment(amount) : null, null, amount > 0 ? { accent: "p1" } : {});
  }
  ctx.fillStyle = "rgba(150,180,230,0.7)";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText("選んだ数だけ人資源を支払い、その数の生命カウンターを置きます。", x + 28, y + h - 42, w - 56);
}

function destroyChoiceCandidates() {
  const items = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const unit = state.board[row]?.[col];
      if (unit) items.push({ key: `unit:${row}:${col}`, card: unit, label: unit.name, sub: `Unit ${unit.owner} R${row + 1}C${col + 1}` });
    }
  }
  for (const pid of ["p1", "p2"]) {
    state.players[pid].structs.forEach((struct, index) => {
      items.push({ key: `struct:${pid}:${index}`, card: struct, label: struct.name, sub: `Struct ${state.players[pid].name}` });
    });
  }
  return items;
}

function drawSelectDestroyCardsPanel(pending) {
  const x = 330, y = 162, w = 780, h = 474;
  drawChoicePanelBase(x, y, w, h, "rgba(180,70,50,0.75)", "#ff5040");
  const player = state.players[pending.playerId];
  const selected = new Set(pending.selected || []);
  const candidates = destroyChoiceCandidates();
  ctx.fillStyle = "#ffd0c0";
  ctx.font = "700 20px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`${pending.cardName}: 破壊対象`, x + 28, y + 36);
  ctx.fillStyle = "rgba(255,210,190,0.82)";
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`追加コスト ${formatCost(pending.cost || {}) || "なし"} / ${pending.amount}枚まで選択。現在: ${selected.size}枚`, x + 28, y + 64, w - 56);
  const isController = canControlActivePlayer() && pending.playerId === controlledPlayerId();
  const cardW = 74;
  const cardH = Math.round(cardW / CARD_ASPECT);
  candidates.slice(0, 16).forEach((item, i) => {
    const cx = x + 28 + (i % 8) * (cardW + 18);
    const cy = y + 92 + Math.floor(i / 8) * (cardH + 30);
    const active = selected.has(item.key);
    drawSelectableChoiceCard(cx, cy, cardW, cardH, item.card, {
      selected: active,
      label: active ? "TARGET" : item.sub.replace(/^.*? /, ""),
      onClick: isController ? () => toggleDestroyChoice(item.key) : null,
    });
  });
  if (isController) {
    const canPayCost = canPay(player, pending.cost || {});
    drawButton(x + 28, y + h - 56, 180, 36, "支払わず解決", () => resolveDestroyChoice({ payCost: false }));
    drawButton(x + w - 238, y + h - 56, 210, 36, "支払い破壊", canPayCost ? () => resolveDestroyChoice({ payCost: true }) : null, null, canPayCost ? { accent: "p1" } : { accent: "dim" });
  }
}

function drawKaijuAwakenPanel(pending) {
  const x = 300, y = 142, w = 840, h = 520;
  drawChoicePanelBase(x, y, w, h, "rgba(120,50,160,0.78)", "#b040ff");
  const player = state.players[pending.playerId];
  const units = unitsOwnedBy(pending.playerId).filter((unit) => unit.instanceId !== pending.unitInstanceId);
  const structs = player.structs || [];
  const hand = player.hand || [];
  const isController = canControlActivePlayer() && pending.playerId === controlledPlayerId();
  ctx.fillStyle = "#e0c0ff";
  ctx.font = "700 20px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`${pending.cardName}: 覚醒コスト`, x + 28, y + 36);
  ctx.fillStyle = "rgba(220,190,255,0.82)";
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText("自分のユニット、ストラクト、手札を1枚ずつ除外してください。", x + 28, y + 64, w - 56);
  const drawColumn = (title, items, selectedValue, kind, baseX) => {
    ctx.fillStyle = "#caa0ff";
    ctx.font = "700 14px 'Yu Gothic UI', sans-serif";
    ctx.fillText(title, baseX, y + 100);
    const cardW = 70;
    const cardH = Math.round(cardW / CARD_ASPECT);
    items.slice(0, 3).forEach((item, i) => {
      const value = item.value;
      const active = selectedValue === value;
      const cx = baseX + i * (cardW + 10);
      const cy = y + 118;
      drawSelectableChoiceCard(cx, cy, cardW, cardH, item.card, {
        selected: active,
        label: active ? "SELECTED" : item.sub || "",
        onClick: isController ? () => toggleKaijuAwakenChoice(kind, value) : null,
      });
    });
  };
  drawColumn("Unit", units.map((unit) => ({ value: unit.instanceId, card: unit, label: unit.name, sub: `R${unit.row + 1}C${unit.col + 1}` })), pending.selectedUnitInstanceId, "unit", x + 28);
  drawColumn("Struct", structs.map((struct, index) => ({ value: index, card: struct, label: struct.name, sub: "STRUCT" })), pending.selectedStructIndex, "struct", x + 298);
  drawColumn("Hand", hand.map((card, index) => ({ value: index, card, label: card.name, sub: card.type.toUpperCase() })), pending.selectedHandIndex, "hand", x + 568);
  if (isController) {
    const ready = pending.selectedUnitInstanceId != null && pending.selectedStructIndex != null && pending.selectedHandIndex != null;
    drawButton(x + w - 198, y + h - 56, 170, 36, "覚醒する", ready ? resolveKaijuAwakenChoice : null, null, ready ? { accent: "p1" } : { accent: "dim" });
  }
}

function canAffordStructActivation(struct, player) {
  for (const ab of (struct.abilities || []).filter((a) => a.trigger === "onStructurePhase")) {
    if (ab.effect === "chooseExchange") {
      const canAffordAny = (ab.costOptions || []).some(
        (opt) => (player.resources[opt.resource] || 0) >= opt.amount
      );
      if (!canAffordAny) return false;
    } else if (ab.effect === "chooseProduceResource") {
      const canAffordAny = (ab.options || []).some((opt) => canPay(player, opt.cost || {}));
      if (!canAffordAny) return false;
    } else if (ab.effect === "chooseSummonGolem") {
      const canAffordAny = (ab.costOptions || []).some(
        (opt) => (player.resources[opt.resource] || 0) >= opt.amount
      );
      if (!canAffordAny) return false;
    } else if (ab.effect === "destroyEnemyStructs") {
      if ((player.resources.fuel || 0) < (ab.fuelCost || 1)) return false;
      const opponent = opponentOf(player.id);
      if (!getDestroyableEnemyStructEntries(state, opponent, struct).length) return false;
    } else {
      for (const [res, amt] of Object.entries(ab.cost || {})) {
        if ((player.resources[res] || 0) < amt) return false;
      }
      if (typeof ab.amount === "number" && ab.amount < 0) {
        if ((player.resources[ab.resource] || 0) < Math.abs(ab.amount)) return false;
      }
    }
  }
  return true;
}

function drawStructPhaseOverlay() {
  const pending = state.pendingStructPhase;
  if (!pending) { structPhaseScroll = 0; enemyStructChoiceScroll = 0; return; }
  const player = state.players[pending.playerId];
  if (!pending.activatedTactIndexes) pending.activatedTactIndexes = [];
  const activatables = structPhaseActivatables(player);
  const isController = canControlActivePlayer();

  ctx.fillStyle = "rgba(0,0,8,0.76)";
  ctx.fillRect(0, 0, W, H);

  // カード画像メインのレイアウト（ページング）
  const cardW = 96;
  const cardH = Math.round(cardW / CARD_ASPECT); // 134
  const cardGap = 14;
  const maxCols = 5;
  structPhaseScroll = Math.max(0, Math.min(structPhaseScroll, Math.max(0, activatables.length - maxCols)));
  const visibleItems = activatables.slice(structPhaseScroll, structPhaseScroll + maxCols);
  const cols = Math.min(maxCols, visibleItems.length || 1);
  const contentW = cols * (cardW + cardGap) - cardGap;

  const headerH = 72;
  const btnH = 28;
  const cardRowH = cardH + 4 + 13 + 6 + btnH + 6; // card+abilityText+btn
  const enemyChoice = pending.pendingEnemyStructChoice;
  const choiceH = pending.pendingResourceChoice ? 72 : enemyChoice ? 120 : 0;
  const footerH = 56;
  const w = Math.max(660, contentW + 80);
  const h = headerH + cardRowH + choiceH + footerH;
  const x = Math.round((W - w) / 2);
  const y = Math.round((H - h) / 2);

  ctx.save();
  ctx.shadowColor = "#30a870";
  ctx.shadowBlur = 28;
  roundRect(x, y, w, h, 12, "rgba(6,18,14,0.97)", "rgba(40,150,90,0.7)", 2);
  ctx.shadowBlur = 0;
  ctx.restore();

  const acGrd = ctx.createLinearGradient(x, y, x + w, y);
  acGrd.addColorStop(0, "transparent");
  acGrd.addColorStop(0.3, "rgba(50,160,100,0.55)");
  acGrd.addColorStop(0.7, "rgba(50,160,100,0.55)");
  acGrd.addColorStop(1, "transparent");
  ctx.fillStyle = acGrd;
  ctx.fillRect(x, y, w, 2);

  ctx.fillStyle = "#70dfa8";
  ctx.font = "700 18px 'Yu Gothic UI', sans-serif";
  ctx.fillText("ストラクトフェーズ", x + 24, y + 28);
  ctx.fillStyle = "rgba(130,200,160,0.75)";
  ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
  ctx.fillText("発動するストラクト／タクトを選択（スキップ可）", x + 24, y + 50);

  const cardsAreaX = x + Math.round((w - contentW) / 2);
  const cardsAreaY = y + headerH;

  // ページナビゲーション（5枚を超える場合）
  const navBtnW = 28; const navBtnH = 32;
  const navBtnY = cardsAreaY + Math.round((cardH - navBtnH) / 2);
  if (structPhaseScroll > 0) {
    drawButton(x + 6, navBtnY, navBtnW, navBtnH, "◀", () => { structPhaseScroll--; });
  }
  if (structPhaseScroll + maxCols < activatables.length) {
    drawButton(x + w - navBtnW - 6, navBtnY, navBtnW, navBtnH, "▶", () => { structPhaseScroll++; });
  }
  if (activatables.length > maxCols) {
    ctx.fillStyle = "rgba(120,190,150,0.8)";
    ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${structPhaseScroll + 1}〜${Math.min(structPhaseScroll + maxCols, activatables.length)} / ${activatables.length}`, x + w - 10, y + 52);
    ctx.textAlign = "left";
  }

  const choice = pending.pendingResourceChoice;
  const waitingChoice = choice || enemyChoice;
  visibleItems.forEach(({ kind, index, card: struct }, i) => {
    const hasMultiActivate = (struct.abilities || []).some((a) => a.multiActivate);
    const activated = kind === "struct"
      ? !hasMultiActivate && pending.activatedIndexes.includes(index)
      : !hasMultiActivate && pending.activatedTactIndexes.includes(index);
    const affordable = canAffordStructActivation(struct, player) && !struct.rested;
    const cx = cardsAreaX + i * (cardW + cardGap);
    const cy = cardsAreaY;

    // カード画像（メイン）
    ctx.save();
    if (activated) { ctx.shadowColor = "#50e890"; ctx.shadowBlur = 18; }
    drawCard(cx, cy, cardW, cardH, struct, { noHover: !isController, small: true, artOnly: true });
    ctx.shadowBlur = 0;
    ctx.restore();

    // 支払い不可オーバーレイ
    if (!affordable && !activated) {
      roundRect(cx, cy, cardW, cardH, 6, "rgba(60,0,0,0.55)", "rgba(160,40,40,0.7)", 1.5);
    }

    // 効果テキスト
    const phaseAbilities = (struct.abilities || []).filter((a) => STRUCT_PHASE_TRIGGERS.includes(a.trigger));
    const abText = phaseAbilities
      .map((a) => abilityText({ abilities: [a] }))
      .join(" / ");
    ctx.fillStyle = activated ? "#60c890" : affordable ? "#a0d8b8" : "#a07070";
    ctx.font = "600 10px 'Yu Gothic UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(abText || struct.text || "", cx + cardW / 2, cy + cardH + 14, cardW);
    ctx.textAlign = "left";

    // 発動ボタン
    const hpAbility = (struct.abilities || []).find((a) => a.trigger === "onStructurePhaseHP");
    const hasRestActivate = (struct.abilities || []).some((a) => a.trigger === "onStructurePhase");
    const btnY = cy + cardH + 22;
    if (isController && (!activated || hasMultiActivate)) {
      if (hasRestActivate && affordable && !waitingChoice) {
        const activate = kind === "struct"
          ? () => activateStructInPhase(index)
          : () => activateTactInPhase(index);
        drawButton(cx, btnY, cardW, btnH, hasMultiActivate ? "再発動" : "発動", activate);
      } else if (hasRestActivate) {
        drawButton(cx, btnY, cardW, btnH, affordable ? "選択中..." : "発動不可", null, null, { accent: "dim" });
      }
    } else if (activated) {
      ctx.fillStyle = "#50d880";
      ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("✓ 発動済", cx + cardW / 2, btnY + 18);
      ctx.textAlign = "left";
    }
    if (hpAbility && isController && !struct.hpActivatedThisTurn) {
      const hpCanAfford = player.core.hp > hpAbility.hpCost;
      const hpLabel = `ライフ${hpAbility.hpCost}`;
      drawButton(cx, btnY + btnH + 4, cardW, 22, hpLabel,
        kind === "struct" && hpCanAfford ? () => activateStructHPAbility(index) : null,
        null, hpCanAfford ? { accent: "p2" } : { accent: "dim" });
    }
  });

  if (choice) {
    const choiceY = y + h - footerH - choiceH + 6;
    roundRect(x + 14, choiceY, w - 28, 58, 6, "rgba(4,14,28,0.92)", "rgba(60,120,200,0.7)", 1.5);
    ctx.fillStyle = "#90b8e8";
    ctx.font = "700 13px 'Yu Gothic UI', sans-serif";
    const choiceVerb = choice.type === "chooseProduceResource" ? "得る資源を選択してください" : "支払う資源を選択してください";
    ctx.fillText(`${choice.cardName}: ${choiceVerb}`, x + 26, choiceY + 20);
    let bx = x + 26;
    const options = Array.isArray(choice.options)
      ? choice.options
      : (choice.costOptions || []).map((opt) => ({
          id: opt.resource,
          resource: opt.resource,
          label: `${RESOURCE_LABELS[opt.resource] || opt.resource} ${opt.amount}`,
          cost: { [opt.resource]: opt.amount },
        }));
    for (const opt of options) {
      const canPayOption = canPay(player, opt.cost || {});
      const label = opt.label || opt.id || opt.resource;
      if (isController && canPayOption) {
        drawButton(bx, choiceY + 28, 120, 22, label, () => resolveMarketChoice(opt.id || opt.resource));
      } else {
        drawButton(bx, choiceY + 28, 120, 22, label, null, null, { accent: "dim" });
      }
      bx += 130;
    }
  }

  if (enemyChoice) {
    const opponentId = opponentOf(pending.playerId);
    const enemyStructs = state.players[opponentId].structs;
    const sourceCard = enemyChoice.sourceCard || { name: enemyChoice.cardName };
    const validIndices = new Set(getDestroyableEnemyStructEntries(state, opponentId, sourceCard).map((entry) => entry.index));
    const tauntRequired = enemyStructChoicePool(enemyStructs).length < enemyStructs.length;
    const choiceY = y + h - footerH - choiceH + 6;
    roundRect(x + 14, choiceY, w - 28, 108, 6, "rgba(28,8,8,0.92)", "rgba(180,60,60,0.7)", 1.5);
    ctx.fillStyle = "#f0a0a0";
    ctx.font = "700 13px 'Yu Gothic UI', sans-serif";
    const remainLabel = enemyChoice.remaining > 1 ? `（残り${enemyChoice.remaining}枚）` : "";
    ctx.fillText(`${enemyChoice.cardName}: 破壊する相手ストラクトを選択${remainLabel}（燃${enemyChoice.fuelCost}）`, x + 26, choiceY + 20);
    if (tauntRequired) {
      ctx.fillStyle = "rgba(220,170,170,0.85)";
      ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
      ctx.fillText("[構造挑発]対象のみ選択可 / [効果保護]は[効果貫通]が必要", x + 26, choiceY + 36, w - 52);
    }
    const pickW = 88;
    const pickH = Math.round(pickW / CARD_ASPECT);
    const pickGap = 10;
    const maxEnemyCols = Math.max(1, Math.floor((w - 52) / (pickW + pickGap)));
    enemyStructChoiceScroll = Math.max(0, Math.min(enemyStructChoiceScroll, Math.max(0, enemyStructs.length - maxEnemyCols)));
    const visibleEnemyStructs = enemyStructs
      .map((enemyStruct, enemyIdx) => ({ enemyStruct, enemyIdx }))
      .slice(enemyStructChoiceScroll, enemyStructChoiceScroll + maxEnemyCols);
    let px = x + 26;
    const canPayFuel = (player.resources.fuel || 0) >= enemyChoice.fuelCost;
    visibleEnemyStructs.forEach(({ enemyStruct, enemyIdx }) => {
      const selectable = validIndices.has(enemyIdx);
      drawCard(px, choiceY + 30, pickW, pickH, enemyStruct, { noHover: !isController || !selectable, small: true, artOnly: true });
      if (!selectable) {
        roundRect(px, choiceY + 30, pickW, pickH, 6, "rgba(0,0,0,0.55)", "rgba(80,40,40,0.5)", 1);
        ctx.fillStyle = "#c09090";
        ctx.font = "600 9px 'Yu Gothic UI', sans-serif";
        ctx.textAlign = "center";
        const blockLabel = !canDestroyEnemyStructByEffect(sourceCard, enemyStruct) ? "効果保護" : "挑発対象外";
        ctx.fillText(blockLabel, px + pickW / 2, choiceY + 30 + pickH / 2 + 3, pickW - 8);
        ctx.textAlign = "left";
      } else if (isController && canPayFuel) {
        addHit(px, choiceY + 30, pickW, pickH, () => resolveEnemyStructChoice(enemyIdx));
      }
      px += pickW + pickGap;
    });
    if (enemyStructs.length > maxEnemyCols) {
      const navY = choiceY + 30 + pickH + 8;
      if (enemyStructChoiceScroll > 0) {
        drawButton(x + 20, navY, 40, 22, "◀", () => { enemyStructChoiceScroll--; render(); });
      }
      ctx.fillStyle = "rgba(220,180,180,0.85)";
      ctx.font = "600 10px 'Yu Gothic UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${enemyStructChoiceScroll + 1}〜${Math.min(enemyStructChoiceScroll + maxEnemyCols, enemyStructs.length)} / ${enemyStructs.length}`, x + w / 2, navY + 15);
      ctx.textAlign = "left";
      if (enemyStructChoiceScroll + maxEnemyCols < enemyStructs.length) {
        drawButton(x + w - 60, navY, 40, 22, "▶", () => { enemyStructChoiceScroll++; render(); });
      }
    }
    if (!enemyStructs.length) {
      ctx.fillStyle = "rgba(220,180,180,0.8)";
      ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
      ctx.fillText("相手のストラクトがありません", x + 26, choiceY + 58);
    }
  }

  if (isController) {
    const endDisabled = !!waitingChoice;
    drawButton(
      x + w - 216, y + h - 44, 196, 34,
      "ストラクトフェーズ終了",
      endDisabled ? null : endStructPhase,
      null,
      endDisabled ? { accent: "dim" } : { accent: "p1" }
    );
  }
}

function drawHandConfirmOverlay() {
  const selected = state.selected;
  const card = selectedPlayableCard();
  if (
    !card ||
    !["hand", "structDeck"].includes(selected?.kind) ||
    selected.confirmed ||
    state.pendingChoice ||
    (selected.playerId && selected.playerId !== viewerPlayerId())
  ) {
    return;
  }

  ctx.fillStyle = "rgba(0, 0, 10, 0.72)";
  ctx.fillRect(0, 0, W, H);
  addHit(0, 0, W, H, () => {});

  const x = 418;
  const y = 142;
  const w = 604;
  const h = 520;
  const theme = CARD_TYPE_THEME[card.type] || CARD_TYPE_THEME.struct;
  ctx.save();
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur = 24;
  roundRect(x, y, w, h, 12, "rgba(6,8,22,0.98)", theme.accent, 2);
  ctx.shadowBlur = 0;
  ctx.restore();
  // Top stripe
  const stripeGrd = ctx.createLinearGradient(x, y, x + w, y);
  stripeGrd.addColorStop(0, "transparent");
  stripeGrd.addColorStop(0.2, theme.accent);
  stripeGrd.addColorStop(0.8, theme.accent);
  stripeGrd.addColorStop(1, "transparent");
  ctx.fillStyle = stripeGrd;
  ctx.fillRect(x, y, w, 3);

  // Card art preview (left panel)
  drawCardArt(x + 16, y + 16, 180, 220, card);

  ctx.fillStyle = "#d8e8ff";
  ctx.font = "700 24px 'Yu Gothic UI', sans-serif";
  ctx.fillText(card.name, x + 212, y + 40, w - 228);

  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillStyle = theme.text;
  const typeLabel = { unit: "ユニット", tact: "指令", wild: "Wild", grand: "Grand", struct: "施設" }[card.type] || card.type;
  const stats = card.type === "unit" ? ` / ATK ${card.atk} / HP ${card.hp}` : "";
  ctx.fillText(`${typeLabel} / ${card.faction || "ニュートラル"} / コスト ${formatCost(card.cost)}${stats}`, x + 212, y + 62, w - 228);

  let nextY = y + 90;
  const tags = tagLabels(card).join(" / ");
  if (tags) {
    ctx.fillStyle = "rgba(160,190,240,0.6)";
    ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("タグ", x + 212, nextY);
    ctx.fillStyle = "#90b8e0";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText(tags, x + 260, nextY, w - 276);
    nextY += 24;
  }

  const keywords = keywordLabels(card).join(" / ");
  if (keywords) {
    ctx.fillStyle = "rgba(160,190,240,0.6)";
    ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("効果", x + 212, nextY);
    ctx.fillStyle = "#90b8e0";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    nextY = drawWrappedText(keywords, x + 260, nextY, w - 276, 18, 3);
    nextY += 6;
  }

  const generatedEffect = abilityText(card);
  if (generatedEffect) {
    ctx.fillStyle = "rgba(160,190,240,0.6)";
    ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("処理", x + 212, nextY);
    ctx.fillStyle = "#90b8e0";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    nextY = drawWrappedText(generatedEffect, x + 212, nextY + 16, w - 228, 18, 4);
    nextY += 6;
  }

  const text = card.text || card.flavor || "";
  if (text) {
    // Separator
    ctx.strokeStyle = "rgba(40,70,160,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 212, nextY + 6); ctx.lineTo(x + w - 20, nextY + 6); ctx.stroke();
    nextY += 16;
    ctx.fillStyle = "rgba(180,200,240,0.7)";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    drawWrappedText(text, x + 212, nextY, w - 228, 18, 8);
  }

  const tactOnlySummon = card.type === "unit" && requiresTactSummon(card);
  const useLabel = tactOnlySummon
    ? "指令からのみ出撃"
    : card.type === "unit"
      ? "使う: 配置先選択"
      : card.type === "struct"
        ? "使う: 建設"
        : "使う";
  const missingTarget = (card.abilities || []).some((a) => {
    if (a.trigger !== "onPlay" || !a.target) return false;
    return !hasValidAbilityTarget(state, { ability: a, playerId: viewerPlayerId(), card });
  });
  const cannotUse = missingTarget || tactOnlySummon;
  drawButton(x + w - 316, y + h - 58, 154, 38, "戻る", () => {
    state.selected = null;
    state.message = "カード選択を解除しました。";
  });
  drawButton(x + w - 146, y + h - 58, 120, 38, useLabel,
    cannotUse ? null : useSelectedPlayableCard, null,
    cannotUse ? { accent: "dim" } : { accent: "p1" });
}

function drawFieldCardDetailOverlay() {
  const selected = state.selected;
  const card = selectedFieldCard();
  if (!card || state.pendingChoice) return;

  ctx.fillStyle = "rgba(0, 0, 10, 0.72)";
  ctx.fillRect(0, 0, W, H);
  addHit(0, 0, W, H, () => {});

  const x = 418;
  const y = 142;
  const w = 604;
  const h = 520;
  const theme = CARD_TYPE_THEME[card.type] || CARD_TYPE_THEME.struct;
  ctx.save();
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur = 24;
  roundRect(x, y, w, h, 12, "rgba(6,8,22,0.98)", theme.accent, 2);
  ctx.shadowBlur = 0;
  ctx.restore();
  const stripeGrd2 = ctx.createLinearGradient(x, y, x + w, y);
  stripeGrd2.addColorStop(0, "transparent");
  stripeGrd2.addColorStop(0.2, theme.accent);
  stripeGrd2.addColorStop(0.8, theme.accent);
  stripeGrd2.addColorStop(1, "transparent");
  ctx.fillStyle = stripeGrd2;
  ctx.fillRect(x, y, w, 3);

  // Card art preview
  drawCardArt(x + 16, y + 16, 180, 220, card);

  ctx.fillStyle = "#d8e8ff";
  ctx.font = "700 24px 'Yu Gothic UI', sans-serif";
  ctx.fillText(card.name, x + 212, y + 40, w - 228);

  const controller = card.owner ? state.players[card.owner]?.name : selected.kind === "fieldStruct" ? state.players[selected.playerId]?.name : "";
  const typeLabel = { unit: "ユニット", struct: "施設" }[card.type] || card.type;
  const stats = card.type === "unit" ? ` / ATK ${card.atk} / HP ${card.currentHp}/${card.maxHp}` : "";
  const status = card.type === "unit" ? ` / ${card.rested ? "レスト" : "非レスト"}` : "";
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillStyle = theme.text;
  ctx.fillText(`${typeLabel} / ${controller || "場"} / ${card.faction || "ニュートラル"}${stats}${status}`, x + 212, y + 62, w - 228);

  let nextY = y + 90;
  const tags = tagLabels(card).join(" / ");
  if (tags) {
    ctx.fillStyle = "rgba(160,190,240,0.6)";
    ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("タグ", x + 212, nextY);
    ctx.fillStyle = "#90b8e0";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText(tags, x + 260, nextY, w - 276);
    nextY += 24;
  }

  ctx.fillStyle = "rgba(160,190,240,0.6)";
  ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText("コスト", x + 212, nextY);
  let costIconX = drawCostIcons(card.cost || {}, x + 260, nextY - 14, { size: 16, showNone: true });
  if (card.actCost && Object.values(card.actCost).some((v) => v > 0)) {
    ctx.fillStyle = "rgba(160,190,240,0.6)";
    ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("アクト", costIconX + 6, nextY);
    drawCostIcons(card.actCost, costIconX + 52, nextY - 14, { size: 16 });
  }
  nextY += 24;

  const keywords = keywordLabels(card).join(" / ");
  if (keywords) {
    ctx.fillStyle = "rgba(160,190,240,0.6)";
    ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("効果", x + 212, nextY);
    ctx.fillStyle = "#90b8e0";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    nextY = drawWrappedText(keywords, x + 212, nextY + 14, w - 228, 18, 3);
    nextY += 6;
  }

  const generatedEffect = abilityText(card);
  if (generatedEffect) {
    ctx.fillStyle = "rgba(160,190,240,0.6)";
    ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("処理", x + 212, nextY);
    ctx.fillStyle = "#90b8e0";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    nextY = drawWrappedText(generatedEffect, x + 212, nextY + 14, w - 228, 18, 4);
    nextY += 6;
  }

  const text = card.text || card.flavor || "";
  if (text) {
    ctx.strokeStyle = "rgba(40,70,160,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 212, nextY + 6); ctx.lineTo(x + w - 20, nextY + 6); ctx.stroke();
    nextY += 16;
    ctx.fillStyle = "rgba(180,200,240,0.7)";
    ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    drawWrappedText(text, x + 212, nextY, w - 228, 18, 8);
  }

  drawButton(x + w - 146, y + h - 58, 120, 38, "閉じる", () => {
    if (selected.kind === "unit") {
      state.selected = { kind: "unit", row: selected.row, col: selected.col };
      state.message = `${card.name} selected`;
    } else {
      state.selected = null;
      state.message = "詳細を閉じました。";
    }
  });
}

function drawCardRevealOverlay() {
  const reveal = app.localCardPopup || state.cardReveal;
  const isLocalPopup = Boolean(app.localCardPopup);
  if (!reveal) return;
  if (!isLocalPopup && (reveal.playerId === viewerPlayerId() || app.dismissedCardRevealIds.includes(reveal.id))) return;
  const card = reveal.card;

  ctx.fillStyle = "rgba(0, 0, 10, 0.78)";
  ctx.fillRect(0, 0, W, H);
  addHit(0, 0, W, H, () => {});

  const x = 382;
  const y = 104;
  const w = 676;
  const h = 596;
  const revTheme = CARD_TYPE_THEME[card.type] || CARD_TYPE_THEME.struct;
  ctx.save();
  ctx.shadowColor = revTheme.glow;
  ctx.shadowBlur = 28;
  roundRect(x, y, w, h, 12, "rgba(6,8,22,0.98)", revTheme.accent, 2);
  ctx.shadowBlur = 0;
  ctx.restore();
  // Top banner
  const bannerGrd = ctx.createLinearGradient(x, y, x, y + 56);
  bannerGrd.addColorStop(0, revTheme.grad[0]);
  bannerGrd.addColorStop(1, "rgba(6,8,22,0)");
  ctx.fillStyle = bannerGrd;
  ctx.fillRect(x, y, w, 56);

  ctx.fillStyle = "#c8d8ff";
  ctx.font = "700 16px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`${reveal.playerName} がカードを使用`, x + 36, y + 30, w - 72);

  // Card art on left
  drawCardArt(x + 16, y + 58, 190, 240, card);

  ctx.fillStyle = "#d8e8ff";
  ctx.font = "700 26px 'Yu Gothic UI', sans-serif";
  ctx.fillText(card.name, x + 224, y + 92, w - 240);

  const typeLabel = { unit: "ユニット", tact: "指令", wild: "Wild", grand: "Grand", struct: "施設" }[card.type] || card.type;
  const stats =
    card.type === "unit"
      ? ` / ATK ${card.atk ?? "-"} / HP ${card.currentHp && card.maxHp ? `${card.currentHp}/${card.maxHp}` : card.hp ?? "-"}`
      : "";
  ctx.fillStyle = revTheme.text;
  ctx.font = "600 13px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`${typeLabel} / ${card.faction || "ニュートラル"} / コスト ${formatCost(card.cost)}${stats}`, x + 224, y + 118, w - 240);

  let nextY = y + 148;
  if (card.actCost) {
    ctx.fillStyle = "rgba(160,190,240,0.6)"; ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("アクト", x + 224, nextY);
    ctx.fillStyle = "#90b8e0"; ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText(formatCost(card.actCost), x + 280, nextY, w - 296);
    nextY += 22;
  }

  if (card.tags?.length) {
    ctx.fillStyle = "rgba(160,190,240,0.6)"; ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("タグ", x + 224, nextY);
    ctx.fillStyle = "#90b8e0"; ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText(card.tags.join(" / "), x + 280, nextY, w - 296);
    nextY += 22;
  }

  if (card.keywords?.length) {
    ctx.fillStyle = "rgba(160,190,240,0.6)"; ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("効果", x + 224, nextY);
    ctx.fillStyle = "#90b8e0"; ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    nextY = drawWrappedText(card.keywords.join(" / "), x + 224, nextY + 14, w - 240, 18, 3);
    nextY += 6;
  }

  if (card.abilityText) {
    ctx.fillStyle = "rgba(160,190,240,0.6)"; ctx.font = "700 12px 'Yu Gothic UI', sans-serif";
    ctx.fillText("処理", x + 224, nextY);
    ctx.fillStyle = "#90b8e0"; ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    nextY = drawWrappedText(card.abilityText, x + 224, nextY + 14, w - 240, 18, 5);
    nextY += 6;
  }

  if (card.text) {
    ctx.strokeStyle = "rgba(40,70,160,0.3)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 224, nextY + 6); ctx.lineTo(x + w - 20, nextY + 6); ctx.stroke();
    nextY += 18;
    ctx.fillStyle = "rgba(180,200,240,0.7)"; ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
    drawWrappedText(card.text, x + 224, nextY, w - 240, 18, 8);
  }

  drawButton(x + w - 156, y + h - 58, 130, 38, "確認", () => {
    dismissCardReveal();
    state.message = "相手の使用カードを確認しました。";
  }, null, { accent: "p1" });
}

function drawZoneViewerOverlay() {
  if (!zoneViewerState) return;
  const { playerId, zone, scroll } = zoneViewerState;
  const player = state.players[playerId];
  const cards = zone === "dump" ? player.dump : zone === "structDeck" ? player.structDeck : player.exileZone;
  const zoneLabel = zone === "dump" ? "DUMP" : zone === "structDeck" ? "ストラクトデッキ" : "OUT";
  const zoneColor = zone === "dump" ? "#4a6347" : zone === "structDeck" ? "#405080" : "#5a3d6a";

  ctx.fillStyle = "rgba(0, 0, 10, 0.82)";
  ctx.fillRect(0, 0, W, H);
  addHit(0, 0, W, H, () => { zoneViewerState = null; });

  const ox = 200;
  const oy = 80;
  const ow = 1040;
  const oh = 740;
  const zoneAccent = zone === "dump" ? "rgba(60,180,100,0.7)" : "rgba(160,80,200,0.7)";
  ctx.save();
  ctx.shadowColor = zone === "dump" ? "#30c060" : "#a040c0";
  ctx.shadowBlur = 20;
  roundRect(ox, oy, ow, oh, 12, "rgba(6,8,22,0.98)", zoneAccent, 2);
  ctx.shadowBlur = 0;
  ctx.restore();
  // Top stripe
  const zoneStripe = ctx.createLinearGradient(ox, oy, ox + ow, oy);
  zoneStripe.addColorStop(0, "transparent"); zoneStripe.addColorStop(0.2, zoneAccent); zoneStripe.addColorStop(0.8, zoneAccent); zoneStripe.addColorStop(1, "transparent");
  ctx.fillStyle = zoneStripe; ctx.fillRect(ox, oy, ow, 3);

  ctx.fillStyle = "#c8e0ff";
  ctx.font = "700 20px 'Yu Gothic UI', sans-serif";
  ctx.fillText(`${player.name} / ${zoneLabel} (${cards.length}枚)`, ox + 24, oy + 38);
  drawButton(ox + ow - 126, oy + 14, 106, 32, "閉じる", () => { zoneViewerState = null; });

  const CARD_W = 120;
  const CARD_H = 148;
  const COLS_V = 7;
  const GAP_X = 14;
  const GAP_Y = 14;
  const startY = oy + 58;
  const visibleRows = Math.floor((oh - 76) / (CARD_H + GAP_Y));
  const totalRows = Math.ceil(cards.length / COLS_V);
  const clampedScroll = Math.max(0, Math.min(scroll, totalRows - visibleRows));
  zoneViewerState.scroll = clampedScroll;

  const startIdx = clampedScroll * COLS_V;
  const visible = cards.slice(startIdx, startIdx + visibleRows * COLS_V);
  visible.forEach((card, i) => {
    const col = i % COLS_V;
    const row = Math.floor(i / COLS_V);
    const cx = ox + 24 + col * (CARD_W + GAP_X);
    const cy = startY + row * (CARD_H + GAP_Y);
    const absIdx = startIdx + i;
    const isSelSD = zone === "structDeck" && state.selected?.kind === "structDeck" && state.selected.index === absIdx;
    const isViewerSD = zone === "structDeck" && playerId === viewerPlayerId();
    const sdAffordable = isViewerSD && cardIsAffordable(player, card);
    drawCard(cx, cy, CARD_W, CARD_H, card, { small: true, selected: isSelSD, affordable: sdAffordable });
    if (isViewerSD && sdAffordable && !isSelSD) {
      ctx.save();
      ctx.shadowColor = "#ffd84a"; ctx.shadowBlur = 14;
      roundRect(cx, cy, CARD_W, CARD_H, 6, null, "rgba(255,220,50,0.9)", 2.5);
      ctx.shadowBlur = 0;
      ctx.restore();
    } else if (isViewerSD && !sdAffordable && !isSelSD) {
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(cx, cy, CARD_W, CARD_H);
    }
    addHit(cx, cy, CARD_W, CARD_H, () => {
      if (zone === "structDeck" && playerId === viewerPlayerId()) {
        if (!requireActivePlayerControl()) return;
        zoneViewerState = null;
        state.selected = { kind: "structDeck", playerId, index: absIdx, confirmed: false };
        state.message = `${card.name}: カード確認後に設置できます。`;
        render();
      }
    });
    addCardHover(cx, cy, CARD_W, CARD_H, card);
  });

  if (totalRows > visibleRows) {
    drawButton(ox + ow - 70, oy + oh - 96, 46, 34, "↑", () => { zoneViewerState.scroll = Math.max(0, zoneViewerState.scroll - 1); });
    drawButton(ox + ow - 70, oy + oh - 54, 46, 34, "↓", () => { zoneViewerState.scroll = Math.min(totalRows - visibleRows, zoneViewerState.scroll + 1); });
    addWheelRegion(ox, startY, ow, visibleRows * (CARD_H + GAP_Y), (dy) => { zoneViewerState.scroll = Math.max(0, Math.min(totalRows - visibleRows, zoneViewerState.scroll + (dy > 0 ? 1 : -1))); });
  }
}

function drawLog() {
  // ボード右下のフローティングログパネル
  const lw = 380, lh = 54;
  const lx = W - lw - 8, ly = layout.board.y + layout.board.h - lh - 2;
  roundRect(lx, ly, lw, lh, 6, "rgba(4,8,20,0.80)", "rgba(30,60,140,0.30)", 1);
  ctx.fillStyle = "rgba(130,160,215,0.8)";
  ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
  state.log.slice(0, 3).forEach((line, i) => ctx.fillText(line, lx + 8, ly + 16 + i * 16, lw - 12));
}

function drawCard(x, y, w, h, card, options = {}) {
  if (card && !options.noHover) addCardHover(x, y, w, h, card);
  const theme = CARD_TYPE_THEME[card.type] || CARD_TYPE_THEME.struct;
  const isSelected = options.selected;
  const isSmall = options.small;
  const fs = isSmall ? 10 : 13;

  ctx.save();
  if (isSelected || options.affordable) {
    ctx.shadowColor = isSelected ? "#f0c040" : "#ffd84a";
    ctx.shadowBlur = isSelected ? 20 : 14;
  }
  const bgGrd = ctx.createLinearGradient(x, y, x, y + h);
  bgGrd.addColorStop(0, theme.grad[0]);
  bgGrd.addColorStop(1, theme.grad[1]);
  roundRect(x, y, w, h, 6, bgGrd, isSelected ? "#f0c040" : options.affordable ? "#ffd84a" : theme.accent, isSelected || options.affordable ? 2.5 : 1.5);
  ctx.shadowBlur = 0;
  ctx.restore();

  if (options.artOnly) {
    // フィールド表示用: アートのみ、名前・ステータスなし
    drawCardArt(x + 2, y + 2, w - 4, h - 4, card, options);
    if (card.rested && !options.noRestOverlay) drawRestedOverlay(x, y, w, h, options);
    if ((card.counters || 0) > 0) {
      const r = options.small ? 9 : 12;
      const bx = x + r + 4;
      const by = y + h - r - 4;
      ctx.save();
      ctx.shadowColor = "#c0a000";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(180,130,0,0.92)";
      ctx.fill();
      ctx.strokeStyle = "#ffe060";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff8c0";
      ctx.font = `800 ${options.small ? 9 : 11}px 'Yu Gothic UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(card.counters), bx, by);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.restore();
    }
    return;
  }

  // Art area (top 60% of card)
  const artH = Math.max(22, Math.floor(h * 0.58));
  drawCardArt(x + 2, y + 2, w - 4, artH - 2, card, options);

  // Name bar (gradient overlay at top)
  const nameGrd = ctx.createLinearGradient(x, y, x, y + 22);
  nameGrd.addColorStop(0, "rgba(0,0,0,0.8)");
  nameGrd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = nameGrd;
  ctx.fillRect(x + 2, y + 2, w - 4, 22);
  ctx.fillStyle = "#e8f0ff";
  ctx.font = `700 ${fs}px 'Yu Gothic UI', sans-serif`;
  ctx.fillText(card.name, x + 5, y + 15, w - 10);

  // Stats area below art
  const statsY = y + artH + 2;
  const statsH = h - artH - 4;
  if (statsH > 0) {
    ctx.fillStyle = "rgba(4,8,20,0.85)";
    ctx.fillRect(x + 2, statsY, w - 4, statsH);
    if (card.type === "unit" || card.type === "core") {
      const maxHp = card.maxHp ?? card.hp;
      const curHp = card.currentHp ?? card.hp;
      const hpRatio = maxHp > 0 ? Math.max(0, curHp / maxHp) : 0;
      const barX = x + 4; const barY = statsY + statsH - 8; const barW = w - 8;
      ctx.fillStyle = "rgba(20,20,40,0.8)"; ctx.fillRect(barX, barY, barW, 5);
      const hpCol = hpRatio > 0.5 ? "#30c060" : hpRatio > 0.25 ? "#e0a020" : "#e02020";
      ctx.fillStyle = hpCol; ctx.fillRect(barX, barY, barW * hpRatio, 5);
      if (card.type === "unit") {
        ctx.fillStyle = "#c0d8ff";
        ctx.font = `700 ${fs}px 'Yu Gothic UI', sans-serif`;
        ctx.fillText(`${card.atk}`, x + 5, statsY + 12);
      }
      ctx.textAlign = "right";
      ctx.fillStyle = hpRatio < 0.5 ? "#ff8080" : "#80e080";
      ctx.fillText(`${curHp}`, x + w - 5, statsY + 12);
      ctx.textAlign = "left";
      if ((card.counters || 0) > 0) {
        ctx.fillStyle = "#ffe060";
        ctx.font = `700 ${Math.max(8, fs - 2)}px 'Yu Gothic UI', sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(`◆${card.counters}`, x + w / 2, statsY + 12);
        ctx.textAlign = "left";
      }
      if (statsH > 30) drawCostIcons(card.cost || {}, x + 5, statsY + 15, { size: Math.max(10, Math.min(14, Math.floor(w / 7))), showNone: true });
      const keywords = keywordLabels(card).join(" ");
      if (keywords && statsH > 42) {
        ctx.fillStyle = theme.text;
        ctx.font = `600 ${Math.max(8, fs - 2)}px 'Yu Gothic UI', sans-serif`;
        ctx.fillText(keywords, x + 5, statsY + 38, w - 10);
      }
      if (card.rested && !options.noRestOverlay) drawRestedOverlay(x, y, w, h, options);
    } else {
      const typeLabel = { tact: "TACT", wild: "WILD", grand: "GRAND", struct: "STRUCT" }[card.type] || card.type.toUpperCase();
      ctx.fillStyle = theme.text;
      ctx.font = `700 ${fs}px 'Yu Gothic UI', sans-serif`;
      ctx.fillText(typeLabel, x + 5, statsY + 14);
      if (statsH > 30) drawCostIcons(card.cost || {}, x + 5, statsY + 18, { size: Math.max(10, Math.min(14, Math.floor(w / 7))), showNone: true });
    }
  }
}

function drawRestedOverlay(x, y, w, h, options = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 2, y + 2, w - 4, h - 4);
  ctx.clip();
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

  // Diagonal slash
  ctx.strokeStyle = "rgba(200, 60, 60, 0.7)";
  ctx.lineWidth = options.small ? 3 : 5;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + h - 8);
  ctx.lineTo(x + w - 8, y + 8);
  ctx.stroke();

  // REST badge
  const badgeW = options.small ? 40 : 58;
  const badgeH = options.small ? 16 : 22;
  ctx.shadowColor = "#ff2020";
  ctx.shadowBlur = 8;
  roundRect(x + w - badgeW - 6, y + 6, badgeW, badgeH, 4, "rgba(180,20,20,0.85)", "rgba(255,60,60,0.8)", 1.5);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffb0b0";
  ctx.font = options.small ? "800 10px 'Yu Gothic UI', sans-serif" : "800 13px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("REST", x + w - badgeW / 2 - 6, y + 6 + badgeH / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawCardArt(x, y, w, h, card, options = {}) {
  const entry = getCardImage(card);
  if (!entry?.loaded || entry.failed) {
    const theme = CARD_TYPE_THEME[card?.type] || CARD_TYPE_THEME.struct;
    const pg = ctx.createRadialGradient(x + w/2, y + h/2, 0, x + w/2, y + h/2, Math.max(w,h)*0.7);
    pg.addColorStop(0, theme.grad[0]);
    pg.addColorStop(1, theme.grad[1]);
    ctx.fillStyle = pg;
    ctx.fillRect(x, y, w, h);
    // カード名を中央に改行表示（仮画像）
    const name = card?.name || "";
    if (name && w > 16 && h > 12) {
      const fs = Math.max(7, Math.min(13, Math.floor(w / 4.8)));
      ctx.fillStyle = theme.text || "rgba(200,220,255,0.9)";
      ctx.font = `600 ${fs}px 'Yu Gothic UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const charsPerLine = Math.max(2, Math.floor((w - 6) / (fs * 0.9)));
      const lines = [];
      for (let i = 0; i < name.length; i += charsPerLine) lines.push(name.slice(i, i + charsPerLine));
      const lineH = fs + 3;
      let ty = y + h / 2 - (lines.length - 1) * lineH / 2;
      for (const line of lines) { ctx.fillText(line, x + w / 2, ty, w - 4); ty += lineH; }
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const iw = entry.image.naturalWidth || entry.image.width;
  const ih = entry.image.naturalHeight || entry.image.height;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(entry.image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  // Dark vignette at bottom so stats text is readable
  const botGrad = ctx.createLinearGradient(x, y + h - 30, x, y + h);
  botGrad.addColorStop(0, "rgba(0,0,0,0)");
  botGrad.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = botGrad;
  ctx.fillRect(x, y + h - 30, w, 30);
  ctx.restore();
}

function drawCardBack(x, y, w, h) {
  const grd = ctx.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, "#0e1a34");
  grd.addColorStop(1, "#060e1c");
  roundRect(x, y, w, h, 6, grd, "rgba(50,90,180,0.7)", 1.5);
  // Diamond pattern
  ctx.strokeStyle = "rgba(60,100,200,0.25)";
  ctx.lineWidth = 1;
  const cx2 = x + w / 2;
  const cy2 = y + h / 2;
  const size = Math.min(w, h) * 0.36;
  ctx.beginPath();
  ctx.moveTo(cx2, cy2 - size);
  ctx.lineTo(cx2 + size * 0.7, cy2);
  ctx.lineTo(cx2, cy2 + size);
  ctx.lineTo(cx2 - size * 0.7, cy2);
  ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = "rgba(80,130,255,0.18)";
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
}

function drawCardTooltip(card, mx, my) {
  const TW = 300;
  const PAD = 12;
  const LINE = 18;
  const tipTheme = CARD_TYPE_THEME[card?.type] || CARD_TYPE_THEME.struct;

  // measure height: collect lines first
  const lines = [];
  lines.push({ text: card.name, font: "700 14px 'Yu Gothic UI', sans-serif", color: "#c8e0ff" });
  const typeLabel = `${CARD_TYPE_LABELS[card.type] || card.type} / ${card.faction || "ニュートラル"}`;
  lines.push({ text: typeLabel, font: "600 11px 'Yu Gothic UI', sans-serif", color: tipTheme.text });
  if (card.type === "unit") {
    lines.push({ text: `ATK ${card.atk}  HP ${card.hp}`, font: "700 13px 'Yu Gothic UI', sans-serif", color: "#80d0ff" });
  }
  const tags = tagLabels(card);
  if (tags.length) lines.push({ text: `[${tags.join("] [")}]`, font: "600 11px 'Yu Gothic UI', sans-serif", color: "#80c0a0" });
  const hasCost = Object.values(card.cost || {}).some((v) => v > 0);
  if (hasCost || card.type !== "struct") {
    lines.push({ type: "cost", cost: card.cost || {}, label: "コスト" });
  }
  if (card.actCost && Object.values(card.actCost).some((v) => v > 0)) {
    lines.push({ type: "cost", cost: card.actCost, label: "アクト" });
  }
  const kwLabels = keywordLabels(card);
  if (kwLabels.length) lines.push({ text: kwLabels.join(" / "), font: "600 11px 'Yu Gothic UI', sans-serif", color: "#70b0e0" });
  const abilText = abilityText(card);
  if (abilText) lines.push({ text: abilText, font: "600 11px 'Yu Gothic UI', sans-serif", color: "#a0e0b8", wrap: true, maxLines: 4 });
  // 原文テキスト（description）を表示
  const descText = card.description || card.text || card.flavor || "";
  if (descText) lines.push({ text: descText, font: "600 11px 'Yu Gothic UI', sans-serif", color: "rgba(200,220,255,0.8)", wrap: true, maxLines: 12 });

  // compute tooltip height
  ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
  let th = PAD;
  for (const l of lines) {
    if (l.type === "cost") { th += LINE; continue; }
    ctx.font = l.font;
    if (l.wrap) {
      const words = l.text;
      let row = "";
      let lineCount = 0;
      const maxLines = l.maxLines || 8;
      for (const ch of words) {
        const next = row + ch;
        if (ctx.measureText(next).width > TW - PAD * 2) {
          lineCount++;
          row = ch;
          if (lineCount >= maxLines) break;
        } else {
          row = next;
        }
      }
      lineCount++;
      th += lineCount * LINE + 4;
    } else {
      th += LINE;
    }
  }
  th += PAD;

  // position
  let tx = mx + 18;
  let ty = my - 12;
  if (tx + TW > W - 4) tx = mx - TW - 18;
  if (ty + th > H - 4) ty = H - th - 4;
  if (ty < 4) ty = 4;

  roundRect(tx, ty, TW, th, 10, "rgba(4,6,18,0.97)", tipTheme.accent, 1.5);

  // draw lines
  let cy = ty + PAD + 4;
  for (const l of lines) {
    if (l.type === "cost") {
      ctx.fillStyle = "rgba(160,180,220,0.8)";
      ctx.font = "600 11px 'Yu Gothic UI', sans-serif";
      ctx.fillText(`${l.label}:`, tx + PAD, cy + 13, 46);
      drawCostIcons(l.cost, tx + PAD + 48, cy - 1, { size: 14, showNone: true });
      cy += LINE;
      continue;
    }
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    if (l.wrap) {
      const maxLines = l.maxLines || 8;
      cy = drawWrappedText(l.text, tx + PAD, cy + 2, TW - PAD * 2, LINE, maxLines);
    } else {
      ctx.fillText(l.text, tx + PAD, cy + 14, TW - PAD * 2);
      cy += LINE;
    }
  }
}

function drawMiniCard(x, y, w, h, label, fill) {
  roundRect(x, y, w, h, 5, fill, "rgba(80,120,200,0.4)", 1);
  ctx.fillStyle = "#b0c8e8";
  ctx.font = "600 12px 'Yu Gothic UI', sans-serif";
  ctx.fillText(label, x + 7, y + h * 0.65, w - 12);
}

function abilityText(card) {
  return (card?.abilities || [])
    .map((ability) => {
      const trigger = {
        onPlay: "使用時",
        onSummon: "登場時",
        onDestroy: "破壊時",
        onStructurePhase: "Structure Phase",
        onDestroyEnemyUnit: "相手ユニット破壊時",
        onTurnStart: "ターン開始時",
        onTurnEnd: "ターン終了時",
        onMill: "デッキから墓地送り時",
        onActivate: "起動",
        onFirstDraw: "最初のドロー時",
        onDamageDealt: "攻撃ダメージ与えた時",
        onStructurePhaseHP: "ライフ起動",
        onAttack: "攻撃するとき",
      }[ability.trigger] || ability.trigger;
      const effect = {
        drawCards: `カードを${ability.amount}枚引く`,
        damageEnemyCore: `敵コアに${ability.amount}ダメージ`,
        damageTargetUnit: `対象ユニットに${ability.amount}ダメージ`,
        produceResource: `${RESOURCE_LABELS[ability.resource] || ability.resource}+${ability.amount}`,
        gainResource: `${RESOURCE_LABELS[ability.resource] || ability.resource}+${ability.amount}`,
        buffFriendlyUnitsHp: `味方ユニットのHP+${ability.amount}`,
        buffFriendlyUnitsAtk: `味方ユニットのATK+${ability.amount}`,
        mysticCapture: "神秘ユニットを選択して登場時効果を発動",
        grantDestroyGain: `味方ユニット1体に「破壊時：${RESOURCE_LABELS[ability.resource] || ability.resource}+${ability.amount}」を付与`,
        chooseExchange: `${(ability.costOptions || []).map((o) => `${RESOURCE_LABELS[o.resource] || o.resource}${o.amount}`).join("または")}を支払い → ${Object.entries(ability.produces || {}).map(([r, a]) => `${RESOURCE_LABELS[r] || r}+${a}`).join("/")}`,
        chooseProduceResource: `${(ability.options || []).map((o) => o.label || o.id).join("か")}を得る`,
        chooseSummonGolem: `${(ability.costOptions || []).map((o) => `${RESOURCE_LABELS[o.resource] || o.resource}${o.amount}`).join("または")}→コスト${ability.maxCost || 3}以下の[ゴーレム]を出す`,
        tactToStructOverStruct: `「${ability.requiredStructName || "覆没の迷宮"}」があればストラクト化`,
        summonGolemFromDeckOrDump: `デッキ・墓地からコスト${ability.maxCost || 3}以下の[ゴーレム]を出す`,
        summonGolemToSameRow: `デッキ・墓地からコスト${ability.maxCost || 3}以下の[ゴーレム]を同じ行に出す`,
        destroySelf: "自壊",
        searchDeckByType: `デッキから${ability.cardType || "?"}を手札に`,
        revealTopNPick: `デッキ上${ability.amount || 3}枚公開→1枚手札に`,
        searchDeckPick: "デッキから条件合致カードを1枚手札に",
        payResourceOrCoreDamage: `${RESOURCE_LABELS[ability.resource] || ability.resource}${ability.amount}支払いまたはコア${ability.damage}ダメージ`,
        gainShockOrAlert: "[衝撃]か[警戒]を得る",
        grantKeywordsToEnemyRelativeRow: `敵第${ability.row}行に${(ability.keywords || []).map((k) => `[${KEYWORD_DEFINITIONS[k]?.label || k}]`).join("")}付与`,
        destroySelfIfUnrested: "アンレストなら自壊",
        summonToken: "トークン生成",
        gainActCostResources: "攻撃ダメージ時：相手アクトコスト資源を獲得",
        reviveUnitFromDump: `墓地からコスト${ability.maxCost}以下のユニットを蘇生`,
        restTargetNoUnrest: "相手ユニットをレスト（次ターン解除不可）",
        produceResourceCostHP: `ライフ${ability.hpCost}支払い → ${RESOURCE_LABELS[ability.resource] || ability.resource}+${ability.amount}`,
        produceResourceCostHuman: `人${ability.humanCost}支払い → ${RESOURCE_LABELS[ability.resource] || ability.resource}+${ability.amount}`,
        destroyEnemyStructs: `燃${ability.fuelCost}支払い → 相手のストラクト${ability.amount}枚破壊`,
        destroyEnemyStructsOnPlay: `相手のストラクト${ability.amount}枚破壊`,
      }[ability.effect] || ability.effect;
      return `${trigger}: ${effect}`;
    })
    .join(" / ");
}

function drawWrappedText(text, x, y, maxWidth, lineHeight, maxLines = 8) {
  const chars = String(text || "").split("");
  let line = "";
  let lines = 0;
  for (const char of chars) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y, maxWidth);
      y += lineHeight;
      lines += 1;
      line = char;
      if (lines >= maxLines) return y;
    } else {
      line = next;
    }
  }
  if (line && lines < maxLines) {
    ctx.fillText(line, x, y, maxWidth);
    y += lineHeight;
  }
  return y;
}

function drawButton(x, y, w, h, label, onClick, _fillUnused, opts = {}) {
  const isMicro = opts.micro;
  const accent = opts.accent; // "p1" | "dim" | undefined
  let bgColor, borderColor, textColor;
  if (accent === "p1") {
    bgColor = "rgba(20,60,180,0.85)"; borderColor = "#4090ff"; textColor = "#c0d8ff";
  } else if (accent === "dim") {
    bgColor = "rgba(30,20,20,0.7)"; borderColor = "rgba(120,60,60,0.6)"; textColor = "#806060";
  } else if (opts.dark) {
    bgColor = "rgba(10,16,36,0.85)"; borderColor = "rgba(50,80,160,0.5)"; textColor = "#8090b0";
  } else {
    bgColor = "rgba(14,24,52,0.85)"; borderColor = "rgba(60,100,200,0.55)"; textColor = "#a8c0e8";
  }
  roundRect(x, y, w, h, isMicro ? 4 : 7, bgColor, borderColor, isMicro ? 1 : 1.5);
  ctx.fillStyle = textColor;
  ctx.font = isMicro ? "700 11px 'Yu Gothic UI', sans-serif" : "700 14px 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  if (onClick) addHit(x, y, w, h, onClick);
}

function roundRect(x, y, w, h, r, fill, stroke, lineWidth = 2) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function gameSummary() {
  return {
    note: "Canvas coordinates origin top-left; x right, y down. Board rows 0-3 from Player 2 side to Player 1 side.",
    app: {
      screen: app.screen,
      auth: app.auth,
      deckName: app.deckName,
      deck: { core: app.deck.core, main: [...app.deck.main], struct: [...app.deck.struct] },
      savedDecks: app.savedDecks.map((entry) => ({ id: entry.id, name: entry.name, mainCount: entry.deck.main.length, structCount: entry.deck.struct.length })),
      structDeckScroll: app.structDeckScroll,
      selectedCard: (() => {
        const card = findCatalogCard(app.deckBuilder.selectedCardId);
        return card ? { id: card.id, name: card.name, type: card.type, text: card.text || card.flavor || "", abilities: abilityText(card) } : null;
      })(),
      match: app.match,
      localCardPopup: app.localCardPopup,
      queuedOnlineAction: queuedOnlineAction ? { opId: queuedOnlineAction.opId, reason: queuedOnlineAction.reason, playerId: queuedOnlineAction.playerId } : null,
    },
    turn: state.turn,
    activePlayer: state.activePlayer,
    viewerPlayer: viewerPlayerId(),
    bottomHandPlayer: viewerPlayerId(),
    topHandPlayer: opponentOf(viewerPlayerId()),
    phase: state.phase,
    winner: state.winner,
    selected: state.selected,
    handConfirmVisible: Boolean(
      ["hand", "structDeck"].includes(state.selected?.kind) &&
        !state.selected.confirmed &&
        (!state.selected.playerId || state.selected.playerId === viewerPlayerId()) &&
        selectedPlayableCard(),
    ),
    cardReveal: state.cardReveal,
    dismissedCardRevealIds: [...app.dismissedCardRevealIds],
    turnStartSummary: state.turnStartSummary,
    pendingTarget: state.pendingTarget
      ? { card: state.pendingTarget.card.name, target: state.pendingTarget.ability.target, effect: state.pendingTarget.ability.effect }
      : null,
    pendingChoice: state.pendingChoice
      ? {
          type: state.pendingChoice.type,
          card: state.pendingChoice.cardName,
          selectedHandIndexes: [...(state.pendingChoice.selectedHandIndexes || [])],
          selected: state.pendingChoice.selected || [],
          selectedUnitInstanceId: state.pendingChoice.selectedUnitInstanceId ?? null,
          selectedStructIndex: state.pendingChoice.selectedStructIndex ?? null,
          selectedHandIndex: state.pendingChoice.selectedHandIndex ?? null,
          choices: state.pendingChoice.type === "mysticCapture"
            ? mysticCaptureChoices().map(({ card, handIndex }) => ({ handIndex, name: card.name, tags: tagLabels(card) }))
            : [],
        }
      : null,
    effectQueueCount: state.effectQueue.length,
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, player]) => [
        id,
        {
          core: {
            id: player.core.id,
            name: player.core.name,
            faction: player.core.faction || null,
            flavor: player.core.flavor || "",
            hp: player.core.hp,
            initialHand: player.core.initialHand,
            draw: player.core.draw,
            handLimit: player.core.handLimit,
            deckSize: player.core.deckSize,
            deckMin: player.core.deckMin,
            deckMax: player.core.deckMax,
            startResources: player.core.startResources,
            income: player.core.income,
            specialRequirements: player.core.specialRequirements || [],
          },
          coreHp: player.core.hp,
          resources: player.resources,
          hand: player.hand.map((card) => ({
            name: card.name,
            type: card.type,
            faction: card.faction || null,
            tags: tagLabels(card),
            variant: card.variant || null,
            cost: card.cost,
            keywords: keywordLabels(card),
            image: cardImageSource(card),
          })),
          structs: player.structs.map((card) => card.name),
          tactZone: player.tactZone.map((card) => card.name),
          wildZone: player.wildZone.map((card) => ({ type: card.type, faceDown: Boolean(card.faceDown) })),
          grandZone: player.grandZone.map((card) => card.name),
          mainDeckCount: player.mainDeck.length,
          structDeckCount: player.structDeck.length,
          dumpCount: player.dump.length,
          exileCount: player.exileZone.length,
        },
      ]),
    ),
    board: state.board.map((row) =>
      row.map((unit) =>
        unit
          ? {
              owner: unit.owner,
              name: unit.name,
              faction: unit.faction || null,
              tags: tagLabels(unit),
              variant: unit.variant || null,
              atk: unit.atk,
              hp: unit.currentHp,
              maxHp: unit.maxHp,
              rested: unit.rested,
              keywords: keywordLabels(unit),
              image: cardImageSource(unit),
              attacksThisTurn: unit.attacksThisTurn || 0,
            }
          : null,
      ),
    ),
    visualBoard: Array.from({ length: ROWS }, (_, visualRow) =>
      state.board[visualRowToBoardRow(visualRow)].map((unit) =>
        unit
          ? {
              owner: unit.owner,
              name: unit.name,
              row: unit.row,
              visualRow,
              rested: unit.rested,
            }
          : null,
      ),
    ),
    message: state.message,
    log: state.log.slice(0, 5),
  };
}

function resetForTest(options = {}) {
  const fresh = createGame(DEFAULT_MAIN_DECK_IDS, DEFAULT_STRUCT_DECK_IDS, DEFAULT_CORE_ID, { shuffleMainDeck: false });
  Object.assign(state, fresh);
  app.screen = "game";
  nextInstanceId = 1;
  if (options.emptyHands) {
    for (const player of Object.values(state.players)) player.hand = [];
  }
  if (options.resources) {
    for (const [playerId, resources] of Object.entries(options.resources)) {
      state.players[playerId].resources = normalizeResourceObject(resources);
    }
  }
  render();
  return gameSummary();
}

function placeUnitForTest(cardId, owner, row, col, options = {}) {
  const unit = makeUnit(cardId, owner, row, col, options);
  commitUnitToBoard(state, unit, row, col);
  render();
  return unit;
}

function setResourcesForTest(playerId, resources) {
  state.players[playerId].resources = normalizeResourceObject(resources);
  render();
  return state.players[playerId].resources;
}

function selectUnitForTest(row, col) {
  if (!state.board[row]?.[col]) throw new Error(`No unit at ${row},${col}`);
  state.selected = { kind: "unit", row, col };
  render();
}

function openUnitDetailForTest(row, col) {
  if (!state.board[row]?.[col]) throw new Error(`No unit at ${row},${col}`);
  state.selected = { kind: "unit", row, col, detailOpen: true };
  render();
  return gameSummary();
}

function openFieldStructDetailForTest(playerId, index) {
  if (!state.players[playerId]?.structs[index]) throw new Error(`No struct at ${playerId}:${index}`);
  state.selected = { kind: "fieldStruct", playerId, index, detailOpen: true };
  render();
  return gameSummary();
}

function addHandCardForTest(playerId, cardId) {
  const card = cardCatalog.main[cardId] || cardCatalog.structs[cardId] || cardCatalog.cores[cardId];
  if (!card) throw new Error(`Unknown card: ${cardId}`);
  state.players[playerId].hand.push(cloneCard(card));
  render();
  return state.players[playerId].hand.length - 1;
}

function addDumpCardForTest(playerId, cardId) {
  const card = cardCatalog.main[cardId] || cardCatalog.structs[cardId] || cardCatalog.cores[cardId];
  if (!card) throw new Error(`Unknown card: ${cardId}`);
  state.players[playerId].dump.push(cloneCard(card));
  render();
  return state.players[playerId].dump.length;
}

function validateDeckForTest(ids) {
  validateDeck(ids);
  return true;
}

function selectHandCardForTest(handIndex) {
  const card = state.players[state.activePlayer].hand[handIndex];
  if (!card) return false;
  state.selected = { kind: "hand", playerId: state.activePlayer, index: handIndex, confirmed: false };
  return true;
}

function selectStructDeckCardForTest(structIndex) {
  const card = state.players[state.activePlayer].structDeck[structIndex];
  if (!card) return false;
  state.selected = { kind: "structDeck", playerId: state.activePlayer, index: structIndex, confirmed: false };
  return true;
}

const testing = {
  reset: resetForTest,
  placeUnit: placeUnitForTest,
  setResources: setResourcesForTest,
  selectUnit: selectUnitForTest,
  openUnitDetail: openUnitDetailForTest,
  openFieldStructDetail: openFieldStructDetailForTest,
  addHandCard: addHandCardForTest,
  addDumpCard: addDumpCardForTest,
  validateDeck: validateDeckForTest,
  summonFromHand: placeUnitFromHand,
  playTactFromHand,
  playWildFromHand,
  playGrandFromHand,
  playStruct,
  activateStructInPhase,
  activateTactInPhase,
  resolveMarketChoice,
  resolveChooseGainResource,
  resolveLifeCounterPayment,
  toggleDestroyChoice,
  resolveDestroyChoice,
  toggleKaijuAwakenChoice,
  resolveKaijuAwakenChoice,
  toggleMysticCaptureChoice,
  resolveMysticCaptureChoice,
  resolveRevealPick,
  resolveRevealPickSkip,
  resolveSearchDeckPick,
  resolveChargeAttack,
  selectHandCard: selectHandCardForTest,
  selectStructDeckCard: selectStructDeckCardForTest,
  useSelectedHandCard,
  useSelectedPlayableCard,
  canControlActivePlayer,
  attack: attackWithSelectedUnit,
  resolveTarget: resolvePendingTarget,
  processEffectQueue,
  activateSelectedUnit,
  cleanupAllDestroyed,
  move: moveSelectedUnit,
  retreat: retreatSelectedUnit,
  endTurn,
  signInWithGoogleDemo,
  signInWithGoogle,
  signInAsGuest,
  signOut,
  openDeckBuilder,
  openMatchLobby,
  startLocalMatch,
  startMatchFromLobby,
  startOnlineMatch,
  copyRoomCode,
  createRoomMatch,
  joinRoomMatch,
  broadcastOnlineState,
  requestOnlineStateSync,
  addDeckCard,
  removeDeckCard,
  removeDeckCardById,
  addStructDeckCard,
  removeStructDeckCard,
  removeStructDeckCardById,
  importDeckmakerDeckData,
  importDeckmakerAllData,
  deckmakerAllDataPayload,
  exportIncompleteCardData,
  buildIncompleteCardDataPayload,
  catalogCard: findCatalogCard,
  setDeckBuilderLibrary,
  changeLibraryPage,
  changeLibraryScroll,
  changeStructDeckScroll,
  changeDeckScroll,
  setDeckBuilderSearchPreset,
  setDeckBuilderTagFilter,
  cycleDeckBuilderSort,
  saveDeck,
  syncDecksFromServer,
  persistDecksToServer,
  loadNamedDeck,
  selectMatchDeck,
  selectCardForDetail,
  testDrawDeck,
  selectCoreCard,
  resetDeckBuilder,
  summary: gameSummary,
};

window.render_game_to_text = () => JSON.stringify(gameSummary());
window.advanceTime = () => render();
window.__twcg = { app, state, cardCatalog, abilityEffects, KEYWORD_DEFINITIONS, testing, render };

loadServerConfig();
loadFirebaseCardsIntoCatalog().then(() => render());
render();
