export interface PlayerProfileResponse {
  id: string;
  username: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  gold: number;
  gems: number;
  energy: number;
  maxEnergy: number;
  createdAt: Date;
  stats: PlayerStatsResponse;
}

export interface PlayerStatsResponse {
  totalBattles: number;
  battlesWon: number;
  battlesLost: number;
  winRate: number;
  campaignStarsTotal: number;
  campaignStagesCompleted: number;
  totalHeroes: number;
  highestHeroLevel: number;
  totalQuestsClaimed: number;
  powerScore: number;
}
