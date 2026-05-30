---
paths:
  - "**/__tests__/**"
  - "**/*.test.ts"
---

# Unit test conventions

Tests live in `src/__tests__/*.test.ts` inside each app directory. The test environment is `node` (no DOM).

**Canvas mock pattern** — functions that call `CanvasRenderingContext2D` methods are tested by injecting a minimal no-op object into `state.soilCtxs` (for grid functions) or by passing a mock ctx directly to `draw()`:

```ts
function makeCanvasCtx(): CanvasRenderingContext2D {
  return { save: () => {}, restore: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
           clearRect: () => {}, fillStyle: '', globalCompositeOperation: 'source-over' } as unknown as CanvasRenderingContext2D;
}
```

**`textures.ts` is excluded from coverage** (`vite.config.ts` → `coverage.exclude`) because it calls `document.createElement('canvas')` at runtime and cannot be exercised in the node environment.
