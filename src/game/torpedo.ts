import { Vec2 } from '../core/vector';
import { Projectile } from './projectile';

export class Torpedo extends Projectile {
  constructor(pos: Vec2, vel: Vec2, owner?: any) {
    super(pos, vel, owner);
    this.radius = 6;
    this.maxLife = 25; // seconds
    this.damage = 100; // Base damage for first 1000 units
  }

  /**
   * Calculate torpedo damage based on distance traveled:
   * - First 1000 units: 100 damage (flat)
   * - After 1000 units: scales to 500 damage at 2500 units
   * - Rate: +26.67 damage per 100 units beyond 1000
   */
  getDamage(): number {
    const distance = Vec2.sub(this.pos, this.startPos).len();

    if (distance <= 1000) {
      return 100; // Flat damage for first 1000 units
    } else if (distance >= 2500) {
      return 500; // Max damage at 2500 units
    } else {
      // Calculate additional damage: +26.67 per 100 units beyond 1000
      const additionalUnits = distance - 1000;
      const additionalDamage = (400 / 1500) * additionalUnits; // 400 damage over 1500 units
      return Math.floor(100 + additionalDamage);
    }
  }

  /**
   * Check if torpedo should still exist in the world
   * Override to use 2500 unit max range instead of 1200
   */
  get alive() {
    const distance = Vec2.sub(this.pos, this.startPos).len();
    return this.life < this.maxLife && distance < 2500;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vec2, w: number, h: number) {
    const sx = this.pos.x - camera.x + w / 2;
    const sy = this.pos.y - camera.y + h / 2;
    ctx.save();
    ctx.translate(sx, sy);
    const ang = Math.atan2(this.vel.y, this.vel.x);
    ctx.rotate(ang);
    // body
    ctx.fillStyle = '#374151';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-10, -4, 20, 8);
    ctx.fill();
    ctx.stroke();
    // nose
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(6, 4);
    ctx.lineTo(6, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

