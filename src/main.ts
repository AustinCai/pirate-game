import { Assets } from './core/assets';
import { Input } from './core/input';
import { Vec2 } from './core/vector';
import { AIShip } from './game/ai-ship';
import { Projectile } from './game/projectile';
import { Ship } from './game/ship';

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

// World bounds (finite map)
const WORLD = {
  minX: -4000,
  maxX: 4000,
  minY: -4000,
  maxY: 4000,
};

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
  const s = new AIShip(player, { ship: { length: 95, width: 36, cannonPairs: 3 }, sprite });
  s.maxHealth = 60;
  s.health = s.maxHealth;
  s.maxSpeed = 170;
  s.thrust = 48;
  s.reverseThrust = 18;

  // Get current viewport bounds (camera starts at player position)
  const viewport = getViewportBounds(camera, canvas.width, canvas.height);

  // Spawn within view with some margin to avoid immediate edge clipping
  const margin = 100;
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
  const s = new AIShip(player, { ship: { length: 95, width: 36, cannonPairs: 3 }, sprite });
  s.maxHealth = 60;
  s.health = s.maxHealth;
  s.maxSpeed = 170;
  s.thrust = 48;
  s.reverseThrust = 18;

  // Spawn beyond map edges and sail toward center
  const spawnDistance = 500; // Distance beyond map edges to spawn
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
  player = new Ship({ length: 140, width: 48, cannonPairs: 8 }, sprite);
  player.isPlayer = true;
  player.maxHealth = 140;
  player.health = player.maxHealth;
  ships.push(player);
  setupCannonHud(player);

  // Spawn AI ships: some in view, some scattered around the world
  const totalShips = 16;
  const shipsInView = 4; // Always have 4 ships in view initially

  // Spawn ships in view first
  for (let i = 0; i < shipsInView; i++) {
    const s = spawnAIShipInView(player, sprite);
    ships.push(s);
    enemies.push(s);
  }

  // Spawn remaining ships scattered around the world
  const remainingShips = totalShips - shipsInView;
  const minR = 600;
  const maxR = 2600;
  for (let i = 0; i < remainingShips; i++) {
    const s = new AIShip(player, { ship: { length: 95, width: 36, cannonPairs: 3 }, sprite });
    s.maxHealth = 60;
    s.health = s.maxHealth;
    // random position in annulus [minR, maxR) around player
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random() * (maxR * maxR - minR * minR) + minR * minR);
    s.pos.set(player.pos.x + Math.cos(angle) * r, player.pos.y + Math.sin(angle) * r);
    s.angle = angle + (Math.random() - 0.5) * 0.6; // varied starting heading
    s.maxSpeed = 170;
    s.thrust = 48;
    s.reverseThrust = 18;
    ships.push(s);
    enemies.push(s);
  }
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

  if (!player) return; // wait for init

  // Update
  player.update(dt, {
    up: input.isDown('ArrowUp'),
    down: input.isDown('ArrowDown'),
    left: input.isDown('ArrowLeft'),
    right: input.isDown('ArrowRight'),
    fire: input.isDown('Space'),
  }, projectiles);
  applyWorldBounds(player);

  // AI ships
  for (const s of enemies) {
    if (s instanceof AIShip) {
      s.updateAI(dt, projectiles, ships);
    }
    applyWorldBounds(s);
  }

  // Remove ships that have fully sunk
  for (let i = ships.length - 1; i >= 0; i--) {
    const s = ships[i];
    if (s.isFullySunk()) {
      ships.splice(i, 1);
      const ei = enemies.indexOf(s);
      if (ei >= 0) enemies.splice(ei, 1);
    }
  }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.update(dt);
    if (!p.alive) projectiles.splice(i, 1);
  }

  updateCannonHud(player);

  // Maintain minimum ships in view
  maintainShipsInView();

  // Camera follows ship, with slight lead in velocity direction
  const lead = 0.25;
  camera.x = player.pos.x + player.vel.x * lead;
  camera.y = player.pos.y + player.vel.y * lead;

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
      if (s.health <= 0 || s.isSinking) continue;
      if (s.hitsCircle(p.pos, p.radius)) {
        s.takeDamage(p.damage);
        // remove projectile immediately
        projectiles.splice(i, 1);
        i--;
        if (s.health <= 0 && !s.isSinking) {
          // Start sinking animation instead of removing immediately
          s.startSinking();
        }
        break;
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

  // HUD overlays
  drawMinimap(w, h);

  input.updateFrame();
}
requestAnimationFrame(loop);

// HUD cannon indicators
let portDots: HTMLSpanElement[] = [];
let starboardDots: HTMLSpanElement[] = [];

function setupCannonHud(s: Ship) {
  const hud = document.getElementById('hud')!;
  const portContainer = hud.querySelector('.dots.port') as HTMLDivElement;
  const starboardContainer = hud.querySelector('.dots.starboard') as HTMLDivElement;
  portContainer.innerHTML = '';
  starboardContainer.innerHTML = '';
  // Count per side based on offsets
  const portCount = s.cannons.filter(c => c.side === 'port').length;
  const starboardCount = s.cannons.filter(c => c.side === 'starboard').length;
  portDots = []; starboardDots = [];
  for (let i = 0; i < portCount; i++) {
    const dot = document.createElement('span'); dot.className = 'dot';
    portContainer.appendChild(dot); portDots.push(dot);
  }
  for (let i = 0; i < starboardCount; i++) {
    const dot = document.createElement('span'); dot.className = 'dot';
    starboardContainer.appendChild(dot); starboardDots.push(dot);
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
}

// Minimap in bottom-right showing player and other ships
function drawMinimap(w: number, h: number) {
  if (!player) return;
  const size = 180;
  const margin = 12;
  const pad = 10;
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
  const bounce = 0.4;
  if (s.pos.x < minX) { s.pos.x = minX; if (s.vel.x < 0) s.vel.x *= -bounce; }
  if (s.pos.x > maxX) { s.pos.x = maxX; if (s.vel.x > 0) s.vel.x *= -bounce; }
  if (s.pos.y < minY) { s.pos.y = minY; if (s.vel.y < 0) s.vel.y *= -bounce; }
  if (s.pos.y > maxY) { s.pos.y = maxY; if (s.vel.y > 0) s.vel.y *= -bounce; }
}

// Maintain minimum ships in player's view
function maintainShipsInView() {
  if (!player) return;

  const viewport = getViewportBounds(camera, canvas.width, canvas.height);
  const minShipsInView = 2;
  const maxTotalShips = 16;

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
