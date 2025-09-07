import { Vec2 } from "../core/vector";
import type { Ship } from "./ship";

export class Projectile {
  pos: Vec2;
  vel: Vec2;
  radius = 3;
  life = 0;
  maxLife = 4; // seconds
  damage = 12;
  owner?: Ship;

  constructor(pos: Vec2, vel: Vec2, owner?: Ship) {
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.owner = owner;
  }

  update(dt: number) {
    this.pos.add(Vec2.scale(this.vel, dt));
    this.life += dt;
  }

  get alive() { return this.life < this.maxLife; }

  draw(ctx: CanvasRenderingContext2D, camera: Vec2, w: number, h: number) {
    const sx = this.pos.x - camera.x + w / 2;
    const sy = this.pos.y - camera.y + h / 2;
    ctx.save();
    ctx.fillStyle = '#1f2937'; // dark core
    ctx.beginPath();
    ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; // small highlight
    ctx.beginPath();
    ctx.arc(sx - this.radius * 0.3, sy - this.radius * 0.3, this.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
