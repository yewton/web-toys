import { BigNum } from './bignum';

export type Difficulty = 'min1' | 'min5' | 'min30' | 'fudasetsu' | 'graham';

export interface DifficultyConfig {
  /** コース名 */
  name: string;
  /** 補足（控えめに） */
  desc: string;
  /** 敵の総 HP */
  hp: BigNum;
  /** クリアまでに集めるアイテム総数 */
  totalItems: number;
  /** 極限モード（事実上クリア不能・自己責任）。メニューで警告枠として描く */
  extreme?: boolean;
}

/**
 * 1 アイテム分の atk.e 上昇量（チャンク）。全コース共通。
 * totalItems = hp.e / CHUNK_E（HPだけで導出される。コース毎に手動チューニングしない）。
 */
export const CHUNK_E = 3.4;
/**
 * ゲージの 1 箱が表す damage 量（log10）。コース共通。30分(hp.e=2040)がちょうど
 * 60 箱に収まる粒度（= 2040/60）に揃え、1分(=2 箱)/5分(=10)/30分(=60)を全量表示できる。
 * 極限は totalSegments が cap を超えるのでコンベアモードに入る。
 */
export const DISPLAY_CAP_BOXES = 60;
export const EXP_PER_BOX = 34;

/** HP指数からコース設定を作る。コース間の差異は HP（と説明文）のみ。 */
function course(name: string, desc: string, hpE: number, extreme = false): DifficultyConfig {
  return {
    name,
    desc,
    hp: new BigNum(1, hpE),
    totalItems: Math.max(1, Math.round(hpE / CHUNK_E)),
    extreme,
  };
}

// コース間の差異は「敵の HP」だけ。ゲージ仕様 / アイテム挙動はすべて共通。
export const difficultyConfigs: Record<Difficulty, DifficultyConfig> = {
  // 時間コース（HP指数を上げるほど道中で命数が登る。最後のゲージは多層クライマックス）
  min1:  course('1分コース',  '無量大数（10⁶⁸）まで。腕慣らしに。',                       68),
  min5:  course('5分コース',  '阿伽羅（10³⁴⁰）まで。矜羯羅・阿伽羅など珍しい命数が出る。', 340),
  min30: course('30分コース', '阿婆羅（10²⁰⁴⁰）まで。命数を駆け上がる長丁場。',           2040),
  // 極限モード（自己責任）。HP が桁外れ＝事実上クリア不能（同じロジックの帰結としてそうなる）。
  fudasetsu: course('不可説不可説転級', '10^(3.7×10³⁷)。毎秒10クリックでも約10³⁰年。自己責任で。', 3.7e37,  true),
  graham:    course('グラハム数級',     '10^(1.7×10³⁰⁸)。約10³⁰⁰年。完全にネタ。自己責任で。',     1.7e308, true),
};

/** メニュー表示順 */
export const difficultyOrder: Difficulty[] = ['min1', 'min5', 'min30', 'fudasetsu', 'graham'];

/**
 * 真の総 segments 数。1 箱 = EXP_PER_BOX のダメージなので hp.e / EXP_PER_BOX。
 * 極限コースでは天文学的な値になる（描画はしない、論理的な総量として保持）。
 */
export function totalSegmentsForHp(hpE: number): number {
  if (hpE <= 0) return 0;
  return Math.ceil(hpE / EXP_PER_BOX);
}

/**
 * 画面に並べる箱の本数。`totalSegments(hpE)` を DISPLAY_CAP で頭打ちにするだけ。
 * EXP_PER_BOX = 34 と DISPLAY_CAP = 60 の組み合わせで:
 *   1分=2 / 5分=10 / 30分=60（全量表示） / 不可説&グラハム=60（cap、コンベア）。
 * 全コースで 1 箱は同じダメージ量を表す＝ 1 クリックの per-box 削り速度は共通。
 */
export function displayBoxesForHp(hpE: number): number {
  return Math.max(1, Math.min(DISPLAY_CAP_BOXES, totalSegmentsForHp(hpE)));
}

/** 攻撃力の挙動チューニング */
export const ATTACK = {
  /**
   * 直近のアイテム取得からこのクリック数が経つと、次のアイテムが 1 つ出現する。
   * クリック自体が「燃料」を作るわけではなく、単に「このペースでアイテムが供給される」
   * という供給間隔。1分(20 items)=180 clicks、30分(600 items)=5400 clicks 相当。
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
