export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  score: number;
  level: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  playerRank: LeaderboardEntry | null;
  total: number;
}

export type LeaderboardType = 'power' | 'campaign' | 'battles';
