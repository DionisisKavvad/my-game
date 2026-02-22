import { BattleHero, StatusEffect } from '@hero-wars/shared';

export class HeroSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Image;
  private hpBarBg: Phaser.GameObjects.Image;
  private hpBarFill: Phaser.GameObjects.Image;
  private nameLabel: Phaser.GameObjects.Text;
  private highlightGfx: Phaser.GameObjects.Graphics;
  private maxHp: number;
  private currentHp: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    hero: BattleHero,
    side: 'player' | 'enemy',
  ) {
    super(scene, x, y);
    this.maxHp = hero.stats.hp;
    this.currentHp = hero.currentHp;

    const textureKey = this.resolveTextureKey(hero);

    // Highlight glow (hidden by default)
    this.highlightGfx = scene.add.graphics();
    this.add(this.highlightGfx);

    // Hero sprite
    this.sprite = scene.add.image(0, 0, textureKey);
    if (side === 'enemy') {
      this.sprite.setFlipX(true);
    }
    this.add(this.sprite);

    // Name label above sprite
    this.nameLabel = scene.add.text(0, -55, hero.name, {
      fontSize: '11px',
      color: side === 'player' ? '#4ecdc4' : '#e94560',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add(this.nameLabel);

    // HP bar background
    this.hpBarBg = scene.add.image(0, 48, 'hp-bar-bg');
    this.add(this.hpBarBg);

    // HP bar fill
    this.hpBarFill = scene.add.image(0, 48, 'hp-bar-fill');
    this.add(this.hpBarFill);

    // HP text
    const hpText = scene.add.text(0, 60, `${this.currentHp}`, {
      fontSize: '10px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add(hpText);

    scene.add.existing(this);
  }

  /**
   * Uses the heroClass field added to BattleHero for texture resolution.
   * Falls back to 'warrior' texture if heroClass is not set.
   */
  private resolveTextureKey(hero: BattleHero): string {
    if (hero.heroClass) {
      return `hero-${hero.heroClass}`;
    }
    return 'hero-warrior';
  }

  highlight(active: boolean): void {
    this.highlightGfx.clear();
    if (active) {
      this.highlightGfx.lineStyle(2, 0xffd700, 0.8);
      this.highlightGfx.strokeRoundedRect(-36, -44, 72, 88, 10);
    }
  }

  updateHp(newHp: number): void {
    this.currentHp = Math.max(0, newHp);
    const ratio = this.currentHp / this.maxHp;

    this.scene.tweens.add({
      targets: this.hpBarFill,
      scaleX: ratio,
      duration: 300,
      ease: 'Power2',
    });

    if (ratio < 0.25) {
      this.hpBarFill.setTint(0xff0000);
    } else if (ratio < 0.5) {
      this.hpBarFill.setTint(0xffaa00);
    } else {
      this.hpBarFill.clearTint();
    }
  }

  playAttackAnimation(
    target: HeroSprite,
    duration: number,
    onHit: () => void,
  ): void {
    const origX = this.x;
    const origY = this.y;
    const dx = (target.x - this.x) * 0.4;
    const dy = (target.y - this.y) * 0.4;

    this.scene.tweens.add({
      targets: this,
      x: origX + dx,
      y: origY + dy,
      duration: duration * 0.3,
      ease: 'Power2',
      yoyo: true,
      onYoyo: () => {
        onHit();
        target.playHitEffect(duration * 0.3);
      },
    });
  }

  playHitEffect(duration: number): void {
    this.sprite.setTint(0xff0000);
    this.scene.tweens.add({
      targets: this,
      x: this.x + 5,
      duration: 50,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.sprite.clearTint();
      },
    });
  }

  playHealEffect(duration: number): void {
    const glow = this.scene.add.circle(this.x, this.y, 40, 0x4ecdc4, 0.3);

    this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration,
      onComplete: () => glow.destroy(),
    });
  }

  playBuffEffect(effects: StatusEffect[], duration: number): void {
    for (const effect of effects) {
      const color =
        effect.type === 'buff' || effect.type === 'shield'
          ? 0xffd700
          : 0x9b59b6;

      const isDebuff = effect.type === 'debuff' || effect.type === 'dot';
      for (let i = 0; i < 6; i++) {
        const offsetX = (Math.random() - 0.5) * 40;
        const particle = this.scene.add.circle(
          this.x + offsetX,
          this.y,
          3,
          color,
          0.8,
        );

        const dirMult = isDebuff ? 1 : -1;
        this.scene.tweens.add({
          targets: particle,
          y: this.y + dirMult * 60,
          alpha: 0,
          duration: duration * 0.8,
          delay: i * 50,
          ease: 'Power1',
          onComplete: () => particle.destroy(),
        });
      }
    }
  }

  playDoTEffect(duration: number): void {
    this.sprite.setTint(0x9b59b6);
    this.scene.time.delayedCall(duration * 0.5, () => {
      this.sprite.clearTint();
    });
  }

  playDeathAnimation(): void {
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      y: this.y + 30,
      duration: 600,
      ease: 'Power2',
    });
  }
}
