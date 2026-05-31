import { BigNum } from './bignum';

export type Difficulty = 'muryotaisu' | 'mabara' | 'kaibun' | 'fukasetsu' | 'graham';

export interface DifficultyConfig {
  /** コース名 */
  name: string;
  /** 補足（控えめに） */
  desc: string;
  /** 敵の総 HP */
  hp: BigNum;
  /** クリアまでに集めるアイテム総数（chunkAtE から導出） */
  totalItems: number;
  /** 極限モード（実時間で 1 日級。メニューで警告枠として描く） */
  extreme?: boolean;
}

/**
 * ゲージ密度・インフレ率のチューニング定数（全コース共通）。HP しか変えないという
 * 設計原則の下、ここの 3 値だけで「ゲージの削れリズム」と「命数体験のスケール」を制御する。
 */
export const GAUGE_DENSITY = {
  /**
   * 1 ボックスを削るのに何アイテム分かかるか。1 アイテム = `chunkAtE` 分の atk.e 上昇 ≈
   * 1 アイテム分の damageE 増、なので「1 box ≒ K アイテム ≒ K × CLICK_BUDGET クリック」となる。
   * 体感のためのキー定数：小さくすると箱が細かく速く削れ、大きくすると重厚にゆっくり削れる。
   */
  ITEMS_PER_BOX: 10,
  /**
   * 万進法ゾーン（e < INFL_E）での chunk の床値。`atk.e` の per-item 上昇量で、
   * 「1 命数（4 桁）あたり何アイテム使うか」 = 4 / C0 を決める。
   * 1.0 だと万進法 1 命数 ≒ 4 アイテム ≒ 36 タップ、3-5 タップの最低保証は十分余裕。
   */
  C0: 1.0,
  /**
   * 「インフレ率がインフレし始める」しきい値。e ≤ INFL_E では chunk = C0 一定、
   * e > INFL_E では chunk = e / INFL_E と現在指数に比例して伸びる。
   * 100 は無量大数(68)のすぐ上＝「無量大数を越えた瞬間から世界が加速する」物語に対応。
   */
  INFL_E: 100,
} as const;

/**
 * 画面に並べる箱の上限（コンベアモードのトリガ）。
 *
 * 値は「摩婆羅コースの totalSegments」と同じ ≒ 32。1 箱のサイズは `gaugeView` 側でこの本数
 * (cap − 1 = 31 箱) がバー幅にちょうど収まるよう固定する。これより多い displayedSegments を
 * 許すと、削れた箱の赤フラッシュ→消滅→左へスライドする演出が画面外で起きてしまうため。
 * 界分以上は totalSegments > cap となり自動的にコンベアモードに入る。
 */
export const DISPLAY_CAP_BOXES = 32;

/**
 * 1 アイテムが atk.e を押し上げる量。`e ≤ INFL_E` までは一定 (= C0)、その先は現在の指数に
 * 比例してインフレ率自体が伸びる。これにより上数法の命数間隔（次の命数 = 2 × 現在指数）と
 * chunk の伸びが同調し、「1 命数あたりのアイテム数」が自然に一定（= INFL_E / C0 / ln(2) 近辺）
 * に保たれる。
 */
export function chunkAtE(e: number): number {
  const { C0, INFL_E } = GAUGE_DENSITY;
  return Math.max(C0, e / INFL_E);
}

/**
 * 1 ボックスが表す damageE 量。chunkAtE と同じ形で伸びるので、per-click のゲージ削り量
 * (≒ chunk / (CLICK_BUDGET × expPerBox)) は e に依らず一定 ≒ 1/(CLICK_BUDGET × ITEMS_PER_BOX)
 * になる＝コース全域で同じ「削れ感」が得られる。
 */
export function expPerBoxAt(e: number): number {
  return GAUGE_DENSITY.ITEMS_PER_BOX * chunkAtE(e);
}

/**
 * damageE → consumed (削った箱数の連続値)。`∫₀^D 1/expPerBoxAt(e) de` の閉形式。
 * Phase A (D ≤ INFL_E) は線形、Phase B は対数。境界で C¹ 連続。
 */
export function consumedFromDamageE(damageE: number): number {
  if (damageE <= 0) return 0;
  const { ITEMS_PER_BOX, C0, INFL_E } = GAUGE_DENSITY;
  const boxA = INFL_E / (ITEMS_PER_BOX * C0); // Phase A の総箱数 = INFL_E / (K × C0)
  if (damageE <= INFL_E) return damageE / (ITEMS_PER_BOX * C0);
  // Phase B: ∫ 1/(K × e/INFL_E) de = (INFL_E/K) × ln(e)
  return boxA + (INFL_E / ITEMS_PER_BOX) * Math.log(damageE / INFL_E);
}

/**
 * `consumedFromDamageE` の逆関数（テスト・ダーティチェック・デバッグ用）。
 * 「ゲージ位置 X 箱から復元したい damageE は？」に答える。
 */
export function damageEFromConsumed(consumed: number): number {
  if (consumed <= 0) return 0;
  const { ITEMS_PER_BOX, C0, INFL_E } = GAUGE_DENSITY;
  const boxA = INFL_E / (ITEMS_PER_BOX * C0);
  if (consumed <= boxA) return consumed * ITEMS_PER_BOX * C0;
  return INFL_E * Math.exp(((consumed - boxA) * ITEMS_PER_BOX) / INFL_E);
}

/**
 * 端数調整：`consumedFromDamageE(hp.e)` は一般に整数にならないので、`totalSegments` と
 * 揃うように線形にストレッチする。`damageE = hp.e` でちょうど `consumed = totalSegments` に
 * 到達＝撃破時にゲージがピッタリ 0 になる。スケーリング比は最大でも ~1.03 (無量大数) なので
 * per-click 削り感は実質変化なし。
 */
export function consumedAtDamage(damageE: number, hpE: number): number {
  const rawAtHp = consumedFromDamageE(hpE);
  if (rawAtHp <= 0) return 0;
  const total = Math.max(1, Math.ceil(rawAtHp));
  return consumedFromDamageE(damageE) * (total / rawAtHp);
}

/** `consumedAtDamage` の逆関数（devtools 用）。 */
export function damageEAtConsumed(consumed: number, hpE: number): number {
  const rawAtHp = consumedFromDamageE(hpE);
  if (rawAtHp <= 0) return 0;
  const total = Math.max(1, Math.ceil(rawAtHp));
  return damageEFromConsumed(consumed * (rawAtHp / total));
}

/**
 * 撃破までに必要なアイテム総数。`∫₀^hp.e 1/chunkAtE(e) de` の閉形式。
 * Phase A は線形、Phase B は対数なので、巨大な hp.e でも overflow しない。
 */
export function totalItemsForHp(hpE: number): number {
  if (hpE <= 0) return 1;
  const { C0, INFL_E } = GAUGE_DENSITY;
  const itemsA = INFL_E / C0; // Phase A 全域分のアイテム数 = INFL_E / C0
  if (hpE <= INFL_E) return Math.max(1, Math.round(hpE / C0));
  return Math.max(1, Math.round(itemsA + INFL_E * Math.log(hpE / INFL_E)));
}

/** HP指数からコース設定を作る。コース間の差異は HP（と説明文）のみ。 */
function course(name: string, desc: string, hpE: number, extreme = false): DifficultyConfig {
  return {
    name,
    desc,
    hp: new BigNum(1, hpE),
    totalItems: totalItemsForHp(hpE),
    extreme,
  };
}

// コース間の差異は「敵の HP」だけ。chunkAtE / expPerBoxAt はコース不問の全域共通。
export const difficultyConfigs: Record<Difficulty, DifficultyConfig> = {
  // 4 つの本コース：到達命数で命名。所要時間は INFL_E=100 の曲線における目安。
  muryotaisu: course('無量大数 コース', '万進法の最果てまで。サクッと 1 分。',                       68),
  mabara:     course('摩婆羅 コース',   '上数法に踏み入る。そこそこ 5 分。',                         896),
  kaibun:     course('界分 コース',     '上数法を駆け上がる。じっくり 8 分。',                       7168),
  fukasetsu:  course('不可説不可説転 コース', '華厳経の象徴的命数。極限 2 時間。',                    7 * Math.pow(2, 122)), // = 不可説不可説転の正確な指数
  // フレーバー枠（事実上クリア不能ではないが、文字通り 1 日張り付くプレイ）
  graham:     course('グラハム数 コース', '記号上の到達点。連打で 1 週間級。本当にやる？', 1.7e308, true),
};

/** メニュー表示順 */
export const difficultyOrder: Difficulty[] = [
  'muryotaisu',
  'mabara',
  'kaibun',
  'fukasetsu',
  'graham',
];

/**
 * 真の総 segments 数。damageE = hp.e に到達した時の consumed = 撃破ピッタリの箱数。
 * 極限ゾーンでは天文学的になるので、表示は DISPLAY_CAP_BOXES で頭打ちにする（コンベアモード）。
 */
export function totalSegmentsForHp(hpE: number): number {
  if (hpE <= 0) return 0;
  return Math.max(1, Math.ceil(consumedFromDamageE(hpE)));
}

/**
 * 画面に並べる箱の本数。`totalSegments(hpE)` を DISPLAY_CAP_BOXES で頭打ちにするだけ。
 * 動的密度の下では、無量大数 ≈ 7 / 摩婆羅 ≈ 32（= cap）/ 界分以上は cap に達してコンベアに入る。
 */
export function displayBoxesForHp(hpE: number): number {
  return Math.max(1, Math.min(DISPLAY_CAP_BOXES, totalSegmentsForHp(hpE)));
}

/** 攻撃力の挙動チューニング */
export const ATTACK = {
  /**
   * アイテム取得から次のアイテム出現までのクリック数。`chunkAtE` 分の atk.e ジャンプを
   * このクリック数で按分するので「アイテム取得後の伸び」が均される。
   */
  CLICK_BUDGET_PER_ITEM: 9,
} as const;

/** ゲージの挙動・演出チューニング */
export const GAUGE = {
  /** 攻撃後この時間（ms）は赤い残像ゲージを維持する */
  TRAIL_HOLD_MS: 600,
  /** 維持後、赤ゲージが実位置に追従して減る割合 */
  TRAIL_DECAY_RATE: 0.15,
  /** 1 本削り切った箱が赤く光る時間（ms） */
  BOX_FLASH_MS: 300,
  /** 赤→黒のあと、左へスライドしてフェードアウトし切るまでの時間（ms） */
  BOX_SLIDE_MS: 240,
} as const;

/** ゲージ・箱の配色（KH 風：基本緑＋黒背景） */
export const COLORS = {
  /** 通常ゲージの緑 */
  base: '#27e35a',
  /**
   * ダメージ残像の赤。彩度を落とした赤にしてある（純赤 #ff2b2b は暗い背景で
   * 前進して見え＝色立体視で隣の緑から「浮いて」見えるため、彩度を下げて同一面に馴染ませる）。
   */
  trail: '#d64545',
  /** ゲージ背景（黒） */
  bg: '#0a0a0a',
  /**
   * 最後の 1 本だけ多層表現。深い層から順の配列 [0]=黄(最深) / [1]=青 / [2]=緑(最前面)。
   * 前面の緑を削ると背面の青が現れ、青を削ると黄が現れ、黄を削り切ると黒背景になる。
   */
  final: ['#ffd21a', '#1f8fff', '#27e35a'],
  /** 残ゲージ箱：生存 / 削り切った瞬間 / 消滅後 */
  boxAlive: '#27e35a',
  boxFlash: '#d64545',
  boxDead: '#0b0b0b',
} as const;
