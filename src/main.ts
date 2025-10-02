import { Assets } from './core/assets';
import { loadCannonSound, loadHitSound, loadPlayerHitSound, loadShipSinkingSound, loadTorpedoSounds, playShipSinkingSound, playTorpedoLaunchSound, playTorpedoLoadSound, setPlayerPosition } from './core/audio';
import * as Constants from './core/constants';
import { Input } from './core/input';
import { Vec2 } from './core/vector';
import { AIShip } from './game/ai-ship';
import { CapitalShip } from './game/capital-ship';
import { Projectile } from './game/projectile';
import { Ship } from './game/ship';
import { Torpedo } from './game/torpedo';

// =========================
// Game Configuration Constants
// =========================

// World bounds reference (defined in constants)
const WORLD = Constants.WORLD_BOUNDS;

// Torpedo constants (for backward compatibility with HUD display)
const TORPEDO_ARMING_S = Constants.TORPEDO_ARMING_S;
const TORPEDO_RELOAD_S = Constants.TORPEDO_RELOAD_S;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const DPR = window.devicePixelRatio || 1;

function resize() {
  const w = Math.floor(window.innerWidth);
  const h = Math.floor(window.innerHeight);
  canvas.width = Math.floor(w * DPR);
  canvas.height = Math.floor(h * DPR);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const input = new Input();

// Game state
let player!: Ship;
const enemies: Ship[] = [];
const ships: Ship[] = [];
const projectiles: Projectile[] = [];
const camera = new Vec2(0, 0);
let shipSpriteRef: HTMLImageElement | undefined;
// Removed respawn timer and label - game over screen shows immediately on death
const collisionCooldown = new Map<string, number>();
type Treasure = { pos: Vec2; collected: boolean; size: 'normal' | 'large'; xpValue: number };
const treasures: Treasure[] = [];
let upgradeOverlayOpen = false;
let upgradeOverlayEl: HTMLDivElement | null = null;
let startScreenOpen = true;
let startScreenEl: HTMLDivElement | null = null;
let gameOverScreenOpen = false;
let gameOverScreenEl: HTMLDivElement | null = null;
let collectLabelEl: HTMLDivElement | null = null;
let playerXP = 400; // Starting XP for ship customization
let totalXP = 400; // Total XP ever earned (never decreases)
// Upgrade XP costs (initialized from constants)
let costRepairXP = Constants.XP_UPGRADE_BASE_COST;
let costReinforceXP = Constants.XP_UPGRADE_BASE_COST;
let costCannonsXP = Constants.XP_UPGRADE_BASE_COST;
let costTorpedoXP = Constants.XP_TORPEDO_COST;
// Healing over time (shop)
let healJobs: { remaining: number; perSec: number }[] = [];
// Torpedo state
type TorpedoTube = { cooldown: number; arming: number };
let torpedoTubes: TorpedoTube[] = [];

// Game statistics tracking
let gameStats = {
  cannonShotsFired: 0,
  cannonHits: 0,
  torpedoShotsFired: 0,
  torpedoHits: 0,
  shipsSunk: {
    regular: 0,
    capital: 0
  }
};

// Stat tracking functions
(window as any).trackCannonShot = () => gameStats.cannonShotsFired++;
(window as any).trackCannonHit = () => gameStats.cannonHits++;
(window as any).trackTorpedoShot = () => gameStats.torpedoShotsFired++;
(window as any).trackTorpedoHit = () => gameStats.torpedoHits++;
(window as any).trackShipSunk = (isCapital: boolean) => {
  if (isCapital) {
    gameStats.shipsSunk.capital++;
  } else {
    gameStats.shipsSunk.regular++;
  }
};

// World bounds (finite map) - now defined above

// Helper function to decide ship type based on rarity
function shouldSpawnCapitalShip(chance: number = 0.15): boolean {
  // Default 15% chance, but can be overridden for respawns (20%)
  return Math.random() < chance;
}

// Create AI ship or capital ship based on rarity
function createAIShip(player: Ship, sprite?: HTMLImageElement, capitalChance: number = 0.15): AIShip {
  if (shouldSpawnCapitalShip(capitalChance)) {
    return new CapitalShip(player, { sprite });
  } else {
    return new AIShip(player, { ship: { length: Constants.AI_LENGTH_PX, width: Constants.AI_WIDTH_PX, cannonPairs: Constants.AI_CANNON_PAIRS }, sprite });
  }
}

// Initialize audio system and load sounds
loadCannonSound().catch(err => console.warn('Audio initialization failed:', err));
loadHitSound().catch(err => console.warn('Hit sound initialization failed:', err));
loadPlayerHitSound().catch(err => console.warn('Player hit sound initialization failed:', err));
loadTorpedoSounds().catch(err => console.warn('Torpedo sound initialization failed:', err));
loadShipSinkingSound().catch(err => console.warn('Ship sinking sound initialization failed:', err));

// Try to load webp sprite; fallback to hull drawing
Assets.loadImage('/ship.webp').then(img => initGame(img)).catch(() => initGame());

// Create ships for initial spawn ensuring exactly 2 capital ships
function createInitialShips(player: Ship, totalShips: number, sprite?: HTMLImageElement): AIShip[] {
  const ships: AIShip[] = [];
  let capitalShipsCreated = 0;
  const targetCapitalShips = 2;

  for (let i = 0; i < totalShips; i++) {
    // Force capital ship creation if we haven't reached the target yet
    const forceCapital = capitalShipsCreated < targetCapitalShips && i >= totalShips - (targetCapitalShips - capitalShipsCreated);

    let ship: AIShip;
    if (forceCapital) {
      ship = new CapitalShip(player, { sprite });
      capitalShipsCreated++;
    } else {
      ship = new AIShip(player, { ship: { length: Constants.AI_LENGTH_PX, width: Constants.AI_WIDTH_PX, cannonPairs: Constants.AI_CANNON_PAIRS }, sprite });
    }

    ships.push(ship);
  }

  return ships;
}

// Helper function to check if a position is too close to existing ships
function isPositionValid(pos: Vec2, existingShips: Ship[], minDistance: number): boolean {
  for (const ship of existingShips) {
    const distance = Vec2.sub(pos, ship.pos).len();
    if (distance < minDistance) {
      return false;
    }
  }
  return true;
}

// Simplified random spawning with collision avoidance
function spawnAIShipRandom(player: Ship, existingShips: Ship[], sprite?: HTMLImageElement, capitalChance: number = 0.15): AIShip {
  const s = createAIShip(player, sprite, capitalChance);

  // Only apply regular AI stats if it's not a capital ship
  if (!(s instanceof CapitalShip)) {
    s.maxHealth = Constants.AI_MAX_HEALTH;
    s.health = s.maxHealth;
    s.maxSpeed = Constants.AI_MAX_SPEED;
    s.thrust = Constants.AI_THRUST;
    s.reverseThrust = Constants.AI_REVERSE_THRUST;
    s.turnAccel = Constants.AI_TURN_ACCEL;
    s.rudderRate = Constants.AI_RUDDER_RATE;
    s.linDrag = Constants.AI_LINEAR_DRAG;
    s.angDrag = Constants.AI_ANGULAR_DRAG;
  }

  // Minimum distance between ships and from player
  const minShipDistance = 200; // Minimum distance between any two ships
  const minPlayerDistance = 400; // Minimum distance from player

  // Try up to 50 times to find a valid position
  for (let attempts = 0; attempts < 50; attempts++) {
    // Random position within world bounds, with some margin from edges
    const margin = 300;
    const x = WORLD.minX + margin + Math.random() * (WORLD.maxX - WORLD.minX - 2 * margin);
    const y = WORLD.minY + margin + Math.random() * (WORLD.maxY - WORLD.minY - 2 * margin);

    const testPos = new Vec2(x, y);

    // Check if position is valid (not too close to existing ships or player)
    if (isPositionValid(testPos, existingShips, minShipDistance) &&
      isPositionValid(testPos, [player], minPlayerDistance)) {

      s.pos.set(x, y);

      // Random initial facing direction
      s.angle = Math.random() * Math.PI * 2;

      return s;
    }
  }

  // Fallback: if we can't find a valid position, just place it somewhere
  const fallbackX = WORLD.minX + 100 + Math.random() * (WORLD.maxX - WORLD.minX - 200);
  const fallbackY = WORLD.minY + 100 + Math.random() * (WORLD.maxY - WORLD.minY - 200);
  s.pos.set(fallbackX, fallbackY);
  s.angle = Math.random() * Math.PI * 2;

  return s;
}

// New edge spawning function for ships that spawn when others are killed
function spawnShipAtEdge(player: Ship, existingShips: Ship[], sprite?: HTMLImageElement): AIShip {
  const s = createAIShip(player, sprite, 0.20); // 20% chance for capital ships on respawn

  // Only apply regular AI stats if it's not a capital ship
  if (!(s instanceof CapitalShip)) {
    s.maxHealth = Constants.AI_MAX_HEALTH;
    s.health = s.maxHealth;
    s.maxSpeed = Constants.AI_MAX_SPEED;
    s.thrust = Constants.AI_THRUST;
    s.reverseThrust = Constants.AI_REVERSE_THRUST;
    s.turnAccel = Constants.AI_TURN_ACCEL;
    s.rudderRate = Constants.AI_RUDDER_RATE;
    s.linDrag = Constants.AI_LINEAR_DRAG;
    s.angDrag = Constants.AI_ANGULAR_DRAG;
  }

  // Choose random edge to spawn from (0=top, 1=right, 2=bottom, 3=left)
  const edge = Math.floor(Math.random() * 4);
  let spawnX: number, spawnY: number;
  const edgeMargin = 2000; // At least 2000 units from the edge
  const worldMargin = 300; // Safety margin from world bounds

  switch (edge) {
    case 0: // Top edge
      spawnX = WORLD.minX + worldMargin + Math.random() * (WORLD.maxX - WORLD.minX - 2 * worldMargin);
      spawnY = WORLD.minY + edgeMargin;
      break;
    case 1: // Right edge
      spawnX = WORLD.maxX - edgeMargin;
      spawnY = WORLD.minY + worldMargin + Math.random() * (WORLD.maxY - WORLD.minY - 2 * worldMargin);
      break;
    case 2: // Bottom edge
      spawnX = WORLD.minX + worldMargin + Math.random() * (WORLD.maxX - WORLD.minX - 2 * worldMargin);
      spawnY = WORLD.maxY - edgeMargin;
      break;
    case 3: // Left edge
    default:
      spawnX = WORLD.minX + edgeMargin;
      spawnY = WORLD.minY + worldMargin + Math.random() * (WORLD.maxY - WORLD.minY - 2 * worldMargin);
      break;
  }

  s.pos.set(spawnX, spawnY);

  // Choose a random destination point that's also at least 2000 units from all edges
  const destMargin = 2000;
  const destX = WORLD.minX + destMargin + Math.random() * (WORLD.maxX - WORLD.minX - 2 * destMargin);
  const destY = WORLD.minY + destMargin + Math.random() * (WORLD.maxY - WORLD.minY - 2 * destMargin);

  // Set up travel mode towards the destination
  if (s instanceof AIShip) {
    s.setTravelTarget(new Vec2(destX, destY));
  }

  // Give initial velocity towards the destination
  const toDest = new Vec2(destX - spawnX, destY - spawnY);
  const initialSpeed = 50 + Math.random() * 50; // 50-100 units/sec
  const dir = toDest.clone().normalize();
  s.vel.set(dir.x * initialSpeed, dir.y * initialSpeed);

  return s;
}

function getViewportBounds(camera: Vec2, canvasWidth: number, canvasHeight: number) {
  const w = canvasWidth / DPR;
  const h = canvasHeight / DPR;
  return {
    left: camera.x - w / 2,
    right: camera.x + w / 2,
    top: camera.y - h / 2,
    bottom: camera.y + h / 2,
  };
}


function initGame(sprite?: HTMLImageElement) {
  shipSpriteRef = sprite;

  // Clear all existing ships to ensure clean state
  ships.length = 0;
  player = new Ship({
    length: Constants.PLAYER_LENGTH_PX,
    width: Constants.PLAYER_WIDTH_PX,
    cannonPairs: Constants.PLAYER_CANNON_PAIRS
  }, sprite);
  player.isPlayer = true;
  player.maxHealth = Constants.PLAYER_MAX_HEALTH;
  player.health = player.maxHealth;
  // Player physics tuning
  player.maxSpeed = Constants.PLAYER_MAX_SPEED;
  player.thrust = Constants.PLAYER_THRUST;
  player.reverseThrust = Constants.PLAYER_REVERSE_THRUST;
  player.turnAccel = Constants.PLAYER_TURN_ACCEL;
  player.rudderRate = Constants.PLAYER_RUDDER_RATE;
  player.linDrag = Constants.PLAYER_LINEAR_DRAG;
  player.angDrag = Constants.PLAYER_ANGULAR_DRAG;
  ships.push(player);
  setupCannonHud(player);
  setupMetricsHud();
  setupScoreHud();
  setupShopNotification();
  setupTorpedoNotification();

  // Spawn AI ships with exactly 2 capital ships for initial spawn (all at edges)
  const totalShips = Constants.AI_TOTAL_STARTING_SHIPS;

  // Create ships ensuring exactly 2 capital ships
  const initialShips = createInitialShips(player, totalShips, sprite);

  for (const s of initialShips) {
    // Apply stats for regular AI ships (capital ships use their own stats)
    if (!(s instanceof CapitalShip)) {
      s.maxHealth = Constants.AI_MAX_HEALTH;
      s.health = s.maxHealth;
      s.maxSpeed = Constants.AI_MAX_SPEED;
      s.thrust = Constants.AI_THRUST;
      s.reverseThrust = Constants.AI_REVERSE_THRUST;
      s.turnAccel = Constants.AI_TURN_ACCEL;
      s.rudderRate = Constants.AI_RUDDER_RATE;
      s.linDrag = Constants.AI_LINEAR_DRAG;
      s.angDrag = Constants.AI_ANGULAR_DRAG;
    }

    // Find a valid edge spawn position with collision avoidance
    const minShipDistance = 200;
    const minPlayerDistance = 400;

    for (let attempts = 0; attempts < 50; attempts++) {
      // Choose random edge to spawn from (0=top, 1=right, 2=bottom, 3=left)
      const edge = Math.floor(Math.random() * 4);
      let spawnX: number, spawnY: number;
      const edgeMargin = 2000; // At least 2000 units from the edge
      const worldMargin = 300; // Safety margin from world bounds

      switch (edge) {
        case 0: // Top edge
          spawnX = WORLD.minX + worldMargin + Math.random() * (WORLD.maxX - WORLD.minX - 2 * worldMargin);
          spawnY = WORLD.minY + edgeMargin;
          break;
        case 1: // Right edge
          spawnX = WORLD.maxX - edgeMargin;
          spawnY = WORLD.minY + worldMargin + Math.random() * (WORLD.maxY - WORLD.minY - 2 * worldMargin);
          break;
        case 2: // Bottom edge
          spawnX = WORLD.minX + worldMargin + Math.random() * (WORLD.maxX - WORLD.minX - 2 * worldMargin);
          spawnY = WORLD.maxY - edgeMargin;
          break;
        case 3: // Left edge
        default:
          spawnX = WORLD.minX + edgeMargin;
          spawnY = WORLD.minY + worldMargin + Math.random() * (WORLD.maxY - WORLD.minY - 2 * worldMargin);
          break;
      }

      const testPos = new Vec2(spawnX, spawnY);

      // Check if position is valid (not too close to existing ships or player)
      let valid = true;
      for (const existingShip of ships) {
        if (Vec2.sub(testPos, existingShip.pos).len() < minShipDistance) {
          valid = false;
          break;
        }
      }
      if (!valid || Vec2.sub(testPos, player.pos).len() < minPlayerDistance) {
        continue;
      }

      s.pos.set(spawnX, spawnY);

      // Choose a random destination point that's also at least 2000 units from all edges
      const destMargin = 2000;
      const destX = WORLD.minX + destMargin + Math.random() * (WORLD.maxX - WORLD.minX - 2 * destMargin);
      const destY = WORLD.minY + destMargin + Math.random() * (WORLD.maxY - WORLD.minY - 2 * destMargin);

      // Set up travel mode towards the destination
      if (s instanceof AIShip) {
        s.setTravelTarget(new Vec2(destX, destY));
      }

      // Give initial velocity towards the destination
      const toDest = new Vec2(destX - spawnX, destY - spawnY);
      const initialSpeed = 50 + Math.random() * 50; // 50-100 units/sec
      const dir = toDest.clone().normalize();
      s.vel.set(dir.x * initialSpeed, dir.y * initialSpeed);

      ships.push(s);
      enemies.push(s);
      break;
    }
  }

  // Show start screen
  openStartScreen();
}

// Simple ocean background
function drawOcean(w: number, h: number, cam: Vec2, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0b355f');
  g.addColorStop(1, '#0a2744');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Fixed world-space grid (constant, doesn't move with camera)
  const gridSize = Constants.GRID_SIZE_WORLD_UNITS;
  const majorEvery = Constants.GRID_MAJOR_LINE_EVERY;

  ctx.save();

  // Calculate the range of grid lines visible in the current viewport
  const leftWorld = cam.x - w / 2;
  const rightWorld = cam.x + w / 2;
  const topWorld = cam.y - h / 2;
  const bottomWorld = cam.y + h / 2;

  // Find the first grid line to the left/top of the viewport
  const firstGridX = Math.floor(leftWorld / gridSize) * gridSize;
  const firstGridY = Math.floor(topWorld / gridSize) * gridSize;

  // Draw vertical grid lines (with performance optimization)
  let verticalLinesDrawn = 0;
  const maxLines = 50; // Safety limit to prevent performance issues

  for (let wx = firstGridX; wx <= rightWorld + gridSize && verticalLinesDrawn < maxLines; wx += gridSize) {
    const sx = wx - cam.x + w / 2;

    // Skip if line is outside viewport bounds (with some margin)
    if (sx < -50 || sx > w + 50) continue;

    // Calculate grid index for major/minor line determination
    const gridIndex = Math.abs(Math.round(wx / gridSize));
    const isMajor = gridIndex % majorEvery === 0;

    ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
    ctx.stroke();
    verticalLinesDrawn++;
  }

  // Draw horizontal grid lines (with performance optimization)
  let horizontalLinesDrawn = 0;
  for (let wy = firstGridY; wy <= bottomWorld + gridSize && horizontalLinesDrawn < maxLines; wy += gridSize) {
    const sy = wy - cam.y + h / 2;

    // Skip if line is outside viewport bounds (with some margin)
    if (sy < -50 || sy > h + 50) continue;

    // Calculate grid index for major/minor line determination
    const gridIndex = Math.abs(Math.round(wy / gridSize));
    const isMajor = gridIndex % majorEvery === 0;

    ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
    ctx.stroke();
    horizontalLinesDrawn++;
  }

  ctx.restore();
}

let last = performance.now();
let speedupMode = false;
function loop(now: number) {
  requestAnimationFrame(loop);
  const dtRaw = (now - last) / 1000;
  last = now;
  let dt = Math.min(0.033, dtRaw); // clamp for stability

  // Apply speedup multiplier when enabled
  if (speedupMode) {
    dt *= 2.0; // 2x speed
  }

  // Tick collision cooldowns
  if (collisionCooldown.size) {
    for (const [k, v] of Array.from(collisionCooldown.entries())) {
      const nv = v - dt;
      if (nv <= 0) collisionCooldown.delete(k); else collisionCooldown.set(k, nv);
    }
  }

  if (!player) return; // wait for init

  // Update (paused while shop, start screen, or game over screen is open)
  if (!upgradeOverlayOpen && !startScreenOpen && !gameOverScreenOpen) {
    player.update(dt, {
      up: input.isDown('ArrowUp'),
      down: input.isDown('ArrowDown'),
      left: input.isDown('ArrowLeft'),
      right: input.isDown('ArrowRight'),
      fire: input.isDown('Space'),
    }, projectiles);
    applyWorldBounds(player);

    // Update player position for distance-based audio
    setPlayerPosition(player.pos);

    // AI ships
    for (const s of enemies) {
      if (s instanceof AIShip) {
        s.updateAI(dt, projectiles, ships, WORLD);
      }
      applyWorldBounds(s);
    }

    // Ship-ship collisions (gentle bounce)
    resolveShipCollisions(ships, dt);

    // Remove ships that have fully sunk
    for (let i = ships.length - 1; i >= 0; i--) {
      const s = ships[i];
      if (s.isFullySunk()) {
        // Spawn a new ship when an enemy ship is killed (if not at max capacity)
        if (s !== player && enemies.length < Constants.MAX_ENEMIES_TOTAL) {
          const newShip = spawnShipAtEdge(player, ships, shipSpriteRef);
          ships.push(newShip);
          enemies.push(newShip);
        }

        ships.splice(i, 1);
        const ei = enemies.indexOf(s);
        if (ei >= 0) enemies.splice(ei, 1);
      }
    }

    // Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.update(dt);
      if (!p.alive) projectiles.splice(i, 1);
    }

    updateCannonHud(player);
    updateMetricsHud(player);
    updateScoreHud();
    updateShopNotification();
    updateTorpedoNotification();

    // Camera follows ship, with slight lead in velocity direction
    camera.x = player.pos.x + player.vel.x * Constants.CAMERA_VELOCITY_LEAD_FACTOR;
    camera.y = player.pos.y + player.vel.y * Constants.CAMERA_VELOCITY_LEAD_FACTOR;

    // Collisions: projectiles vs ships
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      // remove projectiles that leave the world
      if (p.pos.x < WORLD.minX || p.pos.x > WORLD.maxX || p.pos.y < WORLD.minY || p.pos.y > WORLD.maxY) {
        projectiles.splice(i, 1);
        continue;
      }
      for (let j = ships.length - 1; j >= 0; j--) {
        const s = ships[j];
        if (p.owner === s) continue;
        // Allow hitting ships even while sinking to block shots; skip only if fully sunk (removed/ghost)
        if (s.isSinking && s.isFullySunk()) continue;
        if (s.hitsCircle(p.pos, p.radius)) {
          const prev = s.health;
          s.takeDamage(p.damage, p.owner === player);
          if (p.owner === player) {
            addXP(p.damage * Constants.XP_DAMAGE_MULTIPLIER);
            // Track hit based on projectile type
            if (p instanceof Torpedo) {
              (window as any).trackTorpedoHit();
            } else {
              (window as any).trackCannonHit();
            }
          }
          // If already sinking, accelerate the sink by 1 second per hit
          if (s.isSinking) {
            s.sinkTimer = Math.min(s.sinkDuration, s.sinkTimer + 1);
          }
          // remove projectile immediately
          projectiles.splice(i, 1);
          i--;
          if (s.health <= 0 && !s.isSinking) {
            // Start sinking animation instead of removing immediately
            s.startSinking();
            // Play ship sinking sound
            playShipSinkingSound(s === player, s instanceof CapitalShip, s.pos);
            if (p.owner === player) {
              addXP(Constants.XP_SINK_BONUS); // sink bonus
              // Track ship sunk by player
              (window as any).trackShipSunk(s instanceof CapitalShip);
            }
            // If the player died, immediately show game over screen
            if (s === player) {
              openGameOverScreen();
            }
            // Spawn treasure only for capital ships (non-player)
            if (s !== player && s instanceof CapitalShip) {
              treasures.push({
                pos: s.pos.clone(),
                collected: false,
                size: 'large',
                xpValue: Constants.XP_TREASURE_LARGE
              });
            }
          }
          break;
        }
      }
    }

    // Auto-collect treasure when in pickup radius
    if (player && !player.isSinking) {
      for (const t of treasures) {
        if (!t.collected && player.hitsCircle(t.pos, Constants.TREASURE_PICKUP_RADIUS)) {
          t.collected = true;
          addXP(t.xpValue); // bonus for collecting treasure (varies by size)
        }
      }
    }

    // Apply healing-over-time jobs
    if (healJobs.length) {
      for (let i = healJobs.length - 1; i >= 0; i--) {
        const job = healJobs[i];
        if (player.health >= player.maxHealth) { healJobs.splice(i, 1); continue; }
        let delta = job.perSec * dt;
        const missing = player.maxHealth - player.health;
        if (delta > missing) delta = missing;
        if (delta > job.remaining) delta = job.remaining;
        if (delta > 0) {
          player.health += delta;
          job.remaining -= delta;
        }
        if (job.remaining <= 1e-6) healJobs.splice(i, 1);
      }
    }
  } else {
    // Still update HUD when paused
    updateCannonHud(player);
    updateMetricsHud(player);
    updateScoreHud();
    updateShopNotification();
    updateTorpedoNotification();
  }

  // Game over screen is triggered immediately when player dies, no respawn logic needed

  // Remove fully sunk ships (keep player for now)
  for (let i = ships.length - 1; i >= 0; i--) {
    const s = ships[i];
    if (s.isSinking && s.isFullySunk()) {
      // Spawn a new ship when an enemy ship is killed (if not at max capacity)
      if (s !== player && enemies.length < Constants.MAX_ENEMIES_TOTAL) {
        const newShip = spawnShipAtEdge(player, ships, shipSpriteRef);
        ships.push(newShip);
        enemies.push(newShip);
      }

      if (s !== player) {
        ships.splice(i, 1);
        const ei = enemies.indexOf(s);
        if (ei >= 0) enemies.splice(ei, 1);
      }
    }
  }

  // Draw
  const w = canvas.width / DPR;
  const h = canvas.height / DPR;
  drawOcean(w, h, camera, now / 1000);
  drawWorldBounds(w, h);

  // projectiles first (behind ships)
  for (const p of projectiles) p.draw(ctx, camera, w, h);
  for (const s of ships) s.draw(ctx, camera, w, h);
  drawTreasures(w, h);

  // HUD overlays
  drawMinimap(w, h);

  // Torpedo tubes (timers and launch). Only when not paused
  if (!upgradeOverlayOpen && torpedoTubes.length) {
    for (const tube of torpedoTubes) {
      if (tube.cooldown > 0) tube.cooldown -= dt;
      if (tube.arming > 0) {
        tube.arming -= dt;
        if (tube.arming <= 0) {
          const fwd = player.forwardVec();
          const spawn = new Vec2(
            player.pos.x + fwd.x * (player.length * 0.55),
            player.pos.y + fwd.y * (player.length * 0.55),
          );
          const vel = new Vec2(
            player.vel.x + fwd.x * Constants.TORPEDO_SPEED,
            player.vel.y + fwd.y * Constants.TORPEDO_SPEED,
          );
          projectiles.push(new Torpedo(spawn, vel, player));
          (window as any).trackTorpedoShot(); // Track torpedo shot

          // Track first torpedo launch for notification
          if (!hasLaunchedTorpedo) {
            hasLaunchedTorpedo = true;
            updateTorpedoNotification();
          }

          playTorpedoLaunchSound(); // Play launch sound when torpedo actually fires
          tube.cooldown = Constants.TORPEDO_RELOAD_S;
          tube.arming = 0;
        }
      }
    }
    if (input.wasPressed('KeyT')) {
      const ready = torpedoTubes.find(t => t.cooldown <= 0 && t.arming <= 0);
      if (ready) {
        ready.arming = Constants.TORPEDO_ARMING_S;
        playTorpedoLoadSound(); // Play load sound when commanding torpedo fire
      }
    }
  }

  // Upgrade overlay keyboard shortcuts (1/2/3/4) and close (Esc/S)
  if (upgradeOverlayOpen) {
    if (input.wasPressed('Digit1') || input.wasPressed('Numpad1')) {
      applyUpgradeRepair();
    } else if (input.wasPressed('Digit2') || input.wasPressed('Numpad2')) {
      applyUpgradeReinforce();
    } else if (input.wasPressed('Digit3') || input.wasPressed('Numpad3')) {
      applyUpgradeAddCannons();
    } else if (input.wasPressed('Digit4') || input.wasPressed('Numpad4')) {
      applyUpgradeTorpedo();
    } else if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
      closeUpgradeOverlay();
    }
  }

  // Close start screen with any key press
  if (startScreenOpen && (input.wasPressed('KeyP') || input.wasPressed('Space') || input.wasPressed('ArrowUp') || input.wasPressed('ArrowDown') || input.wasPressed('ArrowLeft') || input.wasPressed('ArrowRight') || input.wasPressed('KeyT'))) {
    closeStartScreen();
  }

  // Open shop with P (always allowed); close handled above when open
  if (!upgradeOverlayOpen && input.wasPressed('KeyP')) {
    openUpgradeOverlay();
  }

  // Toggle speedup mode with S (always allowed)
  if (input.wasPressed('KeyS')) {
    speedupMode = !speedupMode;
  }

  // Auto-collect treasure when in pickup radius
  if (player && !player.isSinking) {
    for (const t of treasures) {
      if (!t.collected && player.hitsCircle(t.pos, Constants.TREASURE_PICKUP_RADIUS)) {
        t.collected = true;
        addXP(t.xpValue); // bonus for collecting treasure (varies by size)
      }
    }
  }

  // Clear per-frame pressed keys at the very end
  input.updateFrame();
}
requestAnimationFrame(loop);

// HUD cannon indicators
let portDots: HTMLSpanElement[] = [];
let starboardDots: HTMLSpanElement[] = [];
let torpedoDots: HTMLSpanElement[] = [];
let metricsEl: HTMLDivElement | null = null;

// Score display (top right)
let scoreEl: HTMLDivElement | null = null;

// Shop notification (bottom left)
let shopNotificationEl: HTMLDivElement | null = null;
let shopNotificationDismissed = false;

// Torpedo notification
let torpedoNotificationEl: HTMLDivElement | null = null;
let torpedoNotificationDismissed = false;
let hasLaunchedTorpedo = false;

function setupCannonHud(s: Ship) {
  const hud = document.getElementById('hud')!;
  const portContainer = hud.querySelector('.dots.port') as HTMLDivElement;
  const starboardContainer = hud.querySelector('.dots.starboard') as HTMLDivElement;
  const torpedoContainer = hud.querySelector('.dots.torpedo') as HTMLDivElement;
  portContainer.innerHTML = '';
  starboardContainer.innerHTML = '';
  if (torpedoContainer) torpedoContainer.innerHTML = '';
  // Count per side based on offsets
  const portCount = s.cannons.filter(c => c.side === 'port').length;
  const starboardCount = s.cannons.filter(c => c.side === 'starboard').length;
  portDots = []; starboardDots = []; torpedoDots = [];
  for (let i = 0; i < portCount; i++) {
    const dot = document.createElement('span'); dot.className = 'dot';
    portContainer.appendChild(dot); portDots.push(dot);
  }
  for (let i = 0; i < starboardCount; i++) {
    const dot = document.createElement('span'); dot.className = 'dot';
    starboardContainer.appendChild(dot); starboardDots.push(dot);
  }
  // Torpedo tubes
  if (torpedoContainer) {
    const count = torpedoTubes.length;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('span'); dot.className = 'dot';
      torpedoContainer.appendChild(dot); torpedoDots.push(dot);
    }
  }
}

function updateCannonHud(s: Ship) {
  if (!portDots.length || !starboardDots.length) return;
  // Build arrays per side in cannon order along hull
  const port = s.cannons.filter(c => c.side === 'port');
  const star = s.cannons.filter(c => c.side === 'starboard');
  for (let i = 0; i < portDots.length; i++) {
    const c = port[i]; const dot = portDots[i];
    const ready = c && c.cooldown <= 0;
    dot.classList.toggle('ready', !!ready);
    if (!ready && c) {
      const prog = 1 - (c.cooldown / c.reloadTime);
      dot.style.background = `conic-gradient(#f59e0b ${Math.max(0, Math.min(1, prog)) * 360}deg, rgba(255,255,255,0.08) 0)`;
    } else {
      dot.style.background = '';
    }
  }
  for (let i = 0; i < starboardDots.length; i++) {
    const c = star[i]; const dot = starboardDots[i];
    const ready = c && c.cooldown <= 0;
    dot.classList.toggle('ready', !!ready);
    if (!ready && c) {
      const prog = 1 - (c.cooldown / c.reloadTime);
      dot.style.background = `conic-gradient(#f59e0b ${Math.max(0, Math.min(1, prog)) * 360}deg, rgba(255,255,255,0.08) 0)`;
    } else {
      dot.style.background = '';
    }
  }
  // Torpedoes
  if (torpedoDots.length && torpedoTubes.length) {
    for (let i = 0; i < torpedoDots.length; i++) {
      const tube = torpedoTubes[i];
      const dot = torpedoDots[i];
      if (!tube) continue;
      const ready = tube.cooldown <= 0 && tube.arming <= 0;
      dot.classList.toggle('ready', !!ready);
      if (!ready) {
        let total = tube.arming > 0 ? TORPEDO_ARMING_S : TORPEDO_RELOAD_S;
        let remaining = tube.arming > 0 ? tube.arming : tube.cooldown;
        const prog = 1 - (remaining / total);
        dot.style.background = `conic-gradient(#60a5fa ${Math.max(0, Math.min(1, prog)) * 360}deg, rgba(255,255,255,0.08) 0)`;
      } else {
        dot.style.background = '';
      }
    }
  }
}

// Metrics HUD (position and speed)
function setupMetricsHud() {
  const hud = document.getElementById('hud')!;
  if (!metricsEl) {
    metricsEl = document.createElement('div');
    metricsEl.id = 'metrics';
    metricsEl.style.marginTop = '8px';
    metricsEl.style.fontSize = '12px';
    metricsEl.style.opacity = '0.9';
    metricsEl.style.whiteSpace = 'pre';
    hud.appendChild(metricsEl);
  }
}

function updateMetricsHud(s: Ship) {
  if (!metricsEl) return;
  const x = Math.round(s.pos.x);
  const y = Math.round(s.pos.y);
  const speed = Math.round(s.vel.len());
  const xp = Math.floor(playerXP);
  metricsEl.textContent = `Pos: (${x}, ${y})\nSpeed: ${speed} px/s\nXP: ${xp}`;
}

// Score display (top right)
function setupScoreHud() {
  if (!scoreEl) {
    scoreEl = document.getElementById('score') as HTMLDivElement;
  }
}

function updateScoreHud() {
  if (!scoreEl) return;

  const smallShips = gameStats.shipsSunk.regular;
  const capitalShips = gameStats.shipsSunk.capital;
  const displayTotalXP = Math.floor(totalXP);

  scoreEl.innerHTML = `
    <div class="stat"><span class="label">Small Ships:</span><span class="value">${smallShips}</span></div>
    <div class="stat"><span class="label">Capital Ships:</span><span class="value">${capitalShips}</span></div>
    <div class="stat"><span class="label">Total XP:</span><span class="value">${displayTotalXP}</span></div>
  `;
}

// Shop notification (bottom left)
function setupShopNotification() {
  if (!shopNotificationEl) {
    shopNotificationEl = document.getElementById('shop-notification') as HTMLDivElement;

    // Add click handler to open shop
    shopNotificationEl.addEventListener('click', (e) => {
      // Don't trigger if clicking the close button
      if (!(e.target as HTMLElement).classList.contains('notification-close')) {
        openUpgradeOverlay();
        shopNotificationDismissed = true;
        updateShopNotification();
      }
    });

    // Add close button handler
    const closeButton = shopNotificationEl.querySelector('.notification-close') as HTMLButtonElement;
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        shopNotificationDismissed = true;
        updateShopNotification();
      });
    }
  }
}

function updateShopNotification() {
  if (!shopNotificationEl) return;

  // Hide permanently if dismissed or shop has been opened
  if (shopNotificationDismissed) {
    shopNotificationEl.style.display = 'none';
    return;
  }

  const canAfford = canAffordAnyUpgrade();
  shopNotificationEl.style.display = canAfford ? 'block' : 'none';
}

// Torpedo notification
function setupTorpedoNotification() {
  if (!torpedoNotificationEl) {
    torpedoNotificationEl = document.getElementById('torpedo-notification') as HTMLDivElement;

    // Add click handler to dismiss
    torpedoNotificationEl.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).classList.contains('notification-close')) {
        torpedoNotificationDismissed = true;
        updateTorpedoNotification();
      }
    });

    // Add close button handler
    const closeButton = torpedoNotificationEl.querySelector('.notification-close') as HTMLButtonElement;
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        torpedoNotificationDismissed = true;
        updateTorpedoNotification();
      });
    }
  }
}

function updateTorpedoNotification() {
  if (!torpedoNotificationEl) return;

  // Hide permanently if dismissed or torpedo has been launched
  if (torpedoNotificationDismissed || hasLaunchedTorpedo) {
    torpedoNotificationEl.style.display = 'none';
    return;
  }

  // Show if player has torpedoes available but hasn't launched any
  const hasTorpedoes = torpedoTubes.length > 0;
  torpedoNotificationEl.style.display = hasTorpedoes ? 'block' : 'none';
}

// Removed respawn label functions - game over screen shows immediately on death

function openUpgradeOverlay() {
  // Mark shop notification as dismissed since shop is now opened
  shopNotificationDismissed = true;
  updateShopNotification();

  if (!upgradeOverlayEl) {
    const hud = document.getElementById('hud')!;
    upgradeOverlayEl = document.createElement('div');
    upgradeOverlayEl.id = 'upgrade-overlay';
    Object.assign(upgradeOverlayEl.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,255,255,0.35)',
      padding: '16px',
      borderRadius: '10px',
      color: '#e6f0ff',
      zIndex: '1000',
      minWidth: '320px',
      textAlign: 'left',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
    } as CSSStyleDeclaration);
    hud.appendChild(upgradeOverlayEl);
  }
  // Rebuild contents each time to refresh costs and availability
  upgradeOverlayEl.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = `Shop — XP: ${Math.floor(playerXP)}`;
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  upgradeOverlayEl.appendChild(title);
  const list = document.createElement('div');
  Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '8px' } as CSSStyleDeclaration);
  upgradeOverlayEl.appendChild(list);
  const mkBtn = (label: string, enabled: boolean, onClick: () => void) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: '8px 10px',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.4)',
      background: enabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)',
      color: enabled ? '#e6f0ff' : 'rgba(230,240,255,0.5)',
      cursor: enabled ? 'pointer' : 'not-allowed',
    } as CSSStyleDeclaration);
    if (enabled) btn.addEventListener('click', () => { onClick(); });
    list.appendChild(btn);
  };
  mkBtn(`1) Repair ship (+50% max) — ${Math.ceil(costRepairXP)} XP`, playerXP >= costRepairXP, applyUpgradeRepair);
  mkBtn(`2) Reinforce hull (+30 max & current) — ${Math.ceil(costReinforceXP)} XP`, playerXP >= costReinforceXP, applyUpgradeReinforce);
  mkBtn(`3) Add cannons (+1 per side) — ${Math.ceil(costCannonsXP)} XP`, playerXP >= costCannonsXP, applyUpgradeAddCannons);
  const torpLabel = torpedoTubes.length >= 4 ? '4) Torpedo tube — Max 4' : `4) Torpedo tube (press T) — ${Math.ceil(costTorpedoXP)} XP (Owned ${torpedoTubes.length}/4)`;
  mkBtn(torpLabel, torpedoTubes.length < 4 && playerXP >= costTorpedoXP, applyUpgradeTorpedo);
  const hint = document.createElement('div');
  hint.textContent = 'Tip: press 1 / 2 / 3 / 4 to choose';
  hint.style.opacity = '0.8';
  hint.style.marginTop = '8px';
  hint.style.fontSize = '12px';
  upgradeOverlayEl.appendChild(hint);
  upgradeOverlayOpen = true;
  upgradeOverlayEl.style.display = 'block';
}

function closeUpgradeOverlay() {
  upgradeOverlayOpen = false;
  if (upgradeOverlayEl) upgradeOverlayEl.style.display = 'none';
}

// Start screen upgrade functions (modified versions for start screen)
function applyStartUpgradeReinforce() {
  if (playerXP < costReinforceXP) return;
  playerXP -= costReinforceXP;
  player.maxHealth += 30;
  player.health = player.maxHealth; // Start at full health
  costReinforceXP = Math.ceil(costReinforceXP * Constants.XP_UPGRADE_INFLATION);
  openStartScreen(); // Refresh the display
}

function applyStartUpgradeAddCannons() {
  if (playerXP < costCannonsXP) return;
  playerXP -= costCannonsXP;
  player.addCannons(1); // 1 pair = 1 per side
  costCannonsXP = Math.ceil(costCannonsXP * Constants.XP_UPGRADE_INFLATION);
  openStartScreen(); // Refresh the display
}

function applyStartUpgradeTorpedo() {
  if (torpedoTubes.length >= 4) return;
  if (playerXP < costTorpedoXP) return;
  playerXP -= costTorpedoXP;
  torpedoTubes.push({ cooldown: 0, arming: 0 });
  costTorpedoXP = Math.ceil(costTorpedoXP * Constants.XP_UPGRADE_INFLATION);
  openStartScreen(); // Refresh the display
}

function openStartScreen() {
  if (!startScreenEl) {
    const hud = document.getElementById('hud')!;
    startScreenEl = document.createElement('div');
    startScreenEl.id = 'start-screen';
    Object.assign(startScreenEl.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,255,255,0.35)',
      padding: '20px',
      borderRadius: '10px',
      color: '#e6f0ff',
      zIndex: '1000',
      minWidth: '480px',
      maxWidth: '600px',
      textAlign: 'left',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
    } as CSSStyleDeclaration);
    hud.appendChild(startScreenEl);
  }

  startScreenEl.innerHTML = '';

  const title = document.createElement('div');
  title.textContent = '🏴‍☠️ Pirate Ship Battle';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '16px';
  title.style.fontSize = '20px';
  title.style.textAlign = 'center';
  startScreenEl.appendChild(title);

  // Create two-column layout
  const mainContainer = document.createElement('div');
  Object.assign(mainContainer.style, {
    display: 'flex',
    gap: '20px',
    alignItems: 'flex-start'
  } as CSSStyleDeclaration);

  // Left column - Instructions
  const leftColumn = document.createElement('div');
  Object.assign(leftColumn.style, {
    flex: '1',
    minWidth: '200px'
  } as CSSStyleDeclaration);

  const instructions = document.createElement('div');
  Object.assign(instructions.style, { display: 'flex', flexDirection: 'column', gap: '8px' } as CSSStyleDeclaration);

  const addInstruction = (text: string) => {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.fontSize = '14px';
    div.style.lineHeight = '1.4';
    instructions.appendChild(div);
  };

  addInstruction('🎯 Destroy enemy ships to gain XP');

  const controlsTitle = document.createElement('div');
  controlsTitle.textContent = 'Controls:';
  controlsTitle.style.fontWeight = 'bold';
  controlsTitle.style.marginTop = '8px';
  instructions.appendChild(controlsTitle);

  addInstruction('↑↓←→ Move ship');
  addInstruction('Space Fire cannons');
  addInstruction('T Launch torpedo');
  addInstruction('S Open shop in-game');

  leftColumn.appendChild(instructions);

  // Right column - Ship customization shop
  const rightColumn = document.createElement('div');
  Object.assign(rightColumn.style, {
    flex: '1',
    minWidth: '240px'
  } as CSSStyleDeclaration);

  const shopTitle = document.createElement('div');
  shopTitle.textContent = `⚙️ Customize Your Ship — XP: ${Math.floor(playerXP)}`;
  shopTitle.style.fontWeight = 'bold';
  shopTitle.style.marginBottom = '12px';
  shopTitle.style.fontSize = '14px';
  rightColumn.appendChild(shopTitle);

  const shopList = document.createElement('div');
  Object.assign(shopList.style, { display: 'flex', flexDirection: 'column', gap: '6px' } as CSSStyleDeclaration);

  const mkBtn = (label: string, enabled: boolean, onClick: () => void) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: '6px 8px',
      borderRadius: '4px',
      border: '1px solid rgba(255,255,255,0.4)',
      background: enabled ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
      color: enabled ? '#e6f0ff' : 'rgba(230,240,255,0.4)',
      cursor: enabled ? 'pointer' : 'not-allowed',
      fontSize: '12px',
      textAlign: 'left'
    } as CSSStyleDeclaration);
    if (enabled) {
      btn.addEventListener('click', () => { onClick(); });
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(255,255,255,0.2)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(255,255,255,0.12)';
      });
    }
    shopList.appendChild(btn);
  };

  mkBtn(`Reinforce Hull (+30 HP) — ${Math.ceil(costReinforceXP)} XP`, playerXP >= costReinforceXP, applyStartUpgradeReinforce);
  mkBtn(`Add Cannons (+1 per side) — ${Math.ceil(costCannonsXP)} XP`, playerXP >= costCannonsXP, applyStartUpgradeAddCannons);
  const torpLabel = torpedoTubes.length >= 4 ? 'Torpedo Tube — Max 4' : `Torpedo Tube (press T) — ${Math.ceil(costTorpedoXP)} XP`;
  mkBtn(torpLabel, torpedoTubes.length < 4 && playerXP >= costTorpedoXP, applyStartUpgradeTorpedo);

  rightColumn.appendChild(shopList);

  // Ship status display
  const statusDiv = document.createElement('div');
  statusDiv.style.marginTop = '12px';
  statusDiv.style.fontSize = '12px';
  statusDiv.style.opacity = '0.8';
  statusDiv.style.lineHeight = '1.4';
  statusDiv.innerHTML = `
    <strong>Current Ship:</strong><br>
    Health: ${Math.floor(player.health)}/${Math.floor(player.maxHealth)} HP<br>
    Cannons: ${player.cannons.length} total<br>
    Torpedoes: ${torpedoTubes.length}/4 tubes
  `;
  rightColumn.appendChild(statusDiv);

  // Add columns to main container
  mainContainer.appendChild(leftColumn);
  mainContainer.appendChild(rightColumn);
  startScreenEl.appendChild(mainContainer);

  // Start button
  const startBtn = document.createElement('button');
  startBtn.textContent = 'Start Battle!';
  Object.assign(startBtn.style, {
    padding: '12px 20px',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.4)',
    background: 'rgba(34, 197, 94, 0.2)',
    color: '#e6f0ff',
    cursor: 'pointer',
    marginTop: '20px',
    fontSize: '16px',
    fontWeight: 'bold',
    width: '100%'
  } as CSSStyleDeclaration);
  startBtn.addEventListener('click', closeStartScreen);
  startBtn.addEventListener('mouseenter', () => {
    startBtn.style.background = 'rgba(34, 197, 94, 0.3)';
  });
  startBtn.addEventListener('mouseleave', () => {
    startBtn.style.background = 'rgba(34, 197, 94, 0.2)';
  });
  startScreenEl.appendChild(startBtn);

  const hint = document.createElement('div');
  hint.textContent = 'Press any key to start or customize your ship above';
  hint.style.opacity = '0.6';
  hint.style.marginTop = '8px';
  hint.style.fontSize = '12px';
  hint.style.textAlign = 'center';
  startScreenEl.appendChild(hint);

  startScreenOpen = true;
  startScreenEl.style.display = 'block';
}

function closeStartScreen() {
  startScreenOpen = false;
  if (startScreenEl) startScreenEl.style.display = 'none';

  // Update HUD to reflect any start screen upgrades
  setupCannonHud(player);
}

function openGameOverScreen() {
  const hud = document.getElementById('hud')!;
  if (!gameOverScreenEl) {
    gameOverScreenEl = document.createElement('div');
    gameOverScreenEl.id = 'game-over-screen';
    Object.assign(gameOverScreenEl.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(0,0,0,0.8)',
      border: '1px solid rgba(255,255,255,0.35)',
      padding: '30px',
      borderRadius: '10px',
      color: '#e6f0ff',
      zIndex: '1000',
      minWidth: '500px',
      maxWidth: '700px',
      textAlign: 'center',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
    } as CSSStyleDeclaration);
    hud.appendChild(gameOverScreenEl);
  }

  gameOverScreenEl.innerHTML = '';

  // Title
  const title = document.createElement('div');
  title.textContent = '💀 Game Over';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '20px';
  title.style.fontSize = '24px';
  gameOverScreenEl.appendChild(title);

  // Stats container
  const statsContainer = document.createElement('div');
  statsContainer.style.textAlign = 'left';
  statsContainer.style.marginBottom = '30px';
  statsContainer.style.fontSize = '16px';
  statsContainer.style.lineHeight = '1.6';

  // Calculate accuracies
  const cannonAccuracy = gameStats.cannonShotsFired > 0 ?
    Math.round((gameStats.cannonHits / gameStats.cannonShotsFired) * 100) : 0;
  const torpedoAccuracy = gameStats.torpedoShotsFired > 0 ?
    Math.round((gameStats.torpedoHits / gameStats.torpedoShotsFired) * 100) : 0;

  statsContainer.innerHTML = `
    <h3 style="margin: 0 0 15px 0; color: #fbbf24;">Combat Statistics</h3>
    <div><strong>Cannon Accuracy:</strong> ${cannonAccuracy}% (${gameStats.cannonHits}/${gameStats.cannonShotsFired} shots hit)</div>
    <div><strong>Torpedo Accuracy:</strong> ${torpedoAccuracy}% (${gameStats.torpedoHits}/${gameStats.torpedoShotsFired} shots hit)</div>
    <div><strong>Ships Sunk:</strong></div>
    <div style="margin-left: 20px;">• Regular Ships: ${gameStats.shipsSunk.regular}</div>
    <div style="margin-left: 20px;">• Capital Ships: ${gameStats.shipsSunk.capital}</div>
    <div style="margin-top: 10px;"><strong>Total Ships Sunk:</strong> ${gameStats.shipsSunk.regular + gameStats.shipsSunk.capital}</div>
    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2);">
      <strong style="font-size: 18px; color: #fbbf24;">Total Experience Earned: ${Math.floor(totalXP)} XP</strong>
    </div>
  `;

  gameOverScreenEl.appendChild(statsContainer);

  // Restart button
  const restartBtn = document.createElement('button');
  restartBtn.textContent = 'Restart Game';
  Object.assign(restartBtn.style, {
    padding: '15px 30px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.4)',
    background: 'rgba(59, 130, 246, 0.2)',
    color: '#e6f0ff',
    cursor: 'pointer',
    fontSize: '18px',
    fontWeight: 'bold',
    marginTop: '10px'
  } as CSSStyleDeclaration);
  restartBtn.addEventListener('click', restartGame);
  restartBtn.addEventListener('mouseenter', () => {
    restartBtn.style.background = 'rgba(59, 130, 246, 0.3)';
  });
  restartBtn.addEventListener('mouseleave', () => {
    restartBtn.style.background = 'rgba(59, 130, 246, 0.2)';
  });
  gameOverScreenEl.appendChild(restartBtn);

  gameOverScreenOpen = true;
  gameOverScreenEl.style.display = 'block';
}

function closeGameOverScreen() {
  gameOverScreenOpen = false;
  if (gameOverScreenEl) gameOverScreenEl.style.display = 'none';
}

function restartGame() {
  // Close game over screen
  closeGameOverScreen();

  // Reset game statistics
  gameStats.cannonShotsFired = 0;
  gameStats.cannonHits = 0;
  gameStats.torpedoShotsFired = 0;
  gameStats.torpedoHits = 0;
  gameStats.shipsSunk.regular = 0;
  gameStats.shipsSunk.capital = 0;

  // Reset player XP and upgrade costs
  playerXP = 400;
  totalXP = 400; // Reset total XP to starting amount
  costRepairXP = Constants.XP_UPGRADE_BASE_COST;
  costReinforceXP = Constants.XP_UPGRADE_BASE_COST;
  costCannonsXP = Constants.XP_UPGRADE_BASE_COST;
  costTorpedoXP = Constants.XP_TORPEDO_COST;

  // Reset shop notification dismissal state
  shopNotificationDismissed = false;

  // Reset torpedo notification dismissal state
  torpedoNotificationDismissed = false;
  hasLaunchedTorpedo = false;

  // Reset torpedo tubes
  torpedoTubes.length = 0;

  // Clear all projectiles
  projectiles.length = 0;

  // Clear all treasures
  treasures.length = 0;

  // Clear all ships including any that might be sinking
  ships.length = 0;

  // Clear enemies
  enemies.length = 0;

  // Reset collision cooldowns
  collisionCooldown.clear();

  // Reset camera
  camera.set(0, 0);

  // Clear HUD elements
  if (collectLabelEl) collectLabelEl.style.display = 'none';

  // Reinitialize the game
  initGame(shipSpriteRef);
  startScreenOpen = true;
  if (startScreenEl) startScreenEl.style.display = 'block';
  openStartScreen();
}

function applyUpgradeRepair() {
  if (!upgradeOverlayOpen) return;
  if (playerXP < costRepairXP) return;
  playerXP -= costRepairXP;
  const amt = Math.min(player.maxHealth * 0.5, Math.max(0, player.maxHealth - player.health));
  scheduleHeal(amt);
  // Keep overlay open to allow multiple purchases; refresh contents
  openUpgradeOverlay();
}

function applyUpgradeReinforce() {
  if (!upgradeOverlayOpen) return;
  if (playerXP < costReinforceXP) return;
  playerXP -= costReinforceXP;
  player.maxHealth += 30;
  scheduleHeal(30);
  costReinforceXP = Math.ceil(costReinforceXP * Constants.XP_UPGRADE_INFLATION);
  openUpgradeOverlay();
}

function applyUpgradeAddCannons() {
  if (!upgradeOverlayOpen) return;
  if (playerXP < costCannonsXP) return;
  playerXP -= costCannonsXP;
  player.addCannons(1); // 1 pair = 1 per side
  setupCannonHud(player);
  costCannonsXP = Math.ceil(costCannonsXP * Constants.XP_UPGRADE_INFLATION);
  openUpgradeOverlay();
}

function applyUpgradeTorpedo() {
  if (!upgradeOverlayOpen) return;
  if (torpedoTubes.length >= 4) return;
  if (playerXP < costTorpedoXP) return;
  playerXP -= costTorpedoXP;
  torpedoTubes.push({ cooldown: 0, arming: 0 });
  costTorpedoXP = Math.ceil(costTorpedoXP * Constants.XP_UPGRADE_INFLATION);
  // Refresh HUD to show added tube
  setupCannonHud(player);
  openUpgradeOverlay();
}

function addXP(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  playerXP += amount;
  totalXP += amount;
}

function canAffordAnyUpgrade(): boolean {
  return playerXP >= Math.min(costRepairXP, costReinforceXP, costCannonsXP, costTorpedoXP);
}

function scheduleHeal(amount: number) {
  if (amount <= 0) return;
  healJobs.push({ remaining: amount, perSec: amount / Constants.SHOP_HEAL_DURATION_S });
}

// (Deprecated) Collect prompt helpers removed — treasure now auto-collects

function respawnPlayer() {
  // Remove the old player ship from world
  const old = player;
  const idx = ships.indexOf(old);
  if (idx >= 0) ships.splice(idx, 1);

  // Create a fresh player ship
  const newPlayer = new Ship({
    length: Constants.PLAYER_LENGTH_PX,
    width: Constants.PLAYER_WIDTH_PX,
    cannonPairs: Constants.PLAYER_CANNON_PAIRS
  }, shipSpriteRef);
  newPlayer.isPlayer = true;
  newPlayer.maxHealth = Constants.PLAYER_MAX_HEALTH;
  newPlayer.health = newPlayer.maxHealth;
  newPlayer.pos.set(0, 0);
  newPlayer.vel.set(0, 0);
  newPlayer.angle = -Math.PI / 2;
  ships.push(newPlayer);
  player = newPlayer;

  // Retarget all AI ships to the new player
  for (const s of enemies) {
    if (s instanceof AIShip) {
      s.target = player;
    }
  }

  // Reset HUD to new player's cannons
  setupCannonHud(player);
}

// Minimap in bottom-right showing player and other ships
function drawMinimap(w: number, h: number) {
  if (!player) return;
  const size = Constants.MINIMAP_SIZE_PX;
  const margin = Constants.MINIMAP_MARGIN_PX;
  const pad = Constants.MINIMAP_PAD_PX;
  const x = w - size - margin;
  const y = h - size - margin;
  const inner = size - pad * 2;
  const worldW = WORLD.maxX - WORLD.minX;
  const worldH = WORLD.maxY - WORLD.minY;
  const scale = Math.min(inner / worldW, inner / worldH);
  const xOffset = (inner - worldW * scale) / 2;
  const yOffset = (inner - worldH * scale) / 2;

  ctx.save();
  // panel background
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  // world frame inside panel
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(x + pad + xOffset, y + pad + yOffset, worldW * scale, worldH * scale);

  // ship pips
  for (const s of ships) {
    const mx = x + pad + xOffset + (s.pos.x - WORLD.minX) * scale;
    const my = y + pad + yOffset + (s.pos.y - WORLD.minY) * scale;
    ctx.beginPath();
    ctx.arc(mx, my, s.isPlayer ? 4 : 3, 0, Math.PI * 2);
    if (s.isPlayer) {
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    } else if (s instanceof CapitalShip) {
      // Capital ships show as purple in minimap
      ctx.fillStyle = '#8b5cf6';
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Draw world boundary rectangle in the main view
function drawWorldBounds(w: number, h: number) {
  // corners in screen space
  const x1 = WORLD.minX - camera.x + w / 2;
  const y1 = WORLD.minY - camera.y + h / 2;
  const x2 = WORLD.maxX - camera.x + w / 2;
  const y2 = WORLD.maxY - camera.y + h / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  ctx.restore();
}

// Keep ships inside the world, with a soft bounce
function applyWorldBounds(s: Ship) {
  const hullX = s.length * 0.5;
  const hullY = s.width * 0.5;
  const minX = WORLD.minX + hullX;
  const maxX = WORLD.maxX - hullX;
  const minY = WORLD.minY + hullY;
  const maxY = WORLD.maxY - hullY;
  const bounce = Constants.WORLD_BOUNDARY_BOUNCE;
  if (s.pos.x < minX) { s.pos.x = minX; if (s.vel.x < 0) s.vel.x *= -bounce; }
  if (s.pos.x > maxX) { s.pos.x = maxX; if (s.vel.x > 0) s.vel.x *= -bounce; }
  if (s.pos.y < minY) { s.pos.y = minY; if (s.vel.y < 0) s.vel.y *= -bounce; }
  if (s.pos.y > maxY) { s.pos.y = maxY; if (s.vel.y > 0) s.vel.y *= -bounce; }
}

// Draw treasure icons on the map
function drawTreasures(w: number, h: number) {
  for (const t of treasures) {
    if (t.collected) continue;
    const sx = t.pos.x - camera.x + w / 2;
    const sy = t.pos.y - camera.y + h / 2;
    const scale = t.size === 'large' ? 1.3 : 1.0;
    const baseWidth = 20 * scale;
    const baseHeight = 16 * scale;
    const lidHeight = 8 * scale;

    ctx.save();
    ctx.translate(sx, sy);

    // pickup radius visualization
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, Constants.TREASURE_PICKUP_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // base (larger for capital ship treasures)
    ctx.fillStyle = t.size === 'large' ? '#b45309' : '#d97706'; // Darker gold for large
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
    ctx.fill();
    ctx.stroke();

    // lid (larger for capital ship treasures)
    ctx.fillStyle = t.size === 'large' ? '#d97706' : '#f59e0b'; // Brighter for large
    ctx.beginPath();
    ctx.rect(-baseWidth / 2, -baseHeight / 2 - lidHeight / 2, baseWidth, lidHeight);
    ctx.fill();
    ctx.stroke();

    // lock (larger for capital ship treasures)
    ctx.fillStyle = '#fbbf24';
    const lockRadius = t.size === 'large' ? 3 : 2;
    ctx.beginPath();
    ctx.arc(0, -baseHeight / 4, lockRadius, 0, Math.PI * 2);
    ctx.fill();

    // Add golden glow effect for large treasures
    if (t.size === 'large') {
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, Constants.TREASURE_PICKUP_RADIUS - 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// Resolve collisions between ships using simple elastic response with restitution
function resolveShipCollisions(all: Ship[], dt: number) {
  const iterations = 2; // positional correction passes
  const e = Constants.COLLISION_RESTITUTION; // restitution (bounciness)
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        // Skip only if fully sunk (gone); sinking ships still collide
        if ((a as any).isSinking && (a as any).isFullySunk && (a as any).isFullySunk()) continue;
        if ((b as any).isSinking && (b as any).isFullySunk && (b as any).isFullySunk()) continue;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const d2 = dx * dx + dy * dy;
        const ra = a.getCollisionRadius();
        const rb = b.getCollisionRadius();
        const rSum = ra + rb;
        if (d2 <= 1e-6) {
          // Perfect overlap; nudge randomly
          const nudge = 0.5 * (it + 1);
          a.pos.x -= nudge; b.pos.x += nudge;
          continue;
        }
        if (d2 < rSum * rSum) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const penetration = rSum - d;
          // Position correction: move each out along normal based on mass
          const ma = a.getMass();
          const mb = b.getMass();
          const invMassSum = 1 / (ma + mb);
          const corrA = penetration * (mb * invMassSum);
          const corrB = penetration * (ma * invMassSum);
          a.pos.x -= nx * corrA * 0.5; a.pos.y -= ny * corrA * 0.5;
          b.pos.x += nx * corrB * 0.5; b.pos.y += ny * corrB * 0.5;
          applyWorldBounds(a); applyWorldBounds(b);

          // Relative velocity along normal
          const rvx = b.vel.x - a.vel.x;
          const rvy = b.vel.y - a.vel.y;
          const relNorm = rvx * nx + rvy * ny;
          if (relNorm < 0) {
            const j = -(1 + Constants.COLLISION_RESTITUTION) * relNorm / (1 / ma + 1 / mb);
            const impAx = -j * nx / ma;
            const impAy = -j * ny / ma;
            const impBx = j * nx / mb;
            const impBy = j * ny / mb;
            a.vel.x += impAx; a.vel.y += impAy;
            b.vel.x += impBx; b.vel.y += impBy;

            // Tangential friction for a more realistic scrape
            const tx = -ny, ty = nx; // tangent
            const relTan = rvx * tx + rvy * ty;
            const jt = -relTan / (1 / ma + 1 / mb);
            const jtClamped = Math.max(-Constants.COLLISION_FRICTION * j, Math.min(Constants.COLLISION_FRICTION * j, jt));
            a.vel.x += (-jtClamped * tx) / ma; a.vel.y += (-jtClamped * ty) / ma;
            b.vel.x += (jtClamped * tx) / mb; b.vel.y += (jtClamped * ty) / mb;

            // Small angular kick based on tangential relative motion
            a.angVel -= relTan * 0.0008;
            b.angVel += relTan * 0.0008;

            // Ramming damage scaled by relative speed (with cooldown to avoid rapid repeats)
            const key = `${Math.min(a.id, b.id)}|${Math.max(a.id, b.id)}`;
            if (!collisionCooldown.has(key)) {
              // Determine if tip vs side
              const fwdA = a.forwardVec();
              const fwdB = b.forwardVec();
              const rightA = a.rightVec();
              const rightB = b.rightVec();
              const nABx = nx, nABy = ny; // from A to B
              const nBAx = -nx, nBAy = -ny; // from B to A
              const tipThresh = 0.7; // cos ~45deg
              const dot = (ax: number, ay: number, bx: number, by: number) => ax * bx + ay * by;
              const tipA = dot(fwdA.x, fwdA.y, nABx, nABy) > tipThresh;
              const tipB = dot(fwdB.x, fwdB.y, nBAx, nBAy) > tipThresh;
              const relSpeed = Math.sqrt(rvx * rvx + rvy * rvy);
              let dmgA = 0, dmgB = 0;
              if (tipA !== tipB) {
                // Exactly one ship is ramming with its bow
                const D = Math.max(20, relSpeed * 0.67);
                if (tipA) { dmgB = D; dmgA = D / 3; }
                else { dmgA = D; dmgB = D / 3; }
              } else {
                // Side collision or symmetric bow contact: equal damage based on relative speed
                const D = relSpeed * 0.25;
                dmgA = D; dmgB = D;
              }
              const prevA = a.health;
              const prevB = b.health;
              a.takeDamage(dmgA, b === player); // a is attacked by b
              b.takeDamage(dmgB, a === player); // b is attacked by a
              // Award XP to player for damage dealt via ramming (reduced to 25%)
              if (a === player && dmgA > 0) addXP(dmgA * 0.25);
              if (b === player && dmgB > 0) addXP(dmgB * 0.25);
              if (a.health <= 0 && !a.isSinking) {
                a.startSinking();
                // Play ship sinking sound
                playShipSinkingSound(a === player, a instanceof CapitalShip, a.pos);
                // If the player died, immediately show game over screen
                if (a === player) {
                  openGameOverScreen();
                }
              }
              if (b.health <= 0 && !b.isSinking) {
                b.startSinking();
                // Play ship sinking sound
                playShipSinkingSound(b === player, b instanceof CapitalShip, b.pos);
                // If the player died, immediately show game over screen
                if (b === player) {
                  openGameOverScreen();
                }
              }
              if (a.health <= 0 && prevA > 0 && b === player) addXP(Constants.XP_SINK_BONUS);
              if (b.health <= 0 && prevB > 0 && a === player) addXP(Constants.XP_SINK_BONUS);
              collisionCooldown.set(key, Constants.RAM_DAMAGE_COOLDOWN_S);
            }
          }
        }
      }
    }
  }
}


// Removed ensureAggressiveAI() function - ships now only become aggressive when damaged
