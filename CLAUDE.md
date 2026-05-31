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

Per-app internals and test conventions live in path-scoped rules under `.claude/rules/` (loaded only when you work with matching files): `inflation-clicker.md`, `ants-nest-simulator.md`, `solitaire-cascade.md`, `testing.md`.

**Rules authoring policy**: rules must contain only **cross-file constraints and non-obvious design decisions** — things that cannot be inferred from reading a single source file. Do NOT put in rules:
- Per-file summaries (source files are heavily commented)
- Anything that duplicates source comments
- Test file lists (file names make coverage targets self-evident)

The goal is zero dual-maintenance: if a rule entry would need updating every time the code changes, it belongs in the code comment, not the rule.

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

## Verification utilities

For manual verification (running the app, checking animations/visuals), **use these instead of writing throwaway `npm run dev &` / `pkill -f vite` / `ps`/`grep` / scratch scripts** — they are pre-approved in `.claude/settings.json`, so they don't trigger permission prompts:

```bash
scripts/dev.sh up [port]          # start vite detached (default 5173), idempotent, waits for HTTP 200
scripts/dev.sh down [port|all]    # stop managed server(s) by pid/process-group (no blind pkill)
scripts/dev.sh status             # list managed servers (port / pid / HTTP state)
scripts/dev.sh logs [port]        # tail tmp/dev-<port>.log
scripts/dev.sh url [app] [port]   # print an app URL (app: clicker | ants | solitaire)
scripts/dev.sh shot <path|url> [out.png] [--full] [--wait ms] [--size WxH]  # static screenshot via Playwright chromium
```

- Lifecycle state lives in `tmp/` (`dev-<port>.pid`, `dev-<port>.log`; gitignored). Always `scripts/dev.sh down all` when finished.
- For **animation / interactive visual checks**, drive the running server with the **chrome-devtools MCP** server (`navigate_page` / `take_screenshot` / `evaluate_script` / `wait_for`), allowed at server level in `.claude/settings.json`.

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
6. If the app has non-obvious internals, add a path-scoped rule at `.claude/rules/<app-name>.md` (`paths: ["<app-name>/**"]`) rather than expanding this file

## Creating pull requests

**Before running `gh pr create`**, you must:

1. Read `.github/pull_request_template.md` with the Read tool.
2. Fill every applicable section in **English**, following the template structure exactly.
3. For ants-nest-simulator changes, complete the VRT checklist (check off each item you have actually run).

The PreToolUse hook `.claude/hooks/pr-template-check.sh` enforces these rules mechanically and will **block** `gh pr create` if:

- The body is missing a `## Summary` section, or
- The body contains Japanese characters.
