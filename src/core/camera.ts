import { Vec2 } from './vector';
import type { ViewportInfo } from './interfaces';

/**
 * Camera system for viewport management and world-to-screen coordinate conversion.
 * Handles smooth following of targets with optional velocity prediction.
 */
export class Camera {
  private _position = new Vec2(0, 0);
  private velocityLeadFactor = 0.25; // How much to lead the camera based on target velocity

  constructor(initialPosition = new Vec2(0, 0)) {
    this._position = initialPosition.clone();
  }

  /**
   * Get the current camera position in world coordinates
   */
  get position(): Vec2 {
    return this._position.clone();
  }

  /**
   * Set the camera position directly
   */
  setPosition(position: Vec2): void {
    this._position.set(position.x, position.y);
  }

  /**
   * Update camera to follow a target with velocity prediction.
   * This creates smoother camera movement by anticipating where the target is going.
   */
  followTarget(targetPosition: Vec2, targetVelocity: Vec2): void {
    // Lead the camera slightly based on target velocity for smoother following
    const leadOffset = Vec2.scale(targetVelocity, this.velocityLeadFactor);
    const targetCameraPos = Vec2.add(targetPosition, leadOffset);
    
    this._position.set(targetCameraPos.x, targetCameraPos.y);
  }

  /**
   * Get viewport bounds in world coordinates
   * Used for culling objects outside the visible area
   */
  getViewport(canvasWidth: number, canvasHeight: number, devicePixelRatio = 1): ViewportInfo {
    // Convert canvas dimensions to world space
    const worldWidth = canvasWidth / devicePixelRatio;
    const worldHeight = canvasHeight / devicePixelRatio;
    
    const halfWidth = worldWidth / 2;
    const halfHeight = worldHeight / 2;

    return {
      left: this._position.x - halfWidth,
      right: this._position.x + halfWidth,
      top: this._position.y - halfHeight,
      bottom: this._position.y + halfHeight,
      width: worldWidth,
      height: worldHeight
    };
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(worldPos: Vec2, canvasWidth: number, canvasHeight: number, devicePixelRatio = 1): Vec2 {
    const worldWidth = canvasWidth / devicePixelRatio;
    const worldHeight = canvasHeight / devicePixelRatio;
    
    return new Vec2(
      worldPos.x - this._position.x + worldWidth / 2,
      worldPos.y - this._position.y + worldHeight / 2
    );
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenPos: Vec2, canvasWidth: number, canvasHeight: number, devicePixelRatio = 1): Vec2 {
    const worldWidth = canvasWidth / devicePixelRatio;
    const worldHeight = canvasHeight / devicePixelRatio;
    
    return new Vec2(
      screenPos.x - worldWidth / 2 + this._position.x,
      screenPos.y - worldHeight / 2 + this._position.y
    );
  }

  /**
   * Set how much the camera should lead based on target velocity
   */
  setVelocityLeadFactor(factor: number): void {
    this.velocityLeadFactor = Math.max(0, Math.min(1, factor));
  }
}