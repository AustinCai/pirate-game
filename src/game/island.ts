import { Vec2 } from '../core/vector';

export class Island {
  outline: Vec2[];
  center: Vec2;
  private maxRadius: number;

  constructor(points: Vec2[]) {
    if (points.length < 3) throw new Error('Island requires at least three points');
    this.outline = ensureCounterClockwise(points.map(p => p.clone()));
    this.center = this.outline.reduce((acc, pt) => acc.add(pt), new Vec2()).scale(1 / this.outline.length);
    this.maxRadius = this.outline.reduce((max, pt) => Math.max(max, Vec2.sub(pt, this.center).len()), 0);
  }

  containsPoint(point: Vec2): boolean {
    return pointInPolygon(point, this.outline);
  }

  intersectsCircle(center: Vec2, radius: number): boolean {
    if (this.containsPoint(center)) return true;
    const radiusSq = radius * radius;
    const count = this.outline.length;
    for (let i = 0; i < count; i++) {
      const a = this.outline[i];
      const b = this.outline[(i + 1) % count];
      const distSq = distanceSqPointToSegment(center, a, b);
      if (distSq <= radiusSq) return true;
    }
    return false;
  }

  resolveCircle(center: Vec2, radius: number): Vec2 {
    const inside = this.containsPoint(center);
    let bestNormal: Vec2 | null = null;
    let bestDepth = 0;

    const count = this.outline.length;
    if (inside) {
      let maxSigned = -Infinity;
      for (let i = 0; i < count; i++) {
        const a = this.outline[i];
        const b = this.outline[(i + 1) % count];
        const edge = Vec2.sub(b, a);
        const len = edge.len();
        if (len <= 1e-6) continue;
        const nx = edge.y / len;
        const ny = -edge.x / len; // outward normal for CCW polygon
        const signed = (center.x - a.x) * nx + (center.y - a.y) * ny;
        if (signed > maxSigned) {
          maxSigned = signed;
          bestNormal = new Vec2(nx, ny);
        }
      }
      if (bestNormal) {
        const depth = radius - maxSigned;
        if (depth > 0) {
          bestDepth = depth;
        }
      }
    } else {
      for (let i = 0; i < count; i++) {
        const a = this.outline[i];
        const b = this.outline[(i + 1) % count];
        const closest = closestPointOnSegment(center, a, b);
        const diff = Vec2.sub(center, closest);
        const dist = diff.len();
        if (dist < radius && dist > 1e-6) {
          const depth = radius - dist;
          if (depth > bestDepth) {
            bestDepth = depth;
            bestNormal = diff.scale(1 / dist);
          }
        } else if (dist <= 1e-6) {
          const edge = Vec2.sub(b, a);
          const len = edge.len();
          if (len > 1e-6) {
            const nx = edge.y / len;
            const ny = -edge.x / len;
            const depth = radius;
            if (depth > bestDepth) {
              bestDepth = depth;
              bestNormal = new Vec2(nx, ny);
            }
          }
        }
      }
    }

    if (!bestNormal || bestDepth <= 0) return new Vec2(0, 0);
    return Vec2.scale(bestNormal, bestDepth);
  }

  avoidanceVector(center: Vec2, radius: number): Vec2 {
    return this.resolveCircle(center, radius + 40);
  }

  intersectsSegment(a: Vec2, b: Vec2, radius: number): boolean {
    if (this.containsPoint(a) || this.containsPoint(b)) return true;

    const count = this.outline.length;
    for (let i = 0; i < count; i++) {
      const p1 = this.outline[i];
      const p2 = this.outline[(i + 1) % count];
      if (segmentsIntersect(a, b, p1, p2)) return true;
      const distSq = distanceSqPointToSegment(a, p1, p2);
      if (distSq <= radius * radius) return true;
      const distSqB = distanceSqPointToSegment(b, p1, p2);
      if (distSqB <= radius * radius) return true;
    }
    return false;
  }

  computeOutline(sampleCount?: number): Vec2[] {
    return this.outline.map(pt => pt.clone());
  }

  getBoundingRadius(): number {
    return this.maxRadius;
  }
}

export interface IslandGenerationOptions {
  countSmall: number;
  countLarge: number;
}

export function generateIslands(options: IslandGenerationOptions, worldBounds: { minX: number; maxX: number; minY: number; maxY: number; }, rng: () => number = Math.random): Island[] {
  const islands: Island[] = [];
  const placements: { pos: Vec2; radius: number }[] = [];

  const attemptPlacement = (count: number, scale: number, radiusRange: [number, number]) => {
    while (count > 0) {
      const island = placeIsland(scale, radiusRange, worldBounds, rng, placements);
      if (!island) break;
      const approxRadius = islandApproxRadius(island, scale);
      placements.push({ pos: island.center.clone(), radius: approxRadius });
      islands.push(island);
      count--;
    }
  };

  attemptPlacement(options.countLarge, 2.6, [220, 420]);
  attemptPlacement(options.countSmall, 1.0, [120, 240]);

  return islands;
}

function placeIsland(scale: number, radiusRange: [number, number], world: { minX: number; maxX: number; minY: number; maxY: number; }, rng: () => number, placements: { pos: Vec2; radius: number }[]): Island | null {
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const margin = 600 * scale;
    const x = lerp(world.minX + margin, world.maxX - margin, rng());
    const y = lerp(world.minY + margin, world.maxY - margin, rng());
    const pos = new Vec2(x, y);

    if (pos.len() < 700 * scale) continue;

    const approxRadius = lerp(radiusRange[0], radiusRange[1], rng()) * scale;
    const tooClose = placements.some(p => Vec2.sub(p.pos, pos).len() < (p.radius + approxRadius) * 0.7);
    if (tooClose) continue;

    const outline = generateBlobOutline(pos, radiusRange, scale, rng);
    try {
      const island = new Island(outline);
      const bounding = island.getBoundingRadius();
      const conflict = placements.some(p => Vec2.sub(p.pos, island.center).len() < (p.radius + bounding) * 0.75);
      if (conflict) continue;
      return island;
    } catch {
      continue;
    }
  }
  return null;
}

function generateBlobOutline(center: Vec2, radiusRange: [number, number], scale: number, rng: () => number): Vec2[] {
  const pointCount = randomInt(12, 20, rng);
  const baseRadius = lerp(radiusRange[0], radiusRange[1], rng()) * scale;
  const angleStep = (Math.PI * 2) / pointCount;

  const angles: number[] = [];
  for (let i = 0; i < pointCount; i++) {
    const jitter = (rng() - 0.5) * angleStep * 0.6;
    angles.push(i * angleStep + jitter);
  }
  angles.sort((a, b) => a - b);

  const radii: number[] = [];
  for (let i = 0; i < pointCount; i++) {
    const variance = lerp(0.6, 1.4, rng());
    radii.push(baseRadius * variance);
  }

  smoothArray(radii, 2);

  const points: Vec2[] = [];
  for (let i = 0; i < pointCount; i++) {
    const angle = angles[i];
    const radius = radii[i];
    points.push(new Vec2(
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle) * radius,
    ));
  }

  return points;
}

function smoothArray(values: number[], iterations: number) {
  const count = values.length;
  const temp = new Array<number>(count);
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < count; i++) {
      const prev = values[(i - 1 + count) % count];
      const next = values[(i + 1) % count];
      temp[i] = (values[i] * 2 + prev + next) / 4;
    }
    for (let i = 0; i < count; i++) {
      values[i] = temp[i];
    }
  }
}

function distanceSqPointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = Vec2.sub(b, a);
  const lenSq = ab.dot(ab);
  if (lenSq <= 1e-8) return Vec2.sub(p, a).dot(Vec2.sub(p, a));
  const t = clamp(Vec2.sub(p, a).dot(ab) / lenSq, 0, 1);
  const closest = new Vec2(a.x + ab.x * t, a.y + ab.y * t);
  const diff = Vec2.sub(p, closest);
  return diff.dot(diff);
}

function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = Vec2.sub(b, a);
  const lenSq = ab.dot(ab);
  if (lenSq <= 1e-8) return a.clone();
  const t = clamp(Vec2.sub(p, a).dot(ab) / lenSq, 0, 1);
  return new Vec2(a.x + ab.x * t, a.y + ab.y * t);
}

function segmentsIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): boolean {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && onSegment(p1, q1, p2)) return true;
  if (o2 === 0 && onSegment(p1, q2, p2)) return true;
  if (o3 === 0 && onSegment(q1, p1, q2)) return true;
  if (o4 === 0 && onSegment(q1, p2, q2)) return true;
  return false;
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  const val = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(val) < 1e-8) return 0;
  return val > 0 ? 1 : 2;
}

function onSegment(a: Vec2, b: Vec2, c: Vec2): boolean {
  return Math.min(a.x, c.x) - 1e-6 <= b.x && b.x <= Math.max(a.x, c.x) + 1e-6 &&
         Math.min(a.y, c.y) - 1e-6 <= b.y && b.y <= Math.max(a.y, c.y) + 1e-6;
}

function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / Math.max(1e-8, (yj - yi)) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function ensureCounterClockwise(points: Vec2[]): Vec2[] {
  const area = polygonArea(points);
  if (area < 0) points.reverse();
  return points;
}

function polygonArea(points: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function randomInt(min: number, max: number, rng: () => number): number {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(rng() * (high - low + 1)) + low;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function islandApproxRadius(island: Island, scale: number): number {
  return island.getBoundingRadius() + 200 * scale;
}
