import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { HeroesService } from './heroes.service';
import {
  BattleHero,
  BattleLog,
  BattleStartResponse,
  BattleCompleteResponse,
  PlayerHeroResponse,
  calculateHeroStats,
} from '@hero-wars/shared';
import { BattleSimulator } from '@hero-wars/battle-engine';

/**
 * Direct adapter: PlayerHeroResponse -> BattleHero.
 * Avoids constructing an intermediate PlayerHero object.
 * Uses the template's class and spriteKey directly from the API response.
 */
function playerHeroResponseToBattleHero(
  hero: PlayerHeroResponse,
  team: 'player' | 'enemy',
): BattleHero {
  const stats = calculateHeroStats(hero.template, hero.level, hero.stars);
  return {
    id: hero.id,
    name: hero.template.name,
    heroClass: hero.template.class,
    spriteKey: hero.template.spriteKey,
    stats,
    currentHp: stats.hp,
    skills: hero.template.skills.map((s) => ({
      id: s.id,
      name: s.name,
      damage: s.damage,
      cooldown: s.cooldown,
      currentCooldown: 0,
      target: s.target,
      effect: s.effect,
    })),
    team,
    position: hero.teamPosition ?? 0,
    statusEffects: [],
  };
}

@Injectable({ providedIn: 'root' })
export class BattleService {
  /** Cached validation result -- survives component destruction (M2 fix). */
  private _lastValidationResult: BattleCompleteResponse | null = null;

  get lastValidationResult(): BattleCompleteResponse | null {
    return this._lastValidationResult;
  }

  constructor(
    private api: ApiService,
    private heroesService: HeroesService,
  ) {}

  /**
   * Starts a battle for a campaign stage.
   * 1. Calls POST /battles/start to get seed and enemy team.
   * 2. Converts player heroes to BattleHero[] using direct adapter.
   * 3. Runs the BattleSimulator locally.
   * 4. Returns everything needed for visualization.
   */
  async startBattle(stageId: string): Promise<{
    battleId: string;
    playerTeam: BattleHero[];
    enemyTeam: BattleHero[];
    battleLog: BattleLog;
    startTimestamp: number;
  }> {
    const startTimestamp = Date.now();

    // 1. Start battle on server
    const response = await firstValueFrom(
      this.api.post<BattleStartResponse>('/battles/start', { stageId }),
    );

    // 2. Get player's current team and convert directly to BattleHero[]
    const teamRes = await firstValueFrom(this.heroesService.loadTeam());
    const playerTeam = teamRes.heroes.map((h) =>
      playerHeroResponseToBattleHero(h, 'player'),
    );

    // 3. Run simulator locally
    const simulator = new BattleSimulator({
      playerTeam,
      enemyTeam: response.enemyTeam,
      seed: response.seed,
    });
    const battleLog = simulator.run();

    return {
      battleId: response.battleId,
      playerTeam,
      enemyTeam: response.enemyTeam,
      battleLog,
      startTimestamp,
    };
  }

  /**
   * Submits the battle log to the server for validation.
   * Caches the result in the service so it survives component destruction.
   */
  async completeBattle(
    battleId: string,
    clientLog: BattleLog,
    durationMs: number,
  ): Promise<BattleCompleteResponse> {
    this._lastValidationResult = null;
    const result = await firstValueFrom(
      this.api.post<BattleCompleteResponse>(
        `/battles/complete`,
        { battleId, clientLog, durationMs },
      ),
    );
    this._lastValidationResult = result;
    return result;
  }

  /** Clear cached result when starting a new battle. */
  clearLastResult(): void {
    this._lastValidationResult = null;
  }
}
