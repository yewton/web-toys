import { WIDTH, HEIGHT, DEPTH, GROUND_LEVEL } from './constants';
import { state } from './state';
import { getGridType } from './grid';

// Cached across frames to reduce GC pressure
let _gridImgData: ImageData | null = null;
let _phImgData: ImageData | null = null;
let _phCanvas: HTMLCanvasElement | null = null;
let _phCtx: CanvasRenderingContext2D | null = null;

function ensurePhCanvas(): void {
  if (_phCanvas) return;
  _phCanvas = document.createElement('canvas');
  _phCanvas.width = WIDTH;
  _phCanvas.height = HEIGHT;
  _phCtx = _phCanvas.getContext('2d')!;
}

// Z-layer ring colors, distinct from ant-state colors
const Z_RING = ['#6495ed', '#c8c8c8', '#ffd700'];

// ─── PIXEL FILL ───────────────────────────────────────────────────────────────

/** Grid cell colors only — no pheromone mixed in */
function fillGridPixels(data: Uint8ClampedArray): void {
  const { grids } = state;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 4;

      let maxType = 0;
      for (let z = 0; z < DEPTH; z++) {
        const cell = grids[z][y][x];
        if (cell > maxType) maxType = cell;
      }

      let r: number, g: number, b: number;
      if (maxType === 3) {
        r = 130; g = 25; b = 25;
      } else if (maxType === 1) {
        const d = y / HEIGHT;
        r = (105 + d * 45) | 0;
        g = (62 + d * 28) | 0;
        b = (22 + d * 18) | 0;
      } else {
        r = 10; g = 10; b = 24;
      }

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
}

/**
 * Pheromone source pixels for the offscreen canvas.
 * Uses near-full alpha so the CSS blur spreads a strong glow outward.
 */
function fillPheromoneOverlayPixels(data: Uint8ClampedArray): void {
  const { pheromone } = state;

  for (let i = 3; i < data.length; i += 4) data[i] = 0;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const phIdx = y * WIDTH + x;
      let maxPh = 0;
      for (let z = 0; z < DEPTH; z++) {
        const ph = pheromone[z][phIdx];
        if (ph > maxPh) maxPh = ph;
      }
      if (maxPh < 0.0005) continue;

      // High source alpha so blur spreads a visible cloud even for faint trails
      const t = Math.min(1, Math.sqrt(maxPh * 20));
      const idx = phIdx * 4;
      data[idx] = 255;
      data[idx + 1] = (210 - t * 60) | 0; // warm amber → yellow
      data[idx + 2] = 0;
      data[idx + 3] = (t * 255) | 0;
    }
  }
}

/**
 * Composite pheromone onto ctx using three blur passes (wide haze → mid glow → tight core)
 * plus a sin-based pulse and a slow lateral drift for a smoke-like appearance.
 */
function drawPheromoneLayer(ctx: CanvasRenderingContext2D): void {
  ensurePhCanvas();
  if (!_phImgData) _phImgData = _phCtx!.createImageData(WIDTH, HEIGHT);
  fillPheromoneOverlayPixels(_phImgData.data);
  _phCtx!.putImageData(_phImgData, 0, 0);

  const now = Date.now();
  const pulse = 0.72 + 0.28 * Math.sin(now / 550);  // ~1.8 Hz oscillation
  const drift = Math.sin(now / 1800) * 2;            // slow ±2 px lateral drift

  ctx.save();

  // Pass 1 — wide ambient haze
  ctx.globalAlpha = 0.32 * pulse;
  ctx.filter = 'blur(14px)';
  ctx.drawImage(_phCanvas!, drift, 0);

  // Pass 2 — mid glow
  ctx.globalAlpha = 0.52 * pulse;
  ctx.filter = 'blur(7px)';
  ctx.drawImage(_phCanvas!, 0, 0);

  // Pass 3 — tight luminous core
  ctx.globalAlpha = 0.75 * pulse;
  ctx.filter = 'blur(2px)';
  ctx.drawImage(_phCanvas!, 0, 0);

  ctx.restore();
}

// ─── ANT OVERLAYS ─────────────────────────────────────────────────────────────

function drawAnts(ctx: CanvasRenderingContext2D, fullDetail: boolean): void {
  const SENSOR_DIST = 6;
  const ARROW_LEN = 15;

  for (const ant of state.ants) {
    const { drawX: ax, drawY: ay, angle, wanderAngle, hasDirt, z } = ant;
    const sc = hasDirt ? '#ff8c42' : '#50c878';

    ctx.save();

    // Direction arrow
    const tx = ax + Math.cos(angle) * ARROW_LEN;
    const ty = ay + Math.sin(angle) * ARROW_LEN;
    ctx.strokeStyle = sc;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    ctx.fillStyle = sc;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - Math.cos(angle - 0.42) * 5, ty - Math.sin(angle - 0.42) * 5);
    ctx.lineTo(tx - Math.cos(angle + 0.42) * 5, ty - Math.sin(angle + 0.42) * 5);
    ctx.closePath();
    ctx.fill();

    if (fullDetail) {
      // Wander target direction (dashed) — long-term goal angle
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = hasDirt ? 'rgba(255,180,100,0.5)' : 'rgba(130,220,160,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + Math.cos(wanderAngle) * 11, ay + Math.sin(wanderAngle) * 11);
      ctx.stroke();
      ctx.setLineDash([]);

      // Sensor dots: front / left / right
      for (const da of [0, -Math.PI / 3, Math.PI / 3]) {
        const sa = angle + da;
        const sx = ax + Math.cos(sa) * SENSOR_DIST;
        const sy = ay + Math.sin(sa) * SENSOR_DIST;
        ctx.fillStyle = getGridType(sx, sy, z) > 0 ? '#ff4466' : '#44ff88';
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Body dot
    ctx.fillStyle = sc;
    ctx.beginPath();
    ctx.arc(ax, ay, fullDetail ? 3 : 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Z-layer ring
    ctx.strokeStyle = Z_RING[z];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ax, ay, fullDetail ? 5.5 : 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

// ─── LEGEND ───────────────────────────────────────────────────────────────────

const LEGEND: [string, string][] = [
  ['#50c878', 'Exploring'],
  ['#ff8c42', 'Carrying dirt'],
  ['#e8c040', 'Pheromone'],
  ['#7a5230', 'Soil'],
  ['#8c1e1e', 'Protected zone'],
  ['#6495ed', 'Ring: Z back'],
  ['#c8c8c8', 'Ring: Z mid'],
  ['#ffd700', 'Ring: Z front'],
];

function drawLegend(ctx: CanvasRenderingContext2D): void {
  const lh = 12, px = 5, py = 5;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(px, py, 112, LEGEND.length * lh + 8);
  ctx.font = '8px monospace';
  LEGEND.forEach(([color, label], i) => {
    const iy = py + 6 + i * lh;
    ctx.fillStyle = color;
    ctx.fillRect(px + 4, iy - 4, 7, 7);
    ctx.fillStyle = '#cccccc';
    ctx.fillText(label, px + 15, iy + 3);
  });
}

// ─── GROUND LINE ──────────────────────────────────────────────────────────────

function drawGroundLine(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(80,220,80,0.45)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, GROUND_LEVEL);
  ctx.lineTo(WIDTH, GROUND_LEVEL);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(80,220,80,0.75)';
  ctx.font = '8px monospace';
  ctx.fillText('── SURFACE ──', 118, GROUND_LEVEL - 2);
  ctx.restore();
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Full debug frame.
 * Draw order: grid → ground line → ants → pheromone → legend
 * Pheromone is rendered last so it is visible even where ants overlap.
 */
export function drawDebugFrame(ctx: CanvasRenderingContext2D): void {
  if (!_gridImgData) _gridImgData = ctx.createImageData(WIDTH, HEIGHT);
  fillGridPixels(_gridImgData.data);
  ctx.putImageData(_gridImgData, 0, 0);
  drawGroundLine(ctx);
  drawAnts(ctx, true);
  drawPheromoneLayer(ctx);   // ← after ants so pheromone is never hidden
  drawLegend(ctx);
}

/**
 * Overlay additions on top of normal rendering.
 * Draw order: ants → pheromone
 * Pheromone is rendered last so it is visible even where ants overlap.
 */
export function drawDebugOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalAlpha = 0.8;
  drawAnts(ctx, false);
  ctx.restore();
  drawPheromoneLayer(ctx);   // ← after ants so pheromone is never hidden
}
