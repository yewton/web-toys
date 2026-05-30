import { GAUGE } from './config';

/**
 * KH 風・分割体力ゲージのモデル（純粋ロジックのみ。描画は gaugeView.ts）。
 *
 * 体力は「1 箱 = `expPerBoxAt(e)` のダメージ」として量子化される（density は動的。config.ts 参照）。
 * - `totalSegments`: HP 由来の真の総 segments 数。無量大数≒7 / 摩婆羅≒32 / 界分≒53 / 不可説不可説転≒827。
 * - `displayedSegments`: 画面に並べる本数（cap = DISPLAY_CAP_BOXES = 32 ＝ 摩婆羅の totalSegments）。
 * - `consumed`: ここまでに削った segments 数（連続値、`consumedFromDamageE(damageE)`）。
 *
 * 1 クリックで増える `consumed` は per-click 削り量が動的密度で打ち消されるため、コースに
 * 依存せず常に ≒ 1 / (CLICK_BUDGET × ITEMS_PER_BOX) ≒ 1.1% に保たれる。
 *  - 無量大数・摩婆羅: totalSegments ≤ displayedSegments（=cap）なので、開始から箱が
 *    左から削れていく（depletion）。
 *  - 界分以上: totalSegments が cap を超え、`consumed < totalSegments − cap` の間は箱の本数が
 *    cap に張り付いたまま `box[0]` がコンベアサイクル（点滅→消失→復活）で常時アニメする。
 *    Phase B では log スケールなので、巨大 HP でも有限時間でしきい値に到達して最終的に depletion
 *    入りする（界分は約 40% 経過で depletion へ）。
 */
export interface GaugeSlice {
  /** 表示上の残り箱数（最前面 bar 1 個＋ row の alive 箱を含む）。`displayedSegments` で頭打ち。 */
  segmentsLeft: number;
  /** 最前面 bar の充填率 0..1（= 1 − consumed の小数部）。 */
  barFill: number;
  /** 最終 1 本（多層 climax）か。`segmentsLeft === 1` のとき真。 */
  isFinal: boolean;
}

/**
 * `consumed` と総量から表示用 slice を算出する。
 * - `barFill` は consumed の小数部だけで決まる＝コース不問で 1 クリックの bar 変化量が同一。
 * - `segmentsLeft` は `min(displayedSegments, totalSegments − floor(consumed))` で cap される。
 */
export function sliceGauge(
  consumed: number,
  totalSegments: number,
  displayedSegments: number,
): GaugeSlice {
  const safe = Math.max(0, consumed);
  if (safe >= totalSegments) return { segmentsLeft: 0, barFill: 0, isFinal: false };
  if (totalSegments <= 0 || displayedSegments <= 0) {
    return { segmentsLeft: 0, barFill: 0, isFinal: false };
  }
  const consumedInt = Math.floor(safe);
  const frac = safe - consumedInt;
  // bar fill: frac=0 のとき満タン（新しい segment に入った直後）、frac→1 で空に近づく。
  const barFill = frac > 0 ? 1 - frac : 1;
  // 残り segments（部分的に削り中の現セグメントを 1 本として含む）
  const remainingReal = totalSegments - consumedInt;
  const segmentsLeft = Math.max(0, Math.min(displayedSegments, remainingReal));
  return { segmentsLeft, barFill, isFinal: segmentsLeft === 1 };
}

export interface FinalLayer {
  /** 0=黄(最深) / 1=青 / 2=緑(最前面) */
  layerIndex: number;
  /** 現在めくっている層の残量 0..1 */
  frontRemain: number;
}

/**
 * 最後の 1 本を 3 層（緑→青→黄）に分解する。
 * 前面の層を削り切ると 1 つ深い層が前面に出る、というめくり表現用。
 */
export function finalLayer(barFill: number): FinalLayer {
  const p = Math.max(0, Math.min(1, barFill));
  if (p <= 0) return { layerIndex: 0, frontRemain: 0 };
  const layerIndex = Math.min(2, Math.floor(p * 3));
  const frontRemain = Math.min(1, p * 3 - layerIndex);
  return { layerIndex, frontRemain };
}

/** ゲージのアニメーション用ミュータブル状態（全コース共通の構造）。 */
export interface GaugeState {
  /** 画面に並べる本数（cap 後）。 */
  displayedSegments: number;
  /** 真の総 segments 数。over-cap 検知 & box flash 開始タイミング判定に使う。 */
  totalSegments: number;
  /** 赤残像用にラグして追従する consumed（常に実 consumed 以下） */
  displayedConsumed: number;
  /** 最後に攻撃した時刻（ms） */
  lastAttackTime: number;
  /** 各箱が削り切られた時刻（0 = まだ削れていない）。赤→黒→左へスライド退場アニメに使う */
  boxFlashAt: number[];
  /** 前フレームまでに削り切った整数 segments 数（depletion フェーズの flash 判定用） */
  prevConsumedInt: number;
}

export function createGaugeState(displayedSegments: number, totalSegments: number): GaugeState {
  return {
    displayedSegments,
    totalSegments,
    displayedConsumed: 0,
    lastAttackTime: 0,
    boxFlashAt: new Array(displayedSegments).fill(0),
    prevConsumedInt: 0,
  };
}

export function notifyAttack(g: GaugeState, now: number): void {
  g.lastAttackTime = now;
}

/**
 * 毎フレーム呼ぶ更新処理。
 *  1. 赤残像 (displayedConsumed) を「攻撃後 HOLD_MS は維持 → その後追従して進む」させる。
 *     consumed が整数境界を越えたとき（= 1 箱削り切ったとき）はその境界に即スナップして
 *     新しい segment に乗り換える＝トレイルは「現在の bar 内のラグ」だけを表現する。
 *  2. depletion フェーズに入った後（remainingReal ≤ displayedSegments）、各整数境界を越えた
 *     ところで該当する表示 index の箱に赤フラッシュのタイムスタンプを打つ。over-cap 期間中は
 *     `remainingReal − displayedSegments` の整数を消費しても flash しない（箱は静止）。
 */
export function advanceGauge(g: GaugeState, consumed: number, now: number): void {
  const safe = Math.max(0, consumed);

  // トレイル：現在の segment 境界より古い displayedConsumed は即スナップで最新へ追従
  const consumedFloor = Math.floor(Math.min(safe, g.totalSegments));
  if (g.displayedConsumed < consumedFloor) {
    g.displayedConsumed = consumedFloor;
  } else if (g.displayedConsumed > safe) {
    // HP 回復（新規ゲーム / ロード直後）は即追従
    g.displayedConsumed = safe;
  } else if (now - g.lastAttackTime > GAUGE.TRAIL_HOLD_MS && g.displayedConsumed < safe) {
    const diff = safe - g.displayedConsumed;
    const inc = Math.max(0.002, diff * GAUGE.TRAIL_DECAY_RATE);
    g.displayedConsumed = Math.min(safe, g.displayedConsumed + inc);
  }

  // 箱フラッシュ：
  //  - コンベアフェーズ（残り real > displayedSegments）: 1 セグメント消費毎に左端 box[0] を
  //    flash させ、FLASH+SLIDE 後にリセットして繰り返す。残箱の本数は cap に張り付いたまま
  //    だが、左端で「点滅→消える→復活」のサイクルが続く＝コース進行が常に視覚化される。
  //  - depletion フェーズ（残り real ≤ displayedSegments）: index oldCleared..newCleared
  //    を順に flash（左から順に削れて行く）。
  const consumedInt = Math.min(consumedFloor, g.totalSegments);
  const flashStart = Math.max(0, g.totalSegments - g.displayedSegments);
  // コンベア中、box[0] のアニメ完了後はリセットして次の点滅サイクルに備える
  if (
    consumedInt < flashStart &&
    g.boxFlashAt[0] > 0 &&
    now - g.boxFlashAt[0] >= GAUGE.BOX_FLASH_MS + GAUGE.BOX_SLIDE_MS
  ) {
    g.boxFlashAt[0] = 0;
  }
  if (consumedInt > g.prevConsumedInt) {
    for (let absIdx = g.prevConsumedInt; absIdx < consumedInt; absIdx++) {
      if (absIdx < flashStart) {
        // コンベアサイクル：box[0] を flash（既にアニメ中なら次サイクルへ譲る）
        if (g.boxFlashAt[0] === 0) g.boxFlashAt[0] = now;
      } else {
        // depletion：実 segment index を表示 index にマップ
        const dispIdx = absIdx - flashStart;
        if (dispIdx >= 0 && dispIdx < g.boxFlashAt.length) g.boxFlashAt[dispIdx] = now;
      }
    }
  }
  g.prevConsumedInt = consumedInt;
}

export type BoxStatus = 'alive' | 'flash' | 'dead';

/**
 * 表示 index の箱の状態を返す。alive=緑 / flash=赤 / dead=黒。
 * 表示 index 0 が一番左（最初に flash する）、displayedSegments-2 が一番右の row 箱。
 */
export function boxStatus(
  g: GaugeState,
  index: number,
  segmentsLeft: number,
  now: number,
): BoxStatus {
  const cleared = g.displayedSegments - segmentsLeft;
  if (index >= cleared) return 'alive';
  const flashedAt = g.boxFlashAt[index] ?? 0;
  if (flashedAt > 0 && now - flashedAt < GAUGE.BOX_FLASH_MS) return 'flash';
  return 'dead';
}
