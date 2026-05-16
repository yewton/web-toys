# Solitaire Cascade

An interactive browser demo that recreates the victory cascade animation from Klondike Solitaire.

## Features

- **Card cascade** — click, tap, or drag to launch cards
- **8 visual effects** — Spin / Giant / Flip / Depth / Neon / Chaos / Particles / Continuous Drag
- **5 particle types** — Bubble / Fire / Water / Snow / Star
- **Reflex Mode** — hold the button for slow-motion playback
- **Auto Play** — automated demo mode that cycles through all four suit decks
- **Responsive** — works on smartphones, tablets, and desktop

## Development

```bash
npm install
npm run dev        # dev server → http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve dist/ locally
npm run typecheck  # TypeScript type check only
```

## Tech Stack

- [Vite](https://vitejs.dev/) — bundler + dev server
- [TypeScript](https://www.typescriptlang.org/) — type-safe transpilation
- Canvas API — pure 2D / pseudo-3D rendering without a UI framework

## License

[MIT](LICENSE)
