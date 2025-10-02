# Repository Guidelines

## Project Structure & Module Organization
- `index.html` hosts the canvas bootstrapping the HUD overlay.
- Gameplay loop, rendering, and camera logic live in `src/main.ts`.
- Shared utilities (vectors, input, assets, audio) sit under `src/core/`.
- Domain entities such as ships, projectiles, and torpedoes reside in `src/game/`.
- Static art and audio are served from `public/`; compiled output lands in `dist/` after a build.

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run dev` starts the Vite dev server with hot module replacement.
- `npm run build` produces a production bundle in `dist/` (run before publishing changes).
- `npm run preview` serves the last build locally for smoke testing release assets.

## Coding Style & Naming Conventions
- TypeScript in strict mode; prefer small modules with named exports.
- Use two-space indentation, semicolons, and allow trailing commas.
- Filenames are lowercase with dashes (`ocean-grid.ts`), classes use `PascalCase`, functions and variables use `camelCase`.
- Keep feature work localized; avoid opportunistic refactors without discussion.

## Testing Guidelines
- No automated suite exists yet; rely on `npm run build` and manual play sessions to validate changes.
- If you add tests, use `vitest`, colocate specs beside sources as `*.spec.ts`, and focus on deterministic logic (avoid canvas rendering paths).
- Document any new manual test steps in the PR description.

## Commit & Pull Request Guidelines
- Write imperative, scoped commit subjects (≤72 chars), e.g. `fix(ai): steady broadside tracking`.
- PRs should summarize intent, list verification steps, and include screenshots or clips for visual tweaks.
- Ensure `npm run build` succeeds and no TypeScript errors remain before requesting review.

## Architecture Overview
- The render/update loop in `src/main.ts` advances all entities, resolves collisions, and updates the HUD each frame.
- `Ship` and its AI subclasses expose `update(dt)` for simulation and `draw` for rendering; new mechanics should extend these entry points.
- Builders should route shared math or input helpers through `src/core/` to keep `src/game/` focused on gameplay rules.
