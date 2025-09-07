# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm install`: Install dependencies
- `npm run dev`: Start Vite dev server with hot module reloading (auto-opens browser)
- `npm run build`: Production build to `dist/` directory
- `npm run preview`: Serve the built app locally for verification

## Project Architecture

This is a TypeScript HTML5 Canvas pirate ship game built with Vite. The architecture follows a clean object-oriented design with separate system responsibilities:

### Core Engine (`src/core/`)
- **GameEngine**: Main orchestrator class that coordinates all systems and handles the game loop (`game-engine.ts`)
- **EntityManager**: Manages all game entities (ships, projectiles) and their lifecycle (`entity-manager.ts`)
- **Camera**: Viewport management and world-to-screen coordinate conversion (`camera.ts`)
- **GameWorld**: World boundaries, physics rules, and spatial constraints (`game-world.ts`)
- **Vector Math**: `Vec2` class for 2D operations (`vector.ts`)
- **Input Handling**: Keyboard input management (`input.ts`)
- **Asset Loading**: Image asset loading utilities (`assets.ts`)
- **Interfaces**: TypeScript interfaces for better code organization (`interfaces.ts`)

### Game Systems (`src/systems/`)
- **CollisionSystem**: Handles all collision detection and resolution with realistic physics (`collision-system.ts`)

### Game Logic (`src/game/`)
- **Ship System**: Base `Ship` class with physics, cannon management, and polygon-based collision detection (`ship.ts`)
- **AI Ships**: `AIShip` extends `Ship` with behavior states (patrol, aggressive, flee) (`ai-ship.ts`)
- **Projectiles**: Base `Projectile` class and specialized `Torpedo` class for different ammunition types

### UI System (`src/ui/`)
- **HUDSystem**: Manages all UI elements including health bars, cannon indicators, minimap, and overlays (`hud-system.ts`)

### Main Entry Point (`src/main.ts`)
- Simplified bootstrap file that creates the GameEngine and starts the game
- All game logic is now properly encapsulated in the engine and system classes

## Key Design Patterns

- **Separation of Concerns**: Each system has a single, well-defined responsibility
- **Object-Oriented Design**: Clean class hierarchy with proper encapsulation and interfaces
- **System Architecture**: Game engine coordinates independent systems (collision, entities, camera, etc.)
- **Entity Management**: Centralized entity lifecycle management with type safety
- **Sequential Cannon Firing**: Cannons fire in sequence along the hull for realistic broadsides
- **Polygon-Based Collision**: Ships use hull polygons rather than simple circles for accurate hit detection
- **State-Based AI**: AI ships switch between patrol, aggressive, and flee behaviors based on distance and health
- **Component-Based UI**: HUD system manages different UI components independently

## Game Constants & Tuning

All gameplay constants are centralized in the GameEngine's `createGameConfig()` method:
- Ship physics (thrust, drag, turn rates) 
- AI behavior parameters (spawn distances, aggression counts)
- Weapon systems (reload times, damage, torpedo mechanics)
- World dimensions and camera behavior
- Progression system (XP costs, upgrade mechanics)

## Asset Structure

- `public/ship.webp`: Optional ship sprite (falls back to vector hull if missing)
- `index.html`: Canvas setup and HUD containers
- Game renders to full-screen canvas with overlay HUD elements

## Testing

No automated tests currently. Manual playtesting expected. Build must pass before deployment.