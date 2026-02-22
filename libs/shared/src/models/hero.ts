export type HeroClass = 'warrior' | 'mage' | 'healer' | 'archer' | 'tank';

export type HeroRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface HeroTemplate {
  id: string;
  name: string;
  class: HeroClass;
  rarity: HeroRarity;
  baseHp: number;
  baseAttack: number;
  baseDefense: number;
  baseSpeed: number;
  skills: HeroSkill[];
  spriteKey: string;
}

export interface HeroSkill {
  id: string;
  name: string;
  description: string;
  damage: number;
  cooldown: number;
  target: 'single' | 'all' | 'self' | 'ally';
  effect?: SkillEffect;
}

export interface SkillEffect {
  type: 'heal' | 'buff' | 'debuff' | 'dot' | 'shield';
  value: number;
  duration: number;
  stat?: keyof HeroStats;
}

export interface HeroStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}

export interface PlayerHero {
  id: string;
  playerId: string;
  templateId: string;
  template: HeroTemplate;
  level: number;
  stars: number;
  xp: number;
  equipment: Record<string, string>;
  isInTeam: boolean;
  teamPosition: number | null;
}

export interface HeroTemplateResponse {
  id: string;
  name: string;
  class: HeroClass;
  rarity: HeroRarity;
  baseHp: number;
  baseAttack: number;
  baseDefense: number;
  baseSpeed: number;
  skills: HeroSkill[];
  spriteKey: string;
}

export interface PlayerHeroResponse {
  id: string;
  templateId: string;
  template: HeroTemplateResponse;
  level: number;
  stars: number;
  xp: number;
  xpToNextLevel: number;
  equipment: Record<string, string>;
  isInTeam: boolean;
  teamPosition: number | null;
  computedStats: HeroStats;
}

export interface UpgradeResult {
  hero: PlayerHeroResponse;
  goldSpent: number;
  playerGoldRemaining: number;
  levelsGained: number;
  starsGained: number;
}

export interface TeamUpdateRequest {
  heroPositions: { heroId: string; position: number }[];
}

export interface TeamResponse {
  heroes: PlayerHeroResponse[];
}

export function calculateHeroStats(template: HeroTemplate, level: number, stars: number): HeroStats {
  const levelMultiplier = 1 + (level - 1) * 0.1;
  const starMultiplier = 1 + (stars - 1) * 0.15;

  return {
    hp: Math.floor(template.baseHp * levelMultiplier * starMultiplier),
    attack: Math.floor(template.baseAttack * levelMultiplier * starMultiplier),
    defense: Math.floor(template.baseDefense * levelMultiplier * starMultiplier),
    speed: Math.floor(template.baseSpeed * levelMultiplier * starMultiplier),
  };
}
