import { BattleHero, StatusEffect, HeroStats } from '@hero-wars/shared';

export interface EffectTickResult {
  heroId: string;
  effectId: string;
  type: StatusEffect['type'];
  damage: number;
  healing: number;
  expired: boolean;
}

/**
 * Applies a status effect to a hero.
 * For 'heal' type, the healing is instant and we do NOT add it to statusEffects.
 */
export function applyEffect(hero: BattleHero, effect: StatusEffect): void {
  if (effect.type === 'heal') {
    // Instant heal -- apply immediately, do not store as ongoing effect
    hero.currentHp = Math.min(hero.currentHp + effect.value, hero.stats.hp);
    return;
  }
  hero.statusEffects.push({ ...effect });
}

/**
 * Processes effects at turn-start or turn-end for a given hero.
 *
 * turn-start: DoT deals damage.
 * turn-end: Decrement remainingTurns on buff/debuff/shield/dot.
 */
export function processEffects(
  hero: BattleHero,
  phase: 'turn-start' | 'turn-end',
): EffectTickResult[] {
  const results: EffectTickResult[] = [];

  if (phase === 'turn-start') {
    // Process DoT damage
    for (const effect of hero.statusEffects) {
      if (effect.type === 'dot') {
        const damage = effect.value;
        hero.currentHp = Math.max(0, hero.currentHp - damage);
        results.push({
          heroId: hero.id,
          effectId: effect.id,
          type: 'dot',
          damage,
          healing: 0,
          expired: false,
        });
      }
    }
  }

  if (phase === 'turn-end') {
    // Decrement remaining turns on all effects
    for (const effect of hero.statusEffects) {
      effect.remainingTurns--;
      const expired = effect.remainingTurns <= 0;
      results.push({
        heroId: hero.id,
        effectId: effect.id,
        type: effect.type,
        damage: 0,
        healing: 0,
        expired,
      });
    }
  }

  return results;
}

/**
 * Removes all expired effects (remainingTurns <= 0) from a hero.
 */
export function removeExpiredEffects(hero: BattleHero): void {
  hero.statusEffects = hero.statusEffects.filter((e) => e.remainingTurns > 0);
}

/**
 * Calculates a hero's effective stats after all active buff/debuff modifiers.
 * Buffs add +value% to the stat, debuffs subtract -value% from the stat.
 */
export function getEffectiveStats(hero: BattleHero): HeroStats {
  const base: HeroStats = { ...hero.stats };

  for (const effect of hero.statusEffects) {
    if ((effect.type === 'buff' || effect.type === 'debuff') && effect.stat) {
      const statKey = effect.stat;
      const modifier = effect.value / 100;
      if (effect.type === 'buff') {
        base[statKey] = Math.floor(base[statKey] * (1 + modifier));
      } else {
        base[statKey] = Math.floor(base[statKey] * (1 - modifier));
      }
    }
  }

  // Ensure no stat goes below 0
  base.hp = Math.max(0, base.hp);
  base.attack = Math.max(1, base.attack);
  base.defense = Math.max(0, base.defense);
  base.speed = Math.max(1, base.speed);

  return base;
}

/**
 * Absorbs damage through active shields on a hero.
 * Returns the remaining damage after shield absorption.
 */
export function absorbShieldDamage(hero: BattleHero, damage: number): number {
  let remaining = damage;

  for (const effect of hero.statusEffects) {
    if (effect.type === 'shield' && remaining > 0) {
      if (effect.value >= remaining) {
        effect.value -= remaining;
        remaining = 0;
      } else {
        remaining -= effect.value;
        effect.value = 0;
      }
    }
  }

  // Remove depleted shields
  hero.statusEffects = hero.statusEffects.filter(
    (e) => !(e.type === 'shield' && e.value <= 0),
  );

  return remaining;
}
