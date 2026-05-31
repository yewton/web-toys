---
paths:
  - "inflation-clicker/**"
---

# inflation-clicker internals

Source files are heavily commented in Japanese. This rule captures only **cross-file constraints and non-obvious design decisions** — things you cannot infer from reading a single file.

## Design invariants

- **Courses differ ONLY in `hp.e`.** All density/attack tuning is global and derived from HP. The five courses are命数-named after their own HP exponent: 無量大数 `10^68` / 摩婆羅 `10^896` / 界分 `10^7168` / 不可説不可説転 `10^(7·2^122)` / グラハム数 `10^1.7e308`. Only グラハム数 is `extreme: true` (amber warning card in menu).
- **Gameplay is three-variable and phase-free** (`state.ts` / `game.ts`): `atk.e` (per-click damage magnitude, moves only via the post-item ramp) / `atkTargetE` (ramp target, bumped one `chunkAtE` per item) / `damageE` (cumulative log10 damage; defeat at `damageE ≥ hp.e`). No fuel, phase gates, or idle trickle.
- **Dynamic density** (`config.ts`) keeps per-click gauge drain rate course-agnostic: `chunkAtE(e) = max(C0=1, e/INFL_E=100)` and `expPerBoxAt = ITEMS_PER_BOX · chunkAtE` grow in lockstep, so `consumed`-per-click stays constant across all courses. `consumedAtDamage` stretches the integral so `consumed` lands exactly on `totalSegments` at defeat.
- **Number display policy** (`format.ts`): 厳密でなくてよいが嘘にならない / 命数で数字の羅列を避ける / 無量大数を無尽蔵に並べない。Any change must preserve all three.

## Non-obvious per-file facts

- **`format.ts`**: When the joUnit recursion bottoms out (`_joDepth === 3`) on a still-huge coefficient, the leading-block 端数 is **dropped, not concatenated** — fusing it with `k` would be misread as `無量大数^(head·k)`, an orders-of-magnitude lie. The rounding error (≤ `10^34` in the exponent) is negligible.
- **`gaugeView.ts`**: **Excluded from test coverage** (canvas-only). Box size is fixed to 31 (= `DISPLAY_CAP_BOXES − 1`) so 無量大数's 6 boxes sit compact on the right and over-cap courses overflow off the **left** edge — communicating "far too long to show" without per-course conditionals.
- **`game.ts`**: `setHardening` is **cosmetic only** (shell opacity by `damageE/hp.e`); it is not a gameplay phase. DEV-only `window.__clicker` (`state` / `getGauge()` / `particles` / `setAtkExp` / `setDamageE` / `setConsumed` / `autoClick`) + 自動クリック / クリア直前 buttons are tree-shaken from production.
- **`state.ts`**: Save keys follow `inflationClicker.save.<diff>`. `migrateLegacySave` folds the old single-slot key once at boot.
- **`ui.ts`**: HP is shown **only** by the gauge — no HP number is ever displayed. Dependency direction is `game → ui`, `main → game` (no cycle).
- **`particles.ts`**: Node-testable via mock `measureText`/`stroke`. Damage numbers are drawn in a second pass over sparks so power-up emerald sparks cannot recolor a number.
