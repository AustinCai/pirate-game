import { Vec2 } from "../core/vector";
import type { Ship } from "./ship";

/**
 * Base class for all projectiles (cannonballs, torpedoes, etc.).
 * Handles basic physics movement, lifetime tracking, and rendering.
 * Can be extended for specialized projectile types.
 */
export class Projectile {
  pos: Vec2;          // Current position in world space
  vel: Vec2;          // Current velocity vector
  radius = 3;         // Collision radius in pixels
  life = 0;           // How long this projectile has existed (seconds)
  maxLife = 4;        // Maximum lifetime before automatic removal (seconds)
  damage = 12;        // Base damage dealt to ships on hit (at point blank range)
  owner?: Ship;       // Ship that fired this projectile (prevents self-damage)
  startPos: Vec2;     // Position where projectile was fired from

  constructor(pos: Vec2, vel: Vec2, owner?: Ship) {
    this.pos = pos.clone();  // Clone to avoid shared reference issues
    this.vel = vel.clone();
    this.owner = owner;
    this.startPos = pos.clone(); // Track starting position for range calculations
  }

  /**
   * Update projectile physics and lifetime each frame
   */
  update(dt: number) {
    // Simple linear movement - projectiles aren't affected by drag or other forces
    this.pos.add(Vec2.scale(this.vel, dt));
    this.life += dt;
  }

  /**
   * Calculate current damage based on distance traveled from start position
   * - Full damage (12) up to 600 units
   * - Damage decays linearly to 33% (4) at 1200 units
   * - Beyond 1200 units, projectile disappears and deals no damage
   */
  getDamage(): number {
    const distance = Vec2.sub(this.pos, this.startPos).len();

    if (distance >= 1200) {
      return 0; // No damage beyond maximum range
    } else if (distance <= 600) {
      return this.damage; // Full damage within effective range
    } else {
      // Linear decay from 600 to 1200 (from 100% to 33%)
      const decayProgress = (distance - 600) / (1200 - 600); // 0 to 1
      const damageMultiplier = 1.0 - (0.67 * decayProgress); // 1.0 to 0.33
      return Math.floor(this.damage * damageMultiplier);
    }
  }

  /**
   * Check if projectile should still exist in the world
   * Remove if lifetime exceeded OR range exceeded
   */
  get alive() {
    const distance = Vec2.sub(this.pos, this.startPos).len();
    return this.life < this.maxLife && distance < 1200;
  }

  /**
   * Draw the projectile as a simple cannonball with highlight
   */
  draw(ctx: CanvasRenderingContext2D, camera: Vec2, w: number, h: number) {
    // Convert world position to screen coordinates
    const sx = this.pos.x - camera.x + w / 2;
    const sy = this.pos.y - camera.y + h / 2;
    
    ctx.save();
    
    // Draw dark core (main cannonball body)
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw small highlight for 3D effect
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(sx - this.radius * 0.3, sy - this.radius * 0.3, this.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
}
