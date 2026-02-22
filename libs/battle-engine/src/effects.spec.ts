import { BattleHero, StatusEffect } from '@hero-wars/shared';
import {
  applyEffect,
  processEffects,
  removeExpiredEffects,
  getEffectiveStats,
  absorbShieldDamage,
} from './effects';
import { makeHero } from './test-utils';

describe('Effects System', () => {
  let hero: BattleHero;

  beforeEach(() => {
    hero = makeHero({
      id: 'test-hero',
      team: 'player',
      stats: { hp: 1000, attack: 100, defense: 50, speed: 80 },
      currentHp: 1000,
    });
  });

  describe('applyEffect', () => {
    it('should apply a buff to statusEffects', () => {
      const effect: StatusEffect = {
        id: 'buff-1',
        type: 'buff',
        value: 20,
        remainingTurns: 3,
        stat: 'attack',
        sourceId: 'caster',
      };
      applyEffect(hero, effect);
      expect(hero.statusEffects).toHaveLength(1);
      expect(hero.statusEffects[0].type).toBe('buff');
    });

    it('should apply instant heal without storing as effect', () => {
      hero.currentHp = 500;
      const effect: StatusEffect = {
        id: 'heal-1',
        type: 'heal',
        value: 300,
        remainingTurns: 0,
        sourceId: 'healer',
      };
      applyEffect(hero, effect);
      expect(hero.currentHp).toBe(800);
      expect(hero.statusEffects).toHaveLength(0);
    });

    it('should clamp heal to max HP', () => {
      hero.currentHp = 900;
      const effect: StatusEffect = {
        id: 'heal-2',
        type: 'heal',
        value: 300,
        remainingTurns: 0,
        sourceId: 'healer',
      };
      applyEffect(hero, effect);
      expect(hero.currentHp).toBe(1000);
    });

    it('should apply shield as status effect', () => {
      const effect: StatusEffect = {
        id: 'shield-1',
        type: 'shield',
        value: 200,
        remainingTurns: 3,
        sourceId: 'caster',
      };
      applyEffect(hero, effect);
      expect(hero.statusEffects).toHaveLength(1);
      expect(hero.statusEffects[0].type).toBe('shield');
      expect(hero.statusEffects[0].value).toBe(200);
    });

    it('should apply DoT effect', () => {
      const effect: StatusEffect = {
        id: 'dot-1',
        type: 'dot',
        value: 50,
        remainingTurns: 3,
        sourceId: 'caster',
      };
      applyEffect(hero, effect);
      expect(hero.statusEffects).toHaveLength(1);
      expect(hero.statusEffects[0].type).toBe('dot');
    });
  });

  describe('processEffects', () => {
    it('should deal DoT damage at turn-start', () => {
      hero.statusEffects = [
        { id: 'dot-1', type: 'dot', value: 50, remainingTurns: 3, sourceId: 'enemy' },
      ];
      const results = processEffects(hero, 'turn-start');
      expect(hero.currentHp).toBe(950);
      expect(results).toHaveLength(1);
      expect(results[0].damage).toBe(50);
    });

    it('should deal multiple DoT damage at turn-start', () => {
      hero.statusEffects = [
        { id: 'dot-1', type: 'dot', value: 30, remainingTurns: 2, sourceId: 'e1' },
        { id: 'dot-2', type: 'dot', value: 20, remainingTurns: 1, sourceId: 'e2' },
      ];
      const results = processEffects(hero, 'turn-start');
      expect(hero.currentHp).toBe(950);
      expect(results).toHaveLength(2);
    });

    it('should not reduce HP below 0 from DoT', () => {
      hero.currentHp = 30;
      hero.statusEffects = [
        { id: 'dot-1', type: 'dot', value: 50, remainingTurns: 2, sourceId: 'enemy' },
      ];
      processEffects(hero, 'turn-start');
      expect(hero.currentHp).toBe(0);
    });

    it('should decrement remainingTurns at turn-end', () => {
      hero.statusEffects = [
        { id: 'buff-1', type: 'buff', value: 20, remainingTurns: 3, stat: 'attack', sourceId: 'caster' },
      ];
      processEffects(hero, 'turn-end');
      expect(hero.statusEffects[0].remainingTurns).toBe(2);
    });

    it('should mark effects as expired when remainingTurns reaches 0', () => {
      hero.statusEffects = [
        { id: 'buff-1', type: 'buff', value: 20, remainingTurns: 1, stat: 'attack', sourceId: 'caster' },
      ];
      const results = processEffects(hero, 'turn-end');
      expect(results[0].expired).toBe(true);
    });
  });

  describe('removeExpiredEffects', () => {
    it('should remove effects with remainingTurns <= 0', () => {
      hero.statusEffects = [
        { id: 'buff-1', type: 'buff', value: 20, remainingTurns: 0, stat: 'attack', sourceId: 'c1' },
        { id: 'buff-2', type: 'buff', value: 10, remainingTurns: 2, stat: 'defense', sourceId: 'c2' },
      ];
      removeExpiredEffects(hero);
      expect(hero.statusEffects).toHaveLength(1);
      expect(hero.statusEffects[0].id).toBe('buff-2');
    });
  });

  describe('getEffectiveStats', () => {
    it('should apply buff modifier to the specified stat', () => {
      hero.statusEffects = [
        { id: 'buff-1', type: 'buff', value: 50, remainingTurns: 2, stat: 'attack', sourceId: 'caster' },
      ];
      const effective = getEffectiveStats(hero);
      expect(effective.attack).toBe(150); // 100 * 1.5 = 150
      expect(effective.defense).toBe(50); // unchanged
    });

    it('should apply debuff modifier to the specified stat', () => {
      hero.statusEffects = [
        { id: 'debuff-1', type: 'debuff', value: 50, remainingTurns: 2, stat: 'defense', sourceId: 'caster' },
      ];
      const effective = getEffectiveStats(hero);
      expect(effective.defense).toBe(25); // 50 * 0.5 = 25
      expect(effective.attack).toBe(100); // unchanged
    });

    it('should stack multiple buffs on the same stat', () => {
      hero.statusEffects = [
        { id: 'buff-1', type: 'buff', value: 20, remainingTurns: 2, stat: 'attack', sourceId: 'c1' },
        { id: 'buff-2', type: 'buff', value: 20, remainingTurns: 2, stat: 'attack', sourceId: 'c2' },
      ];
      const effective = getEffectiveStats(hero);
      // First buff: 100 * 1.2 = 120, floored = 120
      // Second buff: 120 * 1.2 = 144, floored = 144
      expect(effective.attack).toBe(144);
    });

    it('should not modify stats for non-buff/debuff effects', () => {
      hero.statusEffects = [
        { id: 'dot-1', type: 'dot', value: 50, remainingTurns: 2, sourceId: 'caster' },
        { id: 'shield-1', type: 'shield', value: 200, remainingTurns: 3, sourceId: 'caster' },
      ];
      const effective = getEffectiveStats(hero);
      expect(effective.attack).toBe(100);
      expect(effective.defense).toBe(50);
    });

    it('should ensure stats never go below minimum values', () => {
      hero.statusEffects = [
        { id: 'debuff-1', type: 'debuff', value: 100, remainingTurns: 2, stat: 'attack', sourceId: 'caster' },
      ];
      const effective = getEffectiveStats(hero);
      expect(effective.attack).toBe(1); // minimum 1
    });

    it('should not mutate original hero stats', () => {
      hero.statusEffects = [
        { id: 'buff-1', type: 'buff', value: 50, remainingTurns: 2, stat: 'attack', sourceId: 'caster' },
      ];
      getEffectiveStats(hero);
      expect(hero.stats.attack).toBe(100); // unchanged
    });
  });

  describe('absorbShieldDamage', () => {
    it('should absorb full damage when shield is sufficient', () => {
      hero.statusEffects = [
        { id: 'shield-1', type: 'shield', value: 200, remainingTurns: 3, sourceId: 'caster' },
      ];
      const remaining = absorbShieldDamage(hero, 100);
      expect(remaining).toBe(0);
      expect(hero.statusEffects[0].value).toBe(100);
    });

    it('should absorb partial damage and pass remaining through', () => {
      hero.statusEffects = [
        { id: 'shield-1', type: 'shield', value: 50, remainingTurns: 3, sourceId: 'caster' },
      ];
      const remaining = absorbShieldDamage(hero, 100);
      expect(remaining).toBe(50);
      expect(hero.statusEffects).toHaveLength(0); // shield depleted and removed
    });

    it('should handle exact damage equals shield value', () => {
      hero.statusEffects = [
        { id: 'shield-1', type: 'shield', value: 100, remainingTurns: 3, sourceId: 'caster' },
      ];
      const remaining = absorbShieldDamage(hero, 100);
      expect(remaining).toBe(0);
      expect(hero.statusEffects).toHaveLength(0); // shield depleted
    });

    it('should absorb from multiple shields', () => {
      hero.statusEffects = [
        { id: 'shield-1', type: 'shield', value: 50, remainingTurns: 3, sourceId: 'c1' },
        { id: 'shield-2', type: 'shield', value: 80, remainingTurns: 2, sourceId: 'c2' },
      ];
      const remaining = absorbShieldDamage(hero, 100);
      expect(remaining).toBe(0);
      expect(hero.statusEffects).toHaveLength(1); // first shield depleted
      expect(hero.statusEffects[0].value).toBe(30); // second shield has 30 remaining
    });

    it('should return full damage when no shields exist', () => {
      const remaining = absorbShieldDamage(hero, 100);
      expect(remaining).toBe(100);
    });
  });
});
