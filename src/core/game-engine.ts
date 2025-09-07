import { Vec2 } from './vector';
import { Input } from './input';
import { Assets } from './assets';
import { Camera } from './camera';
import { GameWorld } from './game-world';
import { EntityManager } from './entity-manager';
import { CollisionSystem } from '../systems/collision-system';
import { HUDSystem } from '../ui/hud-system';
import { Ship } from '../game/ship';
import { AIShip } from '../game/ai-ship';
import { Torpedo } from '../game/torpedo';
import type { WorldConfig, ShipControls } from './interfaces';

/**
 * Configuration object for game constants and tuning parameters.
 * Centralized location for all gameplay constants that might need adjustment.
 */
interface GameConfig {
  // World and camera settings
  world: WorldConfig;
  cameraVelocityLead: number;
  
  // Player ship configuration
  player: {
    length: number;
    width: number;
    cannonPairs: number;
    maxHealth: number;
    maxSpeed: number;
    thrust: number;
    reverseThrust: number;
    turnAccel: number;
    rudderRate: number;
    linearDrag: number;
    angularDrag: number;
  };
  
  // AI ship configuration
  ai: {
    length: number;
    width: number;
    cannonPairs: number;
    maxHealth: number;
    maxSpeed: number;
    thrust: number;
    reverseThrust: number;
    turnAccel: number;
    rudderRate: number;
    linearDrag: number;
    angularDrag: number;
    totalStartingShips: number;
    startInViewCount: number;
    spawnAnnulusMinR: number;
    spawnAnnulusMaxR: number;
    offmapSpawnDistance: number;
    spawnInViewMargin: number;
    minEnemiesInView: number;
    maxEnemiesTotal: number;
    aggressiveMinCount: number;
  };
  
  // Physics and collision settings
  physics: {
    collisionRestitution: number;
    collisionFriction: number;
    ramDamageCooldown: number;
  };
  
  // Upgrade and progression system
  progression: {
    treasurePickupRadius: number;
    respawnSecondsAfterSunk: number;
    shopHealDuration: number;
    torpedoCostXP: number;
    torpedoReloadS: number;
    torpedoArmingS: number;
    torpedoSpeed: number;
    upgradeBaseCostXP: number;
    upgradeInflation: number;
  };
}

/**
 * Main game engine that orchestrates all game systems.
 * Handles the game loop, system coordination, and high-level game state management.
 */
export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  
  // Core systems
  private input: Input;
  private camera: Camera;
  private gameWorld: GameWorld;
  private entityManager: EntityManager;
  private collisionSystem: CollisionSystem;
  private hudSystem: HUDSystem;
  
  // Game state
  private config: GameConfig;
  private shipSprite?: HTMLImageElement;
  private isRunning = false;
  private lastFrameTime = 0;
  
  // Player progression and upgrade system
  private playerXP = 0;
  private upgradeCosts = {
    repair: 100,
    reinforce: 100,
    cannons: 100
  };
  private healJobs: Array<{ remaining: number; perSec: number }> = [];
  private torpedoTubes: Array<{ cooldown: number; arming: number }> = [];
  
  // Respawn system
  private playerRespawnTimer: number | null = null;
  
  // Treasure system
  private treasures: Array<{ pos: Vec2; collected: boolean }> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;
    
    // Initialize configuration with all game constants
    this.config = this.createGameConfig();
    
    // Initialize core systems
    this.input = new Input();
    this.camera = new Camera();
    this.camera.setVelocityLeadFactor(this.config.cameraVelocityLead);
    
    this.gameWorld = new GameWorld(this.config.world);
    this.entityManager = new EntityManager();
    
    this.collisionSystem = new CollisionSystem({
      restitution: this.config.physics.collisionRestitution,
      friction: this.config.physics.collisionFriction,
      damageCooldown: this.config.physics.ramDamageCooldown
    });
    
    this.hudSystem = new HUDSystem();
    
    // Setup canvas resize handling
    this.setupCanvasResize();
  }

  /**
   * Create the centralized game configuration.
   * All gameplay constants are defined here for easy tuning.
   */
  private createGameConfig(): GameConfig {
    return {
      world: {
        bounds: { minX: -4000, maxX: 4000, minY: -4000, maxY: 4000 },
        boundaryBounce: 0.4
      },
      cameraVelocityLead: 0.25,
      
      player: {
        length: 140, width: 48, cannonPairs: 8,
        maxHealth: 140, maxSpeed: 180, thrust: 50, reverseThrust: 20,
        turnAccel: 1.5, rudderRate: 2, linearDrag: 0.4, angularDrag: 2.0
      },
      
      ai: {
        length: 95, width: 36, cannonPairs: 3,
        maxHealth: 60, maxSpeed: 170, thrust: 48, reverseThrust: 18,
        turnAccel: 1.0, rudderRate: 1.5, linearDrag: 0.4, angularDrag: 2.0,
        totalStartingShips: 16, startInViewCount: 4,
        spawnAnnulusMinR: 600, spawnAnnulusMaxR: 2600,
        offmapSpawnDistance: 500, spawnInViewMargin: 100,
        minEnemiesInView: 2, maxEnemiesTotal: 16, aggressiveMinCount: 2
      },
      
      physics: {
        collisionRestitution: 0.2, collisionFriction: 0.08, ramDamageCooldown: 0.6
      },
      
      progression: {
        treasurePickupRadius: 80, respawnSecondsAfterSunk: 5, shopHealDuration: 5,
        torpedoCostXP: 300, torpedoReloadS: 15, torpedoArmingS: 1, torpedoSpeed: 140,
        upgradeBaseCostXP: 100, upgradeInflation: 1.20
      }
    };
  }

  /**
   * Initialize the game engine and load assets
   */
  async initialize(): Promise<void> {
    this.hudSystem.initialize();
    
    // Try to load ship sprite, fallback to vector rendering if unavailable
    try {
      this.shipSprite = await Assets.loadImage('/ship.webp');
    } catch (error) {
      console.warn('Ship sprite not found, using vector rendering');
    }
    
    this.initializeGameWorld();
    this.resize(); // Ensure proper initial canvas sizing
  }

  /**
   * Create initial game world with player and AI ships
   */
  private initializeGameWorld(): void {
    // Create and configure player ship
    const player = new Ship(
      { 
        length: this.config.player.length, 
        width: this.config.player.width, 
        cannonPairs: this.config.player.cannonPairs 
      }, 
      this.shipSprite
    );
    
    this.configurePlayerShip(player);
    this.entityManager.setPlayer(player);
    
    // Setup HUD for the new player
    this.hudSystem.setupForPlayer(player, this.torpedoTubes);
    this.hudSystem.getOverlayManager(); // Initialize overlay manager
    
    // Spawn AI ships
    this.spawnInitialAIShips();
  }

  /**
   * Configure player ship with stats from config
   */
  private configurePlayerShip(player: Ship): void {
    const cfg = this.config.player;
    player.isPlayer = true;
    player.maxHealth = cfg.maxHealth;
    player.health = cfg.maxHealth;
    player.maxSpeed = cfg.maxSpeed;
    player.thrust = cfg.thrust;
    player.reverseThrust = cfg.reverseThrust;
    player.turnAccel = cfg.turnAccel;
    player.rudderRate = cfg.rudderRate;
    player.linDrag = cfg.linearDrag;
    player.angDrag = cfg.angularDrag;
  }

  /**
   * Spawn initial AI ships according to configuration
   */
  private spawnInitialAIShips(): void {
    const player = this.entityManager.player!;
    const cfg = this.config.ai;
    
    // Spawn ships in view first for immediate engagement
    for (let i = 0; i < cfg.startInViewCount; i++) {
      const ship = this.createAIShipInView();
      this.entityManager.addShip(ship);
    }
    
    // Spawn remaining ships scattered around the world
    const remainingShips = cfg.totalStartingShips - cfg.startInViewCount;
    for (let i = 0; i < remainingShips; i++) {
      const ship = this.createAIShipAroundPlayer();
      this.entityManager.addShip(ship);
    }
    
    this.ensureAggressiveAI();
  }

  /**
   * Create an AI ship positioned within the current viewport
   */
  private createAIShipInView(): AIShip {
    const player = this.entityManager.player!;
    const viewport = this.camera.getViewport(this.canvas.width, this.canvas.height, this.dpr);
    const margin = this.config.ai.spawnInViewMargin;
    
    // Random position within viewport with margin
    const x = viewport.left + margin + Math.random() * (viewport.width - margin * 2);
    const y = viewport.top + margin + Math.random() * (viewport.height - margin * 2);
    
    const ship = this.createConfiguredAIShip();
    ship.pos.set(x, y);
    
    // Face toward player with some variation
    const toPlayer = Vec2.sub(player.pos, ship.pos);
    ship.angle = Math.atan2(toPlayer.y, toPlayer.x) + (Math.random() - 0.5) * 0.6;
    
    return ship;
  }

  /**
   * Create an AI ship positioned in annulus around player
   */
  private createAIShipAroundPlayer(): AIShip {
    const player = this.entityManager.player!;
    const cfg = this.config.ai;
    
    // Random position in annulus around player
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random() * (cfg.spawnAnnulusMaxR ** 2 - cfg.spawnAnnulusMinR ** 2) + cfg.spawnAnnulusMinR ** 2);
    
    const ship = this.createConfiguredAIShip();
    ship.pos.set(
      player.pos.x + Math.cos(angle) * r,
      player.pos.y + Math.sin(angle) * r
    );
    ship.angle = angle + (Math.random() - 0.5) * 0.6;
    
    return ship;
  }

  /**
   * Create an AI ship positioned beyond world boundaries, sailing toward center
   */
  private createAIShipBeyondWorld(): AIShip {
    const cfg = this.config.ai;
    const bounds = this.gameWorld.getBounds();
    const spawnDistance = cfg.offmapSpawnDistance;
    
    // Choose spawn edge randomly
    const edge = Math.floor(Math.random() * 4);
    let spawnX: number, spawnY: number;
    
    switch (edge) {
      case 0: // Top
        spawnX = (Math.random() - 0.5) * (bounds.maxX - bounds.minX) * 1.5;
        spawnY = bounds.minY - spawnDistance;
        break;
      case 1: // Right
        spawnX = bounds.maxX + spawnDistance;
        spawnY = (Math.random() - 0.5) * (bounds.maxY - bounds.minY) * 1.5;
        break;
      case 2: // Bottom
        spawnX = (Math.random() - 0.5) * (bounds.maxX - bounds.minX) * 1.5;
        spawnY = bounds.maxY + spawnDistance;
        break;
      default: // Left
        spawnX = bounds.minX - spawnDistance;
        spawnY = (Math.random() - 0.5) * (bounds.maxY - bounds.minY) * 1.5;
        break;
    }
    
    const ship = this.createConfiguredAIShip();
    ship.pos.set(spawnX, spawnY);
    
    // Face toward world center with initial velocity
    const toCenter = Vec2.sub(new Vec2(0, 0), ship.pos).normalize();
    ship.angle = Math.atan2(toCenter.y, toCenter.x) + (Math.random() - 0.5) * 0.8;
    
    const initialSpeed = 50 + Math.random() * 50;
    ship.vel.set(toCenter.x * initialSpeed, toCenter.y * initialSpeed);
    
    return ship;
  }

  /**
   * Create and configure an AI ship with stats from config
   */
  private createConfiguredAIShip(): AIShip {
    const player = this.entityManager.player!;
    const cfg = this.config.ai;
    
    const ship = new AIShip(
      player, 
      { ship: { length: cfg.length, width: cfg.width, cannonPairs: cfg.cannonPairs }, sprite: this.shipSprite }
    );
    
    // Apply configuration
    ship.maxHealth = cfg.maxHealth;
    ship.health = cfg.maxHealth;
    ship.maxSpeed = cfg.maxSpeed;
    ship.thrust = cfg.thrust;
    ship.reverseThrust = cfg.reverseThrust;
    ship.turnAccel = cfg.turnAccel;
    ship.rudderRate = cfg.rudderRate;
    ship.linDrag = cfg.linearDrag;
    ship.angDrag = cfg.angularDrag;
    
    return ship;
  }

  /**
   * Start the game loop
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.gameLoop();
  }

  /**
   * Stop the game loop
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Main game loop - called every frame
   */
  private gameLoop = (): void => {
    if (!this.isRunning) return;
    
    try {
      const now = performance.now();
      const rawDt = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;
      
      // Clamp delta time for stability
      const dt = Math.min(0.033, rawDt);
      
      this.update(dt);
      this.render();
      
    } catch (error) {
      console.error('Game loop error:', error);
      // Try to continue running - don't crash the entire game
    }
    
    requestAnimationFrame(this.gameLoop);
  };

  /**
   * Update all game systems for one frame
   */
  private update(dt: number): void {
    const player = this.entityManager.player;
    if (!player) {
      console.warn('No player found, skipping update');
      return;
    }
    
    // Skip game logic updates if shop overlay is open
    const isShopOpen = this.hudSystem.getOverlayManager().isUpgradeOverlayVisible();
    
    if (!isShopOpen) {
      // Update player ship with input
      const controls = this.getPlayerControls();
      const projectiles = this.entityManager.getMutableProjectiles(); // Get mutable reference for ship to add projectiles
      player.update(dt, controls, projectiles);
      this.gameWorld.applyWorldBoundsToShip(player);
      
      // Update AI ships
      this.updateAIShips(dt);
      
      // Update camera to follow player
      this.camera.followTarget(player.pos, player.vel);
      
      // Update projectiles
      this.entityManager.update(dt);
      
      // Update collision system
      this.collisionSystem.update(dt);
      this.collisionSystem.resolveShipCollisions(this.entityManager.getAllShips() as Ship[]);
      
      // Handle projectile collisions
      this.handleProjectileCollisions();
      
      // Update progression systems
      this.updateProgressionSystems(dt);
      
      // Maintain AI ship population
      this.maintainAIPopulation();
      this.ensureAggressiveAI();
      
      // Clean up dead entities
      this.entityManager.cleanup();
    }
    
    // Handle player respawn logic (continues even when shop is open)
    this.updatePlayerRespawn(dt);
    
    // Update HUD
    this.hudSystem.update(player, this.playerXP, this.canAffordAnyUpgrade(), this.torpedoTubes);
    
    // Handle input for shop and other UI
    this.handleUIInput();
  }

  /**
   * Get current player control inputs
   */
  private getPlayerControls(): ShipControls {
    return {
      up: this.input.isDown('ArrowUp'),
      down: this.input.isDown('ArrowDown'),
      left: this.input.isDown('ArrowLeft'),
      right: this.input.isDown('ArrowRight'),
      fire: this.input.isDown('Space')
    };
  }

  /**
   * Update AI ships with their behavior logic
   */
  private updateAIShips(dt: number): void {
    const aiShips = this.entityManager.getEnemyShips().filter(ship => ship instanceof AIShip) as AIShip[];
    const allShips = this.entityManager.getAllShips() as Ship[];
    const worldBounds = this.gameWorld.getBounds();
    const projectiles = Array.from(this.entityManager.getAllProjectiles()); // Create a safe copy
    
    for (const aiShip of aiShips) {
      if (aiShip && !aiShip.isFullySunk()) { // Safety check
        aiShip.updateAI(dt, projectiles, allShips, worldBounds);
        this.gameWorld.applyWorldBoundsToShip(aiShip);
      }
    }
  }

  /**
   * Handle all projectile collision detection and resolution
   */
  private handleProjectileCollisions(): void {
    const ships = this.entityManager.getAllShips() as Ship[];
    
    // Remove projectiles that left the world
    this.entityManager.removeProjectilesOutsideWorld((pos) => this.gameWorld.isPositionOutsideWorld(pos));
    
    // Handle projectile-ship collisions using mutable projectiles array
    const projectiles = this.entityManager.getMutableProjectiles();
    const collisionResults = this.collisionSystem.checkProjectileHits(projectiles, ships);
    
    // Process collision results for game logic (XP, treasures, etc.)
    for (const result of collisionResults) {
      // Award XP to player for damage dealt
      if (result.projectile.owner === this.entityManager.player) {
        this.addXP(result.damage);
        
        // Extra XP for kills
        if (result.wasKilled) {
          this.addXP(20);
          
          // Spawn treasure where enemy ship was killed
          if (result.ship !== this.entityManager.player) {
            this.treasures.push({ pos: result.ship.pos.clone(), collected: false });
          }
        }
      }
    }
  }

  /**
   * Update progression systems (XP, upgrades, treasures, etc.)
   */
  private updateProgressionSystems(dt: number): void {
    const player = this.entityManager.player;
    if (!player || player.isSinking) return;
    
    // Auto-collect treasures in pickup radius
    for (const treasure of this.treasures) {
      if (!treasure.collected && player.hitsCircle(treasure.pos, this.config.progression.treasurePickupRadius)) {
        treasure.collected = true;
        this.addXP(40);
      }
    }
    
    // Apply healing over time from shop purchases
    this.applyHealingOverTime(dt, player);
    
    // Update torpedo systems
    this.updateTorpedoSystems(dt);
  }

  /**
   * Apply healing over time effects from shop purchases
   */
  private applyHealingOverTime(dt: number, player: Ship): void {
    for (let i = this.healJobs.length - 1; i >= 0; i--) {
      const job = this.healJobs[i];
      
      if (player.health >= player.maxHealth) {
        this.healJobs.splice(i, 1);
        continue;
      }
      
      const healAmount = Math.min(
        job.perSec * dt,
        player.maxHealth - player.health,
        job.remaining
      );
      
      if (healAmount > 0) {
        player.health += healAmount;
        job.remaining -= healAmount;
      }
      
      if (job.remaining <= 0.001) {
        this.healJobs.splice(i, 1);
      }
    }
  }

  /**
   * Update torpedo tube cooldowns and handle firing
   */
  private updateTorpedoSystems(dt: number): void {
    const player = this.entityManager.player;
    if (!player) return;
    
    // Update torpedo tube timers
    for (const tube of this.torpedoTubes) {
      if (tube.cooldown > 0) tube.cooldown -= dt;
      
      if (tube.arming > 0) {
        tube.arming -= dt;
        if (tube.arming <= 0) {
          // Launch torpedo
          const forward = player.forwardVec();
          const spawnPos = Vec2.add(player.pos, Vec2.scale(forward, player.length * 0.55));
          const torpedoVel = Vec2.add(player.vel, Vec2.scale(forward, this.config.progression.torpedoSpeed));
          
          this.entityManager.addProjectile(new Torpedo(spawnPos, torpedoVel, player));
          tube.cooldown = this.config.progression.torpedoReloadS;
        }
      }
    }
    
    // Handle torpedo firing input
    if (this.input.wasPressed('KeyT')) {
      const readyTube = this.torpedoTubes.find(tube => tube.cooldown <= 0 && tube.arming <= 0);
      if (readyTube) {
        readyTube.arming = this.config.progression.torpedoArmingS;
      }
    }
  }

  /**
   * Maintain appropriate AI ship population
   */
  private maintainAIPopulation(): void {
    const viewport = this.camera.getViewport(this.canvas.width, this.canvas.height, this.dpr);
    const enemiesInView = this.entityManager.getShipsInViewport(viewport)
      .filter(ship => ship !== this.entityManager.player && !ship.isSinking).length;
    
    const cfg = this.config.ai;
    const totalEnemies = this.entityManager.getEnemyShips().length;
    
    // Spawn ships beyond world borders if we need more in view
    while (enemiesInView < cfg.minEnemiesInView && totalEnemies < cfg.maxEnemiesTotal) {
      const newShip = this.createAIShipBeyondWorld();
      this.entityManager.addShip(newShip);
    }
  }

  /**
   * Ensure minimum number of aggressive AI ships
   */
  private ensureAggressiveAI(): void {
    const player = this.entityManager.player!;
    const aiShips = this.entityManager.getEnemyShips()
      .filter(ship => ship instanceof AIShip && !ship.isSinking) as AIShip[];
    
    // Sort by distance to player
    aiShips.sort((a, b) => 
      Vec2.sub(a.pos, player.pos).len() - Vec2.sub(b.pos, player.pos).len()
    );
    
    // Make closest ships aggressive
    for (let i = 0; i < aiShips.length; i++) {
      const shouldBeAggressive = i < this.config.ai.aggressiveMinCount;
      aiShips[i].aggressive = shouldBeAggressive;
    }
  }

  /**
   * Handle player respawn logic
   */
  private updatePlayerRespawn(dt: number): void {
    const player = this.entityManager.player;
    if (!player) return;
    
    // Start respawn timer when player is fully sunk
    if (player.isSinking && player.isFullySunk() && this.playerRespawnTimer === null) {
      this.playerRespawnTimer = this.config.progression.respawnSecondsAfterSunk;
    }
    
    // Update respawn countdown
    if (this.playerRespawnTimer !== null) {
      this.playerRespawnTimer -= dt;
      this.hudSystem.getOverlayManager().showRespawnCountdown(this.playerRespawnTimer);
      
      if (this.playerRespawnTimer <= 0) {
        this.respawnPlayer();
        this.playerRespawnTimer = null;
        this.hudSystem.getOverlayManager().hideRespawnCountdown();
      }
    }
  }

  /**
   * Respawn the player with a fresh ship
   */
  private respawnPlayer(): void {
    const oldPlayer = this.entityManager.player!;
    this.entityManager.removeShip(oldPlayer);
    
    // Create new player ship
    const newPlayer = new Ship(
      { length: this.config.player.length, width: this.config.player.width, cannonPairs: this.config.player.cannonPairs },
      this.shipSprite
    );
    
    this.configurePlayerShip(newPlayer);
    newPlayer.pos.set(0, 0);
    newPlayer.angle = -Math.PI / 2;
    
    this.entityManager.setPlayer(newPlayer);
    
    // Setup HUD for the respawned player
    this.hudSystem.setupForPlayer(newPlayer, this.torpedoTubes);
    
    // Retarget AI ships to new player
    const aiShips = this.entityManager.getEnemyShips().filter(ship => ship instanceof AIShip) as AIShip[];
    for (const aiShip of aiShips) {
      aiShip.target = newPlayer;
    }
  }

  /**
   * Handle UI input (shop, overlays, etc.)
   */
  private handleUIInput(): void {
    const overlayManager = this.hudSystem.getOverlayManager();
    
    if (overlayManager.isUpgradeOverlayVisible()) {
      // Handle upgrade selection
      if (this.input.wasPressed('Digit1') || this.input.wasPressed('Numpad1')) {
        this.applyUpgrade('repair');
      } else if (this.input.wasPressed('Digit2') || this.input.wasPressed('Numpad2')) {
        this.applyUpgrade('reinforce');
      } else if (this.input.wasPressed('Digit3') || this.input.wasPressed('Numpad3')) {
        this.applyUpgrade('cannons');
      } else if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyS')) {
        overlayManager.closeUpgradeOverlay();
      }
    } else {
      // Open shop
      if (this.input.wasPressed('KeyS')) {
        overlayManager.openUpgradeOverlay(this.playerXP, this.upgradeCosts, (upgradeType) => {
          this.applyUpgrade(upgradeType);
        });
      }
    }
    
    // Clear input frame state
    this.input.updateFrame();
  }

  /**
   * Apply an upgrade purchase
   */
  private applyUpgrade(upgradeType: string): void {
    const player = this.entityManager.player!;
    const cfg = this.config.progression;
    
    switch (upgradeType) {
      case 'repair':
        if (this.playerXP >= this.upgradeCosts.repair) {
          this.playerXP -= this.upgradeCosts.repair;
          const healAmount = Math.min(
            player.maxHealth * 0.5,
            player.maxHealth - player.health
          );
          this.scheduleHealing(healAmount);
        }
        break;
        
      case 'reinforce':
        if (this.playerXP >= this.upgradeCosts.reinforce) {
          this.playerXP -= this.upgradeCosts.reinforce;
          player.maxHealth += 30;
          this.scheduleHealing(30);
          this.upgradeCosts.reinforce = Math.ceil(this.upgradeCosts.reinforce * cfg.upgradeInflation);
        }
        break;
        
      case 'cannons':
        if (this.playerXP >= this.upgradeCosts.cannons) {
          this.playerXP -= this.upgradeCosts.cannons;
          player.addCannons(2);
          this.hudSystem.setupForPlayer(player, this.torpedoTubes); // Refresh HUD for new cannons
          this.upgradeCosts.cannons = Math.ceil(this.upgradeCosts.cannons * cfg.upgradeInflation);
        }
        break;
    }
    
    // Refresh the overlay to show updated costs/availability
    const overlayManager = this.hudSystem.getOverlayManager();
    overlayManager.openUpgradeOverlay(this.playerXP, this.upgradeCosts, (upgradeType) => {
      this.applyUpgrade(upgradeType);
    });
  }

  /**
   * Add XP to player's total
   */
  private addXP(amount: number): void {
    if (amount > 0) {
      this.playerXP += amount;
    }
  }

  /**
   * Check if player can afford any upgrades
   */
  private canAffordAnyUpgrade(): boolean {
    return this.playerXP >= Math.min(this.upgradeCosts.repair, this.upgradeCosts.reinforce, this.upgradeCosts.cannons);
  }

  /**
   * Schedule healing over time
   */
  private scheduleHealing(amount: number): void {
    if (amount > 0) {
      this.healJobs.push({
        remaining: amount,
        perSec: amount / this.config.progression.shopHealDuration
      });
    }
  }

  /**
   * Render the current game state
   */
  private render(): void {
    const worldWidth = this.canvas.width / this.dpr;
    const worldHeight = this.canvas.height / this.dpr;
    
    // Draw ocean background
    this.drawOcean(worldWidth, worldHeight);
    
    // Draw world boundaries
    this.drawWorldBounds(worldWidth, worldHeight);
    
    // Draw all game entities
    this.entityManager.draw(this.ctx, this.camera.position, worldWidth, worldHeight);
    
    // Draw treasures
    this.drawTreasures(worldWidth, worldHeight);
    
    // Draw HUD elements that render to canvas
    this.hudSystem.drawToCanvas(
      this.ctx, 
      this.entityManager.getAllShips() as Ship[], 
      this.camera.position, 
      worldWidth, 
      worldHeight, 
      this.gameWorld.getBounds()
    );
  }

  /**
   * Draw the ocean background with grid
   */
  private drawOcean(width: number, height: number): void {
    const camera = this.camera.position;
    
    // Ocean gradient
    const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#0b355f');
    gradient.addColorStop(1, '#0a2744');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);
    
    // World grid for visual reference
    const gridSize = 80;
    const majorEvery = 5;
    const leftWorld = camera.x - width / 2;
    const topWorld = camera.y - height / 2;
    const firstGridX = Math.floor(leftWorld / gridSize) * gridSize;
    const firstGridY = Math.floor(topWorld / gridSize) * gridSize;
    
    this.ctx.save();
    
    // Draw vertical grid lines
    for (let wx = firstGridX, i = 0; wx <= camera.x + width / 2; wx += gridSize, i++) {
      const screenX = wx - camera.x + width / 2;
      const isMajor = i % majorEvery === 0;
      this.ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)';
      this.ctx.lineWidth = isMajor ? 1.5 : 1;
      this.ctx.beginPath();
      this.ctx.moveTo(screenX, 0);
      this.ctx.lineTo(screenX, height);
      this.ctx.stroke();
    }
    
    // Draw horizontal grid lines
    for (let wy = firstGridY, i = 0; wy <= camera.y + height / 2; wy += gridSize, i++) {
      const screenY = wy - camera.y + height / 2;
      const isMajor = i % majorEvery === 0;
      this.ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)';
      this.ctx.lineWidth = isMajor ? 1.5 : 1;
      this.ctx.beginPath();
      this.ctx.moveTo(0, screenY);
      this.ctx.lineTo(width, screenY);
      this.ctx.stroke();
    }
    
    this.ctx.restore();
  }

  /**
   * Draw world boundary rectangle
   */
  private drawWorldBounds(width: number, height: number): void {
    const camera = this.camera.position;
    const bounds = this.gameWorld.getBounds();
    
    const screenLeft = bounds.minX - camera.x + width / 2;
    const screenTop = bounds.minY - camera.y + height / 2;
    const screenRight = bounds.maxX - camera.x + width / 2;
    const screenBottom = bounds.maxY - camera.y + height / 2;
    
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(screenLeft, screenTop, screenRight - screenLeft, screenBottom - screenTop);
    this.ctx.restore();
  }

  /**
   * Draw treasure chests on the map
   */
  private drawTreasures(width: number, height: number): void {
    const camera = this.camera.position;
    const pickupRadius = this.config.progression.treasurePickupRadius;
    
    for (const treasure of this.treasures) {
      if (treasure.collected) continue;
      
      const screenPos = this.camera.worldToScreen(treasure.pos, this.canvas.width, this.canvas.height, this.dpr);
      
      this.ctx.save();
      this.ctx.translate(screenPos.x, screenPos.y);
      
      // Draw pickup radius
      this.ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([6, 6]);
      this.ctx.beginPath();
      this.ctx.arc(0, 0, pickupRadius, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      
      // Draw treasure chest
      this.ctx.fillStyle = '#d97706';
      this.ctx.strokeStyle = '#92400e';
      this.ctx.lineWidth = 2;
      this.ctx.fillRect(-10, -8, 20, 16);
      this.ctx.strokeRect(-10, -8, 20, 16);
      
      // Draw lid
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.fillRect(-10, -12, 20, 8);
      this.ctx.strokeRect(-10, -12, 20, 8);
      
      // Draw lock
      this.ctx.fillStyle = '#fbbf24';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 2, 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.restore();
    }
  }

  /**
   * Handle canvas resize
   */
  private resize(): void {
    const width = Math.floor(window.innerWidth);
    const height = Math.floor(window.innerHeight);
    
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /**
   * Setup canvas resize handling
   */
  private setupCanvasResize(): void {
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
}