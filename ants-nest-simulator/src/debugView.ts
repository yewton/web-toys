import { WIDTH, HEIGHT, DEPTH, GROUND_LEVEL, PROTECTED_DEPTH } from './constants';
import { state } from './state';
import { getGridType, getPheromone } from './grid';

// Cached across frames to reduce GC pressure
let _gridImgData: ImageData | null = null;
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
      let minType = 3;
      for (let z = 0; z < DEPTH; z++) {
        const cell = grids[z][y][x];
        if (cell > maxType) maxType = cell;
        if (cell < minType) minType = cell;
      }

      let r: number, g: number, b: number;
      if (maxType === 3) {
        r = 130; g = 25; b = 25;
      } else if (y >= GROUND_LEVEL && y < GROUND_LEVEL + PROTECTED_DEPTH) {
        // Protected zone opened as entrance (type 3 → 0/1)
        r = 60; g = 190; b = 80;
      } else if (y >= GROUND_LEVEL && minType === 0) {
        // At least one Z-layer excavated — slate-blue void
        r = 35; g = 100; b = 150;
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
 * Draw pheromone as filled circles (~2× the ant Z-ring radius) into the offscreen
 * canvas. Sampling every STEP pixels keeps the loop fast while preserving coverage.
 */
function fillPheromoneCanvas(phCtx: CanvasRenderingContext2D): void {
  phCtx.clearRect(0, 0, WIDTH, HEIGHT);
  const { pheromone } = state;
  const STEP = 4;
  // Base radius ≈ 2× ant Z-ring (5.5 px) → 11–14 px
  const BASE_R = 13;

  for (let y = 0; y < HEIGHT; y += STEP) {
    for (let x = 0; x < WIDTH; x += STEP) {
      const phIdx = y * WIDTH + x;
      let maxPh = 0;
      for (let z = 0; z < DEPTH; z++) {
        const ph = pheromone[z][phIdx];
        if (ph > maxPh) maxPh = ph;
      }
      if (maxPh < 0.0005) continue;

      const t = Math.min(1, Math.sqrt(maxPh * 20));
      const r = (BASE_R * t + 3) | 0; // min visible radius of 3 px even for faint trails
      const g = (210 - t * 60) | 0;   // warm amber → yellow
      phCtx.fillStyle = `rgba(255,${g},0,${(t * 0.9).toFixed(2)})`;
      phCtx.beginPath();
      phCtx.arc(x, y, r, 0, Math.PI * 2);
      phCtx.fill();
    }
  }
}

/**
 * Composite pheromone onto ctx: single pass, no blur.
 * overlay=true uses additive blending so circles pop through soil colours.
 */
function drawPheromoneLayer(ctx: CanvasRenderingContext2D, overlay = false): void {
  ensurePhCanvas();
  fillPheromoneCanvas(_phCtx!);
  ctx.save();
  if (overlay) ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = overlay ? 0.85 : 0.72;
  ctx.drawImage(_phCanvas!, 0, 0);
  ctx.restore();
}

// ─── ANT OVERLAYS ─────────────────────────────────────────────────────────────

function drawAnts(ctx: CanvasRenderingContext2D, fullDetail: boolean): void {
  const SENSOR_DIST = 6;
  const ARROW_LEN = 15;
  const PH_SENSOR_DIST = 8;

  for (const ant of state.ants) {
    const { drawX: ax, drawY: ay, angle, wanderAngle, hasDirt, z } = ant;
    const sc = hasDirt ? '#ff8c42' : '#50c878';

    ctx.save();

    // Pheromone influence arrow — underground ants only
    if (ay >= GROUND_LEVEL) {
      const la = angle - Math.PI / 3;
      const ra = angle + Math.PI / 3;
      const leftPh = getPheromone(ax + Math.cos(la) * PH_SENSOR_DIST, ay + Math.sin(la) * PH_SENSOR_DIST, z);
      const rightPh = getPheromone(ax + Math.cos(ra) * PH_SENSOR_DIST, ay + Math.sin(ra) * PH_SENSOR_DIST, z);
      const totalPh = leftPh + rightPh;
      if (totalPh > 0.001) {
        // Weighted net direction of the pheromone field
        const nx = (Math.cos(la) * leftPh + Math.cos(ra) * rightPh) / totalPh;
        const ny = (Math.sin(la) * leftPh + Math.sin(ra) * rightPh) / totalPh;
        // Dirt carriers attracted (+1), explorers repelled (-1)
        const sign = hasDirt ? 1 : -1;
        const strength = Math.min(1, totalPh * 40);
        const len = strength * 14 + 4;
        const ex = ax + sign * nx * len;
        const ey = ay + sign * ny * len;
        const ha = Math.atan2(ey - ay, ex - ax);
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = 'rgba(255,210,0,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,210,0,0.9)';
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(ha - 0.4) * 4, ey - Math.sin(ha - 0.4) * 4);
        ctx.lineTo(ex - Math.cos(ha + 0.4) * 4, ey - Math.sin(ha + 0.4) * 4);
        ctx.closePath();
        ctx.fill();
      }
    }

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
  ['#ffd200', 'Ph pull → (dashed)'],
  ['#236496', 'Tunnel (excavated)'],
  ['#7a5230', 'Soil'],
  ['#8c1e1e', 'Protected zone'],
  ['#3cbe50', 'Entrance'],
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

// ─── ENTRANCE INDICATORS ──────────────────────────────────────────────────────

function drawEntranceIndicators(ctx: CanvasRenderingContext2D): void {
  const { grids } = state;

  // Mark entrance columns: protected-zone row that is not type 3
  const entrance = new Uint8Array(WIDTH);
  for (let x = 0; x < WIDTH; x++) {
    for (let z = 0; z < DEPTH; z++) {
      if (grids[z][GROUND_LEVEL][x] !== 3) { entrance[x] = 1; break; }
    }
  }

  ctx.save();
  ctx.fillStyle = '#3cbe50';
  ctx.strokeStyle = '#3cbe50';
  ctx.lineWidth = 1.5;

  // Scan for clusters, draw one arrow per cluster at its center
  let i = 0;
  while (i < WIDTH) {
    if (!entrance[i]) { i++; continue; }
    let j = i;
    while (j < WIDTH && entrance[j]) j++;
    const cx = (i + j - 1) / 2;
    // Stem
    ctx.beginPath();
    ctx.moveTo(cx, GROUND_LEVEL - 13);
    ctx.lineTo(cx, GROUND_LEVEL - 6);
    ctx.stroke();
    // Arrowhead triangle
    ctx.beginPath();
    ctx.moveTo(cx - 4, GROUND_LEVEL - 8);
    ctx.lineTo(cx + 4, GROUND_LEVEL - 8);
    ctx.lineTo(cx, GROUND_LEVEL - 1);
    ctx.closePath();
    ctx.fill();
    i = j;
  }

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
  drawEntranceIndicators(ctx);
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
  drawPheromoneLayer(ctx, true);   // overlay=true: additive blend, punches through soil
}
