import { BattleHero, BattleLog, BattleResult, TurnAction, StatusEffect, GAME_CONFIG } from '@hero-wars/shared';
import { SeededRandom } from './rng';
import { getEffectiveStats, processEffects, removeExpiredEffects } from './effects';
import { executeSkill, executeAutoAttack } from './skills';
import { decideAction } from './ai';

export interface BattleConfig {
  playerTeam: BattleHero[];
  enemyTeam: BattleHero[];
  seed: number;
}

/**
 * Deterministic battle simulator.
 * Supports skills, status effects, AI decisions, and full turn-based combat.
 */
export class BattleSimulator {
  private rng: SeededRandom;
  private heroes: BattleHero[];
  private turns: TurnAction[] = [];
  private currentTurn = 0;

  constructor(private config: BattleConfig) {
    this.rng = new SeededRandom(config.seed);
    // Deep clone heroes to avoid mutating the input
    this.heroes = [
      ...config.playerTeam.map((h) => cloneHero(h)),
      ...config.enemyTeam.map((h) => cloneHero(h)),
    ];
  }

  run(): BattleLog {
    while (this.currentTurn < GAME_CONFIG.battle.maxTurns) {
      this.currentTurn++;

      // Sort alive heroes by effective speed (desc), tiebreak by id (asc)
      const aliveHeroes = this.getAliveHeroes();
      aliveHeroes.sort((a, b) => {
        const speedA = getEffectiveStats(a).speed;
        const speedB = getEffectiveStats(b).speed;
        if (speedB !== speedA) return speedB - speedA;
        return a.id.localeCompare(b.id);
      });

      // Snapshot the turn order (heroes may die mid-turn)
      const turnOrder = [...aliveHeroes];

      for (const hero of turnOrder) {
        if (hero.currentHp <= 0) continue;

        // Turn-start phase: process DoT
        const dotResults = processEffects(hero, 'turn-start');
        for (const dot of dotResults) {
          if (dot.damage > 0) {
            this.turns.push({
              turn: this.currentTurn,
              actorId: hero.id,
              actorName: hero.name,
              skillId: 'dot',
              skillName: 'Damage Over Time',
              targetIds: [hero.id],
              damage: dot.damage,
              healing: 0,
              effects: [],
              resultHp: this.getResultHpSnapshot(),
            });
          }
        }

        // Check if hero died from DoT
        if (hero.currentHp <= 0) {
          const battleEnd = this.checkBattleEnd();
          if (battleEnd) return this.buildLog(battleEnd);
          continue;
        }

        // Decision phase: AI decides action for both player and enemy heroes
        const decision = decideAction(hero, this.heroes, this.rng);

        if (decision.targetIds.length === 0) {
          // No valid targets, skip
          continue;
        }

        // Execution phase
        let damage = 0;
        let healing = 0;
        let effects: StatusEffect[] = [];
        let skillId = 'auto-attack';
        let skillName = 'Auto Attack';
        let targetIds = decision.targetIds;

        if (decision.type === 'skill' && decision.skillId) {
          const skill = hero.skills.find((s) => s.id === decision.skillId);
          if (skill) {
            const result = executeSkill(hero, skill, this.heroes, this.rng, this.currentTurn);
            damage = result.damage;
            healing = result.healing;
            effects = result.effects;
            targetIds = result.targets;
            skillId = skill.id;
            skillName = skill.name;

            // Mark skill on cooldown
            skill.currentCooldown = skill.cooldown;
          }
        } else {
          // Auto-attack
          const target = this.heroes.find((h) => h.id === decision.targetIds[0]);
          if (target && target.currentHp > 0) {
            const result = executeAutoAttack(hero, target, this.rng);
            damage = result.damage;
          }
        }

        // Record TurnAction
        this.turns.push({
          turn: this.currentTurn,
          actorId: hero.id,
          actorName: hero.name,
          skillId,
          skillName,
          targetIds,
          damage,
          healing,
          effects,
          resultHp: this.getResultHpSnapshot(),
        });

        // Decrement cooldowns for this hero
        for (const skill of hero.skills) {
          if (skill.currentCooldown > 0) {
            skill.currentCooldown--;
          }
        }

        // Turn-end phase: process buff/debuff duration ticks
        processEffects(hero, 'turn-end');
        removeExpiredEffects(hero);

        // Check battle end condition
        const battleEnd = this.checkBattleEnd();
        if (battleEnd) return this.buildLog(battleEnd);
      }
    }

    return this.buildLog('timeout');
  }

  private getAliveHeroes(): BattleHero[] {
    return this.heroes.filter((h) => h.currentHp > 0);
  }

  private getResultHpSnapshot(): Record<string, number> {
    const resultHp: Record<string, number> = {};
    for (const hero of this.heroes) {
      resultHp[hero.id] = hero.currentHp;
    }
    return resultHp;
  }

  private checkBattleEnd(): BattleResult | null {
    const playerAlive = this.heroes.some((h) => h.team === 'player' && h.currentHp > 0);
    const enemyAlive = this.heroes.some((h) => h.team === 'enemy' && h.currentHp > 0);

    if (!enemyAlive) return 'victory';
    if (!playerAlive) return 'defeat';
    return null;
  }

  private buildLog(result: BattleResult): BattleLog {
    return {
      seed: this.config.seed,
      turns: this.turns,
      result,
      totalTurns: this.currentTurn,
      durationMs: 0,
    };
  }
}

function cloneHero(hero: BattleHero): BattleHero {
  return {
    ...hero,
    stats: { ...hero.stats },
    skills: hero.skills.map((s) => ({ ...s, effect: s.effect ? { ...s.effect } : undefined })),
    statusEffects: hero.statusEffects.map((e) => ({ ...e })),
  };
}
