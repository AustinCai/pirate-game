**Pirate Ship Game**

- Stack: TypeScript, HTML5 Canvas, Vite.
- Controls: Arrow keys to sail; Space to fire broadsides.

Setup

- Install deps: `npm install`
- Add your ship sprite as WebP at `public/ship.webp` (top-down view recommended). The game falls back to a vector hull if missing.
- Run: `npm run dev` then open the shown URL.

Design Notes

- Momentum-based sailing: linear and angular drag, slow turning with angular acceleration; reverse thrust weaker.
- Broadsides: multiple per-side cannons positioned along the hull; each cannon reloads independently and fires perpendicular to heading (outwards from the ship’s sides).
- Extensible architecture: `Ship`/`Projectile` classes, `Vec2` math, basic `Input` and `Assets` modules.

Next Ideas

- Wind and tacking mechanics; different sail states.
- Enemy ships with AI and damage model.
- Island obstacles, cannonball splashes, particles, and audio.

