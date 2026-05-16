# GEMINI.md

This project, **Web Toys**, is a collection of interactive, high-performance web applications built with modern web technologies but without the overhead of heavy UI frameworks. It prioritizes pure Canvas-based rendering and clean, efficient code.

## Project Overview

- **Purpose**: A workspace for experimental web toys and simulations.
- **Main Technologies**:
  - **Bundler/Dev Server**: [Vite](https://vitejs.dev/)
  - **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
  - **Styling**: [Tailwind CSS](https://tailwindcss.com/) (utility-first, primarily for app wrappers and UI)
  - **Rendering**: Pure HTML5 Canvas API (2D and pseudo-3D)
  - **Testing**: [Playwright](https://playwright.dev/) for visual E2E testing
- **Architecture**: A multi-page application (MPA) structure managed by Vite, where each app resides in its own subdirectory with its own `index.html` and `src/` directory.

## Building and Running

### Development
```bash
npm install   # Install dependencies
npm run dev   # Start the development server at http://localhost:5173
```
The dev server serves the landing page at the root and all apps under their respective paths.

### Production
```bash
npm run build     # Build all apps into the dist/ directory
npm run preview   # Preview the production build locally at http://localhost:4173 (or 8080)
```

### Verification
```bash
npm run typecheck    # Run TypeScript type checking across the entire project
npm run test:visual # Run visual E2E tests for Ants Nest Simulator
```

## Development Conventions

- **Mono-repo Structure**: Each new app should have its own directory containing an `index.html` and a `src/` folder.
- **Configuration**:
  - Add new entry points to `rollupOptions.input` in `vite.config.ts`.
  - Update `tsconfig.json`'s `include` array when adding new source directories.
  - If using Tailwind, add new paths to `content` in `tailwind.config.ts`.
- **Canvas Rendering**: Use object pooling (as seen in `solitaire-cascade`) to minimize garbage collection during high-frequency animation frames.
- **State Management**: Prefer simple singletons or state objects (as seen in `ants-nest-simulator/src/state.ts`) over complex state management libraries.
- **CI/CD**:
  - The project uses GitHub Actions for CI (`ci.yml`) and deployment (`deploy.yml`) to GitHub Pages.
  - Dependencies and Actions are pinned to exact versions or commit SHAs for security.
- **Supply Chain Security**:
  - Use `npm ci` in automated environments.
  - Maintain zero high-severity vulnerabilities (`npm audit`).

## Key Applications

### Klondike Solitaire Victory Cascade (`solitaire-cascade/`)
An interactive visual effect recreating the iconic card fall animation.
- **Key Features**: 8 visual effects, 5 particle types, Reflex Mode (slow-motion), and Auto Play.
- **Rendering**: Uses a 3-layer canvas structure for performance and layering.

### Ant Nest Simulator (`ants-nest-simulator/`)
A 3D simulation of ants digging a nest using pheromone-based collective intelligence.
- **Key Features**: Adjust ant count and speed, 3D grid rendering (composited back-to-front).
- **Algorithm**: Ants follow pheromone trails to decide where to dig (tunnel vs. room mode).
