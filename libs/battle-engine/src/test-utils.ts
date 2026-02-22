import { BattleHero, BattleSkill, HeroStats, SkillEffect } from '@hero-wars/shared';

/**
 * Factory function for creating BattleHero instances in tests.
 */
export function makeHero(
  overrides: Partial<BattleHero> & { id: string; team: 'player' | 'enemy' },
): BattleHero {
  return {
    name: overrides.id,
    stats: { hp: 500, attack: 100, defense: 30, speed: 50 },
    currentHp: 500,
    skills: [],
    position: 0,
    statusEffects: [],
    ...overrides,
  };
}

/**
 * Creates a BattleSkill for testing.
 */
export function makeSkill(overrides: Partial<BattleSkill> & { id: string }): BattleSkill {
  return {
    name: overrides.id,
    damage: 150,
    cooldown: 2,
    currentCooldown: 0,
    target: 'single',
    ...overrides,
  };
}

/**
 * Creates a quick team of heroes.
 */
export function makeTeam(
  team: 'player' | 'enemy',
  count: number,
  baseOverrides?: Partial<BattleHero>,
): BattleHero[] {
  const prefix = team === 'player' ? 'p' : 'e';
  return Array.from({ length: count }, (_, i) =>
    makeHero({
      id: `${prefix}${i + 1}`,
      team,
      position: i,
      ...baseOverrides,
    }),
  );
}

/**
 * Creates a warrior hero (high attack, medium defense, low speed).
 */
export function makeWarrior(
  id: string,
  team: 'player' | 'enemy',
): BattleHero {
  return makeHero({
    id,
    team,
    name: 'Warrior',
    stats: { hp: 1200, attack: 150, defense: 100, speed: 80 },
    currentHp: 1200,
    skills: [
      makeSkill({
        id: 'warrior-slash',
        name: 'Power Slash',
        damage: 150,
        cooldown: 2,
        target: 'single',
      }),
      makeSkill({
        id: 'warrior-shout',
        name: 'Battle Shout',
        damage: 0,
        cooldown: 4,
        target: 'self',
        effect: { type: 'buff', value: 20, duration: 3, stat: 'attack' },
      }),
    ],
  });
}

/**
 * Creates a healer hero (low attack, medium defense, high speed).
 */
export function makeHealer(
  id: string,
  team: 'player' | 'enemy',
): BattleHero {
  return makeHero({
    id,
    team,
    name: 'Healer',
    stats: { hp: 900, attack: 80, defense: 80, speed: 95 },
    currentHp: 900,
    skills: [
      makeSkill({
        id: 'healer-heal',
        name: 'Divine Heal',
        damage: 0,
        cooldown: 2,
        target: 'ally',
        effect: { type: 'heal', value: 200, duration: 1 },
      }),
      makeSkill({
        id: 'healer-shield',
        name: 'Holy Shield',
        damage: 0,
        cooldown: 4,
        target: 'ally',
        effect: { type: 'shield', value: 150, duration: 3 },
      }),
    ],
  });
}

/**
 * Creates a mage hero (high attack, low defense, high speed).
 */
export function makeMage(
  id: string,
  team: 'player' | 'enemy',
): BattleHero {
  return makeHero({
    id,
    team,
    name: 'Mage',
    stats: { hp: 800, attack: 200, defense: 60, speed: 90 },
    currentHp: 800,
    skills: [
      makeSkill({
        id: 'mage-fireball',
        name: 'Fireball',
        damage: 180,
        cooldown: 3,
        target: 'single',
      }),
      makeSkill({
        id: 'mage-blizzard',
        name: 'Blizzard',
        damage: 80,
        cooldown: 5,
        target: 'all',
      }),
    ],
  });
}

/**
 * Creates a tank hero (very high HP, low attack, high defense, low speed).
 */
export function makeTank(
  id: string,
  team: 'player' | 'enemy',
): BattleHero {
  return makeHero({
    id,
    team,
    name: 'Tank',
    stats: { hp: 2000, attack: 90, defense: 180, speed: 50 },
    currentHp: 2000,
    skills: [
      makeSkill({
        id: 'tank-fortify',
        name: 'Defensive Stance',
        damage: 0,
        cooldown: 4,
        target: 'self',
        effect: { type: 'buff', value: 30, duration: 2, stat: 'defense' },
      }),
      makeSkill({
        id: 'tank-slam',
        name: 'Shield Slam',
        damage: 120,
        cooldown: 3,
        target: 'single',
      }),
    ],
  });
}
