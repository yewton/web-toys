import { BigNum } from './bignum';
import { difficultyConfigs, type Difficulty } from './config';

export type Screen = 'menu' | 'playing' | 'cleared';

export interface GameState {
  screen: Screen;
  difficulty: Difficulty;
  /** 敵の総 HP（指数 = maxHp.e がゲージ進行の基準）。表示用にも使う */
  maxHp: BigNum;
  /** 現在の 1 クリック当たりのダメージ倍率 = 10^atk.e。アイテム取得後だけ atkTargetE に向かって徐々に上がる。 */
  atk: BigNum;
  /**
   * 攻撃力の目標指数。アイテムを 1 個取ると `chunkAtE(atkTargetE)` だけジャンプし、その後
   * atk.e がクリック毎に一定歩幅(= chunk / CLICK_BUDGET_PER_ITEM)でここへ追従する。
   * 追いついた後は止まる＝アイテムを取らないと atk.e は動かない。
   */
  atkTargetE: number;
  /**
   * 累積ダメージの log10。各クリックで dmg = m × 10^atk.e を log_add で加算する。
   * ゲージは `consumedFromDamageE(damageE)` で動的密度に変換される（hpGauge.ts 参照）。
   * 序盤 atk.e=0 のうちは加算してもほぼ変わらず＝視覚的にはほぼ削れない＝アイテムで
   * atk.e をインフレさせて初めて適切なペースで削れる。
   */
  damageE: number;
  itemsCollected: number;
  itemAvailable: boolean;
  itemPos: { top: string; left: string };
  /** 直近のアイテムからのクリック数。CLICK_BUDGET_PER_ITEM 到達で次のアイテムを出す。 */
  clicksSinceItem: number;
  elapsedTime: number;
  /** これまでの累計クリック数（リザルト表示用）。 */
  totalClicks: number;
  /** 単発で出した最大ダメージ（リザルト表示用）。`m × 10^e`。 */
  maxHit: BigNum;
  /** 現在の敵絵文字。セーブ/ロード時に復元する。 */
  enemyEmoji: string;
}

export const state: GameState = {
  screen: 'menu',
  difficulty: 'muryotaisu',
  maxHp: new BigNum(1, 68),
  atk: new BigNum(1, 0),
  atkTargetE: 0,
  damageE: 0,
  itemsCollected: 0,
  itemAvailable: false,
  itemPos: { top: '50%', left: '50%' },
  clicksSinceItem: 0,
  elapsedTime: 0,
  totalClicks: 0,
  maxHit: new BigNum(0, 0),
  enemyEmoji: '🧌',
};

/** 難易度を選んで新規ゲーム用に状態を初期化する。 */
export function resetForDifficulty(diff: Difficulty): void {
  const cfg = difficultyConfigs[diff];
  state.difficulty = diff;
  state.maxHp = new BigNum(cfg.hp.m, cfg.hp.e);
  state.atk = new BigNum(1, 0);
  state.atkTargetE = 0;
  state.damageE = 0;
  state.itemsCollected = 0;
  state.itemAvailable = false;
  state.itemPos = { top: '50%', left: '50%' };
  state.clicksSinceItem = 0;
  state.elapsedTime = 0;
  state.totalClicks = 0;
  state.maxHit = new BigNum(0, 0);
}

const SAVE_KEY_PREFIX = 'inflationClicker.save.';
const LEGACY_SAVE_KEY = 'inflationClicker.save';

function saveKeyFor(diff: Difficulty): string {
  return `${SAVE_KEY_PREFIX}${diff}`;
}

interface SerializedBig {
  m: number;
  e: number;
}
interface SaveData {
  screen: Screen;
  difficulty: Difficulty;
  maxHp: SerializedBig;
  atk: SerializedBig;
  atkTargetE: number;
  damageE: number;
  itemsCollected: number;
  itemAvailable: boolean;
  itemPos: { top: string; left: string };
  clicksSinceItem: number;
  elapsedTime: number;
  totalClicks: number;
  maxHit: SerializedBig;
  enemyEmoji?: string;
}

const ser = (n: BigNum): SerializedBig => ({ m: n.m, e: n.e });
const deser = (s: SerializedBig): BigNum => new BigNum(s.m, s.e);

/** 旧フォーマット（単一スロット）のセーブを難易度別キーへ移行する。起動時に 1 回呼ぶ。 */
export function migrateLegacySave(): void {
  try {
    const raw = localStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (d.difficulty && difficultyConfigs[d.difficulty]) {
      const newKey = saveKeyFor(d.difficulty);
      if (!localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, raw);
      }
    }
    localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch {
    // no-op
  }
}

/** 現在の進行状況を localStorage に保存する。 */
export function save(): void {
  if (state.screen === 'menu') return;
  try {
    const data: SaveData = {
      screen: state.screen,
      difficulty: state.difficulty,
      maxHp: ser(state.maxHp),
      atk: ser(state.atk),
      atkTargetE: state.atkTargetE,
      damageE: state.damageE,
      itemsCollected: state.itemsCollected,
      itemAvailable: state.itemAvailable,
      itemPos: state.itemPos,
      clicksSinceItem: state.clicksSinceItem,
      elapsedTime: state.elapsedTime,
      totalClicks: state.totalClicks,
      maxHit: ser(state.maxHit),
      enemyEmoji: state.enemyEmoji,
    };
    localStorage.setItem(saveKeyFor(state.difficulty), JSON.stringify(data));
  } catch {
    // localStorage が使えない環境では黙って諦める
  }
}

/** 指定難易度の有効な進行中セーブが存在するか（読み込みはしない）。 */
export function hasSavedGameForDiff(diff: Difficulty): boolean {
  try {
    const raw = localStorage.getItem(saveKeyFor(diff));
    if (!raw) return false;
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (!d.difficulty || !difficultyConfigs[d.difficulty]) return false;
    return d.screen === 'playing' || d.screen === 'cleared';
  } catch {
    return false;
  }
}

/** 指定難易度のセーブを state へ読み込む。成功すれば true。 */
export function loadSaveForDiff(diff: Difficulty): boolean {
  try {
    const raw = localStorage.getItem(saveKeyFor(diff));
    if (!raw) return false;
    const d = JSON.parse(raw) as SaveData;
    if (d.screen !== 'playing' && d.screen !== 'cleared') return false;
    if (!d.difficulty || !difficultyConfigs[d.difficulty]) return false;
    if (d.difficulty !== diff) return false;
    state.screen = d.screen;
    state.difficulty = d.difficulty;
    state.maxHp = deser(d.maxHp);
    state.atk = deser(d.atk);
    state.atkTargetE = typeof d.atkTargetE === 'number' ? d.atkTargetE : state.atk.e;
    state.damageE = typeof d.damageE === 'number' ? d.damageE : 0;
    state.itemsCollected = d.itemsCollected ?? 0;
    state.itemAvailable = d.itemAvailable ?? false;
    state.itemPos = d.itemPos ?? { top: '50%', left: '50%' };
    state.clicksSinceItem = d.clicksSinceItem ?? 0;
    state.elapsedTime = d.elapsedTime ?? 0;
    state.totalClicks = d.totalClicks ?? 0;
    state.maxHit = d.maxHit ? deser(d.maxHit) : new BigNum(0, 0);
    if (d.enemyEmoji) state.enemyEmoji = d.enemyEmoji;
    return true;
  } catch {
    return false;
  }
}

/** 指定難易度のセーブを削除する。 */
export function clearSaveForDiff(diff: Difficulty): void {
  try {
    localStorage.removeItem(saveKeyFor(diff));
  } catch {
    // no-op
  }
}
