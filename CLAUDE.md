# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech stack

- **Vite** — dev server + bundler (`npm run dev` → `http://localhost:5173`)
- **TypeScript** — strict mode, `moduleResolution: bundler`
- **Tailwind CSS** — utility-first CSS (used by `ants-nest-simulator/`)
- No UI framework (pure Canvas apps)

## Structure

| Path | Description |
|---|---|
| `index.html` | Landing page listing all apps |
| `solitaire-cascade/` | Klondike Solitaire Victory Cascade |
| `ants-nest-simulator/` | Ant Nest Simulator (pheromone-driven ant nest simulator) |
| `inflation-clicker/` | Inflation Clicker (big-number clicker with a Kingdom-Hearts-style segmented HP gauge) |

## Commands

```bash
npm run dev       # dev server with HMR (all apps served)
npm run build     # tsc --noEmit + vite build → dist/
npm run preview   # serve dist/ locally
npm run typecheck # tsc --noEmit only
npm test          # run Vitest unit tests
npm test -- --coverage              # with coverage report
npx vitest run <pattern>            # run a single test file
npm audit         # vulnerability check (expect 0 vulnerabilities)
npm run test:visual  # visual E2E test (Playwright + Claude image evaluation)
```

CI runs in this order: `npm audit` → `typecheck` → `npm test --coverage` → `build`.

## CI / Supply chain

- **`.github/workflows/ci.yml`** — runs `npm ci → npm audit --audit-level=high → typecheck → test --coverage → build` on every push and PR
- **`.github/workflows/deploy.yml`** — deploys `dist/` to GitHub Pages on push to main
- **`.github/dependabot.yml`** — weekly automated updates for both npm packages and GitHub Actions
- **Actions pinned to commit SHAs** — prevents tag-mutation attacks; Dependabot keeps the SHAs up to date
- **`npm ci`** — enforces `package-lock.json` strictly
- **Exact versions in `package.json`** (no `^`) — `.npmrc` sets `save-exact=true`
- **`npm audit --audit-level=high`** — CI fails on high+ severity only

## Adding a new app

1. Create `<app-name>/index.html` and `<app-name>/src/main.ts`
2. Add the entry to `vite.config.ts` `rollupOptions.input`
3. Add a card to the root `index.html`
4. If the app uses Tailwind, add its HTML/src paths to `tailwind.config.ts` content list
5. Add the app's `src/` to `tsconfig.json` `include`

## App internals

### ants-nest-simulator

- **`state.ts`** — singleton holding all mutable simulation state: `grids` (3D voxel array, sized `GRID_WIDTH × GRID_HEIGHT × DEPTH`), `pheromone` (per-voxel `Float32Array` per layer), `soilCtxs` (one full-resolution canvas 2D context per Z layer for rendering soil), `ants` array, and slider values
- **`grid.ts`** — all grid read/write functions. Public API takes **pixel** coordinates; the voxel conversion happens inside. `digGel` / `fillDirt` / `dropDirtInside` return the number of voxels changed so callers can conserve dug volume. `dropDirt(x, y, z, amount)` consumes that count to stack a mound near the ant
- **`Ant.ts`** — `Ant` class with `update()` (simulation logic) and `draw()` (canvas rendering) methods. Tracks `carryAmount` in voxel units, hands it back to `dropDirt` on deposit (volume conservation)
- **`simulation.ts`** — core render loop. Composites the layered grid back-to-front to create a depth effect; initializes grids at voxel resolution. Exposes `advanceSimulation()` as `window.__antSimAdvance` so Playwright tests can advance the simulation instantly without rAF. Removing this exposure will break visual tests
- **`debugView.ts`** — debug overlay. Voxel boundary lines are drawn only when `VOXEL_SIZE >= MIN_VOXEL_SIZE_FOR_GRID_LINES` (currently `3`) — finer grids are too dense to read

Voxel grid cell values: `0` = air, `1` = soil (diggable — single voxel type covering both the original substrate and ant-deposited material), `3` = protected zone (not diggable). `soilCanvases` are per-layer binary opaque-white **masks** (encoding "is there soil here?"). Color comes from a shared y-axis `gradientCanvas` and is applied at render time by `source-in` compositing mask × gradient into `compositeCanvas`. Because every soil pixel — original substrate, ant mound, redeposited tunnel fill — takes its color from the same gradient sampled at its own y, all deposits blend seamlessly with the surrounding substrate. `soilFillStyle()` returns `'#fff'`; it's only used when adding to the mask.

`VOXEL_SIZE` is a pure internal-resolution dial (allowed: `2`, `4`; default `2`). Body-scale constants in `constants.ts` (`DIG_RADIUS_PX`, `DIG_REACH_PX`, `DROP_GRAIN_RADIUS_PX`, `DROP_JITTER_PX`) are pixel-anchored — they describe the ant, not the grid. Changing `VOXEL_SIZE` only changes how grainy the substrate feels; the volume-conservation invariant (`carryAmount` in / `dropDirt` out) holds at every size. The UI selector writes to `localStorage` (`antSim.voxelSize`) and reloads the page so `constants.ts` reads the new value.

### solitaire-cascade

- **3-layer canvas**: `gameCanvas` (green background + cards), `blurCanvas` (trails/reflex glow), `particleCanvas` (particles) stacked on top of each other.
- **Object pools**: `cardPool` / `particlePool` reuse instances to suppress GC. Returns to pool when `Card.active = false`.
- **Module singletons**: `config.ts` (layout dimensions, updated on resize), `effectState.ts` (visual effect on/off and particle limit calculation).
- **Auto mode**: automatically replays a 4-suit deck each time all cards have exited.

### inflation-clicker

- **`bignum.ts`** — `BigNum` (mantissa `m` × `10^e`), the type all HP / attack values use. Pure logic, fully unit-tested.
- **`format.ts`** — `BigNum` → **compound kanji** (chains up to 3 units, e.g. `123極4500載67正`) / english / scientific, plus `formatTime`. Within the万進法 kanji grid (`4 ≤ e < 72`, up to 無量大数) it's compound kanji; **beyond that it uses 華厳経「上数法」命数 by division** (`joUnits`: 矜羯羅 `10^112`, 阿伽羅 `10^224`, 最勝 `10^448`, 摩婆羅, 阿婆羅, 多婆羅, 界分 … each the previous *squared*): for `e ≥ 112`, find the largest命数 `U ≤ e`, show `coefficient` + `U.name`. **The coefficient (`value / 10^U.e`) is itself recursively formatted**, so smaller 上数法 命数 naturally nest inside larger ones — `10^800` becomes `1京矜羯羅阿伽羅最勝`, not a long `無量大数` chain (recursion is finite because `coeff.e < u.e` strictly). The gap `10^72`–`10^111` (no命数) uses **無量大数 stacked as a super-unit** (`compoundAboveMuryo`, `MURYO_E = 68`): `1万無量大数`, etc. — but with recursive nesting in coefficients, at most a single `無量大数` survives in any value below the largest 命数. Too large for命数/stacking (`coeff.e ≥ u.e`, e.g. グラハム数級) **falls back to a recursive kanji power tower** (`kanjiOfNumber`) — `10^(1.7×10^308)` → `10^10^308`. `sci` compacts huge exponents via `formatExp`. Pure.
- **`config.ts`** — `difficultyConfigs` built by `course(name, desc, hpE, extreme)`. **Courses differ ONLY in `hp.e`** (and the `extreme` flag for the menu warning card); everything else is global or derived from HP. Three **time courses** — 1分(`10^68`=無量大数) / 5分(`10^340`=阿伽羅) / 30分(`10^2040`=阿婆羅) — and two **extreme modes** (`extreme: true`, amber warning card): 不可説不可説転級(`10^3.7e37`) / グラハム数級(`10^1.7e308`), effectively un-clearable. Gauge constants are kept course-agnostic: `EXP_PER_BOX = 34` (one box = `10^34` damage; calibrated so 30分 fits exactly in 60 boxes — 1分=2 / 5分=10 / 30分=60 all displayed in full), `CHUNK_E = 3.4` (per-item atk.e jump, decoupled from box size), `DISPLAY_CAP_BOXES = 60`. `totalSegmentsForHp(hpE) = ceil(hpE / EXP_PER_BOX)` is the true segment count. `displayBoxesForHp(hpE) = max(1, min(60, totalSegmentsForHp(hpE)))` caps it for rendering: finite courses get every box, extreme courses (totalSegments ≫ 60) enter **conveyor mode** where the rightmost box is rendered partly off the right canvas edge (`barX + boxW × 0.5` offset) and a fresh box slides in from off-canvas on every integer crossing — visualizing "削っても削っても次が出てくる". Attack tuning is minimal — only `ATTACK.CLICK_BUDGET_PER_ITEM` (clicks between item spawns); gauge tuning is `GAUGE` (`BOX_FLASH_MS`, `BOX_SLIDE_MS`, `TRAIL_HOLD_MS`, `TRAIL_DECAY_RATE`) plus `COLORS`.
- **`state.ts`** — mutable game-state singleton + `localStorage` save/load (key `inflationClicker.save`). The gameplay is **three-variable**: `atk` (`BigNum(1, atk.e)`, current damage magnitude — moved only by the post-item ramp), `atkTargetE` (target the ramp aims at — bumped by each item), and `damageE` (cumulative damage in `log10` — the gauge reads this; clicks add `dmg = m × 10^atk.e` via `logAdd`). Defeat is `damageE ≥ maxHp.e`. `clicksSinceItem` counts toward the next item spawn. `hasSavedGame()` drives the menu's つづきから button, `loadSave()` restores it.
- **`hpGauge.ts`** — **pure model** of the segmented gauge, course-agnostic. The core quantity is `consumed = damageE / EXP_PER_BOX` (continuous, monotonically increasing). `sliceGauge(consumed, totalSegments, displayedSegments)` → `{ segmentsLeft, barFill, isFinal }`: `barFill = 1 − frac(consumed)` so the bar drains at the **same rate per click on every course**; `segmentsLeft = min(displayedSegments, totalSegments − floor(consumed))`. `advanceGauge(g, consumed, now)` runs two flash modes depending on whether `consumed < flashStart = totalSegments − displayedSegments`: (1) **conveyor mode** (over-cap; finite courses bypass this since totalSegments == displayedSegments) stamps `box[0]` on every integer crossing and resets `box[0]` after `BOX_FLASH_MS + BOX_SLIDE_MS` so the next cycle can fire; the gauge view renders the rightmost row box partly off the canvas right edge and slides a fresh box in from off-canvas during the slide phase. (2) **depletion mode** (finite courses or extreme past flashStart) stamps `box[absIdx − flashStart]` so the row clears left-to-right. The trail (`displayedConsumed`) lags real consumed for the red bar overlay, snapping forward on integer crossings so it only shows within-bar lag. **Red trail uses `frontRemain` coordinates, not full-bar.** The view computes `currFrontRemain` / `pastFrontRemain` from `finalLayer()` (for final) or `barFill` (for non-final) and draws red from `barW × (1 − pastFrontRemain)` to `barW × (1 − currFrontRemain)`, so red is always adjacent to the current front's left edge regardless of layer (no "blue-red-blue-green" disjoint, no perceptual float). Layer crossings (different `layerIndex`) fall back to a full-bar trail so the red stays visible during the brief transition. `finalLayer(barFill)` splits the final-bar fill into KH-style multi-layer reveals (green→blue→yellow). Unit-tested.
- **`gaugeView.ts`** — Canvas rendering using the `hpGauge.ts` model. **Excluded from coverage** (canvas-only, like `textures.ts`). A single `drawGauge` is position-based for all courses. Front bar: green (right-anchored, drains left). On the final segment (`slice.isFinal`), KH-style multi-layer reveal (`finalLayer` → green→blue→yellow→black). Red trail during combos. Box row: **KH-style right-aligned `segments-1` boxes** with a unified `boxW` shared across courses (calibrated so the 30分 course's ~35 visible boxes fill the bar width exactly: `max(6, (barW − gap·(35−1))/35)` ≈ 7px on a 390px-wide phone). So 1分 (7 boxes) sits as a compact row on the right, 5分 (14) is wider, 30分 fills the bar exactly, and extreme courses (cap=60) overflow off the bar's **left** side (clipped by the canvas) — communicating "this row is far too long" **without per-course conditionals**. Consumed boxes (from the left) animate **赤く光る → 黒くなる → 左へスライドしてフェードアウト** keyed off each box's `g.boxFlashAt[i]` timestamp (`GAUGE.BOX_FLASH_MS` for the red phase, `GAUGE.BOX_SLIDE_MS` for the slide-out). **Refill mode** (`boxesLeft > segments−1`, i.e. extreme courses or early/mid finite courses): right-aligned conveyor of `segments−1` boxes; on bar-clear the leftmost flashes red (`GAUGE.BOX_FLASH_MS`) → turns black and slides out left fading, the rest shift left, and a fresh green box fades in on the right (`GAUGE.BOX_SLIDE_MS`). **Deplete mode** (finite courses' final stretch, climax): right-aligned `boxesLeft` boxes that don't shift; on bar-clear the leaving box appears one slot to their left (red → black → slides further left and fades), the remaining boxes stay put, the row shrinks from the left. Box size is fixed per course (based on `maxBoxes = segments−1`) so the boxes don't resize during depletion.
- **`particles.ts`** — damage-number particles + `spawnHitSpark(x,y)` (per-hit impact ring + sparks) + `spawnBurst(x,y)` (defeat burst). `stepParticles(dt)` ages them by **real time** (~0.8s life, fps-independent — no lingering when frames drop) and `drawParticles(ctx, screenW)` draws in **two passes** — first rings (growing stroke, dimmed) / sparks (dots), then the damage numbers **on top** (so the emerald power-up sparks can't overwrite a number and shift its color). Numbers are **compound kanji `formatNumber(dmg,'kanji',3)`** (chains like `998兆999億9999万`), spawned **above the click point** (into the dark space over the enemy, not on its bright body), bold-`800` italic, off-white `#fff7ea` (less glare than pure white) with a thin black outline, opaque for most of life then a quick fade, font shrunk + x-clamped to stay on-screen, **with the scientific notation drawn small underneath** (`p.sci`) so unfamiliar命数 still convey magnitude. Number count is capped (`MAX_DAMAGE_NUMBERS`) separately from the overall cap (`MAX_PARTICLES` 36). ~0.6s life. Mockable (`measureText`/`stroke` needed). Node-testable.
- **`ui.ts`** — all DOM wiring (menu, screen toggling, attack stat only — HP is shown by the gauge, no number, item show/hide, shake, `setHardening` (sets `--harden`: crystalline-shell rings + recoil damping, shown instead of any text label), `setEnemyHit` per-hit recoil (loop-decayed `--hit` transform), `playPowerUp` (attack-panel buff flash — no text; the ⚔️ item collect also spawns an emerald `spawnPowerUp` burst), `playDefeat`, input binding). Takes `UICallbacks` from `game.ts` (no cycle: `game → ui`, `main → game`).
- **Layout/perf** — `index.html` uses a `dvh`-based flex column (fixed header/footer, flexible `min-h-0` main) so the footer is always visible on mobile despite browser chrome; rapid-tap zoom is suppressed via `touch-action: manipulation` (body) + `touch-action: none` (`#arena`) and a `gesturestart`/`gesturechange` preventDefault in `main.ts` (iOS ignores `user-scalable=no`); the loop is **dirty-checked** (stats DOM only on value change, gauge canvas only when position/trail/flash moves, fx canvas only while particles exist), particles use **real-time (not frame-based) decay** and a DPR-2-capped fx canvas, and there are **no continuous CSS animations on large elements** (the hardening aura / powering glow are static, updated only on change) — holds 60fps under 4× CPU throttle. Long numbers shrink to fit (`fitText` for DOM, per-particle font scaling for damage popups).
- **`game.ts`** — game logic + the single `requestAnimationFrame` loop. The gameplay model is intentionally **three-variable and phase-free**:
  - `state.atk.e` is the current per-click damage magnitude (`1–9.99 × 10^atk.e`). It only moves via the post-item ramp (below).
  - `state.atkTargetE` is the target damage magnitude. Collecting an item bumps it by `chunk = hp.e / totalItems = CHUNK_E (≈3.4)` instantly. The next `CLICK_BUDGET_PER_ITEM` (=9) clicks each move `atk.e` toward it by `chunk / CLICK_BUDGET_PER_ITEM` (≈0.378 per click) — so the item's boost is **distributed across ~9 taps**, not delivered as a single spike. Once `atk.e == atkTargetE`, the ramp stops; **no idle trickle**, no movement without items.
  - `state.damageE` is the **cumulative damage in log10**. Every click does `dmgExp = atk.e + log10(m)` and updates `damageE = logAdd(damageE, dmgExp)` (`logAdd(a, b) = max + log10(1 + 10^(min−max))`, overflow-safe). Because `atk.e` ramps mid-burst, damage geometrically accelerates over the ~9 ramp clicks → the gauge chips smoothly rather than jumping.
  - **Gauge progress is `consumed = damageE / EXP_PER_BOX`** — one box per `EXP_PER_BOX` (=CHUNK_E ≈3.4) of damage, course-agnostic. The bar fill `1 − frac(consumed)` is identical across courses for the same damage, satisfying "common gauge spec across courses". Win at `damageE ≥ maxHp.e`. Because HP itself is exponential, low-`atk.e` clicks add tiny `consumed` per click — the bar **looks frozen without items** even though damage accumulates.
  - **Items are click-count-paced, not phase-gated**: every `CLICK_BUDGET_PER_ITEM` clicks since the last collection, one spawns (up to `cfg.totalItems`). No fuel logic, no final-segment cutoff, no hardening curve — those mechanisms were removed because they implemented "phase control" the design explicitly avoids.
  - **Without items, defeat is still theoretically possible** — at `atk.e = 0` you do ~5 damage/click, so reaching `damageE = maxHp.e` requires astronomical clicks (e.g. ~2×10^67 for 1分), but the system never artificially freezes.
  - The "powering" attack-panel glow lights up exactly while `atk.e < atkTargetE` — i.e., during the post-item ramp, then turns off when caught up. No timer, no continuous state when nothing is happening.
  - On the killing blow, `triggerDefeat()` blocks further input (`defeatPlaying`), plays the burst (`spawnBurst` + `playDefeat` flash/enemy-pop), and reveals the result overlay only after ~900ms — whose 「タイトルへ」 button sits at the screen bottom and is armed (disabled) for ~0.7s, so mid-combo taps can't bounce you to the title.
  - Exposes `window.__clicker` (`state` / `getGauge()` / `setAtkExp(e)` / `setDamageE(e)` / `autoClick(on, ms, takeItems)`) and a fixed-position **自動クリック** toggle button **only under `import.meta.env.DEV`** (`setupDevTools()`); tree-shaken from production.

## Unit tests

Tests live in `src/__tests__/*.test.ts` inside each app directory. The test environment is `node` (no DOM).

**Canvas mock pattern** — functions that call `CanvasRenderingContext2D` methods are tested by injecting a minimal no-op object into `state.soilCtxs` (for grid functions) or by passing a mock ctx directly to `draw()`:

```ts
function makeCanvasCtx(): CanvasRenderingContext2D {
  return { save: () => {}, restore: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
           clearRect: () => {}, fillStyle: '', globalCompositeOperation: 'source-over' } as unknown as CanvasRenderingContext2D;
}
```

**`textures.ts` is excluded from coverage** (`vite.config.ts` → `coverage.exclude`) because it calls `document.createElement('canvas')` at runtime and cannot be exercised in the node environment.

## Visual E2E Tests (ants-nest-simulator)

Three Playwright tests live in `tests/`:

| Test file | Steps | Purpose |
|---|---|---|
| `ant-nest-visual.spec.ts` | 30,000 | Verifies a nest-like structure forms (tunnels + dirt mound) via LLM evaluation |
| `ant-nest-regression.spec.ts` | 300,000 | Regression guard: asserts surface-ant mean X stays within ±100 of center; no top-edge stacking |
| `ant-nest-evolution.spec.ts` | 25,000 | Captures 5 timestamped screenshots (5k/10k/15k/20k/25k) for time-series visual review |

- Port defaults to **5173**; set `PORT=5174` to avoid conflicts with a running dev server
- Screenshots are saved to `tests/screenshots/` (in `.gitignore`)
- `ant-nest-visual.spec.ts` requires `claude` CLI in PATH; the other two do not
- `__antSimAdvance(n)` and `__antSimState` are exposed on `window` by `main.ts` for test use

### Mandatory pre-PR check (ants-nest-simulator changes)

These tests are **not** run in CI. Whenever a change touches `ants-nest-simulator/` or `tests/ant-nest-*`, run them locally before opening a PR and complete the VRT checklist in `.github/pull_request_template.md`. The checklist there is the single source of truth — do not duplicate it; just satisfy it.

The `.claude/settings.json` PreToolUse hook prints a reminder when `gh pr create` is invoked on a branch with ants-nest-simulator changes.

## Creating pull requests

**Before running `gh pr create`**, you must:

1. Read `.github/pull_request_template.md` with the Read tool.
2. Fill every applicable section in **English**, following the template structure exactly.
3. For ants-nest-simulator changes, complete the VRT checklist (check off each item you have actually run).

The PreToolUse hook `.claude/hooks/pr-template-check.sh` enforces these rules mechanically and will **block** `gh pr create` if:

- The body is missing a `## Summary` section, or
- The body contains Japanese characters.
