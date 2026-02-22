import { BattleEventBus, BattleData } from './battle-event-bus';
import { BattleCompleteResponse, BattleLog } from '@hero-wars/shared';

describe('BattleEventBus', () => {
  let bus: BattleEventBus;

  beforeEach(() => {
    bus = new BattleEventBus();
  });

  afterEach(() => {
    bus.destroy();
  });

  describe('setBattleData / getBattleData', () => {
    it('stores and retrieves battle data correctly', () => {
      const data: BattleData = {
        playerTeam: [],
        enemyTeam: [],
        battleLog: { seed: 1, turns: [], result: 'victory', totalTurns: 0, durationMs: 0 } as BattleLog,
      };

      bus.setBattleData(data);
      expect(bus.getBattleData()).toBe(data);
    });

    it('throws when battle data is not set', () => {
      expect(() => bus.getBattleData()).toThrow('Battle data not set');
    });
  });

  describe('setBattleResult / getBattleResult', () => {
    it('stores and retrieves battle result correctly', () => {
      const result: BattleCompleteResponse = {
        result: 'victory',
        validated: true,
        rewards: { gold: 100, xp: 50, heroXp: 25 },
        starsEarned: 3,
      };

      bus.setBattleResult(result);
      expect(bus.getBattleResult()).toBe(result);
    });

    it('returns null when result not set', () => {
      expect(bus.getBattleResult()).toBeNull();
    });
  });

  describe('changeSpeed / onSpeedChange', () => {
    it('emits speed changes to subscribers', (done) => {
      bus.onSpeedChange((speed) => {
        expect(speed).toBe(2);
        done();
      });

      bus.changeSpeed(2);
    });
  });

  describe('emitTurnUpdate / turnUpdate', () => {
    it('emits turn updates on the observable', (done) => {
      bus.turnUpdate.subscribe((turn) => {
        expect(turn).toBe(5);
        done();
      });

      bus.emitTurnUpdate(5);
    });
  });

  describe('emitBattleComplete / battleComplete', () => {
    it('emits battle complete events', (done) => {
      bus.battleComplete.subscribe(() => {
        done();
      });

      bus.emitBattleComplete();
    });
  });

  describe('emitNavigate / navigate', () => {
    it('emits navigation events', (done) => {
      bus.navigate.subscribe((route) => {
        expect(route).toBe('lobby');
        done();
      });

      bus.emitNavigate('lobby');
    });
  });

  describe('skipBattle / onSkipBattle', () => {
    it('emits skip events to subscribers', (done) => {
      bus.onSkipBattle(() => {
        done();
      });

      bus.skipBattle();
    });
  });

  describe('destroy', () => {
    it('completes all subjects without errors', () => {
      expect(() => bus.destroy()).not.toThrow();
    });

    it('clears battle data on destroy', () => {
      const data: BattleData = {
        playerTeam: [],
        enemyTeam: [],
        battleLog: { seed: 1, turns: [], result: 'victory', totalTurns: 0, durationMs: 0 } as BattleLog,
      };
      bus.setBattleData(data);
      bus.destroy();
      expect(() => bus.getBattleData()).toThrow('Battle data not set');
    });
  });
});
