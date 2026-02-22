import { BattleHero } from '@hero-wars/shared';
import { BattleSimulator, BattleConfig } from './simulator';

function makeHero(overrides: Partial<BattleHero> & { id: string; team: 'player' | 'enemy' }): BattleHero {
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

describe('BattleSimulator determinism', () => {
  const seed = 98765;

  function buildConfig(): BattleConfig {
    return {
      seed,
      playerTeam: [
        makeHero({ id: 'p1', team: 'player', stats: { hp: 600, attack: 120, defense: 40, speed: 70 }, currentHp: 600 }),
        makeHero({ id: 'p2', team: 'player', stats: { hp: 400, attack: 150, defense: 20, speed: 70 }, currentHp: 400 }),
      ],
      enemyTeam: [
        makeHero({ id: 'e1', team: 'enemy', stats: { hp: 500, attack: 100, defense: 35, speed: 70 }, currentHp: 500 }),
        makeHero({ id: 'e2', team: 'enemy', stats: { hp: 450, attack: 110, defense: 25, speed: 70 }, currentHp: 450 }),
      ],
    };
  }

  it('should produce identical BattleLogs for identical configs (same seed, same teams)', () => {
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

    // All four heroes have speed 70, so order is determined by id.localeCompare
    // Expected order: e1, e2, p1, p2 (lexicographic)
    expect(log1.turns[0].actorId).toBe('e1');
    expect(log1.turns[1].actorId).toBe('e2');
    expect(log1.turns[2].actorId).toBe('p1');
    expect(log1.turns[3].actorId).toBe('p2');

    // And both simulations agree
    for (let i = 0; i < log1.turns.length; i++) {
      expect(log1.turns[i].actorId).toBe(log2.turns[i].actorId);
    }
  });

  it('should set durationMs to 0 (no Date.now dependency)', () => {
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

    // At least damage values should differ due to different RNG sequences
    const damages1 = log1.turns.map((t) => t.damage);
    const damages2 = log2.turns.map((t) => t.damage);
    expect(damages1).not.toEqual(damages2);
  });
});
