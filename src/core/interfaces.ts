import { Vec2 } from './vector';

/**
 * Basic interface for any object that can be updated each frame
 * Used by ships, projectiles, and game systems
 */
export interface Updatable {
  update(dt: number): void;
}

/**
 * Basic interface for any object that can be drawn to the canvas
 * Used by ships, projectiles, and UI elements
 */
export interface Drawable {
  draw(ctx: CanvasRenderingContext2D, camera: Vec2, canvasWidth: number, canvasHeight: number): void;
}

/**
 * Interface for game entities that exist in world space
 * Combines position, update, and draw capabilities
 */
export interface GameEntity extends Updatable, Drawable {
  readonly pos: Vec2;
  readonly id: number;
}

/**
 * Configuration for world boundaries and physics
 */
export interface WorldConfig {
  readonly bounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
  };
  readonly boundaryBounce: number; // Bounce factor when hitting world edges
}

/**
 * Input state for controlling ships
 */
export interface ShipControls {
  readonly up: boolean;     // Forward thrust
  readonly down: boolean;   // Reverse thrust  
  readonly left: boolean;   // Turn left
  readonly right: boolean;  // Turn right
  readonly fire: boolean;   // Fire cannons
}

/**
 * Camera viewport information for rendering
 */
export interface ViewportInfo {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}