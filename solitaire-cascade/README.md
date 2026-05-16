# Klondike Solitaire Victory Cascade

An interactive visual effect inspired by the victory animation of Klondike Solitaire, where cards rain down the screen.

## Controls

| Input | Effect |
|---|---|
| Tap / Click | Summon a card at that position |
| Drag / Swipe | Continuously spawn cards along the pointer trail |
| Reflex button (hold) | Slow-motion effect (enhanced trail glow) |
| Clear button | Remove all cards and particles and reset |
| Play button | Auto mode: automatically plays through a 4-suit deck |
| Settings button | Toggle effect and particle types |

## Effect Settings

### Card Effects

| Effect | Description |
|---|---|
| Spin | Cards rotate as they fall |
| Giant | Spawns larger-than-normal cards |
| Z-Spin | Z-axis rotation (depth rotation) |
| Depth | Perspective depth representation |
| Neon | Glowing neon color effect |
| Chaos | Scatter in random directions and speeds |
| Particles | Attach particles to cards |
| Continuous Drag | Continuously spawn while dragging |

### Particle Types

Choose from `normal` / `fire` / `water` / `snow` / `star`.

## Architecture

### 3-Layer Canvas

```
particleCanvas  ← foreground: particle rendering
blurCanvas      ← middle: trails and reflex glow
gameCanvas      ← background: green backdrop + card bodies
```

### Object Pools

`cardPool` / `particlePool` reuse instances to suppress GC. Returns to pool when `Card.active = false`.

### Module Structure

```
src/
├── types.ts       suit, card value, and effect type definitions
├── config.ts      layout dimension singleton (updated on resize)
├── effectState.ts effect on/off and particle limit calculation
├── textures.ts    card face texture generation and caching
├── card.ts        Card class (physics and rendering)
├── particle.ts    Particle class
├── game.ts        main loop, card spawning, and Auto mode
├── ui.ts          button and chip UI event wiring
└── main.ts        entry point
```

### Auto Mode

Automatically replays a 4-suit deck each time all cards have exited, continuing the animation endlessly.
