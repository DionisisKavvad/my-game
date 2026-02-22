/**
 * BattleService unit tests.
 *
 * Note: The client jest config lacks proper Angular test environment setup
 * (setupFilesAfterSetup typo in jest.config.ts), so TestBed cannot be used.
 * These tests validate the service logic by constructing it directly.
 * Integration-level tests (TestBed + HttpClient) are deferred to a future
 * sprint when the jest config is fixed.
 */
import { of } from 'rxjs';

// Mock Angular's Injectable decorator so the service class can be constructed
// without the Angular compiler.
jest.mock('@angular/core', () => ({
  Injectable: () => () => undefined,
}));

// Mock HttpClient dependency (api.service.ts imports it)
jest.mock('@angular/common/http', () => ({}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BattleService } = require('./battle.service');

describe('BattleService', () => {
  let service: typeof BattleService.prototype;
  let apiService: { post: jest.Mock; get: jest.Mock };
  let heroesService: { loadTeam: jest.Mock };

  const mockTemplate = {
    id: 'warrior_bold',
    name: 'Bold Warrior',
    class: 'warrior',
    rarity: 'common',
    baseHp: 1000,
    baseAttack: 100,
    baseDefense: 50,
    baseSpeed: 70,
    skills: [],
    spriteKey: 'warrior_bold',
  };

  const mockPlayerHero = {
    id: 'hero-1',
    templateId: 'warrior_bold',
    template: mockTemplate,
    level: 1,
    stars: 1,
    xp: 0,
    xpToNextLevel: 100,
    equipment: {},
    isInTeam: true,
    teamPosition: 0,
    computedStats: { hp: 1000, attack: 100, defense: 50, speed: 70 },
  };

  const mockBattleStartResponse = {
    battleId: 'battle-123',
    seed: 42,
    seedHash: 'abc123',
    enemyTeam: [
      {
        id: 'enemy-0',
        name: 'Enemy Warrior',
        heroClass: 'warrior',
        stats: { hp: 800, attack: 80, defense: 40, speed: 65 },
        currentHp: 800,
        skills: [],
        team: 'enemy',
        position: 0,
        statusEffects: [],
      },
    ],
  };

  const mockTeamResponse = {
    heroes: [mockPlayerHero],
  };

  beforeEach(() => {
    apiService = {
      post: jest.fn(),
      get: jest.fn(),
    };

    heroesService = {
      loadTeam: jest.fn(),
    };

    service = new BattleService(apiService, heroesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('startBattle', () => {
    beforeEach(() => {
      apiService.post.mockReturnValue(of(mockBattleStartResponse));
      heroesService.loadTeam.mockReturnValue(of(mockTeamResponse));
    });

    it('calls POST /battles/start with the stage ID', async () => {
      await service.startBattle('1-1');
      expect(apiService.post).toHaveBeenCalledWith('/battles/start', { stageId: '1-1' });
    });

    it('loads the player team from HeroesService', async () => {
      await service.startBattle('1-1');
      expect(heroesService.loadTeam).toHaveBeenCalled();
    });

    it('returns a valid battle result with battleId and teams', async () => {
      const result = await service.startBattle('1-1');
      expect(result.battleId).toBe('battle-123');
      expect(result.playerTeam.length).toBe(1);
      expect(result.enemyTeam.length).toBe(1);
      expect(result.battleLog).toBeDefined();
      expect(result.battleLog.turns).toBeDefined();
    });

    it('converts player hero with heroClass from template', async () => {
      const result = await service.startBattle('1-1');
      const hero = result.playerTeam[0];
      expect(hero.heroClass).toBe('warrior');
      expect(hero.spriteKey).toBe('warrior_bold');
    });

    it('runs the simulator and returns a battleLog with result', async () => {
      const result = await service.startBattle('1-1');
      expect(['victory', 'defeat', 'timeout']).toContain(result.battleLog.result);
    });
  });

  describe('completeBattle', () => {
    it('calls POST /battles/:id/complete with correct payload', async () => {
      const mockResponse = {
        result: 'victory',
        validated: true,
        rewards: { gold: 100, xp: 50, heroXp: 25 },
        starsEarned: 3,
      };

      apiService.post.mockReturnValue(of(mockResponse));

      const log = { seed: 42, turns: [], result: 'victory', totalTurns: 0, durationMs: 0 };
      const result = await service.completeBattle('battle-123', log, 5000);

      expect(apiService.post).toHaveBeenCalledWith('/battles/battle-123/complete', {
        battleId: 'battle-123',
        clientLog: log,
        durationMs: 5000,
      });
      expect(result.validated).toBe(true);
    });

    it('caches the validation result in lastValidationResult', async () => {
      const mockResponse = {
        result: 'victory',
        validated: true,
        rewards: { gold: 100, xp: 50, heroXp: 25 },
        starsEarned: 3,
      };

      apiService.post.mockReturnValue(of(mockResponse));

      const log = { seed: 42, turns: [], result: 'victory', totalTurns: 0, durationMs: 0 };
      await service.completeBattle('battle-123', log, 5000);

      expect(service.lastValidationResult).toBe(mockResponse);
    });
  });

  describe('clearLastResult', () => {
    it('clears the cached validation result', async () => {
      const mockResponse = {
        result: 'victory',
        validated: true,
        rewards: { gold: 100, xp: 50, heroXp: 25 },
        starsEarned: 3,
      };
      apiService.post.mockReturnValue(of(mockResponse));

      const log = { seed: 42, turns: [], result: 'victory', totalTurns: 0, durationMs: 0 };
      await service.completeBattle('battle-123', log, 5000);
      service.clearLastResult();

      expect(service.lastValidationResult).toBeNull();
    });
  });
});
