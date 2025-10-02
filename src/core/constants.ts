// =========================
// EXPERIENCE SYSTEM CONSTANTS
// =========================

// XP rewards for combat and collection
export const XP_DAMAGE_MULTIPLIER = 0.25; // XP gained = 25% of damage dealt (increased from 12.5%)
export const XP_SINK_BONUS = 80; // Bonus XP for sinking a ship
export const XP_TREASURE_LARGE = 400; // XP from collecting large treasure (capital ships)

// Shop upgrade costs
export const XP_UPGRADE_BASE_COST = 100; // Base cost for shop upgrades
export const XP_UPGRADE_INFLATION = 1.20; // 20% cost increase per purchase for certain upgrades
export const XP_TORPEDO_COST = 300; // Cost to buy a torpedo tube

// =========================
// SHIP STAT CONSTANTS
// =========================

// Player ship constants
export const PLAYER_LENGTH_PX = 140;
export const PLAYER_WIDTH_PX = 48;
export const PLAYER_CANNON_PAIRS = 4; // pairs per side
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_MAX_SPEED = 200;
export const PLAYER_THRUST = 60;
export const PLAYER_REVERSE_THRUST = 30;
export const PLAYER_TURN_ACCEL = 1.5; // rad/s^2 base
export const PLAYER_RUDDER_RATE = 2.0; // how fast rudder moves per second
export const PLAYER_LINEAR_DRAG = 0.4; // water drag
export const PLAYER_ANGULAR_DRAG = 2.0; // angular drag

// Regular AI ship constants
export const AI_LENGTH_PX = 95;
export const AI_WIDTH_PX = 36;
export const AI_CANNON_PAIRS = 3; // pairs per side
export const AI_MAX_HEALTH = 80;
export const AI_MAX_SPEED = 170;
export const AI_THRUST = 48;
export const AI_REVERSE_THRUST = 18;
export const AI_TURN_ACCEL = 1.0;
export const AI_RUDDER_RATE = 1.5;
export const AI_LINEAR_DRAG = 0.4;
export const AI_ANGULAR_DRAG = 2.0;

// Capital ship constants
export const CAPITAL_LENGTH_PX = 200;
export const CAPITAL_WIDTH_PX = 55;
export const CAPITAL_CANNON_PAIRS = 14; // pairs per side
export const CAPITAL_MAX_HEALTH = 300;
export const CAPITAL_MAX_SPEED = 120;
export const CAPITAL_THRUST = 34;
export const CAPITAL_REVERSE_THRUST = 14;
export const CAPITAL_TURN_ACCEL = 0.7;
export const CAPITAL_RUDDER_RATE = 1.0;
export const CAPITAL_FIRE_RANGE = 600;
export const CAPITAL_DESIRED_DISTANCE = 400;

// =========================
// GAMEPLAY CONSTANTS
// =========================

// Population and spawning
export const AI_TOTAL_STARTING_SHIPS = 16;
export const MAX_ENEMIES_TOTAL = 16;
// Removed AGGRESSIVE_MIN_COUNT - ships now only become aggressive when damaged

// Collision + physics tuning
export const WORLD_BOUNDARY_BOUNCE = 0.4;
export const COLLISION_RESTITUTION = 0.2; // bounce factor on ship-ship collision
export const COLLISION_FRICTION = 0.08; // tangential friction factor
export const RAM_DAMAGE_COOLDOWN_S = 4; // seconds between damage ticks for a pair

// Treasure / upgrades
export const TREASURE_PICKUP_RADIUS = 80; // px
export const RESPAWN_SECONDS_AFTER_FULLY_SUNK = 5;
export const SHOP_HEAL_DURATION_S = 5; // seconds to apply healing from shop upgrades

// Torpedo system
export const TORPEDO_COST_XP = 400;
export const TORPEDO_RELOAD_S = 15;
export const TORPEDO_ARMING_S = 1;
export const TORPEDO_SPEED = 120;

// Audio system
export const MAX_AUDIO_DISTANCE = 1200; // Maximum distance to play sound effects

// Minimap
export const MINIMAP_SIZE_PX = 180;
export const MINIMAP_MARGIN_PX = 12;
export const MINIMAP_PAD_PX = 10;

// Grid system
export const GRID_SIZE_WORLD_UNITS = 160; // Fixed grid spacing in world units
export const GRID_MAJOR_LINE_EVERY = 5; // Every 5th line is major

// World dimensions and camera behavior
export const WORLD_BOUNDS = { minX: -4000, maxX: 4000, minY: -4000, maxY: 4000 } as const;
export const CAMERA_VELOCITY_LEAD_FACTOR = 0.25; // lead camera by velocity fraction

// AI behavior constants (from ai-ship.ts)
export const AI_DEFAULT_FIRE_RANGE = 520;
export const AI_DEFAULT_DESIRED_DISTANCE = 320;
export const AI_COLLISION_LOOKAHEAD_S = 2.5;
export const AI_DESIRED_SEPARATION_MULT = 1.6; // separation ~ 1.6x ship length
export const AI_EDGE_AVOID_MARGIN_PX = 1200; // Increased from 800 - stronger edge avoidance
export const AI_WANDER_SAFE_PAD_PX = 2000; // Increased from 1000 - much safer wandering bounds to prefer center
export const AI_WANDER_REACH_RADIUS_PX = 150;
export const AI_WANDER_TIME_MIN_S = 6;
export const AI_WANDER_TIME_MAX_S = 12;
