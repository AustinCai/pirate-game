/**
 * 2D Vector class for position, velocity, and direction calculations.
 * Provides both mutable instance methods and immutable static methods.
 * Essential for all spatial calculations in the game.
 */
export class Vec2 {
  constructor(public x = 0, public y = 0) {}
  
  /** Create a copy of this vector */
  clone(): Vec2 { return new Vec2(this.x, this.y); }
  
  /** Set both x and y components, returns this for chaining */
  set(x: number, y: number): this { this.x = x; this.y = y; return this; }
  
  /** Add another vector to this one (mutates this vector) */
  add(v: Vec2): this { this.x += v.x; this.y += v.y; return this; }
  
  /** Subtract another vector from this one (mutates this vector) */
  sub(v: Vec2): this { this.x -= v.x; this.y -= v.y; return this; }
  
  /** Scale this vector by a scalar value (mutates this vector) */
  scale(s: number): this { this.x *= s; this.y *= s; return this; }
  
  /** Calculate dot product with another vector */
  dot(v: Vec2): number { return this.x * v.x + this.y * v.y; }
  
  /** Get the length (magnitude) of this vector */
  len(): number { return Math.hypot(this.x, this.y); }
  
  /** Normalize this vector to unit length (mutates this vector) */
  normalize(): this { 
    const l = this.len(); 
    if (l > 1e-8) { 
      this.x /= l; 
      this.y /= l; 
    } 
    return this; 
  }
  
  /** Create a new vector rotated by theta radians */
  rotated(theta: number): Vec2 {
    const c = Math.cos(theta), s = Math.sin(theta);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }
  
  // Static methods for immutable operations
  
  /** Create a new vector from adding two vectors */
  static add(a: Vec2, b: Vec2): Vec2 { return new Vec2(a.x + b.x, a.y + b.y); }
  
  /** Create a new vector from subtracting two vectors */
  static sub(a: Vec2, b: Vec2): Vec2 { return new Vec2(a.x - b.x, a.y - b.y); }
  
  /** Create a new vector from scaling a vector */
  static scale(a: Vec2, s: number): Vec2 { return new Vec2(a.x * s, a.y * s); }
}

