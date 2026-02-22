import { BattleHero, BattleLog, TurnAction } from '@hero-wars/shared';
import { HeroSprite } from '../objects/HeroSprite';
import { SkillEffectFactory } from '../objects/SkillEffectFactory';
import { BattleEventBus } from '../services/battle-event-bus';

interface BattleSceneData {
  battleData: {
    playerTeam: BattleHero[];
    enemyTeam: BattleHero[];
    battleLog: BattleLog;
  };
}

export class BattleScene extends Phaser.Scene {
  private heroSprites: Map<string, HeroSprite> = new Map();
  private actionQueue: TurnAction[] = [];
  private currentActionIndex = 0;
  private speedMultiplier = 1;
  private eventBus!: BattleEventBus;
  private effectFactory!: SkillEffectFactory;
  private skipping = false;

  constructor() {
    super({ key: 'BattleScene' });
  }

  create(data: BattleSceneData): void {
    this.eventBus = this.registry.get('eventBus') as BattleEventBus;
    this.effectFactory = new SkillEffectFactory(this);
    const { playerTeam, enemyTeam, battleLog } = data.battleData;

    // Set up the battlefield layout
    this.createBattlefield();

    // Place player heroes on the left side
    this.placeTeam(playerTeam, 'player');

    // Place enemy heroes on the right side
    this.placeTeam(enemyTeam, 'enemy');

    // Load the action queue
    this.actionQueue = battleLog.turns;

    // Listen for speed change events from Angular overlay
    this.eventBus.onSpeedChange((speed) => {
      this.speedMultiplier = speed;
    });

    // Listen for skip events from Angular overlay
    this.eventBus.onSkipBattle(() => {
      this.skipToEnd();
    });

    // Start playback after a brief pause
    this.time.delayedCall(800, () => this.playNextAction());
  }

  private createBattlefield(): void {
    const divider = this.add.graphics();
    divider.lineStyle(1, 0x333333, 0.5);
    divider.lineBetween(480, 40, 480, 500);

    this.add.text(200, 10, 'YOUR TEAM', {
      fontSize: '14px',
      color: '#4ecdc4',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0);

    this.add.text(760, 10, 'ENEMY TEAM', {
      fontSize: '14px',
      color: '#e94560',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
  }

  private placeTeam(team: BattleHero[], side: 'player' | 'enemy'): void {
    const positions = this.getTeamPositions(team.length, side);

    team.forEach((hero, i) => {
      const pos = positions[i];
      const sprite = new HeroSprite(this, pos.x, pos.y, hero, side);
      this.heroSprites.set(hero.id, sprite);
    });
  }

  private getTeamPositions(
    count: number,
    side: 'player' | 'enemy',
  ): { x: number; y: number }[] {
    const baseX = side === 'player' ? 200 : 760;
    const startY = 270 - ((count - 1) * 90) / 2;

    return Array.from({ length: count }, (_, i) => ({
      x: baseX + (i % 2 === 0 ? 0 : side === 'player' ? -60 : 60),
      y: startY + i * 90,
    }));
  }

  private async playNextAction(): Promise<void> {
    if (this.skipping) return;

    if (this.currentActionIndex >= this.actionQueue.length) {
      this.onBattleComplete();
      return;
    }

    const action = this.actionQueue[this.currentActionIndex];
    this.currentActionIndex++;

    // Notify Angular of current turn
    this.eventBus.emitTurnUpdate(action.turn);

    await this.animateAction(action);
    this.playNextAction();
  }

  private animateAction(action: TurnAction): Promise<void> {
    return new Promise<void>((resolve) => {
      const actor = this.heroSprites.get(action.actorId);
      if (!actor) {
        resolve();
        return;
      }

      const baseDuration = 600 / this.speedMultiplier;

      actor.highlight(true);

      if (action.skillId === 'dot') {
        this.animateDoTTick(action, baseDuration, resolve);
      } else if (action.skillId === 'auto-attack') {
        this.animateAutoAttack(actor, action, baseDuration, resolve);
      } else {
        this.animateSkill(actor, action, baseDuration, resolve);
      }
    });
  }

  private animateAutoAttack(
    actor: HeroSprite,
    action: TurnAction,
    duration: number,
    onComplete: () => void,
  ): void {
    const target = this.heroSprites.get(action.targetIds[0]);
    if (!target) {
      actor.highlight(false);
      onComplete();
      return;
    }

    actor.playAttackAnimation(target, duration, () => {
      if (action.damage > 0) {
        this.showDamageText(target, action.damage, false);
      }

      this.updateHpBars(action.resultHp);

      actor.highlight(false);

      this.time.delayedCall(duration * 0.5, onComplete);
    });
  }

  private animateSkill(
    actor: HeroSprite,
    action: TurnAction,
    duration: number,
    onComplete: () => void,
  ): void {
    this.showSkillName(actor, action.skillName);

    const isDamage = action.damage > 0;
    const isHeal = action.healing > 0;

    if (isDamage) {
      const targets = action.targetIds
        .map((id) => this.heroSprites.get(id))
        .filter((s): s is HeroSprite => s !== undefined);

      this.playSkillEffect(actor, targets, action, duration, () => {
        for (const target of targets) {
          this.showDamageText(target, action.damage, false);
        }
        this.updateHpBars(action.resultHp);
        actor.highlight(false);
        this.time.delayedCall(duration * 0.3, onComplete);
      });
    } else if (isHeal) {
      const targets = action.targetIds
        .map((id) => this.heroSprites.get(id))
        .filter((s): s is HeroSprite => s !== undefined);

      for (const target of targets) {
        target.playHealEffect(duration);
        this.showDamageText(target, action.healing, true);
      }
      this.updateHpBars(action.resultHp);
      actor.highlight(false);
      this.time.delayedCall(duration, onComplete);
    } else {
      // Buff/shield/debuff
      const targets = action.targetIds
        .map((id) => this.heroSprites.get(id))
        .filter((s): s is HeroSprite => s !== undefined);

      for (const target of targets) {
        target.playBuffEffect(action.effects, duration);
      }
      actor.highlight(false);
      this.time.delayedCall(duration, onComplete);
    }
  }

  private animateDoTTick(
    action: TurnAction,
    duration: number,
    onComplete: () => void,
  ): void {
    const target = this.heroSprites.get(action.actorId);
    if (target) {
      target.playDoTEffect(duration);
      this.showDamageText(target, action.damage, false);
      this.updateHpBars(action.resultHp);
    }
    this.time.delayedCall(duration * 0.5, onComplete);
  }

  private showDamageText(target: HeroSprite, value: number, isHeal: boolean): void {
    const color = isHeal ? '#4ecdc4' : '#ff4444';
    const prefix = isHeal ? '+' : '-';
    const text = this.add
      .text(target.x, target.y - 50, `${prefix}${value}`, {
        fontSize: '20px',
        color,
        fontFamily: 'monospace',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: text.y - 40,
      alpha: 0,
      duration: 800 / this.speedMultiplier,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  private showSkillName(actor: HeroSprite, skillName: string): void {
    const text = this.add
      .text(actor.x, actor.y - 70, skillName, {
        fontSize: '12px',
        color: '#ffd700',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: text.y - 20,
      alpha: 0,
      duration: 1000 / this.speedMultiplier,
      ease: 'Power1',
      onComplete: () => text.destroy(),
    });
  }

  private playSkillEffect(
    actor: HeroSprite,
    targets: HeroSprite[],
    action: TurnAction,
    duration: number,
    onComplete: () => void,
  ): void {
    if (targets.length === 0) {
      onComplete();
      return;
    }

    if (targets.length === 1) {
      const target = targets[0];
      this.effectFactory
        .createProjectile(actor, target, 0xe94560, duration * 0.5)
        .then(() => {
          target.playHitEffect(duration * 0.3);
          onComplete();
        });
    } else {
      const centerX = targets.reduce((sum, t) => sum + t.x, 0) / targets.length;
      const centerY = targets.reduce((sum, t) => sum + t.y, 0) / targets.length;

      this.effectFactory
        .createAoEBlast({ x: centerX, y: centerY }, 0xe94560, duration * 0.6)
        .then(() => {
          for (const target of targets) {
            target.playHitEffect(duration * 0.3);
          }
          onComplete();
        });
    }
  }

  private updateHpBars(resultHp: Record<string, number>): void {
    for (const [heroId, hp] of Object.entries(resultHp)) {
      const sprite = this.heroSprites.get(heroId);
      if (sprite) {
        sprite.updateHp(hp);
        if (hp <= 0) {
          sprite.playDeathAnimation();
        }
      }
    }
  }

  private skipToEnd(): void {
    this.skipping = true;
    // Apply the last known HP state from all actions
    if (this.actionQueue.length > 0) {
      const lastAction = this.actionQueue[this.actionQueue.length - 1];
      this.updateHpBars(lastAction.resultHp);
    }
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.onBattleComplete();
  }

  private onBattleComplete(): void {
    this.time.delayedCall(1000, () => {
      this.eventBus.emitBattleComplete();
      this.scene.start('ResultScene');
    });
  }
}
