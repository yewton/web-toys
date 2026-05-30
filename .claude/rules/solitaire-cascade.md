---
paths:
  - "solitaire-cascade/**"
---

# solitaire-cascade internals

- **3-layer canvas**: `gameCanvas` (green background + cards), `blurCanvas` (trails/reflex glow), `particleCanvas` (particles) stacked on top of each other.
- **Object pools**: `cardPool` / `particlePool` reuse instances to suppress GC. Returns to pool when `Card.active = false`.
- **Module singletons**: `config.ts` (layout dimensions, updated on resize), `effectState.ts` (visual effect on/off and particle limit calculation).
- **Auto mode**: automatically replays a 4-suit deck each time all cards have exited.
