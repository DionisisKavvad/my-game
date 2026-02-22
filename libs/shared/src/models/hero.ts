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
