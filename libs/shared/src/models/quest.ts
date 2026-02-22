export type QuestType = 'win_battles' | 'complete_campaign' | 'upgrade_hero' | 'login' | 'spend_energy';

export interface QuestDefinition {
  questId: string;
  type: QuestType;
  name: string;
  description: string;
  target: number;
  rewardGold: number;
  rewardXp: number;
  rewardGems: number;
}

export interface DailyQuestResponse {
  questId: string;
  name: string;
  description: string;
  type: QuestType;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  rewardGold: number;
  rewardXp: number;
  rewardGems: number;
}
