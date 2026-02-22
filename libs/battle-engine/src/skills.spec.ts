import { BattleHero, BattleSkill } from '@hero-wars/shared';
import { executeSkill, executeAutoAttack } from './skills';
import { SeededRandom } from './rng';
import { makeHero, makeSkill, makeMage, makeHealer } from './test-utils';

describe('Skill Execution System', () => {
  const seed = 42;

  function makeRng(): SeededRandom {
    return new SeededRandom(seed);
  }

  describe('executeSkill - single target damage', () => {
    it('should deal damage to the lowest HP enemy', () => {
      const attacker = makeMage('mage-1', 'player');
      const fireball = attacker.skills.find((s) => s.id === 'mage-fireball')!;
      const lowHpEnemy = makeHero({ id: 'e1', team: 'enemy', currentHp: 200 });
      const highHpEnemy = makeHero({ id: 'e2', team: 'enemy', currentHp: 400 });

      const allHeroes = [attacker, lowHpEnemy, highHpEnemy];
      const result = executeSkill(attacker, fireball, allHeroes, makeRng(), 1);

      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]).toBe('e1'); // lowest HP
      expect(result.damage).toBeGreaterThan(0);
    });

    it('should apply skill damage multiplier', () => {
      const attacker = makeHero({
        id: 'a1',
        team: 'player',
        stats: { hp: 500, attack: 100, defense: 30, speed: 50 },
      });
      const weakSkill = makeSkill({ id: 's1', damage: 100, target: 'single' });
      const strongSkill = makeSkill({ id: 's2', damage: 200, target: 'single' });
      const defender = makeHero({ id: 'e1', team: 'enemy', currentHp: 1000 });

      const rng1 = new SeededRandom(seed);
      const result1 = executeSkill(attacker, weakSkill, [attacker, defender], rng1, 1);

      // Reset defender HP
      defender.currentHp = 1000;
      const rng2 = new SeededRandom(seed);
      const result2 = executeSkill(attacker, strongSkill, [attacker, defender], rng2, 1);

      // Stronger skill should deal more damage (assuming same RNG)
      expect(result2.damage).toBeGreaterThanOrEqual(result1.damage);
    });
  });

  describe('executeSkill - AoE damage', () => {
    it('should hit all enemies', () => {
      const mage = makeMage('mage-1', 'player');
      const blizzard = mage.skills.find((s) => s.id === 'mage-blizzard')!;
      const enemies = [
        makeHero({ id: 'e1', team: 'enemy', currentHp: 500 }),
        makeHero({ id: 'e2', team: 'enemy', currentHp: 500 }),
        makeHero({ id: 'e3', team: 'enemy', currentHp: 500 }),
      ];

      const allHeroes = [mage, ...enemies];
      const result = executeSkill(mage, blizzard, allHeroes, makeRng(), 1);

      expect(result.targets).toHaveLength(3);
      expect(result.damage).toBeGreaterThan(0);
    });

    it('should apply AoE damage multiplier (0.7x)', () => {
      const mage = makeHero({
        id: 'mage-1',
        team: 'player',
        stats: { hp: 800, attack: 200, defense: 60, speed: 90 },
        currentHp: 800,
      });
      const aoeSkill = makeSkill({ id: 'aoe', damage: 100, target: 'all' });
      const singleSkill = makeSkill({ id: 'single', damage: 100, target: 'single' });
      const enemy = makeHero({ id: 'e1', team: 'enemy', currentHp: 1000 });

      // Test single damage
      const rng1 = new SeededRandom(seed);
      const singleResult = executeSkill(mage, singleSkill, [mage, enemy], rng1, 1);

      // Reset enemy HP
      enemy.currentHp = 1000;

      // Test AoE damage (on single target for comparison)
      const rng2 = new SeededRandom(seed);
      const aoeResult = executeSkill(mage, aoeSkill, [mage, enemy], rng2, 1);

      // AoE should deal ~70% of single target damage
      expect(aoeResult.damage).toBeLessThan(singleResult.damage);
    });

    it('should skip dead enemies', () => {
      const mage = makeMage('mage-1', 'player');
      const blizzard = mage.skills.find((s) => s.id === 'mage-blizzard')!;
      const alive = makeHero({ id: 'e1', team: 'enemy', currentHp: 500 });
      const dead = makeHero({ id: 'e2', team: 'enemy', currentHp: 0 });

      const allHeroes = [mage, alive, dead];
      const result = executeSkill(mage, blizzard, allHeroes, makeRng(), 1);

      expect(result.targets).toHaveLength(1);
      expect(result.targets[0]).toBe('e1');
    });
  });

  describe('executeSkill - heal', () => {
    it('should heal the lowest HP ratio ally', () => {
      const healer = makeHealer('healer-1', 'player');
      const healSkill = healer.skills.find((s) => s.id === 'healer-heal')!;
      const woundedAlly = makeHero({
        id: 'p1',
        team: 'player',
        stats: { hp: 1000, attack: 100, defense: 50, speed: 70 },
        currentHp: 300,
      });
      const healthyAlly = makeHero({
        id: 'p2',
        team: 'player',
        stats: { hp: 500, attack: 100, defense: 50, speed: 60 },
        currentHp: 400,
      });
      const enemy = makeHero({ id: 'e1', team: 'enemy' });

      const allHeroes = [healer, woundedAlly, healthyAlly, enemy];
      const result = executeSkill(healer, healSkill, allHeroes, makeRng(), 1);

      expect(result.targets).toContain('p1');
      expect(result.healing).toBeGreaterThan(0);
    });

    it('should not heal above max HP', () => {
      const healer = makeHealer('healer-1', 'player');
      const healSkill = healer.skills.find((s) => s.id === 'healer-heal')!;
      const ally = makeHero({
        id: 'p1',
        team: 'player',
        stats: { hp: 500, attack: 100, defense: 50, speed: 70 },
        currentHp: 490,
      });
      const enemy = makeHero({ id: 'e1', team: 'enemy' });

      const allHeroes = [healer, ally, enemy];
      executeSkill(healer, healSkill, allHeroes, makeRng(), 1);

      expect(ally.currentHp).toBeLessThanOrEqual(500);
    });
  });

  describe('executeSkill - shield', () => {
    it('should apply shield as status effect', () => {
      const healer = makeHealer('healer-1', 'player');
      const shieldSkill = healer.skills.find((s) => s.id === 'healer-shield')!;
      const ally = makeHero({
        id: 'p1',
        team: 'player',
        stats: { hp: 500, attack: 100, defense: 20, speed: 70 },
        currentHp: 500,
      });
      const enemy = makeHero({ id: 'e1', team: 'enemy' });

      const allHeroes = [healer, ally, enemy];
      const result = executeSkill(healer, shieldSkill, allHeroes, makeRng(), 1);

      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].type).toBe('shield');
      expect(result.effects[0].value).toBeGreaterThan(0);
    });
  });

  describe('executeSkill - self buff', () => {
    it('should apply buff to the caster', () => {
      const warrior = makeHero({
        id: 'w1',
        team: 'player',
        stats: { hp: 1000, attack: 150, defense: 100, speed: 80 },
        currentHp: 1000,
        skills: [
          makeSkill({
            id: 'self-buff',
            name: 'Battle Shout',
            damage: 0,
            cooldown: 4,
            target: 'self',
            effect: { type: 'buff', value: 20, duration: 3, stat: 'attack' },
          }),
        ],
      });
      const enemy = makeHero({ id: 'e1', team: 'enemy' });

      const allHeroes = [warrior, enemy];
      const result = executeSkill(warrior, warrior.skills[0], allHeroes, makeRng(), 1);

      expect(result.targets).toEqual([warrior.id]);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].type).toBe('buff');
      expect(warrior.statusEffects).toHaveLength(1);
    });
  });

  describe('executeAutoAttack', () => {
    it('should deal damage to target', () => {
      const attacker = makeHero({
        id: 'a1',
        team: 'player',
        stats: { hp: 500, attack: 100, defense: 30, speed: 50 },
        currentHp: 500,
      });
      const defender = makeHero({
        id: 'd1',
        team: 'enemy',
        stats: { hp: 500, attack: 80, defense: 30, speed: 40 },
        currentHp: 500,
      });

      const result = executeAutoAttack(attacker, defender, makeRng());

      expect(result.damage).toBeGreaterThan(0);
      expect(defender.currentHp).toBeLessThan(500);
    });

    it('should be deterministic with same seed', () => {
      const makeAttacker = () =>
        makeHero({
          id: 'a1',
          team: 'player',
          stats: { hp: 500, attack: 100, defense: 30, speed: 50 },
          currentHp: 500,
        });
      const makeDefender = () =>
        makeHero({
          id: 'd1',
          team: 'enemy',
          stats: { hp: 500, attack: 80, defense: 30, speed: 40 },
          currentHp: 500,
        });

      const result1 = executeAutoAttack(makeAttacker(), makeDefender(), new SeededRandom(seed));
      const result2 = executeAutoAttack(makeAttacker(), makeDefender(), new SeededRandom(seed));

      expect(result1.damage).toBe(result2.damage);
    });
  });
});
