export interface PlayerProfile {
  id: string;
  username: string;
  email: string;
  level: number;
  xp: number;
  gold: number;
  gems: number;
  energy: number;
  maxEnergy: number;
  energyRegenAt: Date | null;
  createdAt: Date;
}

