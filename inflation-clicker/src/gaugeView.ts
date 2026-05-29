import { COLORS, GAUGE } from './config';
import { finalLayer, sliceGauge, type GaugeState } from './hpGauge';

// KH 風の傾き（水平シア。tanθ 相当）
const SKEW = -0.12;

type FillStyle = string | CanvasGradient;

function fillRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  style: FillStyle,
): void {
  ctx.fillStyle = style;
  ctx.fillRect(x, y, w, h);
}

function strokeRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  lineWidth: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x, y, w, h);
}

/** 原点 (x,y) に平行移動しつつ水平シアをかけて body を描く。 */
function drawSkewed(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  body: () => void,
): void {
  ctx.save();
  ctx.transform(1, 0, SKEW, 1, x, y);
  body();
  ctx.restore();
}

/**
 * ゲージ一式（前面バー＋残ゲージ箱）を描く。
 *
 * - 全コース共通：1 箱 = EXP_PER_BOX のダメージ。`consumed` (= damageE / EXP_PER_BOX) で進む。
 * - 最前面バーは緑、最終ゲージ（`slice.isFinal`）のときだけ多層めくり（緑→青→黄→黒）。
 * - 残ゲージ箱は KH 同様、右寄せの `displayedSegments-1` 個のうち左から削れていく。
 *   over-cap コース（5分・30分・極限）は前半「箱は静止、bar だけ削れる」フェーズが続き、
 *   `totalSegments - displayedSegments` を越えてから箱が左から消えていく。
 *
 * cssW/cssH は CSS ピクセル、dpr はデバイスピクセル比。
 */
export function drawGauge(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  dpr: number,
  g: GaugeState,
  consumed: number,
  now: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (cssW <= 0 || cssH <= 0) return;

  const slice = sliceGauge(consumed, g.totalSegments, g.displayedSegments);

  const padX = Math.ceil(Math.abs(SKEW) * cssH) + 8;
  const barX = padX;
  const barY = 2;
  const barW = cssW - padX * 2;
  const barH = Math.min(30, cssH * 0.5);

  // --- 体力バー本体 ---
  drawSkewed(ctx, barX, barY, () => {
    fillRect(ctx, 0, 0, barW, barH, COLORS.bg);

    if (slice.segmentsLeft > 0) {
      // バー本体と赤残像を共通の「front 層の右寄せ frontRemain」モデルで描く。
      //   frontRemain = 現在塗られている前面層が右端からどれだけ残っているか (0..1)
      //   - 通常ゲージ: barFill そのもの
      //   - 最終ゲージ: finalLayer().frontRemain （layer 内の残量）
      // 赤残像と前面の左端を同じ式 `barW × (1 − frontRemain)` から導くので、layer 跨ぎ
      // でも両者が常に隣接し、間に behind 層が露出しない。
      const dispBarFill = 1 - (g.displayedConsumed - Math.floor(Math.max(0, g.displayedConsumed)));
      const fl = slice.isFinal ? finalLayer(slice.barFill) : null;
      const flPast = slice.isFinal ? finalLayer(dispBarFill) : null;
      const currFrontRemain = fl ? fl.frontRemain : slice.barFill;
      const pastFrontRemain = flPast ? flPast.frontRemain : dispBarFill;

      // 1. 背面（final のみ）
      if (fl) {
        const behindColor = fl.layerIndex > 0 ? COLORS.final[fl.layerIndex - 1]! : COLORS.bg;
        fillRect(ctx, 0, 0, barW, barH, behindColor);
      }

      // 2. 赤残像：past frontRemain → 現 frontRemain の差を front の真左に置く。
      //    past が上位 layer のとき frontRemain=1.0 → tStart=0 から伸び、layer 跨ぎでも
      //    現 front の左端まで連続する。
      if (pastFrontRemain > currFrontRemain) {
        const tStart = barW * (1 - pastFrontRemain);
        const tEnd = barW * (1 - currFrontRemain);
        fillRect(ctx, tStart, 0, tEnd - tStart, barH, COLORS.trail);
      }

      // 3. 前面：最終 layer 色 or 通常の緑
      const frontColor = fl ? (COLORS.final[fl.layerIndex] ?? COLORS.base) : COLORS.base;
      const frontW = barW * currFrontRemain;
      fillRect(ctx, barW - frontW, 0, frontW, barH, frontColor);
    }

    fillRect(ctx, 0, 0, barW, barH * 0.4, 'rgba(255,255,255,0.18)');
    strokeRect(ctx, 0, 0, barW, barH, '#000', 3);
  });

  // --- 残ゲージ箱 ---
  // 箱は「現在削っているゲージを除いた残り本数」＝合計 displayedSegments-1 個ぶん。
  // 1分=1個 / 5分=9個 / 30分=59個 / 極限=59個。
  const boxCount = Math.max(0, g.displayedSegments - 1);
  if (boxCount === 0) return;

  const boxTop = barY + barH + 6;
  const boxH = Math.max(8, Math.min(12, cssH - boxTop - 2));
  const gap = 2;
  // 箱サイズは行全体（boxCount 個）がバー幅にちょうど収まるよう自動調整、
  // 小さすぎる場合は最低 3px、大きすぎる場合は 24px で頭打ち（1分の極端な巨大箱を防ぐ）。
  const boxW = Math.max(3, Math.min(24, (barW - gap * Math.max(0, boxCount - 1)) / boxCount));
  const slot = boxW + gap;
  const groupW = boxCount * boxW + Math.max(0, boxCount - 1) * gap;

  // コンベアモード（totalSegments > displayedSegments）の場合、右端の箱が canvas right から
  // 約 50% はみ出すよう、padX 分＋box 半分を offset とする。「まだ続く」を視覚化し、
  // 新しい箱はそのさらに右からスライドして現れる。
  const isConveyor = g.totalSegments > g.displayedSegments;
  const offcanvasOffset = isConveyor ? barX + boxW * 0.5 : 0;
  // KH スタイル：箱は右寄せ。コンベア時はさらに右へ押し出して画面右の境界を越えさせる。
  const groupX = barX + barW - groupW + offcanvasOffset;

  const FLASH = GAUGE.BOX_FLASH_MS;
  const SLIDE = GAUGE.BOX_SLIDE_MS;
  // 「削り切った箱」のしきい index（depletion モード時のみ意味を持つ）。
  const cleared = g.displayedSegments - slice.segmentsLeft;

  // コンベアアニメ進捗：box[0] の flashAt からの経過で 0→FLASH→FLASH+SLIDE
  let convPhase: 'idle' | 'flash' | 'slide' = 'idle';
  let slideProgress = 0;
  if (isConveyor) {
    const flashAt0 = g.boxFlashAt[0] ?? 0;
    if (flashAt0 > 0) {
      const dt = now - flashAt0;
      if (dt < FLASH) convPhase = 'flash';
      else if (dt < FLASH + SLIDE) {
        convPhase = 'slide';
        slideProgress = (dt - FLASH) / SLIDE;
      }
    }
  }

  for (let i = 0; i < boxCount; i++) {
    if (isConveyor) {
      // --- コンベアモード ---
      if (i === 0) {
        if (convPhase === 'flash') {
          drawBox(ctx, groupX, boxTop, boxW, boxH, COLORS.boxFlash, 1);
        } else if (convPhase === 'slide') {
          // 左へスライド退出＋フェード（実位置は slot 1個ぶん左、進捗で消える）
          drawBox(
            ctx,
            groupX - slideProgress * slot,
            boxTop,
            boxW,
            boxH,
            COLORS.boxDead,
            1 - slideProgress,
          );
        } else {
          drawBox(ctx, groupX, boxTop, boxW, boxH, COLORS.boxAlive, 1);
        }
      } else if (convPhase === 'slide') {
        // 他の箱は slide phase 中、左へ 1 slot 分シフトする
        drawBox(
          ctx,
          groupX + (i - slideProgress) * slot,
          boxTop,
          boxW,
          boxH,
          COLORS.boxAlive,
          1,
        );
      } else {
        drawBox(ctx, groupX + i * slot, boxTop, boxW, boxH, COLORS.boxAlive, 1);
      }
      continue;
    }

    // --- depletion モード（finite course）：旧来の per-index 動作 ---
    const flashedAt = g.boxFlashAt[i] ?? 0;
    const stillAlive = i >= cleared && flashedAt === 0;
    if (stillAlive) {
      drawBox(ctx, groupX + i * slot, boxTop, boxW, boxH, COLORS.boxAlive, 1);
      continue;
    }
    const dt = flashedAt > 0 ? now - flashedAt : Infinity;
    if (dt < FLASH) {
      drawBox(ctx, groupX + i * slot, boxTop, boxW, boxH, COLORS.boxFlash, 1);
    } else if (dt < FLASH + SLIDE) {
      const s = (dt - FLASH) / SLIDE;
      drawBox(ctx, groupX + (i - s) * slot, boxTop, boxW, boxH, COLORS.boxDead, 1 - s);
    }
  }

  // コンベア slide 中：右端から新しい箱がスライドインして来る
  if (isConveyor && convPhase === 'slide') {
    drawBox(
      ctx,
      groupX + (boxCount - slideProgress) * slot,
      boxTop,
      boxW,
      boxH,
      COLORS.boxAlive,
      1,
    );
  }
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0.02) return;
  drawSkewed(ctx, x, y, () => {
    ctx.globalAlpha = alpha;
    fillRect(ctx, 0, 0, w, h, color);
    strokeRect(ctx, 0, 0, w, h, '#000', 1.5);
    fillRect(ctx, 0, 0, w, h * 0.4, 'rgba(255,255,255,0.22)');
    ctx.globalAlpha = 1;
  });
}
