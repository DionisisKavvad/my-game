import {
  BattleHero,
  BattleSkill,
  StatusEffect,
  GAME_CONFIG,
} from '@hero-wars/shared';
import { SeededRandom } from './rng';
import { calculateDamage } from './damage';
import { getEffectiveStats, applyEffect, absorbShieldDamage } from './effects';

export interface SkillExecutionResult {
  targets: string[];
  damage: number;
  healing: number;
  effects: StatusEffect[];
}

/**
 * Executes a skill from an actor on the appropriate targets.
 * Handles all target types: single, all, self, ally.
 */
export function executeSkill(
  actor: BattleHero,
  skill: BattleSkill,
  allHeroes: BattleHero[],
  rng: SeededRandom,
  currentTurn: number,
): SkillExecutionResult {
  const targets = selectSkillTargets(actor, skill, allHeroes);
  let totalDamage = 0;
  let totalHealing = 0;
  const appliedEffects: StatusEffect[] = [];

  const actorStats = getEffectiveStats(actor);
  const isAoe = skill.target === 'all';

  // Sort targets by id for deterministic RNG consumption order
  const sortedTargets = [...targets].sort((a, b) => a.id.localeCompare(b.id));

  for (const target of sortedTargets) {
    // Damage phase
    if (skill.damage > 0) {
      const targetStats = getEffectiveStats(target);
      const dmgResult = calculateDamage({
        attackerAttack: actorStats.attack,
        defenderDefense: targetStats.defense,
        skillDamage: skill.damage,
        rng,
      });

      let damage = dmgResult.damage;
      if (isAoe) {
        damage = Math.max(
          GAME_CONFIG.battle.minDamage,
          Math.floor(damage * GAME_CONFIG.battle.aoeDamageMultiplier),
        );
      }

      // Apply shield absorption
      const remaining = absorbShieldDamage(target, damage);
      target.currentHp = Math.max(0, target.currentHp - remaining);
      totalDamage += damage;
    }

    // Effect phase
    if (skill.effect) {
      const effect = createStatusEffect(actor, skill, target, actorStats.attack, currentTurn);
      if (effect) {
        applyEffect(target, effect);
        appliedEffects.push(effect);
        if (effect.type === 'heal') {
          totalHealing += effect.value;
        }
      }
    }
  }

  return {
    targets: sortedTargets.map((t) => t.id),
    damage: totalDamage,
    healing: totalHealing,
    effects: appliedEffects,
  };
}

/**
 * Selects targets for a skill based on its target type.
 */
function selectSkillTargets(
  actor: BattleHero,
  skill: BattleSkill,
  allHeroes: BattleHero[],
): BattleHero[] {
  const allies = allHeroes.filter((h) => h.team === actor.team && h.currentHp > 0);
  const enemies = allHeroes.filter((h) => h.team !== actor.team && h.currentHp > 0);

  switch (skill.target) {
    case 'single': {
      if (skill.damage > 0) {
        // Damage skill: target lowest HP enemy
        if (enemies.length === 0) return [];
        const target = enemies.reduce((min, h) =>
          h.currentHp < min.currentHp ? h : min,
        );
        return [target];
      }
      // Heal/buff skill targeting single: pick lowest HP ratio ally
      if (allies.length === 0) return [];
      const target = allies.reduce((min, h) =>
        h.currentHp / h.stats.hp < min.currentHp / min.stats.hp ? h : min,
      );
      return [target];
    }

    case 'all': {
      if (skill.damage > 0) {
        return enemies;
      }
      return allies;
    }

    case 'self':
      return [actor];

    case 'ally': {
      // Pick the ally with the lowest HP ratio for heals, lowest defense for shields
      if (allies.length === 0) return [];
      if (skill.effect?.type === 'shield') {
        const target = allies.reduce((min, h) =>
          h.stats.defense < min.stats.defense ? h : min,
        );
        return [target];
      }
      // Default: lowest HP ratio
      const target = allies.reduce((min, h) =>
        h.currentHp / h.stats.hp < min.currentHp / min.stats.hp ? h : min,
      );
      return [target];
    }

    default:
      return [];
  }
}

/**
 * Creates a StatusEffect from a skill's effect definition.
 */
function createStatusEffect(
  actor: BattleHero,
  skill: BattleSkill,
  target: BattleHero,
  actorAttack: number,
  currentTurn: number,
): StatusEffect | null {
  const effectDef = skill.effect;
  if (!effectDef) return null;

  const effectId = `${actor.id}-${skill.id}-${currentTurn}`;

  switch (effectDef.type) {
    case 'heal': {
      const healAmount = Math.floor(actorAttack * (effectDef.value / 100));
      return {
        id: effectId,
        type: 'heal',
        value: healAmount,
        remainingTurns: 0,
        sourceId: actor.id,
      };
    }

    case 'shield': {
      const shieldAmount = Math.floor(actorAttack * (effectDef.value / 100));
      return {
        id: effectId,
        type: 'shield',
        value: shieldAmount,
        remainingTurns: effectDef.duration,
        sourceId: actor.id,
      };
    }

    case 'buff':
      return {
        id: effectId,
        type: 'buff',
        value: effectDef.value,
        remainingTurns: effectDef.duration,
        stat: effectDef.stat ?? 'attack',
        sourceId: actor.id,
      };

    case 'debuff':
      return {
        id: effectId,
        type: 'debuff',
        value: effectDef.value,
        remainingTurns: effectDef.duration,
        stat: effectDef.stat ?? 'attack',
        sourceId: actor.id,
      };

    case 'dot':
      return {
        id: effectId,
        type: 'dot',
        value: effectDef.value,
        remainingTurns: effectDef.duration,
        sourceId: actor.id,
      };

    default:
      return null;
  }
}

/**
 * Executes an auto-attack from actor to target.
 */
export function executeAutoAttack(
  actor: BattleHero,
  target: BattleHero,
  rng: SeededRandom,
): { damage: number } {
  const actorStats = getEffectiveStats(actor);
  const targetStats = getEffectiveStats(target);

  const dmgResult = calculateDamage({
    attackerAttack: actorStats.attack,
    defenderDefense: targetStats.defense,
    skillDamage: 100,
    rng,
  });

  // Apply shield absorption
  const remaining = absorbShieldDamage(target, dmgResult.damage);
  target.currentHp = Math.max(0, target.currentHp - remaining);

  return { damage: dmgResult.damage };
}
