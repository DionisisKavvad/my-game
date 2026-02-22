export interface CampaignStage {
  id: string;
  chapter: number;
  stage: number;
  name: string;
  difficulty: number;
  energyCost: number;
  enemyTeam: CampaignEnemy[];
  rewards: StageRewards;
}

export interface CampaignEnemy {
  templateId: string;
  level: number;
  stars: number;
}

export interface StageRewards {
  gold: number;
  xp: number;
  heroShards?: { templateId: string; count: number };
}

export interface CampaignStageResponse extends CampaignStage {
  stars: number;
  completed: boolean;
  unlocked: boolean;
}

export interface HeroShardProgress {
  templateId: string;
  templateName: string;
  count: number;
  requiredToUnlock: number;
}

export interface CampaignProgress {
  playerId: string;
  stageId: string;
  stars: number;
  bestTimeMs: number;
  completedAt: Date;
}
