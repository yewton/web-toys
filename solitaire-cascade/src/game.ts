import { SUITS, VALUES, type Suit, type CardValue, type AutoDeck } from './types';
import { config } from './config';
import { effectState, currentParticleType, getDynamicLimits } from './effectState';
import { getFaceTexture } from './textures';
import { Card } from './card';
import { Particle } from './particle';

let gameCanvas!: HTMLCanvasElement;
let blurCanvas!: HTMLCanvasElement;
let particleCanvas!: HTMLCanvasElement;
let ctx!: CanvasRenderingContext2D;
let bCtx!: CanvasRenderingContext2D;
let pCtx!: CanvasRenderingContext2D;
let instructionEl: HTMLElement | null = null;

let cards: Card[] = [];
let particles: Particle[] = [];
const cardPool: Card[] = [];
const particlePool: Particle[] = [];
let autoDecks: AutoDeck[] = [];
let currentAutoColOffset = 0;

let isPointerDown = false;
let pointerX = 0, pointerY = 0;
let lastSpawnX = -1000, lastSpawnY = -1000;

export let autoMode = false;
export function setAutoMode(v: boolean): void { autoMode = v; }

let isReflexMode = false;
let reflexFadeVal = 0;
export function setReflexMode(v: boolean): void { isReflexMode = v; }

export function initCanvases(): void {
  gameCanvas     = document.getElementById('gameCanvas')     as HTMLCanvasElement;
  blurCanvas     = document.getElementById('blurCanvas')     as HTMLCanvasElement;
  particleCanvas = document.getElementById('particleCanvas') as HTMLCanvasElement;
  ctx  = gameCanvas.getContext('2d', { alpha: false })!;
  bCtx = blurCanvas.getContext('2d')!;
  pCtx = particleCanvas.getContext('2d')!;
  instructionEl = document.getElementById('instructionText');
}

export function resize(): void {
  config.width  = window.innerWidth;
  config.height = window.innerHeight;
  gameCanvas.width = blurCanvas.width = particleCanvas.width  = config.width;
  gameCanvas.height = blurCanvas.height = particleCanvas.height = config.height;
  config.CARD_W = Math.min(71, Math.floor(config.width / 7.5));
  config.scale  = config.CARD_W / 71;
  config.CARD_H = Math.floor(96 * config.scale);
  clearScreen();
}

export function clearScreen(): void {
  const { width, height } = config;
  ctx.fillStyle = '#008000';
  ctx.fillRect(0, 0, width, height);
  bCtx.clearRect(0, 0, width, height);
  pCtx.clearRect(0, 0, width, height);

  autoDecks = SUITS.map(s => ({ suit: s, values: [...VALUES] as CardValue[] }));
  currentAutoColOffset = 0;
  cards.forEach(c => cardPool.push(c));
  particles.forEach(p => particlePool.push(p));
  cards = []; particles = [];
  for (let i = 0; i < 4; i++) drawDeckTop(i);
}

function drawDeckTop(offset: number): void {
  const { width, CARD_W, CARD_H } = config;
  const x = (width - CARD_W * 7) / 8 * (4 + offset) + CARD_W * (3 + offset);
  ctx.fillStyle = '#008000';
  ctx.fillRect(x, 20, CARD_W, CARD_H);
  const deck = autoDecks[offset];
  if (deck.values.length > 0) {
    ctx.drawImage(getFaceTexture(deck.suit, deck.values[deck.values.length - 1]), x, 20, CARD_W, CARD_H);
  } else {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 20, CARD_W, CARD_H);
  }
}

function spawnParticle(x: number, y: number, z: number, color: string, neon: boolean, depth: boolean): void {
  const p = particlePool.length > 0 ? particlePool.pop()! : new Particle();
  p.init(x, y, z, color, neon, depth, currentParticleType);
  particles.push(p);
}

export function spawnCard(x: number, y: number, s?: Suit, v?: CardValue): void {
  const c    = cardPool.length > 0 ? cardPool.pop()! : new Card();
  const suit = s ?? SUITS[Math.floor(Math.random() * 4)];
  const val  = v ?? VALUES[Math.floor(Math.random() * 13)];
  c.init(x, y, effectState, suit, val);
  cards.push(c);
  instructionEl?.classList.add('hidden');
}

export function startLoop(): void {
  requestAnimationFrame(loop);
}

function loop(): void {
  const targetReflexFade = isReflexMode ? 1.0 : 0.0;
  reflexFadeVal += (targetReflexFade - reflexFadeVal) * 0.15;
  const timeScale = 1.0 - 0.85 * reflexFadeVal;
  const { width, height, scale } = config;

  pCtx.clearRect(0, 0, width, height);

  if (reflexFadeVal > 0.05) {
    bCtx.globalCompositeOperation = 'destination-out';
    bCtx.fillStyle = `rgba(0, 0, 0, ${0.15 + (1.0 - reflexFadeVal) * 0.2})`;
    bCtx.fillRect(0, 0, width, height);
    bCtx.globalCompositeOperation = 'source-over';
  } else {
    bCtx.clearRect(0, 0, width, height);
  }

  const lim = getDynamicLimits();
  if (cards.length > lim.cards) {
    cards.slice(0, cards.length - lim.cards).forEach(c => { c.active = false; });
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].active) {
      particles[i].update(timeScale);
      particles[i].draw(pCtx);
    } else {
      particlePool.push(particles[i]);
      particles.splice(i, 1);
    }
  }

  if (effectState.depth) cards.sort((a, b) => b.z - a.z);

  for (let i = cards.length - 1; i >= 0; i--) {
    if (cards[i].active) {
      cards[i].update(timeScale, particles.length, lim.particles, spawnParticle);
      if (cards[i].shouldDrawTrail) cards[i].draw(ctx);
      if (reflexFadeVal > 0.05) cards[i].draw(bCtx);
      cards[i].draw(pCtx);
    } else {
      cardPool.push(cards[i]);
      cards.splice(i, 1);
    }
  }

  if (isPointerDown && effectState.continuousDrag && cards.length < lim.cards) {
    const dx = pointerX - lastSpawnX;
    const dy = pointerY - lastSpawnY;
    let lf = 1.0;
    if (effectState.neon)  lf += 1;
    if (effectState.depth) lf += 2;
    if (dx * dx + dy * dy > Math.pow(25 * scale * lf, 2)) {
      spawnCard(pointerX, pointerY);
      lastSpawnX = pointerX; lastSpawnY = pointerY;
    }
  }

  if (autoMode && !cards.some(c => c.active && !c.evicting)) {
    if (autoDecks.every(d => d.values.length === 0)) { clearScreen(); }
    let idx = currentAutoColOffset;
    while (autoDecks[idx].values.length === 0) idx = (idx + 1) % 4;
    const d = autoDecks[idx];
    const v = d.values.pop()!;
    drawDeckTop(idx);
    const { CARD_W, CARD_H } = config;
    const x = (config.width - CARD_W * 7) / 8 * (4 + idx) + CARD_W * (3 + idx);
    spawnCard(x + CARD_W / 2, 20 + CARD_H / 2, d.suit, v);
    currentAutoColOffset = (idx + 1) % 4;
  }

  requestAnimationFrame(loop);
}

export function setupInputHandlers(): void {
  const btnReflex = document.getElementById('btnReflex')!;
  type PointerEvent = MouseEvent | TouchEvent;
  const getP = (e: PointerEvent) => ('touches' in e ? e.touches[0] : e);

  const down = (e: PointerEvent): void => {
    const target = e.target as Element;
    if (target === btnReflex || target.closest('#btnReflex')) return;
    isPointerDown = true;
    const p = getP(e);
    pointerX = p.clientX; pointerY = p.clientY;
    spawnCard(pointerX, pointerY);
    lastSpawnX = pointerX; lastSpawnY = pointerY;
    if ('touches' in e) e.preventDefault();
  };

  const move = (e: PointerEvent): void => {
    if (isPointerDown) {
      const p = getP(e);
      pointerX = p.clientX; pointerY = p.clientY;
    }
    if ('touches' in e) e.preventDefault();
  };

  gameCanvas.addEventListener('mousedown',  down as EventListener);
  gameCanvas.addEventListener('mousemove',  move as EventListener);
  window.addEventListener('mouseup',        () => { isPointerDown = false; });
  gameCanvas.addEventListener('touchstart', down as EventListener, { passive: false });
  gameCanvas.addEventListener('touchmove',  move as EventListener, { passive: false });
}
