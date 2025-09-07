import { Vec2 } from '../core/vector';
import { Projectile } from './projectile';

export class Torpedo extends Projectile {
  constructor(pos: Vec2, vel: Vec2, owner?: any) {
    super(pos, vel, owner);
    this.radius = 6;
    this.maxLife = 25; // seconds
    this.damage = 100;
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

