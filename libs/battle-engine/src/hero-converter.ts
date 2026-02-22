import {
  BattleHero,
  BattleSkill,
  PlayerHero,
  HeroTemplate,
  CampaignEnemy,
  calculateHeroStats,
} from '@hero-wars/shared';

/**
 * Converts a PlayerHero (with its HeroTemplate) into a BattleHero for the simulator.
 * Pure function -- no DB or framework imports.
 */
export function playerHeroToBattleHero(
  playerHero: PlayerHero,
  team: 'player' | 'enemy',
): BattleHero {
  const stats = calculateHeroStats(playerHero.template, playerHero.level, playerHero.stars);

  return {
    id: playerHero.id,
    name: playerHero.template.name,
    heroClass: playerHero.template.class,
    spriteKey: playerHero.template.spriteKey,
    stats,
    currentHp: stats.hp,
    skills: mapSkills(playerHero.template),
    team,
    position: playerHero.teamPosition ?? 0,
    statusEffects: [],
  };
}

/**
 * Converts a CampaignEnemy definition into a BattleHero for the simulator.
 * Requires the resolved HeroTemplate for the enemy.
 */
export function campaignEnemyToBattleHero(
  enemy: CampaignEnemy,
  template: HeroTemplate,
  index: number,
): BattleHero {
  const stats = calculateHeroStats(template, enemy.level, enemy.stars);

  return {
    id: `enemy-${template.id}-${index}`,
    name: template.name,
    heroClass: template.class,
    spriteKey: template.spriteKey,
    stats,
    currentHp: stats.hp,
    skills: mapSkills(template),
    team: 'enemy',
    position: index,
    statusEffects: [],
  };
}

function mapSkills(template: HeroTemplate): BattleSkill[] {
  return template.skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    damage: skill.damage,
    cooldown: skill.cooldown,
    currentCooldown: 0,
    target: skill.target,
    effect: skill.effect,
  }));
}
