import Phaser from 'phaser';
import { BattleCompleteResponse } from '@hero-wars/shared';
import { BattleEventBus } from '../services/battle-event-bus';
import { BattleService } from '../../../core/services/battle.service';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ResultScene' });
  }

  create(): void {
    const eventBus = this.registry.get('eventBus') as BattleEventBus;
    const battleService = this.registry.get('battleService') as BattleService;

    // Try EventBus first (set by component when completeBattle resolves),
    // fall back to BattleService cache (set when the HTTP response arrived
    // after component destruction/recreation).
    const result: BattleCompleteResponse | null =
      eventBus.getBattleResult() ?? battleService.lastValidationResult;

    if (!result) {
      this.showValidating(eventBus, battleService);
      return;
    }

    this.showResult(result, eventBus);
  }

  private showValidating(
    eventBus: BattleEventBus,
    battleService: BattleService,
  ): void {
    this.add.rectangle(480, 270, 960, 540, 0x000000, 0.7);

    const validatingText = this.add
      .text(480, 270, 'Validating...', {
        fontSize: '24px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    // Poll for result every 500ms (up to 10s)
    let attempts = 0;
    const check = this.time.addEvent({
      delay: 500,
      repeat: 20,
      callback: () => {
        attempts++;
        const res =
          eventBus.getBattleResult() ?? battleService.lastValidationResult;
        if (res) {
          check.remove();
          validatingText.destroy();
          this.showResult(res, eventBus);
        } else if (attempts >= 20) {
          check.remove();
          validatingText.setText('Validation unavailable');
          this.showContinueButton(eventBus);
        }
      },
    });
  }

  private showResult(result: BattleCompleteResponse, eventBus: BattleEventBus): void {
    const isVictory = result.result === 'victory';

    this.add.rectangle(480, 270, 960, 540, 0x000000, 0.7);

    const titleText = isVictory ? 'VICTORY' : 'DEFEAT';
    const titleColor = isVictory ? '#ffd700' : '#e94560';
    this.add
      .text(480, 100, titleText, {
        fontSize: '48px',
        color: titleColor,
        fontFamily: 'monospace',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    if (isVictory && result.starsEarned > 0) {
      this.displayStars(result.starsEarned);
      this.displayRewards(result.rewards);
    }

    this.showContinueButton(eventBus);
  }

  private displayStars(count: number): void {
    const starSize = 32;
    const startX = 480 - (3 * starSize + 2 * 16) / 2;

    for (let i = 0; i < 3; i++) {
      const x = startX + i * (starSize + 16) + starSize / 2;
      const isFilled = i < count;
      const color = isFilled ? 0xffd700 : 0x333333;
      const star = this.add.star(x, 180, 5, starSize / 2, starSize, color);

      if (isFilled) {
        star.setScale(0);
        this.tweens.add({
          targets: star,
          scale: 1,
          duration: 300,
          delay: i * 200,
          ease: 'Back.easeOut',
        });
      }
    }
  }

  private displayRewards(rewards: { gold: number; xp: number; heroXp: number }): void {
    const y = 280;
    const style = {
      fontSize: '18px',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
    };

    this.add
      .text(480, y, `Gold: +${rewards.gold}`, { ...style, color: '#ffd700' })
      .setOrigin(0.5);

    this.add
      .text(480, y + 35, `Player XP: +${rewards.xp}`, {
        ...style,
        color: '#4ecdc4',
      })
      .setOrigin(0.5);

    this.add
      .text(480, y + 70, `Hero XP: +${rewards.heroXp}`, {
        ...style,
        color: '#45b7d1',
      })
      .setOrigin(0.5);
  }

  private showContinueButton(eventBus: BattleEventBus): void {
    const btn = this.add
      .text(480, 440, '[ CONTINUE ]', {
        fontSize: '24px',
        color: '#ffffff',
        fontFamily: 'monospace',
        backgroundColor: '#e94560',
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ color: '#ffd700' }));
    btn.on('pointerout', () => btn.setStyle({ color: '#ffffff' }));
    btn.on('pointerdown', () => {
      eventBus.emitNavigate('lobby');
    });
  }
}
