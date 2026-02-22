import { HeroTemplate, PlayerHero, CampaignEnemy } from '@hero-wars/shared';
import { playerHeroToBattleHero, campaignEnemyToBattleHero } from './hero-converter';

const warriorTemplate: HeroTemplate = {
  id: 'warrior_bold',
  name: 'Aric the Bold',
  class: 'warrior',
  rarity: 'common',
  baseHp: 1200,
  baseAttack: 150,
  baseDefense: 100,
  baseSpeed: 80,
  skills: [
    {
      id: 'warrior-slash',
      name: 'Power Slash',
      description: 'A powerful slash that deals 150% damage',
      damage: 150,
      cooldown: 2,
      target: 'single',
    },
    {
      id: 'warrior-shout',
      name: 'Battle Shout',
      description: 'Boosts own attack by 20% for 3 turns',
      damage: 0,
      cooldown: 4,
      target: 'self',
      effect: { type: 'buff', value: 20, duration: 3, stat: 'attack' },
    },
  ],
  spriteKey: 'hero_warrior',
};

describe('Hero Converter', () => {
  describe('playerHeroToBattleHero', () => {
    it('should convert a level 1, 1 star PlayerHero correctly', () => {
      const playerHero: PlayerHero = {
        id: 'ph-123',
        playerId: 'player-1',
        templateId: 'warrior_bold',
        template: warriorTemplate,
        level: 1,
        stars: 1,
        xp: 0,
        equipment: {},
        isInTeam: true,
        teamPosition: 0,
      };

      const battleHero = playerHeroToBattleHero(playerHero, 'player');

      expect(battleHero.id).toBe('ph-123');
      expect(battleHero.name).toBe('Aric the Bold');
      expect(battleHero.team).toBe('player');
      expect(battleHero.position).toBe(0);
      expect(battleHero.currentHp).toBe(battleHero.stats.hp);
      expect(battleHero.statusEffects).toHaveLength(0);
      expect(battleHero.skills).toHaveLength(2);
      // Level 1, stars 1: multiplier = 1.0 * 1.0 = 1.0
      expect(battleHero.stats.hp).toBe(1200);
      expect(battleHero.stats.attack).toBe(150);
    });

    it('should calculate stats with level and star multipliers', () => {
      const playerHero: PlayerHero = {
        id: 'ph-456',
        playerId: 'player-1',
        templateId: 'warrior_bold',
        template: warriorTemplate,
        level: 10,
        stars: 3,
        xp: 0,
        equipment: {},
        isInTeam: true,
        teamPosition: 1,
      };

      const battleHero = playerHeroToBattleHero(playerHero, 'player');

      // Level 10: levelMult = 1 + (10-1) * 0.1 = 1.9
      // Stars 3: starMult = 1 + (3-1) * 0.15 = 1.3
      // HP: floor(1200 * 1.9 * 1.3) = floor(2964) = 2964
      expect(battleHero.stats.hp).toBe(2964);
      expect(battleHero.currentHp).toBe(2964);
    });

    it('should set all skill cooldowns to 0 initially', () => {
      const playerHero: PlayerHero = {
        id: 'ph-789',
        playerId: 'player-1',
        templateId: 'warrior_bold',
        template: warriorTemplate,
        level: 1,
        stars: 1,
        xp: 0,
        equipment: {},
        isInTeam: true,
        teamPosition: 0,
      };

      const battleHero = playerHeroToBattleHero(playerHero, 'player');

      for (const skill of battleHero.skills) {
        expect(skill.currentCooldown).toBe(0);
      }
    });

    it('should carry over skill effect data', () => {
      const playerHero: PlayerHero = {
        id: 'ph-789',
        playerId: 'player-1',
        templateId: 'warrior_bold',
        template: warriorTemplate,
        level: 1,
        stars: 1,
        xp: 0,
        equipment: {},
        isInTeam: true,
        teamPosition: 0,
      };

      const battleHero = playerHeroToBattleHero(playerHero, 'player');

      const buffSkill = battleHero.skills.find((s) => s.id === 'warrior-shout');
      expect(buffSkill?.effect).toBeDefined();
      expect(buffSkill?.effect?.type).toBe('buff');
      expect(buffSkill?.effect?.value).toBe(20);
    });

    it('should handle null teamPosition', () => {
      const playerHero: PlayerHero = {
        id: 'ph-999',
        playerId: 'player-1',
        templateId: 'warrior_bold',
        template: warriorTemplate,
        level: 1,
        stars: 1,
        xp: 0,
        equipment: {},
        isInTeam: false,
        teamPosition: null,
      };

      const battleHero = playerHeroToBattleHero(playerHero, 'player');
      expect(battleHero.position).toBe(0); // defaults to 0
    });
  });

  describe('campaignEnemyToBattleHero', () => {
    it('should convert a CampaignEnemy correctly', () => {
      const enemy: CampaignEnemy = {
        templateId: 'warrior_bold',
        level: 5,
        stars: 2,
      };

      const battleHero = campaignEnemyToBattleHero(enemy, warriorTemplate, 0);

      expect(battleHero.id).toBe('enemy-warrior_bold-0');
      expect(battleHero.name).toBe('Aric the Bold');
      expect(battleHero.team).toBe('enemy');
      expect(battleHero.position).toBe(0);
      // Level 5: levelMult = 1 + (5-1) * 0.1 = 1.4
      // Stars 2: starMult = 1 + (2-1) * 0.15 = 1.15
      // HP: floor(1200 * 1.4 * 1.15) = floor(1931.999...) = 1931
      expect(battleHero.stats.hp).toBe(1931);
      expect(battleHero.currentHp).toBe(1931);
    });

    it('should use index for position and deterministic ID', () => {
      const enemy: CampaignEnemy = {
        templateId: 'warrior_bold',
        level: 3,
        stars: 1,
      };

      const hero0 = campaignEnemyToBattleHero(enemy, warriorTemplate, 0);
      const hero1 = campaignEnemyToBattleHero(enemy, warriorTemplate, 1);

      expect(hero0.id).toBe('enemy-warrior_bold-0');
      expect(hero1.id).toBe('enemy-warrior_bold-1');
      expect(hero0.position).toBe(0);
      expect(hero1.position).toBe(1);
    });
  });
});
