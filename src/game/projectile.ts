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
  damage = 12;        // Damage dealt to ships on hit
  owner?: Ship;       // Ship that fired this projectile (prevents self-damage)

  constructor(pos: Vec2, vel: Vec2, owner?: Ship) {
    this.pos = pos.clone();  // Clone to avoid shared reference issues
    this.vel = vel.clone();
    this.owner = owner;
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
   * Check if projectile should still exist in the world
   */
  get alive() { 
    return this.life < this.maxLife; 
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
