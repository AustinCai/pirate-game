import { Vec2 } from '../core/vector';
import type { Ship } from '../game/ship';
import type { Projectile } from '../game/projectile';

/**
 * Configuration for collision physics behavior
 */
interface CollisionConfig {
  readonly restitution: number;    // Bounce factor (0 = no bounce, 1 = perfect bounce)
  readonly friction: number;       // Tangential friction during collision
  readonly damageCooldown: number; // Seconds between damage applications for the same pair
}

/**
 * Handles all collision detection and resolution in the game.
 * Manages ship-to-ship collisions with realistic physics response,
 * and projectile-to-ship hit detection.
 */
export class CollisionSystem {
  private collisionCooldowns = new Map<string, number>(); // Track damage cooldown between ship pairs
  private config: CollisionConfig;

  constructor(config: CollisionConfig) {
    this.config = config;
  }

  /**
   * Update collision cooldown timers each frame
   */
  update(dt: number): void {
    // Decay collision cooldowns
    for (const [key, cooldown] of Array.from(this.collisionCooldowns.entries())) {
      const newCooldown = cooldown - dt;
      if (newCooldown <= 0) {
        this.collisionCooldowns.delete(key);
      } else {
        this.collisionCooldowns.set(key, newCooldown);
      }
    }
  }

  /**
   * Resolve collisions between ships with realistic physics.
   * Uses iterative position correction and impulse-based velocity changes.
   */
  resolveShipCollisions(ships: Ship[]): void {
    const iterations = 2; // Multiple passes for better stability
    
    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let i = 0; i < ships.length; i++) {
        for (let j = i + 1; j < ships.length; j++) {
          this.resolveShipPairCollision(ships[i], ships[j]);
        }
      }
    }
  }

  /**
   * Handle collision between a specific pair of ships
   */
  private resolveShipPairCollision(shipA: Ship, shipB: Ship): void {
    // Skip ships that are fully sunk (ghost state)
    if ((shipA.isSinking && shipA.isFullySunk()) || (shipB.isSinking && shipB.isFullySunk())) {
      return;
    }

    // Calculate collision detection
    const dx = shipB.pos.x - shipA.pos.x;
    const dy = shipB.pos.y - shipA.pos.y;
    const distanceSquared = dx * dx + dy * dy;
    
    // Handle perfect overlap edge case
    if (distanceSquared <= 1e-6) {
      const nudgeAmount = 1;
      shipA.pos.x -= nudgeAmount;
      shipB.pos.x += nudgeAmount;
      return;
    }

    const radiusA = shipA.getCollisionRadius();
    const radiusB = shipB.getCollisionRadius();
    const radiusSum = radiusA + radiusB;
    
    // Check if ships are colliding
    if (distanceSquared >= radiusSum * radiusSum) {
      return; // No collision
    }

    // Calculate collision response
    const distance = Math.sqrt(distanceSquared);
    const normalX = dx / distance;
    const normalY = dy / distance;
    const penetration = radiusSum - distance;

    // Position correction - separate ships based on their mass
    const massA = shipA.getMass();
    const massB = shipB.getMass();
    const totalMass = massA + massB;
    const correctionA = penetration * (massB / totalMass) * 0.5;
    const correctionB = penetration * (massA / totalMass) * 0.5;

    shipA.pos.x -= normalX * correctionA;
    shipA.pos.y -= normalY * correctionA;
    shipB.pos.x += normalX * correctionB;
    shipB.pos.y += normalY * correctionB;

    // Velocity response - calculate impulse
    const relativeVelX = shipB.vel.x - shipA.vel.x;
    const relativeVelY = shipB.vel.y - shipA.vel.y;
    const relativeVelNormal = relativeVelX * normalX + relativeVelY * normalY;

    // Only resolve if ships are moving toward each other
    if (relativeVelNormal >= 0) {
      return;
    }

    // Calculate impulse magnitude
    const impulse = -(1 + this.config.restitution) * relativeVelNormal / (1/massA + 1/massB);
    
    // Apply impulse to velocities
    const impulseX = impulse * normalX;
    const impulseY = impulse * normalY;
    
    shipA.vel.x -= impulseX / massA;
    shipA.vel.y -= impulseY / massA;
    shipB.vel.x += impulseX / massB;
    shipB.vel.y += impulseY / massB;

    // Apply tangential friction for realistic scraping
    const tangentX = -normalY;
    const tangentY = normalX;
    const relativeTangent = relativeVelX * tangentX + relativeVelY * tangentY;
    const frictionImpulse = Math.max(-this.config.friction * impulse, 
                                   Math.min(this.config.friction * impulse, -relativeTangent / (1/massA + 1/massB)));
    
    const frictionX = frictionImpulse * tangentX;
    const frictionY = frictionImpulse * tangentY;
    
    shipA.vel.x -= frictionX / massA;
    shipA.vel.y -= frictionY / massA;
    shipB.vel.x += frictionX / massB;
    shipB.vel.y += frictionY / massB;

    // Small angular velocity change from tangential collision
    shipA.angVel -= relativeTangent * 0.0008;
    shipB.angVel += relativeTangent * 0.0008;

    // Apply ramming damage with cooldown
    this.applyRammingDamage(shipA, shipB, Math.sqrt(relativeVelX * relativeVelX + relativeVelY * relativeVelY), normalX, normalY);
  }

  /**
   * Apply ramming damage based on collision characteristics
   */
  private applyRammingDamage(shipA: Ship, shipB: Ship, relativeSpeed: number, normalX: number, normalY: number): void {
    // Generate unique key for this ship pair
    const key = `${Math.min(shipA.id, shipB.id)}|${Math.max(shipA.id, shipB.id)}`;
    
    // Check if collision is still on cooldown
    if (this.collisionCooldowns.has(key)) {
      return;
    }

    // Determine collision type (bow vs side)
    const forwardA = shipA.forwardVec();
    const forwardB = shipB.forwardVec();
    
    // Check if each ship is hitting with its bow (front)
    const dotA = forwardA.x * normalX + forwardA.y * normalY; // A pointing toward B
    const dotB = forwardB.x * (-normalX) + forwardB.y * (-normalY); // B pointing toward A
    const bowThreshold = 0.7; // cos(~45 degrees)
    
    const shipABowHit = dotA > bowThreshold;
    const shipBBowHit = dotB > bowThreshold;

    let damageA = 0;
    let damageB = 0;

    if (shipABowHit !== shipBBowHit) {
      // One ship ramming with bow, one taking it on the side
      const baseDamage = Math.max(20, relativeSpeed * 0.67);
      if (shipABowHit) {
        damageB = baseDamage;        // B takes full ramming damage
        damageA = baseDamage / 3;    // A takes some damage from impact
      } else {
        damageA = baseDamage;        // A takes full ramming damage
        damageB = baseDamage / 3;    // B takes some damage from impact
      }
    } else {
      // Either both bow-to-bow or both side-to-side collision
      const baseDamage = relativeSpeed * 0.25;
      damageA = damageB = baseDamage;
    }

    // Apply the damage
    const previousHealthA = shipA.health;
    const previousHealthB = shipB.health;
    
    shipA.takeDamage(damageA);
    shipB.takeDamage(damageB);

    // Start sinking if health reaches zero
    if (shipA.health <= 0 && !shipA.isSinking) {
      shipA.startSinking();
    }
    if (shipB.health <= 0 && !shipB.isSinking) {
      shipB.startSinking();
    }

    // Set cooldown to prevent rapid repeated damage
    this.collisionCooldowns.set(key, this.config.damageCooldown);
  }

  /**
   * Check and handle projectile-to-ship collisions
   * Returns information about collisions for game logic (XP, effects, etc.)
   * Note: This method modifies the projectiles array by removing collided projectiles
   */
  checkProjectileHits(projectiles: Projectile[], ships: Ship[]): CollisionResult[] {
    const results: CollisionResult[] = [];

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      
      for (const ship of ships) {
        // Skip if projectile came from this ship
        if (projectile.owner === ship) continue;
        
        // Skip fully sunk ships (they're essentially ghosts)
        if (ship.isSinking && ship.isFullySunk()) continue;
        
        // Check for collision using ship's precise hull detection
        if (ship.hitsCircle(projectile.pos, projectile.radius)) {
          const previousHealth = ship.health;
          ship.takeDamage(projectile.damage);
          
          // Accelerate sinking if ship is already sinking
          if (ship.isSinking) {
            ship.sinkTimer = Math.min(ship.sinkDuration, ship.sinkTimer + 1);
          }
          
          // Start sinking if health reaches zero
          if (ship.health <= 0 && !ship.isSinking) {
            ship.startSinking();
          }

          // Record the collision result
          results.push({
            projectile,
            ship,
            damage: projectile.damage,
            wasKilled: previousHealth > 0 && ship.health <= 0,
            projectileIndex: i
          });

          // Remove the projectile
          projectiles.splice(i, 1);
          break; // One projectile can only hit one ship
        }
      }
    }

    return results;
  }
}

/**
 * Result of a projectile hitting a ship
 */
export interface CollisionResult {
  readonly projectile: Projectile;
  readonly ship: Ship;
  readonly damage: number;
  readonly wasKilled: boolean;     // Whether this hit killed the ship
  readonly projectileIndex: number; // For removing from array
}