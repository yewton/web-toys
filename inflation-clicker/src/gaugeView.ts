import { COLORS, DISPLAY_CAP_BOXES, GAUGE } from './config';
import { finalLayer, sliceGauge, type GaugeState } from './hpGauge';

// KH 風の傾き（水平シア。tanθ 相当）
const SKEW = -0.12;

// 箱サイズの基準本数 ＝ `DISPLAY_CAP_BOXES - 1` ＝ 摩婆羅コースの箱数（31）。
// どのコースでもこの本数を基準に boxW を算出することで、箱の見た目サイズを統一する。
// 短いコース（無量大数=6 箱）は右寄せで余白、cap に到達するコースは箱数も同じになるので
// バー幅にちょうど収まる。
const REF_BOX_COUNT_FOR_SIZING = Math.max(1, DISPLAY_CAP_BOXES - 1);

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
 * - 全コース共通：1 箱 = `expPerBoxAt(e)` のダメージ（動的密度）。`consumed` (= `consumedFromDamageE(damageE)`) で進む。
 * - 最前面バーは緑、最終ゲージ（`slice.isFinal`）のときだけ多層めくり（緑→青→黄→黒）。
 * - 残ゲージ箱は KH 同様、右寄せの `displayedSegments-1` 個のうち左から削れていく。
 *   over-cap コース（不可説不可説転・グラハム数）は前半「箱は静止、bar だけ削れる」フェーズが続き、
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
  // 無量大数=6 / 摩婆羅=31 / 界分以上=31（cap = DISPLAY_CAP_BOXES − 1 に頭打ち）。
  const boxCount = Math.max(0, g.displayedSegments - 1);
  if (boxCount === 0) return;

  const boxTop = barY + barH + 6;
  const boxH = Math.max(8, Math.min(12, cssH - boxTop - 2));
  const gap = 2;
  // 箱サイズは摩婆羅コースの本数を基準に固定。実 boxCount に依存しないので、
  // 無量大数は右寄せでコンパクトに、界分以上はバー左端から溢れて切れる、という見た目になる。
  const boxW = Math.max(
    3,
    Math.min(
      24,
      (barW - gap * Math.max(0, REF_BOX_COUNT_FOR_SIZING - 1)) / REF_BOX_COUNT_FOR_SIZING,
    ),
  );
  const slot = boxW + gap;
  const groupW = boxCount * boxW + Math.max(0, boxCount - 1) * gap;

  // 「コース自体が cap を超えるか」（レイアウト用）と「現在コンベアフェーズ中か」
  // （描画ロジック用）を分離する。前者は界分・不可説・グラハム数で常に true。
  // 後者は consumed が flashStart に届いた時点で false に切り替わり、depletion 描画に移行する。
  const consumedInt = Math.min(g.totalSegments, Math.floor(Math.max(0, consumed)));
  const flashStart = Math.max(0, g.totalSegments - g.displayedSegments);
  const isOverCap = g.totalSegments > g.displayedSegments;
  const inConveyorPhase = isOverCap && consumedInt < flashStart;

  // コンベアフェーズ中だけ右端の箱を canvas right から 50% 押し出し「まだ続く」を表現。
  // depletion へ移行した瞬間に offset を 0 に戻すと、その後の左端からの削れ演出が
  // すべて画面内に収まる（界分の終盤・摩婆羅以下と同じ見え方）。
  const offcanvasOffset = inConveyorPhase ? barX + boxW * 0.5 : 0;
  const groupX = barX + barW - groupW + offcanvasOffset;

  const FLASH = GAUGE.BOX_FLASH_MS;
  const SLIDE = GAUGE.BOX_SLIDE_MS;
  // 「削り切った箱」のしきい index（depletion モード時のみ意味を持つ）。
  const cleared = g.displayedSegments - slice.segmentsLeft;

  // コンベアアニメ進捗：box[0] の flashAt からの経過で 0→FLASH→FLASH+SLIDE
  let convPhase: 'idle' | 'flash' | 'slide' = 'idle';
  let slideProgress = 0;
  if (inConveyorPhase) {
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
    if (inConveyorPhase) {
      // --- コンベアフェーズ：左端 box[0] が点滅→消失、その他は slide 中に左へ 1 slot シフト ---
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

    // --- depletion フェーズ（finite course、または over-cap コースが flashStart を越えた後） ---
    // 左の index から順に flash → slide で退場。over-cap でも groupX は 0 offset なので、
    // 左端の box[0] が canvas 内に収まり、赤フラッシュ→スライドが画面内で見える。
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
  if (inConveyorPhase && convPhase === 'slide') {
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
