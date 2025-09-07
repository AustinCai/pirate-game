export class Vec2 {
  constructor(public x = 0, public y = 0) {}
  clone(): Vec2 { return new Vec2(this.x, this.y); }
  set(x: number, y: number): this { this.x = x; this.y = y; return this; }
  add(v: Vec2): this { this.x += v.x; this.y += v.y; return this; }
  sub(v: Vec2): this { this.x -= v.x; this.y -= v.y; return this; }
  scale(s: number): this { this.x *= s; this.y *= s; return this; }
  dot(v: Vec2): number { return this.x * v.x + this.y * v.y; }
  len(): number { return Math.hypot(this.x, this.y); }
  normalize(): this { const l = this.len(); if (l > 1e-8) { this.x /= l; this.y /= l; } return this; }
  rotated(theta: number): Vec2 {
    const c = Math.cos(theta), s = Math.sin(theta);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }
  static add(a: Vec2, b: Vec2): Vec2 { return new Vec2(a.x + b.x, a.y + b.y); }
  static sub(a: Vec2, b: Vec2): Vec2 { return new Vec2(a.x - b.x, a.y - b.y); }
  static scale(a: Vec2, s: number): Vec2 { return new Vec2(a.x * s, a.y * s); }
}

