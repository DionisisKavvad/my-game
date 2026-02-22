export const GAME_CONFIG = {
  energy: {
    maxEnergy: 120,
    regenRateMinutes: 5,
    regenAmount: 1,
  },

  player: {
    startingGold: 500,
    startingGems: 100,
    startingEnergy: 120,
    maxLevel: 100,
  },

  hero: {
    maxLevel: 100,
    maxStars: 7,
    xpPerLevel: (level: number): number => Math.floor(100 * Math.pow(1.15, level - 1)),
  },

  battle: {
    maxTurns: 50,
    baseTimeout: 300000, // 5 minutes
    critChance: 0.15,
    critMultiplier: 1.5,
    dodgeChance: 0.05,
    minDamage: 1,
  },

  campaign: {
    energyCostPerStage: 6,
    maxStarsPerStage: 3,
  },

  xp: {
    playerXpPerLevel: (level: number): number => Math.floor(200 * Math.pow(1.2, level - 1)),
  },
} as const;
