import { Assets } from './core/assets';
import { Input } from './core/input';
import { Vec2 } from './core/vector';
import { AIShip } from './game/ai-ship';
import { Projectile } from './game/projectile';
import { Ship } from './game/ship';
import { Torpedo } from './game/torpedo';

// =========================
// Game Configuration Constants
// =========================

// World dimensions and camera behavior
const WORLD_BOUNDS = { minX: -4000, maxX: 4000, minY: -4000, maxY: 4000 } as const;
const CAMERA_VELOCITY_LEAD_FACTOR = 0.25; // lead camera by velocity fraction

// Player defaults
const PLAYER_LENGTH_PX = 140;
const PLAYER_WIDTH_PX = 48;
const PLAYER_CANNON_PAIRS = 8; // pairs per side
const PLAYER_MAX_HEALTH = 140;
const PLAYER_MAX_SPEED = 180;
const PLAYER_THRUST = 50;
const PLAYER_REVERSE_THRUST = 20;
const PLAYER_TURN_ACCEL = 1.5;    // rad/s^2 base
const PLAYER_RUDDER_RATE = 2;   // how fast rudder moves per second
const PLAYER_LINEAR_DRAG = 0.4;   // water drag
const PLAYER_ANGULAR_DRAG = 2.0;  // angular drag

// AI defaults
const AI_LENGTH_PX = 95;
const AI_WIDTH_PX = 36;
const AI_CANNON_PAIRS = 3; // pairs per side
const AI_MAX_HEALTH = 60;
const AI_MAX_SPEED = 170;
const AI_THRUST = 48;
const AI_REVERSE_THRUST = 18;
const AI_TURN_ACCEL = 1.0;
const AI_RUDDER_RATE = 1.5;
const AI_LINEAR_DRAG = 0.4;
const AI_ANGULAR_DRAG = 2.0;

// Population and spawning
const AI_TOTAL_STARTING_SHIPS = 16;
const AI_START_IN_VIEW_COUNT = 4;
const AI_SPAWN_ANNULUS_MIN_R = 600;
const AI_SPAWN_ANNULUS_MAX_R = 2600;
const AI_OFFMAP_SPAWN_DISTANCE = 500;
const SPAWN_IN_VIEW_MARGIN_PX = 100;
const MIN_ENEMIES_IN_VIEW = 2;
const MAX_ENEMIES_TOTAL = 16;
const AGGRESSIVE_MIN_COUNT = 2;

// Collision + physics tuning
const WORLD_BOUNDARY_BOUNCE = 0.4;
const COLLISION_RESTITUTION = 0.2; // bounce factor on ship-ship collision
const COLLISION_FRICTION = 0.08;   // tangential friction factor
const RAM_DAMAGE_COOLDOWN_S = 0.6; // seconds between damage ticks for a pair

// Treasure / upgrades
const TREASURE_PICKUP_RADIUS = 80; // px
const RESPAWN_SECONDS_AFTER_FULLY_SUNK = 5;
const SHOP_HEAL_DURATION_S = 5; // seconds to apply healing from shop upgrades
const TORPEDO_COST_XP = 300;
const TORPEDO_RELOAD_S = 15;
const TORPEDO_ARMING_S = 1;
const TORPEDO_SPEED = 140;

// Minimap
const MINIMAP_SIZE_PX = 180;
const MINIMAP_MARGIN_PX = 12;
const MINIMAP_PAD_PX = 10;

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
let playerRespawnTimer: number | null = null;
let respawnLabelEl: HTMLDivElement | null = null;
const collisionCooldown = new Map<string, number>();
type Treasure = { pos: Vec2; collected: boolean };
const treasures: Treasure[] = [];
let upgradeOverlayOpen = false;
let upgradeOverlayEl: HTMLDivElement | null = null;
let collectLabelEl: HTMLDivElement | null = null;
let playerXP = 0;
// Upgrade XP costs
const UPGRADE_BASE_COST_XP = 100;
const UPGRADE_INFLATION = 1.20; // 10% increase per purchase for certain upgrades
let costRepairXP = UPGRADE_BASE_COST_XP;
let costReinforceXP = UPGRADE_BASE_COST_XP;
let costCannonsXP = UPGRADE_BASE_COST_XP;
// Healing over time (shop)
let healJobs: { remaining: number; perSec: number }[] = [];
// Torpedo state
type TorpedoTube = { cooldown: number; arming: number };
let torpedoTubes: TorpedoTube[] = [];

// World bounds (finite map)
const WORLD = WORLD_BOUNDS;

// Try to load webp sprite; fallback to hull drawing
Assets.loadImage('/ship.webp').then(img => initGame(img)).catch(() => initGame());

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

function spawnAIShipInView(player: Ship, sprite?: HTMLImageElement): AIShip {
  const s = new AIShip(player, { ship: { length: AI_LENGTH_PX, width: AI_WIDTH_PX, cannonPairs: AI_CANNON_PAIRS }, sprite });
  s.maxHealth = AI_MAX_HEALTH;
  s.health = s.maxHealth;
  s.maxSpeed = AI_MAX_SPEED;
  s.thrust = AI_THRUST;
  s.reverseThrust = AI_REVERSE_THRUST;
  s.turnAccel = AI_TURN_ACCEL;
  s.rudderRate = AI_RUDDER_RATE;
  s.linDrag = AI_LINEAR_DRAG;
  s.angDrag = AI_ANGULAR_DRAG;
  s.turnAccel = AI_TURN_ACCEL;
  s.rudderRate = AI_RUDDER_RATE;
  s.linDrag = AI_LINEAR_DRAG;
  s.angDrag = AI_ANGULAR_DRAG;

  // Get current viewport bounds (camera starts at player position)
  const viewport = getViewportBounds(camera, canvas.width, canvas.height);

  // Spawn within view with some margin to avoid immediate edge clipping
  const margin = SPAWN_IN_VIEW_MARGIN_PX;
  const viewWidth = viewport.right - viewport.left - margin * 2;
  const viewHeight = viewport.bottom - viewport.top - margin * 2;

  // Random position within viewport
  const x = viewport.left + margin + Math.random() * viewWidth;
  const y = viewport.top + margin + Math.random() * viewHeight;

  s.pos.set(x, y);

  // Face toward player initially
  const toPlayer = Vec2.sub(player.pos, s.pos);
  s.angle = Math.atan2(toPlayer.y, toPlayer.x) + (Math.random() - 0.5) * 0.6;

  return s;
}

function spawnAIShipBeyondMap(player: Ship, sprite?: HTMLImageElement): AIShip {
  const s = new AIShip(player, { ship: { length: AI_LENGTH_PX, width: AI_WIDTH_PX, cannonPairs: AI_CANNON_PAIRS }, sprite });
  s.maxHealth = AI_MAX_HEALTH;
  s.health = s.maxHealth;
  s.maxSpeed = AI_MAX_SPEED;
  s.thrust = AI_THRUST;
  s.reverseThrust = AI_REVERSE_THRUST;

  // Spawn beyond map edges and sail toward center
  const spawnDistance = AI_OFFMAP_SPAWN_DISTANCE; // Distance beyond map edges to spawn
  const worldCenterX = 0;
  const worldCenterY = 0;

  // Choose which edge to spawn from (0=top, 1=right, 2=bottom, 3=left)
  const edge = Math.floor(Math.random() * 4);
  let spawnX: number, spawnY: number;

  switch (edge) {
    case 0: // Top edge
      spawnX = (Math.random() - 0.5) * (WORLD.maxX - WORLD.minX) * 1.5; // Wider spread
      spawnY = WORLD.minY - spawnDistance;
      break;
    case 1: // Right edge
      spawnX = WORLD.maxX + spawnDistance;
      spawnY = (Math.random() - 0.5) * (WORLD.maxY - WORLD.minY) * 1.5;
      break;
    case 2: // Bottom edge
      spawnX = (Math.random() - 0.5) * (WORLD.maxX - WORLD.minX) * 1.5;
      spawnY = WORLD.maxY + spawnDistance;
      break;
    case 3: // Left edge
    default:
      spawnX = WORLD.minX - spawnDistance;
      spawnY = (Math.random() - 0.5) * (WORLD.maxY - WORLD.minY) * 1.5;
      break;
  }

  s.pos.set(spawnX, spawnY);

  // Face toward world center initially, with some variation
  const toCenter = Vec2.sub(new Vec2(worldCenterX, worldCenterY), s.pos);
  s.angle = Math.atan2(toCenter.y, toCenter.x) + (Math.random() - 0.5) * 0.8;

  // Give initial velocity toward center to start sailing in
  const initialSpeed = 50 + Math.random() * 50; // 50-100 units/sec
  const dir = toCenter.clone().normalize();
  s.vel.set(dir.x * initialSpeed, dir.y * initialSpeed);

  return s;
}

function initGame(sprite?: HTMLImageElement) {
  shipSpriteRef = sprite;
  player = new Ship({ length: PLAYER_LENGTH_PX, width: PLAYER_WIDTH_PX, cannonPairs: PLAYER_CANNON_PAIRS }, sprite);
  player.isPlayer = true;
  player.maxHealth = PLAYER_MAX_HEALTH;
  player.health = player.maxHealth;
  // Player physics tuning
  player.maxSpeed = PLAYER_MAX_SPEED;
  player.thrust = PLAYER_THRUST;
  player.reverseThrust = PLAYER_REVERSE_THRUST;
  player.turnAccel = PLAYER_TURN_ACCEL;
  player.rudderRate = PLAYER_RUDDER_RATE;
  player.linDrag = PLAYER_LINEAR_DRAG;
  player.angDrag = PLAYER_ANGULAR_DRAG;
  ships.push(player);
  setupCannonHud(player);
  setupMetricsHud();

  // Spawn AI ships: some in view, some scattered around the world
  const totalShips = AI_TOTAL_STARTING_SHIPS;
  const shipsInView = AI_START_IN_VIEW_COUNT; // Always have N ships in view initially

  // Spawn ships in view first
  for (let i = 0; i < shipsInView; i++) {
    const s = spawnAIShipInView(player, sprite);
    ships.push(s);
    enemies.push(s);
  }

  // Spawn remaining ships scattered around the world
  const remainingShips = totalShips - shipsInView;
  const minR = AI_SPAWN_ANNULUS_MIN_R;
  const maxR = AI_SPAWN_ANNULUS_MAX_R;
  for (let i = 0; i < remainingShips; i++) {
    const s = new AIShip(player, { ship: { length: AI_LENGTH_PX, width: AI_WIDTH_PX, cannonPairs: AI_CANNON_PAIRS }, sprite });
    s.maxHealth = AI_MAX_HEALTH;
    s.health = s.maxHealth;
    // random position in annulus [minR, maxR) around player
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random() * (maxR * maxR - minR * minR) + minR * minR);
    s.pos.set(player.pos.x + Math.cos(angle) * r, player.pos.y + Math.sin(angle) * r);
    s.angle = angle + (Math.random() - 0.5) * 0.6; // varied starting heading
    s.maxSpeed = AI_MAX_SPEED;
    s.thrust = AI_THRUST;
    s.reverseThrust = AI_REVERSE_THRUST;
    s.turnAccel = AI_TURN_ACCEL;
    s.rudderRate = AI_RUDDER_RATE;
    s.linDrag = AI_LINEAR_DRAG;
    s.angDrag = AI_ANGULAR_DRAG;
    ships.push(s);
    enemies.push(s);
  }

  // Mark two nearest as aggressive initially
  ensureAggressiveAI();
}

// Simple ocean background
function drawOcean(w: number, h: number, cam: Vec2, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0b355f');
  g.addColorStop(1, '#0a2744');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // world-space grid to visualize relative motion
  const minor = 80; // px
  const majorEvery = 5;
  const leftWorld = cam.x - w / 2;
  const topWorld = cam.y - h / 2;
  const firstWX = Math.floor(leftWorld / minor) * minor;
  const firstWY = Math.floor(topWorld / minor) * minor;

  ctx.save();
  for (let wx = firstWX, ix = 0; wx <= cam.x + w / 2; wx += minor, ix++) {
    const sx = wx - cam.x + w / 2;
    const isMajor = ix % majorEvery === 0;
    ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = isMajor ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
    ctx.stroke();
  }
  for (let wy = firstWY, iy = 0; wy <= cam.y + h / 2; wy += minor, iy++) {
    const sy = wy - cam.y + h / 2;
    const isMajor = iy % majorEvery === 0;
    ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = isMajor ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
    ctx.stroke();
  }
  ctx.restore();
}

let last = performance.now();
function loop(now: number) {
  requestAnimationFrame(loop);
  const dtRaw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.033, dtRaw); // clamp for stability

  // Tick collision cooldowns
  if (collisionCooldown.size) {
    for (const [k, v] of Array.from(collisionCooldown.entries())) {
      const nv = v - dt;
      if (nv <= 0) collisionCooldown.delete(k); else collisionCooldown.set(k, nv);
    }
  }

  if (!player) return; // wait for init

  // Update (paused while shop is open)
  if (!upgradeOverlayOpen) {
    player.update(dt, {
      up: input.isDown('ArrowUp'),
      down: input.isDown('ArrowDown'),
      left: input.isDown('ArrowLeft'),
      right: input.isDown('ArrowRight'),
      fire: input.isDown('Space'),
    }, projectiles);
    applyWorldBounds(player);

    // Choose aggressive ships first (ensures 2 minimum)
    ensureAggressiveAI();

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

    // Maintain minimum ships in view
    maintainShipsInView();

    // Camera follows ship, with slight lead in velocity direction
    camera.x = player.pos.x + player.vel.x * CAMERA_VELOCITY_LEAD_FACTOR;
    camera.y = player.pos.y + player.vel.y * CAMERA_VELOCITY_LEAD_FACTOR;

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
          s.takeDamage(p.damage);
          if (p.owner === player) {
            addXP(p.damage);
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
            if (p.owner === player) addXP(20); // sink bonus
            // Spawn treasure for non-player ships
            if (s !== player) {
              treasures.push({ pos: s.pos.clone(), collected: false });
            }
          }
          break;
        }
      }
    }

    // Auto-collect treasure when in pickup radius
    if (player && !player.isSinking) {
      for (const t of treasures) {
        if (!t.collected && player.hitsCircle(t.pos, TREASURE_PICKUP_RADIUS)) {
          t.collected = true;
          addXP(40); // bonus for collecting treasure
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
  }

  // Start respawn countdown once the player is fully sunk
  if (player.isSinking && player.isFullySunk() && playerRespawnTimer === null) {
    playerRespawnTimer = RESPAWN_SECONDS_AFTER_FULLY_SUNK; // seconds
    showRespawnLabel();
  }

  // Handle player respawn countdown
  if (playerRespawnTimer !== null) {
    playerRespawnTimer -= dt;
    updateRespawnLabel(Math.max(0, playerRespawnTimer));
    if (playerRespawnTimer <= 0) {
      respawnPlayer();
      playerRespawnTimer = null;
      hideRespawnLabel();
    }
  }

  // Remove fully sunk ships (keep player for now)
  for (let i = ships.length - 1; i >= 0; i--) {
    const s = ships[i];
    if (s.isSinking && s.isFullySunk()) {
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
            player.vel.x + fwd.x * TORPEDO_SPEED,
            player.vel.y + fwd.y * TORPEDO_SPEED,
          );
          projectiles.push(new Torpedo(spawn, vel, player));
          tube.cooldown = TORPEDO_RELOAD_S;
          tube.arming = 0;
        }
      }
    }
    if (input.wasPressed('KeyT')) {
      const ready = torpedoTubes.find(t => t.cooldown <= 0 && t.arming <= 0);
      if (ready) ready.arming = TORPEDO_ARMING_S;
    }
  }

  // Upgrade overlay keyboard shortcuts (1/2/3) and close (Esc/S)
  if (upgradeOverlayOpen) {
    if (input.wasPressed('Digit1') || input.wasPressed('Numpad1')) {
      applyUpgradeRepair();
    } else if (input.wasPressed('Digit2') || input.wasPressed('Numpad2')) {
      applyUpgradeReinforce();
    } else if (input.wasPressed('Digit3') || input.wasPressed('Numpad3')) {
      applyUpgradeAddCannons();
    } else if (input.wasPressed('Escape') || input.wasPressed('KeyS')) {
      closeUpgradeOverlay();
    }
  }

  // Open shop with S (always allowed); close handled above when open
  if (!upgradeOverlayOpen && input.wasPressed('KeyS')) {
    openUpgradeOverlay();
  }

  // Auto-collect treasure when in pickup radius
  if (player && !player.isSinking) {
    for (const t of treasures) {
      if (!t.collected && player.hitsCircle(t.pos, TREASURE_PICKUP_RADIUS)) {
        t.collected = true;
        addXP(40); // bonus for collecting treasure
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
  const shopHint = canAffordAnyUpgrade() ? ' (press S shop)' : '';
  metricsEl.textContent = `Pos: (${x}, ${y})\nSpeed: ${speed} px/s\nXP: ${xp}${shopHint}`;
}

function showRespawnLabel() {
  if (!respawnLabelEl) {
    const hud = document.getElementById('hud')!;
    respawnLabelEl = document.createElement('div');
    respawnLabelEl.id = 'respawn-label';
    respawnLabelEl.style.marginTop = '8px';
    respawnLabelEl.style.padding = '4px 8px';
    respawnLabelEl.style.borderRadius = '6px';
    respawnLabelEl.style.background = 'rgba(0,0,0,0.35)';
    respawnLabelEl.style.border = '1px solid rgba(255,255,255,0.25)';
    respawnLabelEl.style.display = 'inline-block';
    hud.appendChild(respawnLabelEl);
  }
  respawnLabelEl.style.display = 'inline-block';
}

function updateRespawnLabel(timeLeft: number) {
  if (!respawnLabelEl) return;
  const secs = Math.ceil(timeLeft);
  respawnLabelEl.textContent = `Respawning in ${secs}s...`;
}

function hideRespawnLabel() {
  if (!respawnLabelEl) return;
  respawnLabelEl.style.display = 'none';
}

function openUpgradeOverlay() {
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
  mkBtn(`3) Add cannons (+2 per side) — ${Math.ceil(costCannonsXP)} XP`, playerXP >= costCannonsXP, applyUpgradeAddCannons);
  const torpLabel = torpedoTubes.length >= 4 ? '4) Torpedo tube — Max 4' : `4) Torpedo tube (press T) — ${TORPEDO_COST_XP} XP (Owned ${torpedoTubes.length}/4)`;
  mkBtn(torpLabel, torpedoTubes.length < 4 && playerXP >= TORPEDO_COST_XP, applyUpgradeTorpedo);
  const hint = document.createElement('div');
  hint.textContent = 'Tip: press 1 / 2 / 3 to choose';
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
  costReinforceXP = Math.ceil(costReinforceXP * UPGRADE_INFLATION);
  openUpgradeOverlay();
}

function applyUpgradeAddCannons() {
  if (!upgradeOverlayOpen) return;
  if (playerXP < costCannonsXP) return;
  playerXP -= costCannonsXP;
  player.addCannons(2); // 2 pairs = 2 per side
  setupCannonHud(player);
  costCannonsXP = Math.ceil(costCannonsXP * UPGRADE_INFLATION);
  openUpgradeOverlay();
}

function applyUpgradeTorpedo() {
  if (!upgradeOverlayOpen) return;
  if (torpedoTubes.length >= 4) return;
  if (playerXP < TORPEDO_COST_XP) return;
  playerXP -= TORPEDO_COST_XP;
  torpedoTubes.push({ cooldown: 0, arming: 0 });
  // Refresh HUD to show added tube
  setupCannonHud(player);
  openUpgradeOverlay();
}

function addXP(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  playerXP += amount;
}

function canAffordAnyUpgrade(): boolean {
  return playerXP >= Math.min(costRepairXP, costReinforceXP, costCannonsXP);
}

function scheduleHeal(amount: number) {
  if (amount <= 0) return;
  healJobs.push({ remaining: amount, perSec: amount / SHOP_HEAL_DURATION_S });
}

// (Deprecated) Collect prompt helpers removed — treasure now auto-collects

function respawnPlayer() {
  // Remove the old player ship from world
  const old = player;
  const idx = ships.indexOf(old);
  if (idx >= 0) ships.splice(idx, 1);

  // Create a fresh player ship
  const newPlayer = new Ship({ length: 140, width: 48, cannonPairs: 8 }, shipSpriteRef);
  newPlayer.isPlayer = true;
  newPlayer.maxHealth = 140;
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
  const size = MINIMAP_SIZE_PX;
  const margin = MINIMAP_MARGIN_PX;
  const pad = MINIMAP_PAD_PX;
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
  const bounce = WORLD_BOUNDARY_BOUNCE;
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
    // simple chest icon
    ctx.save();
    ctx.translate(sx, sy);
    // pickup radius visualization
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, TREASURE_PICKUP_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // base
    ctx.fillStyle = '#d97706';
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-10, -8, 20, 16);
    ctx.fill();
    ctx.stroke();
    // lid
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.rect(-10, -12, 20, 8);
    ctx.fill();
    ctx.stroke();
    // lock
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Resolve collisions between ships using simple elastic response with restitution
function resolveShipCollisions(all: Ship[], dt: number) {
  const iterations = 2; // positional correction passes
  const e = 0.2; // restitution (bounciness)
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
            const j = -(1 + COLLISION_RESTITUTION) * relNorm / (1 / ma + 1 / mb);
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
            const jtClamped = Math.max(-COLLISION_FRICTION * j, Math.min(COLLISION_FRICTION * j, jt));
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
              a.takeDamage(dmgA);
              b.takeDamage(dmgB);
              // Award XP to player for damage dealt via ramming
              if (a === player && dmgA > 0) addXP(dmgA);
              if (b === player && dmgB > 0) addXP(dmgB);
              if (a.health <= 0 && !a.isSinking) a.startSinking();
              if (b.health <= 0 && !b.isSinking) b.startSinking();
              if (a.health <= 0 && prevA > 0 && b === player) addXP(20);
              if (b.health <= 0 && prevB > 0 && a === player) addXP(20);
              collisionCooldown.set(key, RAM_DAMAGE_COOLDOWN_S);
            }
          }
        }
      }
    }
  }
}

// Maintain minimum ships in player's view
function maintainShipsInView() {
  if (!player) return;

  const viewport = getViewportBounds(camera, canvas.width, canvas.height);
  const minShipsInView = MIN_ENEMIES_IN_VIEW;
  const maxTotalShips = MAX_ENEMIES_TOTAL;

  // Count ships currently in view that are not sinking (excluding player)
  let shipsInView = 0;
  for (const s of enemies) {
    if (!s.isSinking && s.pos.x >= viewport.left && s.pos.x <= viewport.right &&
      s.pos.y >= viewport.top && s.pos.y <= viewport.bottom) {
      shipsInView++;
    }
  }

  // Count ships that are currently sinking to avoid over-spawning
  let sinkingShips = 0;
  for (const s of enemies) {
    if (s.isSinking && !s.isFullySunk()) {
      sinkingShips++;
    }
  }

  // Spawn new ships beyond map edges if we have fewer than minimum active ships in view
  // and haven't reached max total, but wait for sinking ships to finish first
  while (shipsInView < minShipsInView && enemies.length - sinkingShips < maxTotalShips) {
    const s = spawnAIShipBeyondMap(player);
    ships.push(s);
    enemies.push(s);
    shipsInView++;
  }
}

function ensureAggressiveAI() {
  const ai = enemies.filter(s => s instanceof AIShip && !s.isSinking) as AIShip[];
  // Sort by distance to player
  ai.sort((a, b) => Vec2.sub(a.pos, player.pos).len() - Vec2.sub(b.pos, player.pos).len());
  let count = 0;
  for (let i = 0; i < ai.length; i++) {
    const s = ai[i];
    const makeAggressive = i < AGGRESSIVE_MIN_COUNT; // first N nearest
    if (s.aggressive !== makeAggressive) s.aggressive = makeAggressive;
    if (makeAggressive) count++;
  }
}
