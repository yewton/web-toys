export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export type Suit = typeof SUITS[number];
export type CardValue = typeof VALUES[number];
export type ParticleType = 'normal' | 'fire' | 'water' | 'snow' | 'star';

export interface EffectState {
  spin: boolean;
  giant: boolean;
  zSpin: boolean;
  depth: boolean;
  neon: boolean;
  chaos: boolean;
  particles: boolean;
  continuousDrag: boolean;
}

export interface EffectConfigItem {
  id: keyof EffectState;
  icon: string;
  label: string;
}

export interface ParticleConfigItem {
  id: ParticleType;
  icon: string;
  label: string;
}

export interface AutoDeck {
  suit: Suit;
  values: CardValue[];
}
