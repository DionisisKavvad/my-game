import { Subject, Observable } from 'rxjs';
import { BattleHero, BattleLog, BattleCompleteResponse } from '@hero-wars/shared';

export interface BattleData {
  playerTeam: BattleHero[];
  enemyTeam: BattleHero[];
  battleLog: BattleLog;
  stageId: string | null;
}

export class BattleEventBus {
  // Angular -> Phaser
  private speedChange$ = new Subject<number>();
  private skipBattle$ = new Subject<void>();

  // Phaser -> Angular
  private turnUpdate$ = new Subject<number>();
  private battleComplete$ = new Subject<void>();
  private navigate$ = new Subject<string>();

  // Shared state
  private battleData: BattleData | null = null;
  private battleResult: BattleCompleteResponse | null = null;

  // --- Data setters (Angular calls before Phaser starts) ---

  setBattleData(data: BattleData): void {
    this.battleData = data;
  }

  getBattleData(): BattleData {
    if (!this.battleData) throw new Error('Battle data not set');
    return this.battleData;
  }

  setBattleResult(result: BattleCompleteResponse): void {
    this.battleResult = result;
  }

  getBattleResult(): BattleCompleteResponse | null {
    return this.battleResult;
  }

  // --- Angular -> Phaser ---

  changeSpeed(speed: number): void {
    this.speedChange$.next(speed);
  }

  onSpeedChange(callback: (speed: number) => void): void {
    this.speedChange$.subscribe(callback);
  }

  skipBattle(): void {
    this.skipBattle$.next();
  }

  onSkipBattle(callback: () => void): void {
    this.skipBattle$.subscribe(callback);
  }

  // --- Phaser -> Angular ---

  emitTurnUpdate(turn: number): void {
    this.turnUpdate$.next(turn);
  }

  get turnUpdate(): Observable<number> {
    return this.turnUpdate$.asObservable();
  }

  emitBattleComplete(): void {
    this.battleComplete$.next();
  }

  get battleComplete(): Observable<void> {
    return this.battleComplete$.asObservable();
  }

  emitNavigate(route: string): void {
    this.navigate$.next(route);
  }

  get navigate(): Observable<string> {
    return this.navigate$.asObservable();
  }

  // --- Cleanup ---

  destroy(): void {
    this.speedChange$.complete();
    this.skipBattle$.complete();
    this.turnUpdate$.complete();
    this.battleComplete$.complete();
    this.navigate$.complete();
    this.battleData = null;
    this.battleResult = null;
  }
}
