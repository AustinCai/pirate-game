# Project Overview

This project implements a "flash game" style pirate ship game, where you control a pirate ship from a bird's eye view in the open ocean and can fire cannons.

There are other AI ships throughout the map that the play-controlled ship should try to kill.

# Repository Guidelines

## Project Structure & Module Organization
- `index.html`: Canvas + HUD shell.
- `src/main.ts`: Game loop, rendering, camera, HUD updates.
- `src/core/`: Small utilities (e.g., `vector.ts`, `input.ts`, `assets.ts`).
- `src/game/`: Game-domain code (e.g., `ship.ts`, `projectile.ts`).
- `public/`: Static assets served at root (e.g., `public/ship.webp`).
- `README.md`: Run instructions and design notes.

Prefer small, focused modules. Keep domain logic in `src/game` and infrastructure/utilities in `src/core`. Use named exports.

## Build, Test, and Development Commands
- `npm install`: Install dependencies.
- `npm run dev`: Start Vite dev server with HMR.
- `npm run build`: Production build to `dist/`.
- `npm run preview`: Serve the built app locally for verification.

Examples:
- Run locally: `npm run dev`
- Build + preview: `npm run build && npm run preview`

## Coding Style & Naming Conventions
- TypeScript, strict mode enabled.
- Indentation: 2 spaces; include semicolons; trailing commas ok.
- Filenames: lowercase with dashes for multiword (e.g., `ocean-grid.ts`).
- Classes: `PascalCase` (e.g., `Ship`, `Vec2`).
- Functions/variables: `camelCase`.
- Avoid default exports; prefer named exports.
- Keep changes minimal and localized; avoid drive‑by refactors.

## Testing Guidelines
- No automated tests yet. Manual playtesting is expected.
- If adding tests, prefer `vitest` and place files beside sources: `foo.spec.ts`.
- Keep tests fast and deterministic; avoid canvas rendering in unit tests.

## Commit & Pull Request Guidelines
- Commits: concise, imperative subject (max ~72 chars), with context in body if needed.
  - Example: `feat(ship): add sequential port/starboard firing`
  - Example: `fix(input): prevent page scroll on Space`
- PRs: include a short description, screenshots/GIFs for visual changes, and steps to verify.
- Ensure `npm run build` passes and the game loads before requesting review.

## Architecture Overview
- Core loop in `src/main.ts` advances simulation (`Ship`, `Projectile`), updates HUD, and draws.
- Entities are simple classes with `update(dt)` and `draw(...)` where appropriate.
- Extend by adding new systems/entities under `src/game` and wiring them in `main.ts`.
