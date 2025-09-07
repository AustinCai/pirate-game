import type { Ship } from '../game/ship';
import { Vec2 } from '../core/vector';

/**
 * Manages all HUD (Heads-Up Display) elements including health bars,
 * cannon indicators, metrics, and UI overlays.
 */
export class HUDSystem {
  private cannonIndicators = new CannonIndicators();
  private metricsDisplay = new MetricsDisplay();
  private minimap = new Minimap();
  private overlayManager = new OverlayManager();

  /**
   * Initialize HUD system with required DOM elements
   */
  initialize(): void {
    this.cannonIndicators.initialize();
    this.metricsDisplay.initialize();
    this.overlayManager.initialize();
  }

  /**
   * Update all HUD elements for the current frame
   */
  update(player: Ship, playerXP: number, canAffordUpgrades: boolean, torpedoTubes: any[] = []): void {
    this.cannonIndicators.update(player, torpedoTubes);
    this.metricsDisplay.update(player, playerXP, canAffordUpgrades);
  }

  /**
   * Setup HUD for a new player ship (called when ship is created/respawned)
   */
  setupForPlayer(player: Ship, torpedoTubes: any[] = []): void {
    this.cannonIndicators.setupForShip(player, torpedoTubes);
  }

  /**
   * Draw HUD elements that are rendered to canvas (like minimap)
   */
  drawToCanvas(ctx: CanvasRenderingContext2D, ships: Ship[], camera: Vec2, canvasWidth: number, canvasHeight: number, worldBounds: any): void {
    this.minimap.draw(ctx, ships, camera, canvasWidth, canvasHeight, worldBounds);
  }

  /**
   * Get the overlay manager for shop/upgrade interfaces
   */
  getOverlayManager(): OverlayManager {
    return this.overlayManager;
  }
}

/**
 * Manages cannon readiness indicators for both port and starboard sides
 */
class CannonIndicators {
  private portDots: HTMLSpanElement[] = [];
  private starboardDots: HTMLSpanElement[] = [];
  private torpedoDots: HTMLSpanElement[] = [];

  initialize(): void {
    // Setup is done when a ship is first assigned
  }

  /**
   * Setup cannon indicators based on ship's cannon configuration
   */
  setupForShip(ship: Ship, torpedoTubes: any[] = []): void {
    const hud = document.getElementById('hud')!;
    const portContainer = hud.querySelector('.dots.port') as HTMLDivElement;
    const starboardContainer = hud.querySelector('.dots.starboard') as HTMLDivElement;
    const torpedoContainer = hud.querySelector('.dots.torpedo') as HTMLDivElement;

    // Clear existing indicators
    portContainer.innerHTML = '';
    starboardContainer.innerHTML = '';
    if (torpedoContainer) torpedoContainer.innerHTML = '';

    // Count cannons per side
    const portCannons = ship.cannons.filter(c => c.side === 'port');
    const starboardCannons = ship.cannons.filter(c => c.side === 'starboard');

    // Create port cannon indicators
    this.portDots = [];
    for (let i = 0; i < portCannons.length; i++) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      portContainer.appendChild(dot);
      this.portDots.push(dot);
    }

    // Create starboard cannon indicators
    this.starboardDots = [];
    for (let i = 0; i < starboardCannons.length; i++) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      starboardContainer.appendChild(dot);
      this.starboardDots.push(dot);
    }

    // Create torpedo indicators
    this.torpedoDots = [];
    if (torpedoContainer && torpedoTubes.length > 0) {
      for (let i = 0; i < torpedoTubes.length; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        torpedoContainer.appendChild(dot);
        this.torpedoDots.push(dot);
      }
    }
  }

  /**
   * Update cannon indicator states to show reload progress
   */
  update(ship: Ship, torpedoTubes: any[] = []): void {
    // Update port cannons
    const portCannons = ship.cannons.filter(c => c.side === 'port');
    for (let i = 0; i < this.portDots.length && i < portCannons.length; i++) {
      this.updateCannonDot(this.portDots[i], portCannons[i]);
    }

    // Update starboard cannons
    const starboardCannons = ship.cannons.filter(c => c.side === 'starboard');
    for (let i = 0; i < this.starboardDots.length && i < starboardCannons.length; i++) {
      this.updateCannonDot(this.starboardDots[i], starboardCannons[i]);
    }

    // Update torpedo tubes
    for (let i = 0; i < this.torpedoDots.length && i < torpedoTubes.length; i++) {
      this.updateTorpedoDot(this.torpedoDots[i], torpedoTubes[i]);
    }
  }

  /**
   * Update a single cannon indicator dot
   */
  private updateCannonDot(dot: HTMLSpanElement, cannon: any): void {
    if (!cannon || !dot) {
      return; // Safety check to prevent crashes
    }

    const ready = cannon.cooldown <= 0;
    dot.classList.toggle('ready', ready);

    if (!ready) {
      // Show reload progress as a circular fill
      const progress = 1 - (cannon.cooldown / cannon.reloadTime);
      const angle = Math.max(0, Math.min(1, progress)) * 360;
      dot.style.background = `conic-gradient(#f59e0b ${angle}deg, rgba(255,255,255,0.08) 0)`;
    } else {
      dot.style.background = '';
    }
  }

  /**
   * Update a single torpedo indicator dot
   */
  private updateTorpedoDot(dot: HTMLSpanElement, tube: any): void {
    if (!tube || !dot) {
      return; // Safety check to prevent crashes
    }

    const ready = tube.cooldown <= 0 && tube.arming <= 0;
    dot.classList.toggle('ready', ready);

    if (!ready) {
      // Determine which phase we're in (arming or cooldown)
      const isArming = tube.arming > 0;
      const total = isArming ? 1 : 15; // TORPEDO_ARMING_S : TORPEDO_RELOAD_S
      const remaining = isArming ? tube.arming : tube.cooldown;
      const progress = 1 - (remaining / total);
      const angle = Math.max(0, Math.min(1, progress)) * 360;
      
      // Use blue color for torpedoes
      dot.style.background = `conic-gradient(#60a5fa ${angle}deg, rgba(255,255,255,0.08) 0)`;
    } else {
      dot.style.background = '';
    }
  }
}

/**
 * Manages the display of player metrics (position, speed, XP)
 */
class MetricsDisplay {
  private element: HTMLDivElement | null = null;

  initialize(): void {
    const hud = document.getElementById('hud')!;
    this.element = document.createElement('div');
    this.element.id = 'metrics';
    this.element.style.marginTop = '8px';
    this.element.style.fontSize = '12px';
    this.element.style.opacity = '0.9';
    this.element.style.whiteSpace = 'pre';
    hud.appendChild(this.element);
  }

  /**
   * Update metrics display with current player information
   */
  update(ship: Ship, playerXP: number, canAffordUpgrades: boolean): void {
    if (!this.element) return;

    const x = Math.round(ship.pos.x);
    const y = Math.round(ship.pos.y);
    const speed = Math.round(ship.vel.len());
    const xp = Math.floor(playerXP);
    const shopHint = canAffordUpgrades ? ' (press S shop)' : '';

    this.element.textContent = `Pos: (${x}, ${y})\nSpeed: ${speed} px/s\nXP: ${xp}${shopHint}`;
  }
}

/**
 * Manages the minimap display in the bottom-left corner
 */
class Minimap {
  private static readonly SIZE = 180;
  private static readonly MARGIN = 12;
  private static readonly PADDING = 10;

  /**
   * Draw the minimap showing world bounds and ship positions
   */
  draw(ctx: CanvasRenderingContext2D, ships: Ship[], camera: Vec2, canvasWidth: number, canvasHeight: number, worldBounds: any): void {
    if (!ctx || !ships || !camera || !worldBounds) {
      return; // Safety check to prevent crashes
    }
    const size = Minimap.SIZE;
    const margin = Minimap.MARGIN;
    const padding = Minimap.PADDING;
    const dpr = window.devicePixelRatio || 1;
    
    // Convert canvas dimensions to world space
    const worldCanvasWidth = canvasWidth / dpr;
    const worldCanvasHeight = canvasHeight / dpr;
    
    // Position in bottom-left corner instead of bottom-right
    const x = margin;
    const y = worldCanvasHeight - size - margin;
    const innerSize = size - padding * 2;
    
    const worldWidth = worldBounds.maxX - worldBounds.minX;
    const worldHeight = worldBounds.maxY - worldBounds.minY;
    const scale = Math.min(innerSize / worldWidth, innerSize / worldHeight);
    
    const xOffset = (innerSize - worldWidth * scale) / 2;
    const yOffset = (innerSize - worldHeight * scale) / 2;

    ctx.save();
    
    // Draw minimap background
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y, size, size);
    
    // Draw border
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

    // Draw world bounds
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(x + padding + xOffset, y + padding + yOffset, worldWidth * scale, worldHeight * scale);

    // Draw ships
    for (const ship of ships) {
      const shipX = x + padding + xOffset + (ship.pos.x - worldBounds.minX) * scale;
      const shipY = y + padding + yOffset + (ship.pos.y - worldBounds.minY) * scale;
      
      ctx.beginPath();
      ctx.arc(shipX, shipY, ship.isPlayer ? 4 : 3, 0, Math.PI * 2);
      
      if (ship.isPlayer) {
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
}

/**
 * Manages overlay interfaces like the upgrade shop
 */
export class OverlayManager {
  private upgradeOverlay: HTMLDivElement | null = null;
  private respawnLabel: HTMLDivElement | null = null;
  private isUpgradeOverlayOpen = false;

  initialize(): void {
    // Overlays are created on demand
  }

  /**
   * Check if the upgrade overlay is currently open
   */
  isUpgradeOverlayVisible(): boolean {
    return this.isUpgradeOverlayOpen;
  }

  /**
   * Open the upgrade/shop overlay
   */
  openUpgradeOverlay(playerXP: number, upgradeCosts: any, onUpgrade: (upgradeType: string) => void): void {
    if (!this.upgradeOverlay) {
      this.createUpgradeOverlay();
    }

    this.updateUpgradeOverlayContent(playerXP, upgradeCosts, onUpgrade);
    this.isUpgradeOverlayOpen = true;
    this.upgradeOverlay!.style.display = 'block';
  }

  /**
   * Close the upgrade overlay
   */
  closeUpgradeOverlay(): void {
    this.isUpgradeOverlayOpen = false;
    if (this.upgradeOverlay) {
      this.upgradeOverlay.style.display = 'none';
    }
  }

  /**
   * Show respawn countdown
   */
  showRespawnCountdown(secondsRemaining: number): void {
    if (!this.respawnLabel) {
      this.createRespawnLabel();
    }
    
    this.respawnLabel!.style.display = 'inline-block';
    this.respawnLabel!.textContent = `Respawning in ${Math.ceil(secondsRemaining)}s...`;
  }

  /**
   * Hide respawn countdown
   */
  hideRespawnCountdown(): void {
    if (this.respawnLabel) {
      this.respawnLabel.style.display = 'none';
    }
  }

  /**
   * Create the upgrade overlay DOM structure
   */
  private createUpgradeOverlay(): void {
    const hud = document.getElementById('hud')!;
    this.upgradeOverlay = document.createElement('div');
    this.upgradeOverlay.id = 'upgrade-overlay';
    
    Object.assign(this.upgradeOverlay.style, {
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
    });
    
    hud.appendChild(this.upgradeOverlay);
  }

  /**
   * Update the content of the upgrade overlay
   */
  private updateUpgradeOverlayContent(playerXP: number, upgradeCosts: any, onUpgrade: (upgradeType: string) => void): void {
    if (!this.upgradeOverlay) return;

    this.upgradeOverlay.innerHTML = '';
    
    // Title
    const title = document.createElement('div');
    title.textContent = `Shop — XP: ${Math.floor(playerXP)}`;
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '8px';
    this.upgradeOverlay.appendChild(title);

    // Button container
    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    });
    this.upgradeOverlay.appendChild(buttonContainer);

    // Helper function to create upgrade buttons
    const createButton = (text: string, enabled: boolean, callback: () => void) => {
      const button = document.createElement('button');
      button.textContent = text;
      
      Object.assign(button.style, {
        padding: '8px 10px',
        borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.4)',
        background: enabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)',
        color: enabled ? '#e6f0ff' : 'rgba(230,240,255,0.5)',
        cursor: enabled ? 'pointer' : 'not-allowed'
      });
      
      if (enabled) {
        button.addEventListener('click', callback);
      }
      
      buttonContainer.appendChild(button);
    };

    // Create upgrade buttons
    createButton(
      `1) Repair ship (+50% max) — ${Math.ceil(upgradeCosts.repair)} XP`,
      playerXP >= upgradeCosts.repair,
      () => onUpgrade('repair')
    );
    
    createButton(
      `2) Reinforce hull (+30 max & current) — ${Math.ceil(upgradeCosts.reinforce)} XP`,
      playerXP >= upgradeCosts.reinforce,
      () => onUpgrade('reinforce')
    );
    
    createButton(
      `3) Add cannons (+2 per side) — ${Math.ceil(upgradeCosts.cannons)} XP`,
      playerXP >= upgradeCosts.cannons,
      () => onUpgrade('cannons')
    );

    // Instructions
    const hint = document.createElement('div');
    hint.textContent = 'Tip: press 1 / 2 / 3 to choose';
    hint.style.opacity = '0.8';
    hint.style.marginTop = '8px';
    hint.style.fontSize = '12px';
    this.upgradeOverlay.appendChild(hint);
  }

  /**
   * Create the respawn countdown label
   */
  private createRespawnLabel(): void {
    const hud = document.getElementById('hud')!;
    this.respawnLabel = document.createElement('div');
    this.respawnLabel.id = 'respawn-label';
    
    Object.assign(this.respawnLabel.style, {
      marginTop: '8px',
      padding: '4px 8px',
      borderRadius: '6px',
      background: 'rgba(0,0,0,0.35)',
      border: '1px solid rgba(255,255,255,0.25)',
      display: 'none'
    });
    
    hud.appendChild(this.respawnLabel);
  }
}