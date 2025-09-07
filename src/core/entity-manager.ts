import type { GameEntity, ViewportInfo } from './interfaces';
import type { Ship } from '../game/ship';
import type { Projectile } from '../game/projectile';
import { Vec2 } from './vector';

/**
 * Manages all game entities (ships, projectiles) and their lifecycle.
 * Handles updates, cleanup, and provides organized access to different entity types.
 */
export class EntityManager {
  private ships: Ship[] = [];
  private projectiles: Projectile[] = [];
  private _player: Ship | null = null;

  /**
   * Get the player ship (if any)
   */
  get player(): Ship | null {
    return this._player;
  }

  /**
   * Set the player ship
   */
  setPlayer(ship: Ship): void {
    this._player = ship;
    if (!this.ships.includes(ship)) {
      this.ships.push(ship);
    }
  }

  /**
   * Add a ship to the world
   */
  addShip(ship: Ship): void {
    this.ships.push(ship);
  }

  /**
   * Remove a ship from the world
   */
  removeShip(ship: Ship): void {
    const index = this.ships.indexOf(ship);
    if (index >= 0) {
      this.ships.splice(index, 1);
    }
    
    // Clear player reference if this was the player ship
    if (this._player === ship) {
      this._player = null;
    }
  }

  /**
   * Add a projectile to the world
   */
  addProjectile(projectile: Projectile): void {
    this.projectiles.push(projectile);
  }

  /**
   * Get all ships (including player)
   */
  getAllShips(): readonly Ship[] {
    return this.ships;
  }

  /**
   * Get all enemy ships (excluding player)
   */
  getEnemyShips(): Ship[] {
    return this.ships.filter(ship => ship !== this._player);
  }

  /**
   * Get all projectiles
   */
  getAllProjectiles(): readonly Projectile[] {
    return this.projectiles;
  }

  /**
   * Remove projectiles that are outside the world bounds
   */
  removeProjectilesOutsideWorld(isOutsideWorld: (pos: any) => boolean): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (isOutsideWorld(this.projectiles[i].pos)) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  /**
   * Get a mutable reference to projectiles for collision system
   * WARNING: Only use this for collision detection that needs to remove projectiles
   */
  getMutableProjectiles(): Projectile[] {
    return this.projectiles;
  }

  /**
   * Get ships within a certain distance of a position
   */
  getShipsNear(position: Vec2, maxDistance: number): Ship[] {
    const maxDistSquared = maxDistance * maxDistance;
    return this.ships.filter(ship => {
      const distSquared = Vec2.sub(ship.pos, position).dot(Vec2.sub(ship.pos, position));
      return distSquared <= maxDistSquared;
    });
  }

  /**
   * Get ships currently visible in the viewport
   */
  getShipsInViewport(viewport: ViewportInfo): Ship[] {
    return this.ships.filter(ship => 
      ship.pos.x >= viewport.left - ship.length &&
      ship.pos.x <= viewport.right + ship.length &&
      ship.pos.y >= viewport.top - ship.width &&
      ship.pos.y <= viewport.bottom + ship.width
    );
  }

  /**
   * Update all entities for one frame
   * Note: Ships are updated individually by GameEngine to handle different control inputs
   */
  update(dt: number): void {
    // Update all projectiles
    for (const projectile of this.projectiles) {
      projectile.update(dt);
    }
  }

  /**
   * Remove dead/expired entities
   */
  cleanup(): void {
    // Remove dead projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].alive) {
        this.projectiles.splice(i, 1);
      }
    }

    // Remove fully sunk ships (except player - player has special respawn logic)
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const ship = this.ships[i];
      if (ship !== this._player && ship.isSinking && ship.isFullySunk()) {
        this.ships.splice(i, 1);
      }
    }
  }

  /**
   * Draw all entities
   */
  draw(ctx: CanvasRenderingContext2D, camera: Vec2, canvasWidth: number, canvasHeight: number): void {
    // Draw projectiles first (they appear behind ships)
    for (const projectile of this.projectiles) {
      projectile.draw(ctx, camera, canvasWidth, canvasHeight);
    }

    // Draw ships on top
    for (const ship of this.ships) {
      ship.draw(ctx, camera, canvasWidth, canvasHeight);
    }
  }

  /**
   * Clear all entities (useful for game restart)
   */
  clear(): void {
    this.ships.length = 0;
    this.projectiles.length = 0;
    this._player = null;
  }

  /**
   * Get total count of entities being managed
   */
  getEntityCounts(): { ships: number; projectiles: number; total: number } {
    return {
      ships: this.ships.length,
      projectiles: this.projectiles.length,
      total: this.ships.length + this.projectiles.length
    };
  }
}