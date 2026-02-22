import { BattleEventBus } from '../services/battle-event-bus';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload(): void {
    // Show loading bar
    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(280, 250, 400, 30);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0xe94560, 1);
      progressBar.fillRect(282, 252, 396 * value, 26);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
    });

    // For MVP, assets are generated in create()
  }

  create(): void {
    // Generate placeholder textures
    this.generatePlaceholderTextures();

    // Generate UI textures
    this.generateUITextures();

    // Retrieve battle data from EventBus and start battle scene
    const eventBus = this.registry.get('eventBus') as BattleEventBus;
    const battleData = eventBus.getBattleData();

    this.scene.start('BattleScene', { battleData });
  }

  private generatePlaceholderTextures(): void {
    const classes = [
      { key: 'warrior', color: 0xe94560 },
      { key: 'mage', color: 0x6c63ff },
      { key: 'healer', color: 0x4ecdc4 },
      { key: 'archer', color: 0x45b7d1 },
      { key: 'tank', color: 0xffa502 },
    ];

    for (const { key, color } of classes) {
      const gfx = this.add.graphics();
      gfx.fillStyle(color, 1);
      gfx.fillRoundedRect(0, 0, 64, 80, 8);
      gfx.generateTexture(`hero-${key}`, 64, 80);
      gfx.destroy();
    }

    // Projectile texture (small circle)
    const proj = this.add.graphics();
    proj.fillStyle(0xffffff, 1);
    proj.fillCircle(8, 8, 8);
    proj.generateTexture('projectile', 16, 16);
    proj.destroy();
  }

  private generateUITextures(): void {
    // Health bar background (dark)
    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(0x333333, 1);
    bgGfx.fillRect(0, 0, 60, 8);
    bgGfx.generateTexture('hp-bar-bg', 60, 8);
    bgGfx.destroy();

    // Health bar fill (green)
    const fillGfx = this.add.graphics();
    fillGfx.fillStyle(0x00ff00, 1);
    fillGfx.fillRect(0, 0, 60, 8);
    fillGfx.generateTexture('hp-bar-fill', 60, 8);
    fillGfx.destroy();
  }
}
