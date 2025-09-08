// Simple HTML5 Audio System for Cannon Fire and Hit Effects
class AudioManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private audioContext: AudioContext | null = null;
  private initialized = false;
  private activeSounds: Set<HTMLAudioElement> = new Set();

  constructor() {
    // Initialize audio context on first user interaction
    const initAudio = () => {
      if (!this.initialized) {
        this.initialized = true;
        try {
          this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          console.log('🎵 Audio system initialized');
        } catch (e) {
          console.warn('❌ Audio context not supported');
        }
      }
    };

    // Initialize on first user interaction
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('keydown', initAudio, { once: true });
  }

  async loadSound(name: string, url: string): Promise<void> {
    try {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.loop = false; // Ensure master audio doesn't loop

      return new Promise((resolve, reject) => {
        audio.addEventListener('canplaythrough', () => {
          this.sounds.set(name, audio);
          console.log(`✅ Sound loaded: ${name}`);
          resolve();
        }, { once: true });

        audio.addEventListener('error', (e) => {
          console.warn(`❌ Failed to load sound: ${name}`, e);
          reject(e);
        });

        audio.src = url;
        audio.load();
      });
    } catch (e) {
      console.warn(`❌ Error loading sound: ${name}`, e);
      throw e;
    }
  }

  playSound(name: string, volume: number = 1.0): void {
    const audio = this.sounds.get(name);
    if (!audio) {
      console.warn(`⚠️ Sound not found: ${name}`);
      return;
    }

    if (!this.initialized) {
      console.warn('⚠️ Audio not initialized yet');
      return;
    }

    try {
      // Create a new instance for overlapping sounds
      const soundInstance = audio.cloneNode() as HTMLAudioElement;
      soundInstance.volume = Math.max(0, Math.min(1, volume));
      
      // Ensure the cloned instance doesn't loop
      soundInstance.loop = false;
      
      // Track active sounds and clean up when finished
      this.activeSounds.add(soundInstance);
      
      const cleanup = () => {
        this.activeSounds.delete(soundInstance);
        soundInstance.removeEventListener('ended', cleanup);
        soundInstance.removeEventListener('error', cleanup);
        soundInstance.src = '';
        soundInstance.load(); // This helps release resources
      };
      
      soundInstance.addEventListener('ended', cleanup, { once: true });
      soundInstance.addEventListener('error', cleanup, { once: true });

      // Play the sound
      const playPromise = soundInstance.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.warn('⚠️ Audio play failed:', e);
          cleanup(); // Clean up on play failure
        });
      }
    } catch (e) {
      console.warn('⚠️ Error playing sound:', e);
    }
  }

  isSoundLoaded(name: string): boolean {
    return this.sounds.has(name);
  }

  getLoadedSounds(): string[] {
    return Array.from(this.sounds.keys());
  }

  getActiveSoundCount(): number {
    return this.activeSounds.size;
  }

  stopAllSounds(): void {
    for (const sound of this.activeSounds) {
      try {
        sound.pause();
        sound.currentTime = 0;
        sound.src = '';
        sound.load();
      } catch (e) {
        console.warn('⚠️ Error stopping sound:', e);
      }
    }
    this.activeSounds.clear();
    console.log('🔇 All sounds stopped');
  }
}

import { MAX_AUDIO_DISTANCE } from './constants.js';
import { Vec2 } from './vector.js';

// Global audio manager instance
export const audioManager = new AudioManager();

// Global reference to player ship position (set by main game)
let playerPosition: Vec2 | null = null;

export const setPlayerPosition = (position: Vec2) => {
  playerPosition = position;
};

// Helper function to check if sound should play based on distance
const shouldPlaySound = (soundPosition: Vec2 | null): boolean => {
  if (!playerPosition || !soundPosition) {
    return true; // Always play if we don't have position info
  }
  
  const distance = Vec2.sub(soundPosition, playerPosition).len();
  return distance <= MAX_AUDIO_DISTANCE;
};

// Convenience functions
export const playCannonSound = (isPlayer: boolean, soundPosition?: Vec2) => {
  if (soundPosition && !shouldPlaySound(soundPosition)) {
    return; // Don't play sound if too far away
  }
  
  const volume = isPlayer ? 1.0 : 0.4; // 100% for player, 40% for enemies
  audioManager.playSound('cannon_fire', volume);
};

export const playHitSound = (victimIsPlayer: boolean, attackerIsPlayer: boolean, victimPosition?: Vec2) => {
  if (victimIsPlayer) {
    // Player ship was hit - always play player hit sound (no distance check needed)
    audioManager.playSound('player_hit', 0.6); // 60% volume for player being hit
  } else if (attackerIsPlayer) {
    // Enemy ship was hit by player - always play since player is attacking
    audioManager.playSound('cannon_hit', 1.0); // Full volume for player hits
  } else {
    // Enemy ship was hit by enemy - check distance
    if (victimPosition && !shouldPlaySound(victimPosition)) {
      return; // Don't play sound if too far away
    }
    audioManager.playSound('cannon_hit', 0.4); // 40% volume for enemy vs enemy
  }
};

export const loadCannonSound = async (): Promise<void> => {
  try {
    await audioManager.loadSound('cannon_fire', '/cannon_fire.mp3');
    console.log('🎯 Cannon fire sound ready!');
  } catch (e) {
    console.warn('❌ Failed to load cannon sound:', e);
  }
};

export const loadHitSound = async (): Promise<void> => {
  try {
    await audioManager.loadSound('cannon_hit', '/cannon_hit.mp3');
    console.log('💥 Cannon hit sound ready!');
  } catch (e) {
    console.warn('❌ Failed to load hit sound:', e);
  }
};

export const loadPlayerHitSound = async (): Promise<void> => {
  try {
    await audioManager.loadSound('player_hit', '/player_hit.mp3');
    console.log('🛡️ Player hit sound ready!');
  } catch (e) {
    console.warn('❌ Failed to load player hit sound:', e);
  }
};

export const playTorpedoLoadSound = () => {
  audioManager.playSound('torpedo_load', 0.8); // 80% volume for load sound
};

export const playTorpedoLaunchSound = () => {
  audioManager.playSound('torpedo_launch', 1.0); // Full volume for launch
};

export const loadTorpedoSounds = async (): Promise<void> => {
  try {
    await Promise.all([
      audioManager.loadSound('torpedo_load', '/torpedo_load.mp3'),
      audioManager.loadSound('torpedo_launch', '/torpedo_launch.mp3')
    ]);
    console.log('🚀 Torpedo sounds ready!');
  } catch (e) {
    console.warn('❌ Failed to load torpedo sounds:', e);
  }
};

export const playShipSinkingSound = (isPlayer: boolean, isCapitalShip: boolean, shipPosition?: Vec2) => {
  if (shipPosition && !shouldPlaySound(shipPosition)) {
    return; // Don't play sound if too far away
  }

  let volume = 0.4; // Default 40% for small ships

  if (isPlayer) {
    volume = 1.0; // 100% volume when player loses
  } else if (isCapitalShip) {
    volume = 0.8; // 80% volume for capital ships
  }
  // volume remains 0.4 (40%) for small ships

  audioManager.playSound('ship_sinking', volume);
};

export const loadShipSinkingSound = async (): Promise<void> => {
  try {
    await audioManager.loadSound('ship_sinking', '/ship_sinking.mp3');
    console.log('🌊 Ship sinking sound ready!');
  } catch (e) {
    console.warn('❌ Failed to load ship sinking sound:', e);
  }
};

// Emergency audio management functions
export const stopAllSounds = () => {
  audioManager.stopAllSounds();
};

export const getActiveSoundCount = () => {
  return audioManager.getActiveSoundCount();
};
