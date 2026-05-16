# Web Toys

A collection of small web apps built on a whim.

**Live**: https://yewton.github.io/web-toys/

## Apps

| App | Description |
|---|---|
| [Klondike Solitaire Victory Cascade](./solitaire-cascade/) | An interactive visual effect where cards rain down on victory |
| [Ant Nest Simulator](./ants-nest-simulator/) | A 3D simulator where pheromone-driven ants autonomously dig their nest |

## Development

```bash
npm install
npm run dev       # start all apps at http://localhost:5173
npm run build     # build to dist/
npm run typecheck # type-check only
npm run test:visual  # visual E2E test (targets ants-nest-simulator)
```

## Tech Stack

- **Vite** — bundler + dev server
- **TypeScript** — strict mode
- **Tailwind CSS** — utility-first CSS
- No UI framework (pure Canvas apps)

## CI / Deploy

- `ci.yml` — runs `npm audit`, type-check, and build on every push / PR
- `deploy.yml` — auto-deploys to GitHub Pages on push to main
- Actions pinned to commit SHAs, `npm ci` + exact version management for supply chain security

## Adding a New App

1. Create `<app-name>/index.html` and `<app-name>/src/main.ts`
2. Add the entry to `vite.config.ts` `rollupOptions.input`
3. Add a card to the root `index.html`
4. If using Tailwind, add its HTML/src paths to `tailwind.config.ts` content list
5. Add the app's `src/` to `tsconfig.json` `include`

## License

MIT © [yewton](https://github.com/yewton)
