import { BigNum } from './bignum';
import { ATTACK, chunkAtE, type DifficultyConfig } from './config';
import { type GameState } from './state';

/**
 * log10(10^a + 10^b)。累積ダメージ damageE への加算に使う。
 * a, b の差が大きいときに 10^大 を保ったまま小さい方を吸収する＝オーバーフローしない。
 */
export function logAdd(a: number, b: number): number {
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  const max = a >= b ? a : b;
  const min = a >= b ? b : a;
  return max + Math.log10(1 + Math.pow(10, min - max));
}

export interface AttackResult {
  /** この攻撃で表示すべき 1 発のダメージ（m × 10^atk.e）。 */
  dmg: BigNum;
  /** このクリックで新しいアイテムを出すべきか（位置決め・表示は呼び出し側の責務）。 */
  spawnItem: boolean;
  /** 撃破したか（累積ダメージ damageE が hp.e に到達）。 */
  defeated: boolean;
}

/**
 * 1 クリック分のゲームプレイ状態遷移（DOM・乱数・演出から切り離した純粋ロジック）。
 * `m`（1〜10 のダメージ係数）は呼び出し側が乱数で供給する＝テストでは決め打ちできる。
 * `state` のゲームプレイ数値だけを更新し、副作用が必要な箇所はフラグで返す。
 */
export function stepAttack(state: GameState, cfg: DifficultyConfig, m: number): AttackResult {
  // アイテム取得後の徐々ランプ：atk.e を atkTargetE へ「chunkAtE / CLICK_BUDGET_PER_ITEM」歩で
  // 近づける。step を「現在の atk.e」で評価することで stepItem 側の chunk と歩幅が一致し、
  // ちょうど CLICK_BUDGET_PER_ITEM クリックで追いつく。
  if (state.atk.e < state.atkTargetE) {
    const step = chunkAtE(state.atk.e) / ATTACK.CLICK_BUDGET_PER_ITEM;
    state.atk = new BigNum(1, Math.min(state.atkTargetE, state.atk.e + step));
  }

  // 1 クリックのダメージ：m × 10^atk.e。累積ダメージは log10 で加算する（HP も指数表現）。
  const dmgExp = state.atk.e + Math.log10(m);
  state.damageE = logAdd(state.damageE, dmgExp);

  const dmg = new BigNum(m, state.atk.e);
  if (dmg.cmp(state.maxHit) > 0) state.maxHit = dmg;
  state.totalClicks++;

  // アイテム供給：取得から CLICK_BUDGET_PER_ITEM クリック貯まったら 1 つ出す（totalItems 上限まで）。
  state.clicksSinceItem++;
  let spawnItem = false;
  if (
    !state.itemAvailable &&
    state.itemsCollected < cfg.totalItems &&
    state.clicksSinceItem >= ATTACK.CLICK_BUDGET_PER_ITEM
  ) {
    state.itemAvailable = true;
    spawnItem = true;
  }

  return { dmg, spawnItem, defeated: state.damageE >= cfg.hp.e };
}

/**
 * アイテム取得 1 回分のゲームプレイ状態遷移（DOM・演出から切り離した純粋ロジック）。
 * 攻撃力の「目標」指数を 1 アイテム分（= chunkAtE(atkTargetE)）押し上げる。実際の atk.e は
 * 次の `stepAttack` 群でランプ追従するので、取得直後にゲージが急に削れず滑らかに削れていく。
 */
export function stepItem(state: GameState, cfg: DifficultyConfig): void {
  state.itemsCollected += 1;
  state.itemAvailable = false;

  const chunk = chunkAtE(state.atkTargetE);
  state.atkTargetE = Math.min(cfg.hp.e, state.atkTargetE + chunk);

  // N-1 個目を取得した直後は clicksSinceItem を BUDGET に揃えることで、次の stepAttack で
  // スポーン条件が即座に成立し最終アイテムを必ず提示できる。通常はリセット (0)。
  state.clicksSinceItem =
    state.itemsCollected === cfg.totalItems - 1 ? ATTACK.CLICK_BUDGET_PER_ITEM : 0;
}
