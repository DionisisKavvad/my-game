import { HeroStats } from './hero';

export interface BattleHero {
  id: string;
  name: string;
  stats: HeroStats;
  currentHp: number;
  skills: BattleSkill[];
  team: 'player' | 'enemy';
  position: number;
  statusEffects: StatusEffect[];
}

export interface BattleSkill {
  id: string;
  name: string;
  damage: number;
  cooldown: number;
  currentCooldown: number;
  target: 'single' | 'all' | 'self' | 'ally';
}

export interface StatusEffect {
  type: 'heal' | 'buff' | 'debuff' | 'dot' | 'shield';
  value: number;
  remainingTurns: number;
  stat?: keyof HeroStats;
}

export interface TurnAction {
  turn: number;
  actorId: string;
  actorName: string;
  skillId: string;
  skillName: string;
  targetIds: string[];
  damage: number;
  healing: number;
  effects: StatusEffect[];
  resultHp: Record<string, number>;
}

export type BattleResult = 'victory' | 'defeat' | 'timeout';

export interface BattleLog {
  seed: number;
  turns: TurnAction[];
  result: BattleResult;
  totalTurns: number;
  durationMs: number;
}

export interface BattleSummary {
  id: string;
  playerId: string;
  stageId: string | null;
  result: BattleResult;
  rewardGold: number;
  rewardXp: number;
  durationMs: number;
  validated: boolean;
  createdAt: Date;
}
