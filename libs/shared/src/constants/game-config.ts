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
    goldCostPerLevel: (level: number): number => Math.floor(50 * Math.pow(1.12, level - 1)),
    starUpgradeGoldCost: (currentStars: number): number => Math.floor(500 * Math.pow(2.5, currentStars - 1)),
    starUpgradeLevelRequirement: (targetStars: number): number => (targetStars - 1) * 10,
    maxTeamSize: 5,
    starterHeroTemplateIds: ['warrior_bold', 'mage_fire', 'healer_light'],
  },

  battle: {
    maxTurns: 50,
    baseTimeout: 300000, // 5 minutes
    critChance: 0.15,
    critMultiplier: 1.5,
    dodgeChance: 0.05,
    minDamage: 1,
    aoeDamageMultiplier: 0.7,
    healerHpThreshold: 0.4,
    aiRandomTargetChance: 0.1,
  },

  campaign: {
    energyCostPerStage: 6,
    maxStarsPerStage: 3,
  },

  rewards: {
    heroXpPerBattle: 25,
    victoryStar3Threshold: 1.0,
    victoryStar2Threshold: 0.5,
  },

  xp: {
    playerXpPerLevel: (level: number): number => Math.floor(200 * Math.pow(1.2, level - 1)),
  },

  quests: {
    dailyQuestCount: 5,
    loginQuestId: 'daily_login',
  },

  leaderboard: {
    pageSize: 50,
    maxEntries: 1000,
  },
} as const;
