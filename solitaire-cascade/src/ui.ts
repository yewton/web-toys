import { effectState, effectConfig, particleConfig, setCurrentParticleType } from './effectState';
import { clearScreen, setReflexMode, autoMode, setAutoMode } from './game';

export function setupUI(): void {
  buildEffectChips();
  buildParticleChips();
  setupSettingsPanel();
  setupFabs();
  setupReflexMode();
}

function buildEffectChips(): void {
  const container = document.getElementById('chipsContainer')!;
  effectConfig.forEach(eff => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    if (effectState[eff.id]) btn.classList.add('active');
    btn.innerHTML = `<span class="material-symbols-rounded">${eff.icon}</span>`;
    btn.title = eff.label;
    btn.addEventListener('click', (e) => {
      effectState[eff.id] = !effectState[eff.id];
      (e.currentTarget as HTMLButtonElement).classList.toggle('active', effectState[eff.id]);
    });
    container.appendChild(btn);
  });
}

function buildParticleChips(): void {
  const container = document.getElementById('particleChipsContainer')!;
  particleConfig.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'chip radio-chip';
    if (p.id === 'normal') btn.classList.add('active');
    btn.innerHTML = `<span class="material-symbols-rounded">${p.icon}</span>`;
    btn.title = p.label;
    btn.dataset['type'] = p.id;
    btn.addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLButtonElement;
      setCurrentParticleType(el.dataset['type'] as typeof p.id);
      container.querySelectorAll('.radio-chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
    });
    container.appendChild(btn);
  });
}

function setupSettingsPanel(): void {
  document.getElementById('btnSettings')!.addEventListener('click', () => {
    document.getElementById('settingsPanel')!.classList.toggle('open');
  });
  document.getElementById('btnCloseSettings')!.addEventListener('click', () => {
    document.getElementById('settingsPanel')!.classList.remove('open');
  });
}

function setupFabs(): void {
  document.getElementById('btnClear')!.addEventListener('click', clearScreen);

  const btnPlay = document.getElementById('btnPlay')!;
  btnPlay.addEventListener('click', function () {
    const next = !autoMode;
    setAutoMode(next);
    this.innerHTML = next
      ? '<span class="material-symbols-rounded">pause</span>'
      : '<span class="material-symbols-rounded">play_arrow</span>';
    this.classList.toggle('active-mode', next);
  });
}

function setupReflexMode(): void {
  const btnReflex = document.getElementById('btnReflex')!;
  const vignette  = document.getElementById('vignette')!;

  const enable = (e: Event): void => {
    setReflexMode(true);
    vignette.classList.add('active');
    btnReflex.classList.add('active');
    if (e instanceof TouchEvent) e.preventDefault();
  };
  const disable = (): void => {
    setReflexMode(false);
    vignette.classList.remove('active');
    btnReflex.classList.remove('active');
  };

  btnReflex.addEventListener('mousedown', enable);
  btnReflex.addEventListener('touchstart', enable, { passive: false });
  window.addEventListener('mouseup',  disable);
  window.addEventListener('touchend', disable);
}
