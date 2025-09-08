import * as Constants from '../core/constants';
import { AIShip, type AIOptions } from './ai-ship';
import { Ship, type ShipOptions } from './ship';

export class CapitalShip extends AIShip {
    constructor(target: Ship, opts: { ship?: ShipOptions; ai?: AIOptions; sprite?: HTMLImageElement } = {}) {
        // Create with larger dimensions and more cannons
        const capitalOpts: ShipOptions = {
            length: Constants.CAPITAL_LENGTH_PX,
            width: Constants.CAPITAL_WIDTH_PX,
            cannonPairs: Constants.CAPITAL_CANNON_PAIRS,
            ...opts.ship
        };

        super(target, { ...opts, ship: capitalOpts });

        // Enhanced stats
        this.maxHealth = Constants.CAPITAL_MAX_HEALTH;
        this.health = this.maxHealth;
        this.maxSpeed = Constants.CAPITAL_MAX_SPEED;
        this.thrust = Constants.CAPITAL_THRUST;
        this.reverseThrust = Constants.CAPITAL_REVERSE_THRUST;
        this.turnAccel = Constants.CAPITAL_TURN_ACCEL;
        this.rudderRate = Constants.CAPITAL_RUDDER_RATE;

        // Enhanced aggressive AI settings for capital ships
        this.fireRange = Constants.CAPITAL_FIRE_RANGE;
        this.desiredDistance = Constants.CAPITAL_DESIRED_DISTANCE * 0.8; // Even closer engagement
        this.aggressive = true; // Capital ships are always aggressive

        // Capital ships have stronger edge avoidance (they're slower and more valuable)
        this.edgeAvoidStrength = 1.5;

        // Capital ships are elite hunters with improved combat stats
        this.combatAggressiveness = 1.5; // Multiplier for combat behavior
        this.pursuitPersistence = 2.0; // Much more persistent in pursuit
    }
}
