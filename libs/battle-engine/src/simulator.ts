import { BattleHero, BattleLog, BattleResult, TurnAction } from '@hero-wars/shared';
import { SeededRandom } from './rng';
import { calculateDamage } from './damage';
import { GAME_CONFIG } from '@hero-wars/shared';

export interface BattleConfig {
  playerTeam: BattleHero[];
  enemyTeam: BattleHero[];
  seed: number;
}

/**
 * Deterministic battle simulator.
 * Full implementation in Sprint 3 — this skeleton handles basic auto-attack combat.
 */
export class BattleSimulator {
  private rng: SeededRandom;
  private heroes: BattleHero[];
  private turns: TurnAction[] = [];
  private currentTurn = 0;

  constructor(private config: BattleConfig) {
    this.rng = new SeededRandom(config.seed);
    this.heroes = [...config.playerTeam, ...config.enemyTeam];
  }

  run(): BattleLog {
    while (this.currentTurn < GAME_CONFIG.battle.maxTurns) {
      this.currentTurn++;

      // Sort by speed (descending) for turn order
      const aliveHeroes = this.getAliveHeroes();
      aliveHeroes.sort((a, b) => b.stats.speed - a.stats.speed || a.id.localeCompare(b.id));

      for (const hero of aliveHeroes) {
        if (hero.currentHp <= 0) continue;

        const target = this.selectTarget(hero);
        if (!target) break;

        const action = this.executeAutoAttack(hero, target);
        this.turns.push(action);

        const result = this.checkBattleEnd();
        if (result) {
          return this.buildLog(result);
        }
      }
    }

    return this.buildLog('timeout');
  }

  private getAliveHeroes(): BattleHero[] {
    return this.heroes.filter((h) => h.currentHp > 0);
  }

  private selectTarget(attacker: BattleHero): BattleHero | null {
    const enemies = this.getAliveHeroes().filter((h) => h.team !== attacker.team);
    if (enemies.length === 0) return null;
    // Target the enemy with lowest HP
    return enemies.reduce((min, h) => (h.currentHp < min.currentHp ? h : min));
  }

  private executeAutoAttack(attacker: BattleHero, target: BattleHero): TurnAction {
    const result = calculateDamage({
      attackerAttack: attacker.stats.attack,
      defenderDefense: target.stats.defense,
      skillDamage: 100, // base auto-attack
      rng: this.rng,
    });

    target.currentHp = Math.max(0, target.currentHp - result.damage);

    const resultHp: Record<string, number> = {};
    for (const hero of this.heroes) {
      resultHp[hero.id] = hero.currentHp;
    }

    return {
      turn: this.currentTurn,
      actorId: attacker.id,
      actorName: attacker.name,
      skillId: 'auto-attack',
      skillName: 'Auto Attack',
      targetIds: [target.id],
      damage: result.damage,
      healing: 0,
      effects: [],
      resultHp,
    };
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
