# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm install`: Install dependencies
- `npm run dev`: Start Vite dev server with hot module reloading (auto-opens browser)
- `npm run build`: Production build to `dist/` directory
- `npm run preview`: Serve the built app locally for verification

## Project Architecture

This is a TypeScript HTML5 Canvas pirate ship game built with Vite. The architecture uses a monolithic game loop with object-oriented entity design:

### Core Engine (`src/core/`)
- **Vector Math**: `Vec2` class for 2D operations - essential for all spatial calculations (`vector.ts`)
- **Input Handling**: Keyboard input management with frame-based press detection (`input.ts`)
- **Asset Loading**: Image asset loading utilities (`assets.ts`)
- **Audio System**: HTML5 audio management with sound effect coordination (`audio.ts`)
- **Constants**: Centralized gameplay configuration including ship stats, AI behavior, and game rules (`constants.ts`)

### Game Logic (`src/game/`)
- **Ship System**: Base `Ship` class with realistic ship physics, sequential cannon firing, and polygon-based collision detection (`ship.ts`)
- **AI Ships**: `AIShip` extends `Ship` with sophisticated AI states (aggressive, roaming) and predictive collision avoidance (`ai-ship.ts`)
- **Capital Ships**: `CapitalShip` extends `AIShip` with enhanced stats and special behaviors (`capital-ship.ts`)
- **Projectiles**: Base `Projectile` class and specialized `Torpedo` class with different damage and physics (`projectile.ts`, `torpedo.ts`)

### Main Game Loop (`src/main.ts`)
- Monolithic main file containing the complete game state, physics simulation, and rendering
- Handles player respawn system, treasure collection, upgrade shop, and HUD management
- All game systems are implemented directly in the main game loop rather than separate system classes

## Key Design Patterns

- **Object-Oriented Design**: Clean class hierarchy with `Ship` base class extended by `AIShip` and `CapitalShip`
- **Sequential Cannon Firing**: Cannons fire in sequence along the hull for realistic broadsides with per-side timing
- **Polygon-Based Collision**: Ships use hull polygons rather than simple circles for accurate hit detection
- **State-Based AI**: AI ships switch between aggressive and roaming behaviors with predictive collision avoidance
- **Monolithic Game Loop**: All game logic centralized in `main.ts` with direct entity management
- **Configuration-Driven**: Extensive use of constants for easy game balancing and tweaking

## Game Constants & Tuning

All gameplay constants are centralized in `src/core/constants.ts`:
- **Ship Physics**: Thrust, drag, turn rates, and health stats for player, AI, and capital ships
- **AI Behavior**: Fire ranges, desired distances, edge avoidance margins, and aggression settings
- **Experience System**: XP rewards, shop costs, and upgrade inflation rates  
- **World Configuration**: Boundaries, camera behavior, spawn patterns, and population limits
- **Combat Systems**: Torpedo mechanics, collision physics, and damage calculations

## Asset Structure

- `public/ship.webp`: Optional ship sprite (falls back to vector hull drawing if missing)
- `public/*.mp3`: Audio files for cannon fire, hits, and torpedo sounds
- `index.html`: Canvas setup and HUD containers
- Game renders to full-screen canvas with overlay HUD elements positioned via CSS

## Core Game Mechanics

- **Ship Physics**: Momentum-based sailing with separate linear/angular drag and speed-dependent turning
- **Combat System**: Side-based broadside cannons with sequential firing and individual reload timers
- **AI Behaviors**: Ships dynamically switch between aggressive (pursue player) and roaming (wander safely) states
- **Experience & Upgrades**: Gain XP from damage/kills to purchase ship improvements (repair, hull, cannons, torpedoes)
- **Collision System**: Realistic ship-to-ship physics with ramming damage based on relative velocity and impact angle
- **World Boundaries**: Finite map with soft bouncing and AI edge avoidance

## Testing

No automated tests currently. Manual playtesting expected. Build must pass before deployment.