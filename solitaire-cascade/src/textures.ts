import { SUITS, VALUES, type Suit, type CardValue } from './types';

export type FaceKey = `${Suit}_${CardValue}`;

const faces = new Map<FaceKey, HTMLCanvasElement>();
let back: HTMLCanvasElement | null = null;

export function preRenderTextures(): void {
  SUITS.forEach(suit => {
    VALUES.forEach(value => {
      const c = document.createElement('canvas');
      c.width = 71; c.height = 96;
      const t = c.getContext('2d')!;
      t.fillStyle = '#ffffff';
      t.fillRect(0, 0, 71, 96);
      t.fillStyle = (suit === '♥' || suit === '♦') ? '#ff0000' : '#000000';
      t.font = 'bold 16px monospace';
      t.fillText(value, 4, 18);
      t.textAlign = 'center';
      t.font = '40px monospace';
      t.fillText(suit, 35.5, 63);
      t.strokeStyle = '#000000';
      t.lineWidth = 1;
      t.strokeRect(0.5, 0.5, 70, 95);
      faces.set(`${suit}_${value}` as FaceKey, c);
    });
  });

  const b = document.createElement('canvas');
  b.width = 71; b.height = 96;
  const bc = b.getContext('2d')!;
  bc.fillStyle = '#002266';
  bc.fillRect(0, 0, 71, 96);
  bc.strokeStyle = '#ffffff';
  bc.lineWidth = 2;
  bc.strokeRect(4, 4, 63, 88);
  bc.beginPath();
  bc.moveTo(4, 4); bc.lineTo(67, 92);
  bc.moveTo(67, 4); bc.lineTo(4, 92);
  bc.stroke();
  bc.strokeStyle = '#000000';
  bc.strokeRect(0.5, 0.5, 70, 95);
  back = b;
}

export function getFaceTexture(suit: Suit, value: CardValue): HTMLCanvasElement {
  return faces.get(`${suit}_${value}` as FaceKey)!;
}

export function getBackTexture(): HTMLCanvasElement {
  return back!;
}
