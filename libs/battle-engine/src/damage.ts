import { SeededRandom } from './rng';
import { GAME_CONFIG } from '@hero-wars/shared';

export interface DamageInput {
  attackerAttack: number;
  defenderDefense: number;
  skillDamage: number;
  rng: SeededRandom;
}

export interface DamageResult {
  damage: number;
  isCrit: boolean;
  isDodged: boolean;
}

/**
 * Calculates damage dealt from attacker to defender.
 *
 * Formula: baseDamage = (attack * skillDamage / 100) - (defense * 0.5)
 * With crit/dodge rolls from RNG.
 */
export function calculateDamage(input: DamageInput): DamageResult {
  const { attackerAttack, defenderDefense, skillDamage, rng } = input;

  // Check dodge first
  const isDodged = rng.chance(GAME_CONFIG.battle.dodgeChance);
  if (isDodged) {
    return { damage: 0, isCrit: false, isDodged: true };
  }

  // Base damage calculation
  let baseDamage = (attackerAttack * skillDamage) / 100 - defenderDefense * 0.5;

  // Ensure minimum damage
  baseDamage = Math.max(baseDamage, GAME_CONFIG.battle.minDamage);

  // Crit check
  const isCrit = rng.chance(GAME_CONFIG.battle.critChance);
  if (isCrit) {
    baseDamage = Math.floor(baseDamage * GAME_CONFIG.battle.critMultiplier);
  }

  // Add slight variance (+-10%)
  const variance = 0.9 + rng.next() * 0.2;
  const finalDamage = Math.max(Math.floor(baseDamage * variance), GAME_CONFIG.battle.minDamage);

  return { damage: finalDamage, isCrit, isDodged: false };
}
