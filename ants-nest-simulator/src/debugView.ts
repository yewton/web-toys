import {
  WIDTH, HEIGHT, DEPTH,
  VOXEL_SIZE, GRID_WIDTH, GRID_HEIGHT,
} from './constants';
import { state } from './state';
import { getVoxel, getPheromone, voxelCentrePx, SOIL_PROTECTED, SOIL_DIGGABLE, AIR } from './grid';

let _gridImgData: ImageData | null = null;
let _gridCanvas: HTMLCanvasElement | null = null;
let _gridCtx: CanvasRenderingContext2D | null = null;
let _phCanvas: HTMLCanvasElement | null = null;
let _phCtx: CanvasRenderingContext2D | null = null;

function ensureGridCanvas(): void {
  if (_gridCanvas) return;
  _gridCanvas = document.createElement('canvas');
  _gridCanvas.width = WIDTH;
  _gridCanvas.height = HEIGHT;
  _gridCtx = _gridCanvas.getContext('2d')!;
}

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
// Excavation bitmask colours: index = bit2(back/z0) | bit1(mid/z1) | bit0(front/z2)
const DIG_COLORS: readonly [number, number, number][] = [
  [  0,   0,   0],  // 000 – all soil (handled by soil branch)
  [ 55, 190, 170],  // 001 – front only
  [ 45, 130, 210],  // 010 – mid only
  [ 55, 180, 200],  // 011 – front + mid
  [ 25,  55, 140],  // 100 – back only
  [ 45, 120, 175],  // 101 – back + front
  [ 35,  90, 180],  // 110 – back + mid
  [ 75, 205, 230],  // 111 – all layers
];

/** Grid cell colours with per-layer excavation bitmask, painted into a flat
 *  pixel buffer. There is no longer any special handling for "above ground"
 *  or "surface" — every voxel is one of {air, soil, protected} and the
 *  colour depends only on that classification per layer. */
function fillGridPixels(data: Uint8ClampedArray): void {
  const { grids } = state;

  for (let vy = 0; vy < GRID_HEIGHT; vy++) {
    for (let vx = 0; vx < GRID_WIDTH; vx++) {
      let r: number, g: number, b: number;
      const yCenter = voxelCentrePx(vy);

      const v0 = grids[0][vy][vx];
      const v1 = grids[1][vy][vx];
      const v2 = grids[2][vy][vx];
      const protectedHere = v0 === SOIL_PROTECTED && v1 === SOIL_PROTECTED && v2 === SOIL_PROTECTED;

      if (protectedHere) {
        r = 130; g = 25; b = 25;
      } else {
        const mask = (v0 === AIR ? 4 : 0)
                   | (v1 === AIR ? 2 : 0)
                   | (v2 === AIR ? 1 : 0);
        if (mask > 0) {
          [r, g, b] = DIG_COLORS[mask];
        } else {
          // At least one layer here is diggable or protected (mixed). Tint by
          // depth so the debug view still conveys a sense of vertical position.
          const d = yCenter / HEIGHT;
          r = (105 + d * 45) | 0;
          g = ( 62 + d * 28) | 0;
          b = ( 22 + d * 18) | 0;
        }
      }

      const px0 = vx * VOXEL_SIZE;
      const py0 = vy * VOXEL_SIZE;
      for (let py = py0; py < py0 + VOXEL_SIZE; py++) {
        let idx = (py * WIDTH + px0) * 4;
        for (let px = 0; px < VOXEL_SIZE; px++) {
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
          idx += 4;
        }
      }
    }
  }
}

/** Draw pheromone as filled circles into an offscreen canvas. Sampling step
 *  is in pixels so visual density stays constant across grid resolutions. */
function fillPheromoneCanvas(phCtx: CanvasRenderingContext2D): void {
  phCtx.clearRect(0, 0, WIDTH, HEIGHT);
  const BASE_R = 13;
  const STEP_PX = 4;

  for (let y = 0; y < HEIGHT; y += STEP_PX) {
    for (let x = 0; x < WIDTH; x += STEP_PX) {
      const vx = Math.floor(x / VOXEL_SIZE);
      const vy = Math.floor(y / VOXEL_SIZE);
      let maxPh = 0;
      for (let z = 0; z < DEPTH; z++) {
        const ph = getPheromone(vx, vy, z);
        if (ph > maxPh) maxPh = ph;
      }
      if (maxPh < 0.0005) continue;

      const t = Math.min(1, Math.sqrt(maxPh * 20));
      const r = (BASE_R * t + 3) | 0;
      const g = (210 - t * 60) | 0;
      phCtx.fillStyle = `rgba(255,${g},0,${(t * 0.9).toFixed(2)})`;
      phCtx.beginPath();
      phCtx.arc(x, y, r, 0, Math.PI * 2);
      phCtx.fill();
    }
  }
}

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
  const ARROW_LEN = 15;

  for (const ant of state.ants) {
    const ax = ant.drawX;
    const ay = ant.drawY;
    const angle = ant.angle;
    const carrying = ant.carrying;
    const z = ant.vz;
    const sc = carrying ? '#ff8c42' : '#50c878';

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
      // Move-target arrow when interpolating between voxels
      if (ant.isMoving) {
        const txp = voxelCentrePx(ant.tgtVx);
        const typ = voxelCentrePx(ant.tgtVy);
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = carrying ? 'rgba(255,180,100,0.55)' : 'rgba(130,220,160,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(txp, typ);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Sensor dots: 4 cardinals at the planar level
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const sx = voxelCentrePx(ant.vx + dx);
        const sy = voxelCentrePx(ant.vy + dy);
        const v = getVoxel(ant.vx + dx, ant.vy + dy, ant.vz);
        ctx.fillStyle = v === SOIL_DIGGABLE ? '#ff4466' : v === SOIL_PROTECTED ? '#ff0000' : '#44ff88';
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
  ['#ff8c42', 'Carrying voxel'],
  ['#e8c040', 'Pheromone'],
  ['#37beaa', 'Dig: F'],
  ['#2d82d2', 'Dig: M'],
  ['#19378c', 'Dig: B'],
  ['#37b4c8', 'Dig: F+M'],
  ['#2d78af', 'Dig: B+F'],
  ['#235ab4', 'Dig: B+M'],
  ['#4bcde6', 'Dig: all'],
  ['#7a5230', 'Soil'],
  ['#8c1e1e', 'Protected zone'],
  ['#6495ed', 'Ring: Z back'],
  ['#c8c8c8', 'Ring: Z mid'],
  ['#ffd700', 'Ring: Z front'],
];

const _L = { px: 5, py: 5, w: 112, headerH: 14, lh: 12 };
let _legendExpanded = true;

export function toggleLegend(): void { _legendExpanded = !_legendExpanded; }

export function hitTestLegend(cx: number, cy: number): boolean {
  const h = _legendExpanded ? _L.headerH + LEGEND.length * _L.lh + 4 : _L.headerH;
  return cx >= _L.px && cx <= _L.px + _L.w && cy >= _L.py && cy <= _L.py + h;
}

function drawLegend(ctx: CanvasRenderingContext2D): void {
  const { px, py, w, headerH, lh } = _L;
  const boxH = _legendExpanded ? headerH + LEGEND.length * lh + 4 : headerH;

  ctx.fillStyle = 'rgba(15,15,20,0.95)';
  ctx.fillRect(px, py, w, boxH);
  ctx.font = '8px monospace';
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText(`${_legendExpanded ? '▼' : '▶'} Legend`, px + 4, py + 10);

  if (!_legendExpanded) return;

  LEGEND.forEach(([color, label], i) => {
    const iy = py + headerH + 6 + i * lh;
    ctx.fillStyle = color;
    ctx.fillRect(px + 4, iy - 4, 7, 7);
    ctx.fillStyle = '#cccccc';
    ctx.fillText(label, px + 15, iy + 3);
  });
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export function drawDebugFrame(ctx: CanvasRenderingContext2D): void {
  ensureGridCanvas();
  if (!_gridImgData) _gridImgData = _gridCtx!.createImageData(WIDTH, HEIGHT);
  fillGridPixels(_gridImgData.data);
  _gridCtx!.putImageData(_gridImgData, 0, 0);
  ctx.drawImage(_gridCanvas!, 0, 0);
  drawAnts(ctx, true);
  drawPheromoneLayer(ctx);
  drawLegend(ctx);
}

export function drawDebugOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalAlpha = 0.8;
  drawAnts(ctx, false);
  ctx.restore();
  drawPheromoneLayer(ctx, true);
}
