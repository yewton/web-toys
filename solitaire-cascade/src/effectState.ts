import type { EffectState, EffectConfigItem, ParticleConfigItem, ParticleType } from './types';

export const effectState: EffectState = {
  spin: false,
  giant: false,
  zSpin: false,
  depth: false,
  neon: false,
  chaos: false,
  particles: false,
  continuousDrag: true,
};

export const effectConfig: EffectConfigItem[] = [
  { id: 'continuousDrag', icon: 'draw',            label: 'Continuous' },
  { id: 'spin',          icon: 'rotate_right',     label: 'Spin'       },
  { id: 'giant',         icon: 'fullscreen',       label: 'Giant'      },
  { id: 'zSpin',         icon: '3d_rotation',      label: 'Flip'       },
  { id: 'depth',         icon: 'layers',           label: 'Depth'      },
  { id: 'neon',          icon: 'flare',            label: 'Neon'       },
  { id: 'chaos',         icon: 'storm',            label: 'Chaos'      },
  { id: 'particles',     icon: 'auto_awesome',     label: 'Particles'  },
];

export const particleConfig: ParticleConfigItem[] = [
  { id: 'normal', icon: 'bubble_chart',        label: 'Bubble' },
  { id: 'fire',   icon: 'local_fire_department', label: 'Fire'   },
  { id: 'water',  icon: 'water_drop',          label: 'Water'  },
  { id: 'snow',   icon: 'ac_unit',             label: 'Snow'   },
  { id: 'star',   icon: 'star',                label: 'Star'   },
];

export let currentParticleType: ParticleType = 'normal';
export function setCurrentParticleType(t: ParticleType): void {
  currentParticleType = t;
}

export function getDynamicLimits(): { cards: number; particles: number } {
  let maxC = 300;
  let maxP = 1000;
  if (effectState.neon)  { maxC -= 120; maxP -= 400; }
  if (effectState.depth) { maxC -= 150; }
  return { cards: Math.max(40, maxC), particles: Math.max(100, maxP) };
}
