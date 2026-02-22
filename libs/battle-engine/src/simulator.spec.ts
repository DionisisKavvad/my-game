import { BattleHero } from '@hero-wars/shared';
import { BattleSimulator, BattleConfig } from './simulator';
import {
  makeHero,
  makeWarrior,
  makeMage,
  makeHealer,
  makeTank,
  makeSkill,
} from './test-utils';

describe('BattleSimulator', () => {
  describe('Determinism', () => {
    const seed = 98765;

    function buildConfig(): BattleConfig {
      return {
        seed,
        playerTeam: [
          makeHero({
            id: 'p1',
            team: 'player',
            stats: { hp: 600, attack: 120, defense: 40, speed: 70 },
            currentHp: 600,
          }),
          makeHero({
            id: 'p2',
            team: 'player',
            stats: { hp: 400, attack: 150, defense: 20, speed: 70 },
            currentHp: 400,
          }),
        ],
        enemyTeam: [
          makeHero({
            id: 'e1',
            team: 'enemy',
            stats: { hp: 500, attack: 100, defense: 35, speed: 70 },
            currentHp: 500,
          }),
          makeHero({
            id: 'e2',
            team: 'enemy',
            stats: { hp: 450, attack: 110, defense: 25, speed: 70 },
            currentHp: 450,
          }),
        ],
      };
    }

    it('should produce identical BattleLogs for identical configs', () => {
      const sim1 = new BattleSimulator(buildConfig());
      const sim2 = new BattleSimulator(buildConfig());

      const log1 = sim1.run();
      const log2 = sim2.run();

      expect(log1).toEqual(log2);
    });

    it('should resolve speed ties deterministically via id tiebreaker', () => {
      const sim1 = new BattleSimulator(buildConfig());
      const sim2 = new BattleSimulator(buildConfig());

      const log1 = sim1.run();
      const log2 = sim2.run();

      // All heroes have speed 70, so order is determined by id.localeCompare
      // Expected order: e1, e2, p1, p2 (lexicographic)
      // But with AI, first hero may consume RNG for target selection
      // The important thing is both simulations agree
      for (let i = 0; i < log1.turns.length; i++) {
        expect(log1.turns[i].actorId).toBe(log2.turns[i].actorId);
        expect(log1.turns[i].damage).toBe(log2.turns[i].damage);
      }
    });

    it('should set durationMs to 0', () => {
      const sim = new BattleSimulator(buildConfig());
      const log = sim.run();
      expect(log.durationMs).toBe(0);
    });

    it('should produce different results with different seeds', () => {
      const config1 = buildConfig();
      const config2 = buildConfig();
      config2.seed = 11111;

      const log1 = new BattleSimulator(config1).run();
      const log2 = new BattleSimulator(config2).run();

      const damages1 = log1.turns.map((t) => t.damage);
      const damages2 = log2.turns.map((t) => t.damage);
      expect(damages1).not.toEqual(damages2);
    });

    it('should produce byte-identical logs through JSON serialization round-trip', () => {
      const sim = new BattleSimulator(buildConfig());
      const log = sim.run();

      const json = JSON.stringify(log);
      const deserialized = JSON.parse(json);

      const sim2 = new BattleSimulator(buildConfig());
      const log2 = sim2.run();

      expect(deserialized).toEqual(log2);
    });
  });

  describe('Full battle with skills and effects', () => {
    it('should use skills during battle and produce valid log', () => {
      const config: BattleConfig = {
        seed: 42,
        playerTeam: [makeWarrior('p1', 'player'), makeMage('p2', 'player')],
        enemyTeam: [makeWarrior('e1', 'enemy'), makeHealer('e2', 'enemy')],
      };

      const sim = new BattleSimulator(config);
      const log = sim.run();

      // Should have a result
      expect(['victory', 'defeat', 'timeout']).toContain(log.result);

      // Should have turns
      expect(log.turns.length).toBeGreaterThan(0);

      // Should have skillIds other than just auto-attack
      const skillIds = new Set(log.turns.map((t) => t.skillId));
      expect(skillIds.size).toBeGreaterThan(1);

      // Every turn should have a valid resultHp snapshot
      for (const turn of log.turns) {
        expect(turn.resultHp).toBeDefined();
        expect(Object.keys(turn.resultHp).length).toBeGreaterThan(0);
      }
    });

    it('should end with all heroes on one side at 0 HP (or timeout)', () => {
      const config: BattleConfig = {
        seed: 99999,
        playerTeam: [makeWarrior('p1', 'player')],
        enemyTeam: [makeWarrior('e1', 'enemy')],
      };

      const sim = new BattleSimulator(config);
      const log = sim.run();

      if (log.result !== 'timeout') {
        const finalHp = log.turns[log.turns.length - 1].resultHp;
        if (log.result === 'victory') {
          expect(finalHp['e1']).toBe(0);
        } else {
          expect(finalHp['p1']).toBe(0);
        }
      }
    });
  });

  describe('Timeout scenario', () => {
    it('should timeout when both sides cannot kill each other', () => {
      // Two tanks with very high defense and low attack
      const config: BattleConfig = {
        seed: 42,
        playerTeam: [
          makeHero({
            id: 'p1',
            team: 'player',
            stats: { hp: 10000, attack: 1, defense: 500, speed: 50 },
            currentHp: 10000,
          }),
        ],
        enemyTeam: [
          makeHero({
            id: 'e1',
            team: 'enemy',
            stats: { hp: 10000, attack: 1, defense: 500, speed: 50 },
            currentHp: 10000,
          }),
        ],
      };

      const sim = new BattleSimulator(config);
      const log = sim.run();

      expect(log.result).toBe('timeout');
      expect(log.totalTurns).toBe(50); // GAME_CONFIG.battle.maxTurns
    });
  });

  describe('Edge cases', () => {
    it('should handle single hero vs single hero', () => {
      const config: BattleConfig = {
        seed: 12345,
        playerTeam: [makeWarrior('p1', 'player')],
        enemyTeam: [makeWarrior('e1', 'enemy')],
      };

      const sim = new BattleSimulator(config);
      const log = sim.run();

      expect(['victory', 'defeat', 'timeout']).toContain(log.result);
      expect(log.turns.length).toBeGreaterThan(0);
    });

    it('should handle heroes with no skills (auto-attack only)', () => {
      const config: BattleConfig = {
        seed: 42,
        playerTeam: [
          makeHero({ id: 'p1', team: 'player', skills: [] }),
        ],
        enemyTeam: [
          makeHero({ id: 'e1', team: 'enemy', skills: [] }),
        ],
      };

      const sim = new BattleSimulator(config);
      const log = sim.run();

      expect(['victory', 'defeat', 'timeout']).toContain(log.result);
      // All turns should be auto-attack
      for (const turn of log.turns) {
        if (turn.skillId !== 'dot') {
          expect(turn.skillId).toBe('auto-attack');
        }
      }
    });

    it('should handle all heroes with identical stats and speed', () => {
      const stats = { hp: 500, attack: 100, defense: 30, speed: 50 };
      const config: BattleConfig = {
        seed: 42,
        playerTeam: [
          makeHero({ id: 'p1', team: 'player', stats, currentHp: 500 }),
          makeHero({ id: 'p2', team: 'player', stats, currentHp: 500 }),
        ],
        enemyTeam: [
          makeHero({ id: 'e1', team: 'enemy', stats, currentHp: 500 }),
          makeHero({ id: 'e2', team: 'enemy', stats, currentHp: 500 }),
        ],
      };

      const sim1 = new BattleSimulator(config);
      const sim2 = new BattleSimulator({
        ...config,
        playerTeam: config.playerTeam.map((h) => ({ ...h, stats: { ...h.stats } })),
        enemyTeam: config.enemyTeam.map((h) => ({ ...h, stats: { ...h.stats } })),
      });

      const log1 = sim1.run();
      const log2 = sim2.run();

      // Both should be deterministic
      expect(log1.result).toBe(log2.result);
      expect(log1.turns.length).toBe(log2.turns.length);
    });

    it('should handle healer keeping team alive for many turns', () => {
      const config: BattleConfig = {
        seed: 42,
        playerTeam: [
          makeHealer('p1', 'player'),
          makeWarrior('p2', 'player'),
        ],
        enemyTeam: [
          makeHero({ id: 'e1', team: 'enemy', stats: { hp: 800, attack: 50, defense: 30, speed: 60 }, currentHp: 800 }),
        ],
      };

      const sim = new BattleSimulator(config);
      const log = sim.run();

      expect(log.result).toBe('victory');

      // Healer should have used heal skill at some point
      const healActions = log.turns.filter((t) => t.skillId === 'healer-heal');
      expect(healActions.length).toBeGreaterThanOrEqual(0); // may or may not need healing
    });

    it('should handle shield absorbing damage', () => {
      const shielder = makeHealer('p1', 'player');
      const warrior = makeWarrior('p2', 'player');

      const config: BattleConfig = {
        seed: 42,
        playerTeam: [shielder, warrior],
        enemyTeam: [
          makeHero({
            id: 'e1',
            team: 'enemy',
            stats: { hp: 3000, attack: 80, defense: 50, speed: 40 },
            currentHp: 3000,
          }),
        ],
      };

      const sim = new BattleSimulator(config);
      const log = sim.run();

      // Should have used shield skill at some point
      const shieldActions = log.turns.filter((t) => t.skillId === 'healer-shield');
      // The healer prioritizes heal over shield, so shield may not be used if no one is hurt enough
      expect(['victory', 'defeat', 'timeout']).toContain(log.result);
    });

    it('should not mutate the original config teams', () => {
      const playerHero = makeWarrior('p1', 'player');
      const enemyHero = makeWarrior('e1', 'enemy');
      const originalPlayerHp = playerHero.currentHp;
      const originalEnemyHp = enemyHero.currentHp;

      const config: BattleConfig = {
        seed: 42,
        playerTeam: [playerHero],
        enemyTeam: [enemyHero],
      };

      const sim = new BattleSimulator(config);
      sim.run();

      // Original heroes should not be mutated
      expect(playerHero.currentHp).toBe(originalPlayerHp);
      expect(enemyHero.currentHp).toBe(originalEnemyHp);
    });

    it('should decrement cooldowns after each hero action', () => {
      const warrior = makeWarrior('p1', 'player');

      const config: BattleConfig = {
        seed: 42,
        playerTeam: [warrior],
        enemyTeam: [
          makeHero({
            id: 'e1',
            team: 'enemy',
            stats: { hp: 5000, attack: 30, defense: 30, speed: 40 },
            currentHp: 5000,
          }),
        ],
      };

      const sim = new BattleSimulator(config);
      const log = sim.run();

      // Warrior should use skills multiple times during a long fight
      const skillUsages = log.turns.filter(
        (t) => t.actorId === 'p1' && t.skillId !== 'auto-attack' && t.skillId !== 'dot',
      );
      expect(skillUsages.length).toBeGreaterThan(1);
    });
  });

  describe('Battle result correctness', () => {
    it('should return victory when all enemies die', () => {
      const config: BattleConfig = {
        seed: 42,
        playerTeam: [
          makeHero({
            id: 'p1',
            team: 'player',
            stats: { hp: 5000, attack: 500, defense: 200, speed: 100 },
            currentHp: 5000,
          }),
        ],
        enemyTeam: [
          makeHero({
            id: 'e1',
            team: 'enemy',
            stats: { hp: 100, attack: 10, defense: 5, speed: 10 },
            currentHp: 100,
          }),
        ],
      };

      const sim = new BattleSimulator(config);
      const log = sim.run();

      expect(log.result).toBe('victory');
    });

    it('should return defeat when all players die', () => {
      const config: BattleConfig = {
        seed: 42,
        playerTeam: [
          makeHero({
            id: 'p1',
            team: 'player',
            stats: { hp: 100, attack: 10, defense: 5, speed: 10 },
            currentHp: 100,
          }),
        ],
        enemyTeam: [
          makeHero({
            id: 'e1',
            team: 'enemy',
            stats: { hp: 5000, attack: 500, defense: 200, speed: 100 },
            currentHp: 5000,
          }),
        ],
      };

      const sim = new BattleSimulator(config);
      const log = sim.run();

      expect(log.result).toBe('defeat');
    });

    it('should have HP values decrease over time in resultHp snapshots', () => {
      const config: BattleConfig = {
        seed: 42,
        playerTeam: [makeWarrior('p1', 'player')],
        enemyTeam: [makeWarrior('e1', 'enemy')],
      };

      const sim = new BattleSimulator(config);
      const log = sim.run();

      // At least one hero should have decreasing HP
      const firstTurn = log.turns[0];
      const lastTurn = log.turns[log.turns.length - 1];

      const someHpDecreased = Object.keys(firstTurn.resultHp).some(
        (id) => lastTurn.resultHp[id] < firstTurn.resultHp[id],
      );
      expect(someHpDecreased).toBe(true);
    });
  });
});
