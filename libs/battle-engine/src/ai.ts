import { BattleHero, BattleSkill, GAME_CONFIG } from '@hero-wars/shared';
import { SeededRandom } from './rng';

export interface AIDecision {
  type: 'auto-attack' | 'skill';
  skillId?: string;
  targetIds: string[];
}

/**
 * Deterministic AI decision-making for battle heroes.
 * Both player heroes (auto-play) and enemy heroes use this logic.
 *
 * Priority rules (evaluated in order):
 * 1. Heal: If actor has heal skill off cooldown and any ally below 40% HP
 * 2. Buff/Shield: If actor has buff/shield skill off cooldown and no active buff/shield on team
 * 3. AoE: If 3+ enemies alive and AoE skill off cooldown
 * 4. Single-target damage: If damage skill off cooldown, target lowest HP enemy
 * 5. Auto-attack: Default. Target lowest HP enemy (10% random target chance)
 */
export function decideAction(
  actor: BattleHero,
  allHeroes: BattleHero[],
  rng: SeededRandom,
): AIDecision {
  const allies = allHeroes.filter((h) => h.team === actor.team && h.currentHp > 0);
  const enemies = allHeroes.filter((h) => h.team !== actor.team && h.currentHp > 0);

  if (enemies.length === 0) {
    return { type: 'auto-attack', targetIds: [] };
  }

  const readySkills = actor.skills.filter((s) => s.currentCooldown <= 0);

  // Priority 1: Healing
  const healSkill = readySkills.find(
    (s) => s.effect?.type === 'heal' && (s.target === 'ally' || s.target === 'single'),
  );
  if (healSkill) {
    const woundedAlly = allies.find(
      (h) => h.currentHp / h.stats.hp < GAME_CONFIG.battle.healerHpThreshold,
    );
    if (woundedAlly) {
      return { type: 'skill', skillId: healSkill.id, targetIds: [woundedAlly.id] };
    }
  }

  // Priority 2: Buff/Shield
  const supportSkill = readySkills.find(
    (s) =>
      s.effect &&
      (s.effect.type === 'buff' || s.effect.type === 'shield') &&
      (s.target === 'self' || s.target === 'ally'),
  );
  if (supportSkill) {
    const hasActiveBuff = allies.some((h) =>
      h.statusEffects.some(
        (e) => e.type === 'buff' || e.type === 'shield',
      ),
    );
    if (!hasActiveBuff) {
      if (supportSkill.target === 'self') {
        return { type: 'skill', skillId: supportSkill.id, targetIds: [actor.id] };
      }
      // Pick unbuffed ally
      const unbuffedAlly = allies.find(
        (h) => !h.statusEffects.some((e) => e.type === 'buff' || e.type === 'shield'),
      );
      if (unbuffedAlly) {
        return { type: 'skill', skillId: supportSkill.id, targetIds: [unbuffedAlly.id] };
      }
    }
  }

  // Priority 3: AoE (3+ enemies alive)
  const aoeSkill = readySkills.find(
    (s) => s.target === 'all' && s.damage > 0,
  );
  if (aoeSkill && enemies.length >= 3) {
    return {
      type: 'skill',
      skillId: aoeSkill.id,
      targetIds: enemies.map((e) => e.id).sort(),
    };
  }

  // Priority 4: Single-target damage skill
  const damageSkill = readySkills.find(
    (s) => s.target === 'single' && s.damage > 0,
  );
  if (damageSkill) {
    const target = selectDamageTarget(enemies, rng);
    return { type: 'skill', skillId: damageSkill.id, targetIds: [target.id] };
  }

  // Priority 5: Auto-attack (default)
  const target = selectDamageTarget(enemies, rng);
  return { type: 'auto-attack', targetIds: [target.id] };
}

/**
 * Selects a target for damage.
 * 90% of the time: lowest HP enemy.
 * 10% of the time: random enemy (adds unpredictability).
 * Always consumes exactly one RNG value for the random target check.
 */
function selectDamageTarget(
  enemies: BattleHero[],
  rng: SeededRandom,
): BattleHero {
  const isRandom = rng.chance(GAME_CONFIG.battle.aiRandomTargetChance);

  if (isRandom) {
    return rng.pick(enemies);
  }

  // Lowest current HP (deterministic tiebreak by id)
  return enemies.reduce((min, h) => {
    if (h.currentHp < min.currentHp) return h;
    if (h.currentHp === min.currentHp && h.id.localeCompare(min.id) < 0) return h;
    return min;
  });
}
