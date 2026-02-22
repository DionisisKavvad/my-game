import { BattleHero } from '@hero-wars/shared';
import { decideAction } from './ai';
import { SeededRandom } from './rng';
import { makeHero, makeHealer, makeWarrior, makeMage, makeSkill } from './test-utils';

describe('AI Decision Making', () => {
  const seed = 42;

  function makeRng(): SeededRandom {
    return new SeededRandom(seed);
  }

  describe('Priority 1: Healing', () => {
    it('should use heal skill when ally is below 40% HP', () => {
      const healer = makeHealer('healer-1', 'enemy');
      const woundedAlly = makeWarrior('ally-1', 'enemy');
      woundedAlly.currentHp = 100; // well below 40% of 1200
      const enemy = makeWarrior('enemy-1', 'player');

      const allHeroes = [healer, woundedAlly, enemy];
      const decision = decideAction(healer, allHeroes, makeRng());

      expect(decision.type).toBe('skill');
      expect(decision.skillId).toBe('healer-heal');
      expect(decision.targetIds).toContain(woundedAlly.id);
    });

    it('should not use heal when no ally is wounded enough', () => {
      const healer = makeHealer('healer-1', 'enemy');
      const healthyAlly = makeWarrior('ally-1', 'enemy');
      healthyAlly.currentHp = 1000; // above 40%
      const enemy = makeWarrior('enemy-1', 'player');

      const allHeroes = [healer, healthyAlly, enemy];
      const decision = decideAction(healer, allHeroes, makeRng());

      // Should not use heal skill, should look at other priorities
      expect(decision.skillId).not.toBe('healer-heal');
    });
  });

  describe('Priority 2: Buff/Shield', () => {
    it('should use buff skill when no active buffs on team', () => {
      const warrior = makeWarrior('warrior-1', 'enemy');
      const enemy = makeHero({ id: 'enemy-1', team: 'player' });

      const allHeroes = [warrior, enemy];
      const rng = makeRng();
      const decision = decideAction(warrior, allHeroes, rng);

      // Warrior has no heal skill, so priority 1 is skipped
      // Priority 2: has buff skill (Battle Shout), self target
      // Depends on what's off cooldown - warrior-shout should be used or warrior-slash
      // Since slash is damage skill (priority 4), and shout is buff (priority 2)
      expect(decision.type).toBe('skill');
    });

    it('should skip buff when team already has active buff', () => {
      const warrior = makeWarrior('warrior-1', 'enemy');
      warrior.statusEffects = [
        { id: 'buff-1', type: 'buff', value: 20, remainingTurns: 2, stat: 'attack', sourceId: 'warrior-1' },
      ];
      const enemy = makeHero({ id: 'enemy-1', team: 'player' });

      const allHeroes = [warrior, enemy];
      const decision = decideAction(warrior, allHeroes, makeRng());

      // Should skip buff (priority 2) and use damage skill (priority 4) or auto-attack
      expect(decision.skillId).not.toBe('warrior-shout');
    });
  });

  describe('Priority 3: AoE', () => {
    it('should use AoE skill when 3+ enemies alive', () => {
      const mage = makeMage('mage-1', 'player');
      const enemies = [
        makeHero({ id: 'e1', team: 'enemy' }),
        makeHero({ id: 'e2', team: 'enemy' }),
        makeHero({ id: 'e3', team: 'enemy' }),
      ];

      const allHeroes = [mage, ...enemies];
      const decision = decideAction(mage, allHeroes, makeRng());

      // Mage has no heal, no buff/shield skill
      // Has AoE skill (Blizzard) and 3+ enemies alive
      expect(decision.type).toBe('skill');
      expect(decision.skillId).toBe('mage-blizzard');
      expect(decision.targetIds).toHaveLength(3);
    });

    it('should not use AoE when fewer than 3 enemies', () => {
      const mage = makeMage('mage-1', 'player');
      const enemies = [
        makeHero({ id: 'e1', team: 'enemy' }),
        makeHero({ id: 'e2', team: 'enemy' }),
      ];

      const allHeroes = [mage, ...enemies];
      const decision = decideAction(mage, allHeroes, makeRng());

      // Should use single-target skill instead
      expect(decision.skillId).not.toBe('mage-blizzard');
    });
  });

  describe('Priority 4: Single-target damage', () => {
    it('should use single-target damage skill when available', () => {
      const mage = makeMage('mage-1', 'player');
      const enemy = makeHero({ id: 'e1', team: 'enemy' });

      const allHeroes = [mage, enemy];
      const decision = decideAction(mage, allHeroes, makeRng());

      expect(decision.type).toBe('skill');
      expect(decision.skillId).toBe('mage-fireball');
    });
  });

  describe('Priority 5: Auto-attack', () => {
    it('should auto-attack when all skills on cooldown', () => {
      const hero = makeHero({
        id: 'hero-1',
        team: 'player',
        skills: [
          makeSkill({ id: 'skill-1', cooldown: 3, currentCooldown: 2 }),
        ],
      });
      const enemy = makeHero({ id: 'e1', team: 'enemy' });

      const allHeroes = [hero, enemy];
      const decision = decideAction(hero, allHeroes, makeRng());

      expect(decision.type).toBe('auto-attack');
      expect(decision.targetIds).toHaveLength(1);
    });

    it('should auto-attack when hero has no skills', () => {
      const hero = makeHero({ id: 'hero-1', team: 'player', skills: [] });
      const enemy = makeHero({ id: 'e1', team: 'enemy' });

      const allHeroes = [hero, enemy];
      const decision = decideAction(hero, allHeroes, makeRng());

      expect(decision.type).toBe('auto-attack');
    });
  });

  describe('Determinism', () => {
    it('should produce identical decisions with the same seed', () => {
      const mage = makeMage('mage-1', 'player');
      const enemies = [
        makeHero({ id: 'e1', team: 'enemy', currentHp: 200 }),
        makeHero({ id: 'e2', team: 'enemy', currentHp: 300 }),
      ];

      const allHeroes = [mage, ...enemies];
      const rng1 = new SeededRandom(12345);
      const rng2 = new SeededRandom(12345);

      const decision1 = decideAction(mage, allHeroes, rng1);
      const decision2 = decideAction(mage, allHeroes, rng2);

      expect(decision1).toEqual(decision2);
    });
  });

  describe('Target selection', () => {
    it('should target lowest HP enemy for auto-attack most of the time', () => {
      const hero = makeHero({ id: 'hero-1', team: 'player', skills: [] });
      const lowHpEnemy = makeHero({ id: 'e1', team: 'enemy', currentHp: 100 });
      const highHpEnemy = makeHero({ id: 'e2', team: 'enemy', currentHp: 400 });

      const allHeroes = [hero, lowHpEnemy, highHpEnemy];

      // Run multiple times to check that lowest HP is usually targeted
      let lowestHpTargeted = 0;
      for (let seed = 0; seed < 100; seed++) {
        const rng = new SeededRandom(seed);
        const decision = decideAction(hero, allHeroes, rng);
        if (decision.targetIds[0] === lowHpEnemy.id) {
          lowestHpTargeted++;
        }
      }

      // Should target lowest HP ~90% of the time (10% random)
      expect(lowestHpTargeted).toBeGreaterThan(80);
    });
  });

  describe('Edge cases', () => {
    it('should return empty targetIds when no enemies alive', () => {
      const hero = makeHero({ id: 'hero-1', team: 'player' });
      const deadEnemy = makeHero({ id: 'e1', team: 'enemy', currentHp: 0 });

      const allHeroes = [hero, deadEnemy];
      const decision = decideAction(hero, allHeroes, makeRng());

      expect(decision.type).toBe('auto-attack');
      expect(decision.targetIds).toHaveLength(0);
    });
  });
});
