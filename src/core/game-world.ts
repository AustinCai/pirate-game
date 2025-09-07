import { Vec2 } from './vector';
import type { WorldConfig } from './interfaces';
import type { Ship } from '../game/ship';

/**
 * Manages the game world boundaries, physics, and global world state.
 * Handles keeping entities within bounds and world-level physics rules.
 */
export class GameWorld {
  private readonly config: WorldConfig;

  constructor(config: WorldConfig) {
    this.config = config;
  }

  /**
   * Get the world boundaries
   */
  getBounds() {
    return this.config.bounds;
  }

  /**
   * Get world dimensions
   */
  getWorldSize() {
    const bounds = this.config.bounds;
    return {
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY
    };
  }

  /**
   * Check if a position is within world bounds
   */
  isPositionInBounds(pos: Vec2, margin = 0): boolean {
    const bounds = this.config.bounds;
    return pos.x >= bounds.minX - margin && 
           pos.x <= bounds.maxX + margin &&
           pos.y >= bounds.minY - margin && 
           pos.y <= bounds.maxY + margin;
  }

  /**
   * Apply world boundary constraints to a ship, bouncing it back if needed.
   * This keeps ships within the playable area with realistic physics response.
   */
  applyWorldBoundsToShip(ship: Ship): void {
    const bounds = this.config.bounds;
    const bounce = this.config.boundaryBounce;
    
    // Calculate hull margins to prevent the ship from going completely outside bounds
    const hullMarginX = ship.length * 0.5;
    const hullMarginY = ship.width * 0.5;
    
    // Define effective boundaries accounting for ship size
    const effectiveBounds = {
      minX: bounds.minX + hullMarginX,
      maxX: bounds.maxX - hullMarginX,
      minY: bounds.minY + hullMarginY,
      maxY: bounds.maxY - hullMarginY
    };

    // Apply boundary constraints with bounce physics
    if (ship.pos.x < effectiveBounds.minX) {
      ship.pos.x = effectiveBounds.minX;
      if (ship.vel.x < 0) {
        ship.vel.x *= -bounce; // Reverse and dampen velocity
      }
    }
    
    if (ship.pos.x > effectiveBounds.maxX) {
      ship.pos.x = effectiveBounds.maxX;
      if (ship.vel.x > 0) {
        ship.vel.x *= -bounce;
      }
    }
    
    if (ship.pos.y < effectiveBounds.minY) {
      ship.pos.y = effectiveBounds.minY;
      if (ship.vel.y < 0) {
        ship.vel.y *= -bounce;
      }
    }
    
    if (ship.pos.y > effectiveBounds.maxY) {
      ship.pos.y = effectiveBounds.maxY;
      if (ship.vel.y > 0) {
        ship.vel.y *= -bounce;
      }
    }
  }

  /**
   * Check if a position is outside the world bounds (used for cleanup)
   */
  isPositionOutsideWorld(pos: Vec2, safetyMargin = 500): boolean {
    const bounds = this.config.bounds;
    return pos.x < bounds.minX - safetyMargin ||
           pos.x > bounds.maxX + safetyMargin ||
           pos.y < bounds.minY - safetyMargin ||
           pos.y > bounds.maxY + safetyMargin;
  }
}