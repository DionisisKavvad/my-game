import Phaser from 'phaser';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  DestroyRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BattleService } from '../../core/services/battle.service';
import { BattleEventBus } from './services/battle-event-bus';
import { PreloadScene } from './scenes/PreloadScene';
import { BattleScene } from './scenes/BattleScene';
import { ResultScene } from './scenes/ResultScene';

@Component({
  selector: 'app-battle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="battle-wrapper">
      @if (loading()) {
        <div class="loading-overlay">
          <div class="loading-spinner"></div>
          <p>Preparing battle...</p>
        </div>
      }

      @if (error()) {
        <div class="error-overlay">
          <p class="error-message">{{ error() }}</p>
          <button (click)="goToLobby()">Return to Lobby</button>
        </div>
      }

      <div id="phaser-container" #phaserContainer></div>

      <div class="battle-overlay" [class.hidden]="loading() || !!error()">
        <div class="top-bar">
          <span class="turn-counter">Turn {{ currentTurn() }}</span>
          <div class="speed-controls">
            <button
              [class.active]="speed() === 1"
              (click)="setSpeed(1)"
              aria-label="Set speed to 1x">1x</button>
            <button
              [class.active]="speed() === 2"
              (click)="setSpeed(2)"
              aria-label="Set speed to 2x">2x</button>
            <button
              [class.active]="speed() === 4"
              (click)="setSpeed(4)"
              aria-label="Set speed to 4x">4x</button>
          </div>
          <button class="skip-btn" (click)="skipToEnd()" aria-label="Skip to battle result">
            Skip
          </button>
        </div>

        @if (showLog()) {
          <div class="battle-log">
            @for (entry of recentActions(); track $index) {
              <div class="log-entry">
                <span class="actor">{{ entry.actorName }}</span>
                <span class="action"> {{ entry.skillName }}</span>
                @if (entry.damage > 0) {
                  <span class="damage"> -{{ entry.damage }}</span>
                }
                @if (entry.healing > 0) {
                  <span class="heal"> +{{ entry.healing }}</span>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .battle-wrapper {
      position: relative;
      width: 100%;
      height: 100vh;
      background: #1a1a2e;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    #phaser-container {
      width: 100%;
      max-width: 960px;
      aspect-ratio: 16 / 9;
    }

    #phaser-container canvas {
      width: 100% !important;
      height: 100% !important;
    }

    .battle-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
    }

    .battle-overlay.hidden {
      display: none;
    }

    .battle-overlay > * {
      pointer-events: auto;
    }

    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 1rem;
      background: rgba(15, 52, 96, 0.85);
      border-bottom: 1px solid rgba(233, 69, 96, 0.3);
    }

    .turn-counter {
      color: #ffd700;
      font-family: monospace;
      font-size: 1rem;
    }

    .speed-controls button {
      padding: 0.25rem 0.75rem;
      margin: 0 0.25rem;
      background: transparent;
      color: #aaa;
      border: 1px solid #333;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
    }

    .speed-controls button.active {
      color: #e94560;
      border-color: #e94560;
      background: rgba(233, 69, 96, 0.15);
    }

    .skip-btn {
      padding: 0.25rem 1rem;
      background: rgba(233, 69, 96, 0.2);
      color: #e94560;
      border: 1px solid #e94560;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
    }

    .battle-log {
      position: absolute;
      right: 0;
      top: 40px;
      width: 200px;
      max-height: 300px;
      overflow-y: auto;
      background: rgba(0, 0, 0, 0.7);
      padding: 0.5rem;
      font-family: monospace;
      font-size: 0.7rem;
    }

    .log-entry {
      padding: 0.15rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .log-entry .actor { color: #4ecdc4; }
    .log-entry .damage { color: #ff4444; }
    .log-entry .heal { color: #4ecdc4; }

    .loading-overlay,
    .error-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #1a1a2e;
      z-index: 10;
      color: #fff;
      font-family: monospace;
    }

    .loading-spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #333;
      border-top-color: #e94560;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-message {
      color: #e94560;
      margin-bottom: 1rem;
    }

    .error-overlay button {
      padding: 0.5rem 1.5rem;
      background: transparent;
      color: #e94560;
      border: 1px solid #e94560;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
    }
  `],
})
export class BattleComponent implements OnInit, OnDestroy {
  private game!: Phaser.Game;
  private eventBus = new BattleEventBus();
  private destroyRef = inject(DestroyRef);

  currentTurn = signal(0);
  speed = signal(1);
  loading = signal(true);
  error = signal('');
  showLog = signal(true);
  recentActions = signal<Array<{ actorName: string; skillName: string; damage: number; healing: number }>>([]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private battleService: BattleService,
  ) {}

  async ngOnInit() {
    const stageId = this.route.snapshot.paramMap.get('stageId');
    if (!stageId) {
      this.error.set('Invalid stage ID');
      this.loading.set(false);
      return;
    }

    try {
      this.battleService.clearLastResult();

      const { battleId, playerTeam, enemyTeam, battleLog, startTimestamp } =
        await this.battleService.startBattle(stageId);

      if (playerTeam.length === 0) {
        this.error.set('Your team is empty. Please set up your team first.');
        this.loading.set(false);
        return;
      }

      // Fire completeBattle immediately (fire-and-forget).
      // Result cached in BattleService, survives component destruction.
      this.battleService
        .completeBattle(battleId, battleLog, Date.now() - startTimestamp)
        .then((result) => this.eventBus.setBattleResult(result))
        .catch(() => {
          // Result may still be in battleService.lastValidationResult
        });

      // Set battle data on EventBus for Phaser scenes
      this.eventBus.setBattleData({ playerTeam, enemyTeam, battleLog });

      // Pre-populate the battle log sidebar
      this.recentActions.set(
        battleLog.turns.slice(0, 20).map((t) => ({
          actorName: t.actorName,
          skillName: t.skillName,
          damage: t.damage,
          healing: t.healing,
        })),
      );

      this.loading.set(false);

      // Create Phaser game
      this.game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: 'phaser-container',
        width: 960,
        height: 540,
        backgroundColor: '#1a1a2e',
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: [PreloadScene, BattleScene, ResultScene],
      });

      this.game.registry.set('eventBus', this.eventBus);
      this.game.registry.set('battleService', this.battleService);

      // Subscribe to EventBus events with automatic cleanup
      this.eventBus.navigate
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((route) => this.router.navigate([`/${route}`]));

      this.eventBus.turnUpdate
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((turn) => this.currentTurn.set(turn));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start battle';
      this.error.set(message);
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.game?.destroy(true);
    this.eventBus.destroy();
  }

  setSpeed(s: number): void {
    this.speed.set(s);
    this.eventBus.changeSpeed(s);
  }

  skipToEnd(): void {
    this.eventBus.skipBattle();
  }

  goToLobby(): void {
    this.router.navigate(['/lobby']);
  }
}
