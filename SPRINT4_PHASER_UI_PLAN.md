# Sprint 4 -- Phaser UI Implementation Plan

**Target:** Weeks 7-8 | **Status:** Planning | **Owner:** Development Team

---

## 1. Overview & Goals

Sprint 4 transforms the battle engine from a headless simulation into a visual, animated experience. The core deliverable is a Phaser 3 game canvas embedded inside the Angular client that plays back the deterministic battle log produced by `BattleSimulator` from `libs/battle-engine/`.

### Key Objectives

1. **Phaser 3 integration** -- Embed a Phaser game instance inside an Angular standalone component with full lifecycle management.
2. **Battle visualization** -- Animate the pre-computed `BattleLog` turn-by-turn: hero sprites, health bars, damage numbers, skill effects, death animations.
3. **Angular-Phaser communication** -- Bidirectional EventBus using RxJS Subjects so Angular UI overlays can control and react to Phaser state.
4. **Result screen** -- Display victory/defeat with star rating, rewards summary, and navigation back to the lobby or campaign map.
5. **Asset pipeline** -- Establish the placeholder sprite and animation system that can be swapped for production art later.

### What This Sprint Does NOT Include

- Manual battle control (battles are auto-play, driven by AI on both sides per architecture doc Section 4.2).
- Campaign map UI (Sprint 5).
- Sound/audio (deferred to Sprint 7 polish).
- WebSocket real-time PvP (Phase 2).

---

## 2. Current State Assessment

### What Exists (Sprint 1-3 Output)

| Component | File | Status |
|-----------|------|--------|
| Battle simulator (full) | `libs/battle-engine/src/simulator.ts` | Complete -- skills, effects, AI, deterministic |
| Damage calculation | `libs/battle-engine/src/damage.ts` | Complete -- crit/dodge/variance with deterministic RNG consumption |
| Skill execution | `libs/battle-engine/src/skills.ts` | Complete -- single/all/self/ally targeting |
| Status effects | `libs/battle-engine/src/effects.ts` | Complete -- buff/debuff/dot/shield/heal |
| Enemy AI | `libs/battle-engine/src/ai.ts` | Complete -- priority-based decisions |
| Hero converter | `libs/battle-engine/src/hero-converter.ts` | Complete -- PlayerHero/CampaignEnemy to BattleHero |
| Seeded RNG | `libs/battle-engine/src/rng.ts` | Complete -- Mulberry32 |
| Shared types | `libs/shared/src/models/battle.ts` | Complete -- BattleHero, TurnAction, BattleLog, BattleStartResponse |
| Shared hero types | `libs/shared/src/models/hero.ts` | Complete -- HeroTemplate, HeroSkill, SkillEffect, PlayerHero |
| Campaign stages | `libs/shared/src/constants/campaign-stages.ts` | Complete -- 30 stages defined |
| Game config | `libs/shared/src/constants/game-config.ts` | Complete -- battle constants |
| Angular app shell | `apps/client/src/app/` | Complete -- routing, auth, heroes, lobby |
| API service | `apps/client/src/app/core/services/api.service.ts` | Complete -- HTTP wrapper |
| Heroes service | `apps/client/src/app/core/services/heroes.service.ts` | Complete -- team management |
| Auth guard | `apps/client/src/app/core/guards/auth.guard.ts` | Complete |
| App routes | `apps/client/src/app/app.routes.ts` | Complete -- login, register, lobby, heroes, team |
| Lobby component | `apps/client/src/app/features/lobby/lobby.component.ts` | Complete -- main hub with placeholder cards |

### What Needs to Be Built (Sprint 4 Scope)

1. **Phaser 3 installation and webpack/Angular build configuration.**
2. **BattleComponent** -- Angular host component that manages Phaser lifecycle.
3. **BattleService** -- Angular service for battle API calls (start, complete) and simulation orchestration.
4. **EventBus** -- RxJS-based Angular-Phaser communication layer.
5. **PreloadScene** -- Phaser scene for loading sprites, sprite sheets, and UI assets.
6. **BattleScene** -- Main Phaser scene that animates the battle log frame-by-frame.
7. **ResultScene** -- Victory/defeat screen with stars and rewards.
8. **HeroSprite** -- Phaser game object: sprite, health bar, name label, position system.
9. **SkillEffect** -- Visual effect system for skill animations (projectiles, AoE, heals, buffs).
10. **DamageText** -- Floating damage/heal numbers.
11. **Angular overlay UI** -- Turn counter, speed controls, skill log.
12. **Route integration** -- `/battle/:stageId` route with proper guards and navigation.
13. **Responsive canvas sizing** -- Scale Phaser canvas to fit viewport.

---

## 3. Phaser 3 Setup & Angular Integration

### 3.1 Installation

```bash
npm install phaser@3
```

No additional Phaser plugins needed for MVP. The `phaser` package includes the full engine with WebGL renderer, loader, animations, tweens, and game objects.

### 3.2 Angular Build Configuration

Phaser 3 bundles its own copy of several libraries. Angular's build system (esbuild via `@angular-devkit/build-angular`) handles this natively. However, Phaser includes a reference to `fs` in its Node.js detection path. We need to ensure the build does not attempt to resolve Node.js modules.

In `apps/client/project.json`, under the `build` target options:

```json
{
  "build": {
    "options": {
      "allowedCommonJsDependencies": ["phaser"]
    }
  }
}
```

This suppresses the CommonJS warning for Phaser since it ships as a UMD/CommonJS bundle.

### 3.3 TypeScript Configuration

Phaser ships with its own type definitions. Ensure `apps/client/tsconfig.app.json` includes:

```json
{
  "compilerOptions": {
    "types": ["phaser"]
  }
}
```

### 3.4 Angular Component Host

The Phaser game instance lives inside an Angular component. The component manages the full lifecycle: creation on `ngOnInit`, destruction on `ngOnDestroy`.

```typescript
// apps/client/src/app/features/battle/battle.component.ts

@Component({
  selector: 'app-battle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="battle-wrapper">
      <div id="phaser-container" #phaserContainer></div>
      <!-- Angular UI overlays rendered on top of the canvas -->
      <div class="battle-overlay">
        <div class="turn-counter">Turn {{ currentTurn() }}</div>
        <div class="speed-controls">
          <button (click)="setSpeed(1)">1x</button>
          <button (click)="setSpeed(2)">2x</button>
          <button (click)="setSpeed(4)">4x</button>
        </div>
      </div>
    </div>
  `,
})
export class BattleComponent implements OnInit, OnDestroy {
  private game!: Phaser.Game;
  private eventBus = new BattleEventBus();
  private destroyRef = inject(DestroyRef);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private battleService: BattleService,
  ) {}

  async ngOnInit() {
    const stageId = this.route.snapshot.paramMap.get('stageId')!;

    // 1. Run battle simulation
    this.battleService.clearLastResult();
    const { battleId, playerTeam, enemyTeam, battleLog, startTimestamp } =
      await this.battleService.startBattle(stageId);

    // 2. M2 fix: Fire completeBattle() immediately but guard against component destruction.
    //    Result is cached in BattleService (survives destroy), and the HTTP call
    //    is cancelled if the component is destroyed before it completes.
    this.battleService
      .completeBattle(battleId, battleLog, Date.now() - startTimestamp)
      .then((result) => this.eventBus.setBattleResult(result))
      .catch(() => {/* handled in ResultScene via BattleService.lastValidationResult */});

    // 3. Set battle data on EventBus for Phaser scenes
    this.eventBus.setBattleData({ playerTeam, enemyTeam, battleLog });

    // 4. Create Phaser game
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
    // M2 fix: pass BattleService reference so ResultScene can access cached result
    this.game.registry.set('battleService', this.battleService);

    // 5. M2 fix: Subscribe to navigation with takeUntilDestroyed
    this.eventBus.navigate
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((route) => this.router.navigate([`/${route}`]));

    this.eventBus.turnUpdate
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((turn) => this.currentTurn.set(turn));
  }

  ngOnDestroy() {
    this.game?.destroy(true);
    this.eventBus.destroy();
  }
}
```

Key design decisions:
- `Phaser.Scale.FIT` with `CENTER_BOTH` handles responsive scaling automatically. The canvas scales to fit its container while maintaining the 16:9 aspect ratio.
- `backgroundColor` matches the dark theme of the existing UI.
- Angular overlays sit in a sibling `div` positioned absolutely on top of the canvas.

---

## 4. Asset Management Strategy

### 4.1 Placeholder Sprites

For the MVP, we use colored rectangles and simple geometric shapes generated programmatically in Phaser. This avoids external asset dependencies and allows immediate development.

```typescript
// In PreloadScene.create():
// Generate placeholder hero sprites as colored rectangles
const heroColors: Record<string, number> = {
  warrior: 0xe94560,   // red
  mage: 0x6c63ff,      // purple
  healer: 0x4ecdc4,    // teal
  archer: 0x45b7d1,    // blue
  tank: 0xffa502,      // orange
};

// For each hero class, generate a 64x64 texture
for (const [cls, color] of Object.entries(heroColors)) {
  const gfx = this.add.graphics();
  gfx.fillStyle(color, 1);
  gfx.fillRoundedRect(0, 0, 64, 80, 8);
  gfx.generateTexture(`hero-${cls}`, 64, 80);
  gfx.destroy();
}
```

### 4.2 Asset Manifest

When production art is ready, assets will be loaded from an asset manifest:

```typescript
// apps/client/src/assets/battle/asset-manifest.ts
export const BATTLE_ASSETS = {
  sprites: {
    warrior: 'assets/battle/sprites/warrior.png',
    mage: 'assets/battle/sprites/mage.png',
    healer: 'assets/battle/sprites/healer.png',
    archer: 'assets/battle/sprites/archer.png',
    tank: 'assets/battle/sprites/tank.png',
  },
  effects: {
    slash: 'assets/battle/effects/slash.png',
    fireball: 'assets/battle/effects/fireball.png',
    heal: 'assets/battle/effects/heal.png',
    shield: 'assets/battle/effects/shield.png',
    buff: 'assets/battle/effects/buff.png',
  },
  ui: {
    healthBarBg: 'assets/battle/ui/health-bar-bg.png',
    healthBarFill: 'assets/battle/ui/health-bar-fill.png',
  },
};
```

### 4.3 Sprite Sheet Format (Future)

When real art is available, sprites will use Texture Atlas format (JSON Hash) compatible with Phaser's `load.atlas()`:

```typescript
this.load.atlas('warrior', 'sprites/warrior.png', 'sprites/warrior.json');
```

Each atlas will contain frames for: idle, attack, skill, hit, death. For MVP, we fake these with tween-based animations (scale, tint, shake).

### 4.4 Directory Structure for Assets

```
apps/client/src/assets/battle/
├── sprites/          <- Hero sprite images (placeholder PNGs for now)
├── effects/          <- Skill effect images
└── ui/               <- Health bars, buttons, frames
```

---

## 5. Scene Architecture

The Phaser game uses three scenes in sequence:

```
PreloadScene  ──>  BattleScene  ──>  ResultScene
(load assets)      (animate battle)   (show results)
```

### 5.1 PreloadScene

**Purpose:** Load all assets before the battle starts. Show a loading bar.

```typescript
// apps/client/src/app/features/battle/scenes/PreloadScene.ts

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

    // Load external assets if available (future)
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
    // Hero class colors
    const classes = [
      { key: 'warrior', color: 0xe94560 },
      { key: 'mage', color: 0x6c63ff },
      { key: 'healer', color: 0x4ecdc4 },
      { key: 'archer', color: 0x45b7d1 },
      { key: 'tank', color: 0xffa502 },
    ];

    for (const { key, color } of classes) {
      const gfx = this.add.graphics();
      // Body
      gfx.fillStyle(color, 1);
      gfx.fillRoundedRect(0, 0, 64, 80, 8);
      // Class initial letter
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
```

### 5.2 BattleScene

**Purpose:** The main scene. Receives the `BattleLog` and animates it turn-by-turn.

This scene does NOT run the simulator. It receives the completed `BattleLog` (array of `TurnAction`s) and replays them as sequential animations. This is the key architectural pattern: **the battle engine computes, Phaser visualizes**.

```typescript
// apps/client/src/app/features/battle/scenes/BattleScene.ts

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
  private isAnimating = false;
  private speedMultiplier = 1;
  private eventBus!: BattleEventBus;

  constructor() {
    super({ key: 'BattleScene' });
  }

  create(data: BattleSceneData): void {
    this.eventBus = this.registry.get('eventBus') as BattleEventBus;
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

    // Start playback after a brief pause
    this.time.delayedCall(800, () => this.playNextAction());
  }

  private createBattlefield(): void {
    // Battlefield divider line
    const divider = this.add.graphics();
    divider.lineStyle(1, 0x333333, 0.5);
    divider.lineBetween(480, 40, 480, 500);

    // Team labels
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
    // Player team on left (x: 80-380), enemy on right (x: 580-880)
    const baseX = side === 'player' ? 200 : 760;
    const startY = 270 - ((count - 1) * 90) / 2;

    return Array.from({ length: count }, (_, i) => ({
      x: baseX + (i % 2 === 0 ? 0 : (side === 'player' ? -60 : 60)),
      y: startY + i * 90,
    }));
  }

  private async playNextAction(): Promise<void> {
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

      // Highlight the actor
      actor.highlight(true);

      // Animate based on action type
      if (action.skillId === 'dot') {
        // DoT tick -- flash the target
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

    // Actor lunges forward
    actor.playAttackAnimation(target, duration, () => {
      // Show damage number
      if (action.damage > 0) {
        this.showDamageText(target, action.damage, false);
      }

      // Update HP bars from resultHp snapshot
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
    // Flash skill name
    this.showSkillName(actor, action.skillName);

    // Determine if this is a damage or support skill
    const isDamage = action.damage > 0;
    const isHeal = action.healing > 0;

    if (isDamage) {
      // Projectile or AoE animation toward targets
      const targets = action.targetIds
        .map((id) => this.heroSprites.get(id))
        .filter(Boolean) as HeroSprite[];

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
        .filter(Boolean) as HeroSprite[];

      for (const target of targets) {
        target.playHealEffect(duration);
        this.showDamageText(target, action.healing, true);
      }
      this.updateHpBars(action.resultHp);
      actor.highlight(false);
      this.time.delayedCall(duration, onComplete);
    } else {
      // Buff/shield/debuff -- visual effect on targets
      const targets = action.targetIds
        .map((id) => this.heroSprites.get(id))
        .filter(Boolean) as HeroSprite[];

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
    const text = this.add.text(target.x, target.y - 50, `${prefix}${value}`, {
      fontSize: '20px',
      color,
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

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
    const text = this.add.text(actor.x, actor.y - 70, skillName, {
      fontSize: '12px',
      color: '#ffd700',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

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
      // Single target: projectile
      const target = targets[0];
      const projectile = this.add.image(actor.x, actor.y, 'projectile')
        .setTint(0xe94560)
        .setScale(1.5);

      this.tweens.add({
        targets: projectile,
        x: target.x,
        y: target.y,
        duration: duration * 0.5,
        ease: 'Power2',
        onComplete: () => {
          projectile.destroy();
          target.playHitEffect(duration * 0.3);
          onComplete();
        },
      });
    } else {
      // AoE: expanding circle
      const centerX = targets.reduce((sum, t) => sum + t.x, 0) / targets.length;
      const centerY = targets.reduce((sum, t) => sum + t.y, 0) / targets.length;

      const circle = this.add.circle(centerX, centerY, 10, 0xe94560, 0.5);

      this.tweens.add({
        targets: circle,
        radius: 150,
        alpha: 0,
        duration: duration * 0.6,
        ease: 'Power2',
        onComplete: () => {
          circle.destroy();
          for (const target of targets) {
            target.playHitEffect(duration * 0.3);
          }
          onComplete();
        },
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

  private onBattleComplete(): void {
    const battleLog = this.actionQueue;
    const lastAction = battleLog[battleLog.length - 1];

    // Brief pause before transitioning
    this.time.delayedCall(1000, () => {
      this.eventBus.emitBattleComplete();
      this.scene.start('ResultScene');
    });
  }
}
```

### 5.3 ResultScene

**Purpose:** Displays the battle outcome (victory/defeat), star rating, and rewards earned.

```typescript
// apps/client/src/app/features/battle/scenes/ResultScene.ts

export class ResultScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ResultScene' });
  }

  create(): void {
    const eventBus = this.registry.get('eventBus') as BattleEventBus;
    const result = eventBus.getBattleResult();

    const isVictory = result.result === 'victory';

    // Background overlay
    this.add.rectangle(480, 270, 960, 540, 0x000000, 0.7);

    // Result title
    const titleText = isVictory ? 'VICTORY' : 'DEFEAT';
    const titleColor = isVictory ? '#ffd700' : '#e94560';
    this.add.text(480, 100, titleText, {
      fontSize: '48px',
      color: titleColor,
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    if (isVictory && result.starsEarned > 0) {
      // Star display
      this.displayStars(result.starsEarned);

      // Rewards
      this.displayRewards(result.rewards);
    }

    // Continue button (handled via EventBus -> Angular navigation)
    const btn = this.add.text(480, 440, '[ CONTINUE ]', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
      backgroundColor: '#e94560',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ color: '#ffd700' }));
    btn.on('pointerout', () => btn.setStyle({ color: '#ffffff' }));
    btn.on('pointerdown', () => {
      eventBus.emitNavigate('lobby');
    });
  }

  private displayStars(count: number): void {
    const starSize = 32;
    const startX = 480 - ((3 * starSize + 2 * 16) / 2);

    for (let i = 0; i < 3; i++) {
      const x = startX + i * (starSize + 16) + starSize / 2;
      const isFilled = i < count;
      const color = isFilled ? 0xffd700 : 0x333333;
      const star = this.add.star(x, 180, 5, starSize / 2, starSize, color);

      if (isFilled) {
        // Animate star appearance with delay
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

    this.add.text(480, y, `Gold: +${rewards.gold}`, {
      ...style, color: '#ffd700',
    }).setOrigin(0.5);

    this.add.text(480, y + 35, `Player XP: +${rewards.xp}`, {
      ...style, color: '#4ecdc4',
    }).setOrigin(0.5);

    this.add.text(480, y + 70, `Hero XP: +${rewards.heroXp}`, {
      ...style, color: '#45b7d1',
    }).setOrigin(0.5);
  }
}
```

---

## 6. HeroSprite Game Object

The `HeroSprite` is a Phaser Container that groups the hero's visual elements: sprite image, health bar, name label, and status effect indicators.

### 6.1 Positioning System

```
Player team (left side):          Enemy team (right side):
x: 140-340                        x: 620-820

  Position layout (staggered):

     [P0]                              [E0]
  [P1]                                    [E1]
     [P2]                              [E2]
  [P3]                                    [E3]
     [P4]                              [E4]
```

Heroes are arranged in a staggered formation. Front-row heroes (even positions) are closer to center; back-row (odd positions) are further back.

### 6.2 HeroSprite Class

```typescript
// apps/client/src/app/features/battle/objects/HeroSprite.ts

export class HeroSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Image;
  private hpBarBg: Phaser.GameObjects.Image;
  private hpBarFill: Phaser.GameObjects.Image;
  private nameLabel: Phaser.GameObjects.Text;
  private highlightGfx: Phaser.GameObjects.Graphics;
  private maxHp: number;
  private currentHp: number;
  private heroId: string;
  private heroData: BattleHero;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    hero: BattleHero,
    side: 'player' | 'enemy',
  ) {
    super(scene, x, y);
    this.heroId = hero.id;
    this.heroData = hero;
    this.maxHp = hero.stats.hp;
    this.currentHp = hero.currentHp;

    // Determine texture from hero name/class
    const textureKey = this.resolveTextureKey(hero);

    // Highlight glow (hidden by default)
    this.highlightGfx = scene.add.graphics();
    this.add(this.highlightGfx);

    // Hero sprite
    this.sprite = scene.add.image(0, 0, textureKey);
    if (side === 'enemy') {
      this.sprite.setFlipX(true); // Enemies face left
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
   * M3 fix: Uses the heroClass field added to BattleHero instead of
   * fragile name-based matching. Falls back to 'warrior' texture if
   * heroClass is not set (e.g., legacy data).
   */
  private resolveTextureKey(hero: BattleHero): string {
    if (hero.heroClass) {
      return `hero-${hero.heroClass}`;
    }
    return 'hero-warrior'; // fallback for legacy heroes without heroClass
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

    // Animate HP bar width
    this.scene.tweens.add({
      targets: this.hpBarFill,
      scaleX: ratio,
      duration: 300,
      ease: 'Power2',
    });

    // Change color based on HP ratio
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

    // Lunge toward target
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
    // Flash red and shake
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
    // Green glow effect
    const glow = this.scene.add.circle(0, 0, 40, 0x4ecdc4, 0.3);
    this.add(glow);

    this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      scale: 1.5,
      duration,
      onComplete: () => glow.destroy(),
    });
  }

  playBuffEffect(effects: StatusEffect[], duration: number): void {
    // Upward sparkle for buffs, downward for debuffs
    for (const effect of effects) {
      const color = effect.type === 'buff' || effect.type === 'shield'
        ? 0xffd700
        : 0x9b59b6;

      const particles = this.scene.add.particles(this.x, this.y, 'projectile', {
        speed: { min: 20, max: 60 },
        angle: effect.type === 'debuff' ? { min: 60, max: 120 } : { min: -120, max: -60 },
        lifespan: duration,
        quantity: 5,
        scale: { start: 0.5, end: 0 },
        tint: color,
        emitting: false,
      });

      particles.explode(8);

      this.scene.time.delayedCall(duration, () => particles.destroy());
    }
  }

  playDoTEffect(duration: number): void {
    // Purple pulse
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
```

---

## 7. Battle Flow: Engine to Visualization

This is the critical data flow. The battle engine produces data; Phaser consumes it for visualization.

### 7.1 Sequence Diagram

```
Angular BattleComponent          BattleService                API Server
        |                              |                          |
        |-- navigates to /battle/:id ->|                          |
        |                              |-- POST /battles/start -->|
        |                              |<-- { battleId, seed,     |
        |                              |      enemyTeam }---------|
        |                              |                          |
        |                              |  [Constructs BattleHero[]|
        |                              |   for both teams using   |
        |                              |   playerHeroToBattleHero]|
        |                              |                          |
        |                              |  [Runs BattleSimulator   |
        |                              |   locally with seed      |
        |                              |   -> produces BattleLog] |
        |                              |                          |
        |<-- battleLog, teams ---------|                          |
        |                              |                          |
        |  [Sets data on EventBus]     |                          |
        |  [Creates Phaser.Game]       |                          |
        |                              |                          |
   PreloadScene                        |                          |
        |  [Loads/generates assets]    |                          |
        |  [Reads data from EventBus]  |                          |
        |  [Starts BattleScene]        |                          |
        |                              |                          |
   BattleScene                         |                          |
        |  [Places HeroSprites]        |                          |
        |  [Plays TurnAction queue]    |                          |
        |  [Animates each action]      |                          |
        |  ...                         |                          |
        |  [Battle complete]           |                          |
        |                              |                          |
   ResultScene                         |                          |
        |  [Shows result + rewards]    |                          |
        |                              |                          |
        |-- user clicks Continue ----->|                          |
        |                              |-- POST /battles/complete>|
        |                              |<-- { validated, rewards }|
        |                              |                          |
        |<-- navigate to lobby --------|                          |
```

### 7.2 BattleService (Angular)

```typescript
// apps/client/src/app/core/services/battle.service.ts

import { Injectable } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { HeroesService } from './heroes.service';
import {
  BattleHero, BattleLog, BattleStartResponse, BattleCompleteResponse,
  PlayerHeroResponse, calculateHeroStats,
} from '@hero-wars/shared';
import { BattleSimulator } from '@hero-wars/battle-engine';

/**
 * Direct adapter: PlayerHeroResponse → BattleHero.
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
    heroClass: hero.template.class,       // ← M3 fix: carry class for texture resolution
    spriteKey: hero.template.spriteKey,    // ← M3 fix: carry spriteKey for future art
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
  /** Cached validation result — survives component destruction (M2 fix). */
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
   * 2. Converts player heroes to BattleHero[] using direct adapter (M1 fix).
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
    //    M1 fix: uses playerHeroResponseToBattleHero — no intermediate PlayerHero
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
   * M2 fix: caches the result in the service so it survives component destruction.
   */
  async completeBattle(
    battleId: string,
    clientLog: BattleLog,
    durationMs: number,
  ): Promise<BattleCompleteResponse> {
    this._lastValidationResult = null;
    const result = await firstValueFrom(
      this.api.post<BattleCompleteResponse>(
        `/battles/${battleId}/complete`,
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
```

### 7.3 Key Design Principle: Compute First, Animate Second

The `BattleSimulator.run()` executes synchronously in < 10ms and produces the complete `BattleLog` before any animation starts. The Phaser BattleScene receives this complete log and steps through it action-by-action using tweens and timers. This means:

1. The battle outcome is already known before the first frame renders.
2. Animations are purely cosmetic -- they can be sped up, slowed down, or skipped.
3. The `BattleCompleteResponse` (server validation) can be submitted as soon as the simulation finishes, even before animations complete. This allows the result screen to show validated rewards without waiting.

---

## 8. EventBus Pattern: Angular <-> Phaser Communication

### 8.1 Architecture

The EventBus is an RxJS-based communication layer that bridges Angular (Zone.js/change detection) and Phaser (requestAnimationFrame loop). It is created in the Angular component and passed to Phaser scenes via the game registry.

```typescript
// apps/client/src/app/features/battle/services/battle-event-bus.ts

import { Subject, Observable } from 'rxjs';

export interface BattleData {
  playerTeam: BattleHero[];
  enemyTeam: BattleHero[];
  battleLog: BattleLog;
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

  getBattleResult(): BattleCompleteResponse {
    if (!this.battleResult) throw new Error('Battle result not set');
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
```

### 8.2 Communication Flow

```
Angular Component                    EventBus                    Phaser Scene
       |                                |                             |
       |-- setBattleData(data) -------->|                             |
       |-- setBattleResult(result) ---->|                             |
       |                                |                             |
       |                                |<--- getBattleData() --------|
       |                                |                             |
       |-- changeSpeed(2) ------------->|                             |
       |                                |--- onSpeedChange(cb) ------>|
       |                                |                             |
       |<-- turnUpdate.subscribe -------|<--- emitTurnUpdate(5) ------|
       |                                |                             |
       |<-- battleComplete.subscribe ---|<--- emitBattleComplete() ---|
       |                                |                             |
       |<-- navigate.subscribe ---------|<--- emitNavigate('lobby') --|
       |                                |                             |
       |-- destroy() ------------------>|                             |
```

### 8.3 Why RxJS Subjects Over Phaser Events

- Angular components can subscribe to Observables directly, triggering change detection naturally.
- No coupling to Phaser's internal event system.
- Type safety with TypeScript generics.
- Easy to test: inject mock EventBus in unit tests.
- Memory management: `complete()` on destroy prevents leaks.

---

## 9. Skill Effect Animation System

### 9.1 Effect Types and Visual Mappings

| Skill/Effect Type | Visual | Duration | Color |
|-------------------|--------|----------|-------|
| Auto-attack | Actor lunges toward target, target shakes | 600ms | White flash |
| Single damage skill | Projectile flies from actor to target | 600ms | Red/orange |
| AoE damage skill | Expanding circle over all targets | 800ms | Red pulse |
| Heal | Green glow expanding from target | 500ms | Teal (#4ecdc4) |
| Shield | Gold ring around target | 500ms | Gold (#ffd700) |
| Buff | Upward sparkle particles | 500ms | Gold (#ffd700) |
| Debuff | Downward dark particles | 500ms | Purple (#9b59b6) |
| DoT tick | Purple flash on target | 300ms | Purple (#9b59b6) |
| Death | Fade out + slide down | 600ms | - |

### 9.2 Animation Timing

All animation durations are divided by `speedMultiplier`. At 2x speed, a 600ms animation takes 300ms. This is applied globally to all tweens, delayed calls, and particle lifespans.

### 9.3 SkillEffectFactory

```typescript
// apps/client/src/app/features/battle/objects/SkillEffectFactory.ts

export class SkillEffectFactory {
  constructor(private scene: Phaser.Scene) {}

  createProjectile(
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const proj = this.scene.add.circle(from.x, from.y, 6, color);

      this.scene.tweens.add({
        targets: proj,
        x: to.x,
        y: to.y,
        duration,
        ease: 'Power2',
        onComplete: () => {
          proj.destroy();
          resolve();
        },
      });
    });
  }

  createAoEBlast(
    center: { x: number; y: number },
    color: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const circle = this.scene.add.circle(center.x, center.y, 10, color, 0.4);

      this.scene.tweens.add({
        targets: circle,
        radius: 120,
        alpha: 0,
        duration,
        ease: 'Power1',
        onComplete: () => {
          circle.destroy();
          resolve();
        },
      });
    });
  }

  createHealEffect(target: { x: number; y: number }, duration: number): void {
    const glow = this.scene.add.circle(target.x, target.y, 30, 0x4ecdc4, 0.4);
    this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      scale: 2,
      duration,
      onComplete: () => glow.destroy(),
    });
  }

  createBuffParticles(
    target: { x: number; y: number },
    color: number,
    direction: 'up' | 'down',
    duration: number,
  ): void {
    // Use simple circles moving in the specified direction
    for (let i = 0; i < 6; i++) {
      const offsetX = (Math.random() - 0.5) * 40;
      const particle = this.scene.add.circle(
        target.x + offsetX,
        target.y,
        3,
        color,
        0.8,
      );

      const dirMult = direction === 'up' ? -1 : 1;
      this.scene.tweens.add({
        targets: particle,
        y: target.y + dirMult * 60,
        alpha: 0,
        duration: duration * 0.8,
        delay: i * 50,
        ease: 'Power1',
        onComplete: () => particle.destroy(),
      });
    }
  }
}
```

---

## 10. Angular UI Overlays

Angular components render on top of the Phaser canvas using absolute positioning. This leverages Angular's strengths (forms, routing, change detection) while Phaser handles the game rendering.

### 10.1 Overlay Structure

```html
<!-- battle.component.ts template -->
<div class="battle-wrapper">
  <!-- Phaser canvas -->
  <div id="phaser-container" class="phaser-canvas"></div>

  <!-- Angular overlays (positioned absolutely on top) -->
  <div class="battle-overlay">
    <!-- Top bar: turn counter + speed controls -->
    <div class="top-bar">
      <span class="turn-counter">Turn {{ currentTurn() }}</span>
      <div class="speed-controls">
        <button
          [class.active]="speed() === 1"
          (click)="setSpeed(1)">1x</button>
        <button
          [class.active]="speed() === 2"
          (click)="setSpeed(2)">2x</button>
        <button
          [class.active]="speed() === 4"
          (click)="setSpeed(4)">4x</button>
      </div>
      <button class="skip-btn" (click)="skipToEnd()">Skip</button>
    </div>

    <!-- Battle log sidebar (optional, can be toggled) -->
    @if (showLog()) {
      <div class="battle-log">
        @for (entry of recentActions(); track entry) {
          <div class="log-entry">
            <span class="actor">{{ entry.actorName }}</span>
            <span class="action">{{ entry.skillName }}</span>
            @if (entry.damage > 0) {
              <span class="damage">-{{ entry.damage }}</span>
            }
            @if (entry.healing > 0) {
              <span class="heal">+{{ entry.healing }}</span>
            }
          </div>
        }
      </div>
    }
  </div>
</div>
```

### 10.2 Overlay Styling

```css
.battle-wrapper {
  position: relative;
  width: 100%;
  height: 100vh;
  background: #1a1a2e;
  display: flex;
  align-items: center;
  justify-content: center;
}

.phaser-canvas {
  position: relative;
}

.battle-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none; /* Allow clicks to pass through to Phaser */
}

.battle-overlay > * {
  pointer-events: auto; /* Re-enable clicks for overlay elements */
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
```

---

## 11. Responsive Design

### 11.1 Canvas Scaling

Phaser's built-in `Scale.FIT` mode handles this. The game is designed for a base resolution of **960x540** (16:9) and scales proportionally to fit the viewport.

```typescript
scale: {
  mode: Phaser.Scale.FIT,
  autoCenter: Phaser.Scale.CENTER_BOTH,
  parent: 'phaser-container',
  width: 960,
  height: 540,
}
```

### 11.2 Container Sizing

The Phaser container uses CSS to fill the available viewport minus the overlay controls:

```css
#phaser-container {
  width: 100%;
  max-width: 960px;
  aspect-ratio: 16 / 9;
}

#phaser-container canvas {
  width: 100% !important;
  height: 100% !important;
}
```

### 11.3 Mobile Considerations

For the MVP, mobile is not a primary target but basic usability is maintained:
- Touch events work natively with Phaser's input system.
- The 960x540 base resolution scales down to 375px-wide phones at ~40% scale, which is readable.
- Angular overlay buttons use minimum 44px touch targets per accessibility guidelines.

---

## 12. File Structure & Module Organization

```
apps/client/src/app/
├── features/
│   └── battle/
│       ├── battle.component.ts          <- Angular host component
│       ├── battle.component.spec.ts     <- Component tests
│       ├── scenes/
│       │   ├── PreloadScene.ts          <- Asset loading scene
│       │   ├── BattleScene.ts           <- Main battle animation scene
│       │   └── ResultScene.ts           <- Victory/defeat screen
│       ├── objects/
│       │   ├── HeroSprite.ts            <- Hero visual (sprite, HP bar, name)
│       │   └── SkillEffectFactory.ts    <- Skill animation factory
│       └── services/
│           └── battle-event-bus.ts      <- Angular <-> Phaser communication
├── core/
│   └── services/
│       ├── battle.service.ts            <- NEW: Battle API + simulation
│       ├── api.service.ts               <- Existing
│       ├── heroes.service.ts            <- Existing
│       └── auth.service.ts              <- Existing
```

### 12.1 Route Registration

Add to `apps/client/src/app/app.routes.ts`:

```typescript
{
  path: 'battle/:stageId',
  loadComponent: () =>
    import('./features/battle/battle.component').then((m) => m.BattleComponent),
  canActivate: [authGuard],
},
```

### 12.2 Lobby Update

Update the lobby component to enable the Battle card and link to campaign stage selection (or directly to a battle for now):

```typescript
// In lobby.component.ts template, change the Battle card:
<div class="menu-card" routerLink="/battle/1-1">
  <h3>Battle</h3>
  <p>Enter the battlefield</p>
</div>
```

---

## 13. Step-by-Step Implementation Tasks

### Phase A: Foundation (No Dependencies)

#### Task 13.1: Install Phaser 3 and Configure Build
**Files:** `package.json`, `apps/client/project.json`, `apps/client/tsconfig.app.json`
**Effort:** S (1-2 hours)

- Run `npm install phaser@3`.
- Add `"allowedCommonJsDependencies": ["phaser"]` to the client build config.
- Verify the Angular dev server starts without errors.
- Verify Phaser types are available in client TypeScript files.

#### Task 13.2: Create BattleEventBus Service
**File:** `apps/client/src/app/features/battle/services/battle-event-bus.ts`
**Effort:** S (1-2 hours)

- Implement the `BattleEventBus` class as described in Section 8.
- Add `setBattleData`, `getBattleData`, `setBattleResult`, `getBattleResult`.
- Add Angular-to-Phaser events: `changeSpeed`, `skipBattle`.
- Add Phaser-to-Angular events: `turnUpdate`, `battleComplete`, `navigate`.
- Add `destroy()` for cleanup.

#### Task 13.3: Create BattleService (Angular)
**File:** `apps/client/src/app/core/services/battle.service.ts`
**Effort:** M (3-4 hours)

- Implement `startBattle(stageId)`:
  - Call `POST /battles/start`.
  - Load player team from `HeroesService`.
  - Convert to `BattleHero[]` using `playerHeroToBattleHero` from `@hero-wars/battle-engine`.
  - Run `BattleSimulator` locally.
  - Return `{ battleId, playerTeam, enemyTeam, battleLog }`.
- Implement `completeBattle(battleId, clientLog)`:
  - Call `POST /battles/:id/complete`.
  - Return the validation response.

### Phase B: Phaser Scenes (Depends on A)

#### Task 13.4: Implement PreloadScene
**File:** `apps/client/src/app/features/battle/scenes/PreloadScene.ts`
**Effort:** S (2-3 hours)

- Generate placeholder hero textures (colored rounded rectangles for each class).
- Generate UI textures (HP bar background, HP bar fill, projectile).
- Show a loading progress bar during `preload`.
- Read battle data from EventBus and pass to BattleScene via `scene.start`.

#### Task 13.5: Implement HeroSprite Game Object
**File:** `apps/client/src/app/features/battle/objects/HeroSprite.ts`
**Effort:** M (3-4 hours)

- Create Phaser Container with: sprite image, HP bar (bg + fill), name label, highlight border.
- Implement `updateHp(newHp)` with animated HP bar + color transitions.
- Implement `highlight(active)` for turn indicator.
- Implement `playAttackAnimation(target, duration, onHit)` -- lunge + return.
- Implement `playHitEffect(duration)` -- red flash + shake.
- Implement `playHealEffect(duration)` -- green glow.
- Implement `playBuffEffect(effects, duration)` -- particle sparkles.
- Implement `playDoTEffect(duration)` -- purple flash.
- Implement `playDeathAnimation()` -- fade out + slide down.
- Texture resolution: map hero name to class-based placeholder texture.

#### Task 13.6: Implement SkillEffectFactory
**File:** `apps/client/src/app/features/battle/objects/SkillEffectFactory.ts`
**Effort:** S (2-3 hours)

- `createProjectile(from, to, color, duration)` -- flying circle.
- `createAoEBlast(center, color, duration)` -- expanding circle.
- `createHealEffect(target, duration)` -- green glow expansion.
- `createBuffParticles(target, color, direction, duration)` -- rising/falling particles.

#### Task 13.7: Implement BattleScene
**File:** `apps/client/src/app/features/battle/scenes/BattleScene.ts`
**Effort:** L (6-8 hours)

- Create battlefield layout (team labels, divider).
- Position hero sprites using staggered formation algorithm.
- Implement `playNextAction()` loop stepping through `TurnAction[]`.
- Implement `animateAction()` dispatcher:
  - Auto-attack: lunge + hit.
  - Damage skill: projectile/AoE + damage text.
  - Heal skill: heal effect + heal text.
  - Buff/debuff/shield: particle effects.
  - DoT tick: purple flash + damage text.
- Implement `showDamageText()` -- floating numbers that rise and fade.
- Implement `showSkillName()` -- skill name popup above actor.
- Implement `updateHpBars()` -- synchronize all HP bars from `resultHp` snapshot.
- Listen for speed changes from EventBus.
- Listen for skip event from EventBus.
- Transition to ResultScene on completion.

#### Task 13.8: Implement ResultScene
**File:** `apps/client/src/app/features/battle/scenes/ResultScene.ts`
**Effort:** S (2-3 hours)

- Read battle result from EventBus.
- Display "VICTORY" or "DEFEAT" title.
- Show star rating with animated entrance.
- Show rewards (gold, XP, hero XP).
- Continue button that emits navigate event via EventBus.

### Phase C: Angular Integration (Depends on B)

#### Task 13.9: Implement BattleComponent
**File:** `apps/client/src/app/features/battle/battle.component.ts`
**Effort:** M (4-5 hours)

- On `ngOnInit`:
  - Read `stageId` from route params.
  - Call `BattleService.startBattle(stageId)`.
  - Start the `completeBattle` API call in background (fire-and-forget until needed).
  - Create `BattleEventBus`, set battle data and result.
  - Create Phaser.Game with configuration.
  - Pass EventBus to Phaser via `game.registry`.
- On `ngOnDestroy`:
  - Destroy Phaser game.
  - Destroy EventBus.
- Angular template:
  - Phaser container div.
  - Top bar overlay: turn counter (from `turnUpdate` subscription), speed controls, skip button.
  - Battle log sidebar (from turn actions).
- Subscribe to EventBus navigate event to route back to lobby.
- Handle loading state while `startBattle()` is in progress.
- Handle error state (API failure, empty team).

#### Task 13.10: Register Battle Route and Update Lobby
**Files:** `apps/client/src/app/app.routes.ts`, `apps/client/src/app/features/lobby/lobby.component.ts`
**Effort:** S (1 hour)

- Add `/battle/:stageId` route with lazy loading and `authGuard`.
- Update lobby component: change Battle card from disabled to linked (e.g., `/battle/1-1`).
- Optionally add a simple stage selector or link to stage 1-1 for testing.

### Phase D: Polish (Depends on C)

#### Task 13.11: Skip and Speed Controls
**File:** `battle.component.ts`, `BattleScene.ts`
**Effort:** S (2 hours)

- Wire speed buttons (1x, 2x, 4x) to EventBus `changeSpeed()`.
- Wire skip button to EventBus `skipBattle()`.
- BattleScene listens for skip: immediately set all remaining actions' HP snapshots, show final state, go to ResultScene.

#### Task 13.12: Error Handling and Loading States
**File:** `battle.component.ts`
**Effort:** S (2 hours)

- Show loading spinner while `startBattle()` is in progress.
- Show error message if API call fails.
- Handle empty team (redirect to team builder).
- Handle battle validation failure (show warning on result screen).

#### Task 13.13: Battle Log Submission Timing
**File:** `battle.component.ts`, `battle.service.ts`
**Effort:** S (1-2 hours)

- After `startBattle()` completes and the BattleLog is produced, immediately call `completeBattle()` in the background.
- Store the response (validated, rewards) on the EventBus for ResultScene.
- If the response arrives before animations finish, data is ready when ResultScene loads.
- If animations finish before the response, show a brief "Validating..." spinner on ResultScene.

---

## 14. Testing Strategy

### 14.1 Unit Tests

**BattleEventBus:**
- `setBattleData` / `getBattleData` stores and retrieves correctly.
- `changeSpeed` emits on `onSpeedChange` subscription.
- `emitTurnUpdate` emits on `turnUpdate` observable.
- `destroy()` completes all subjects.

**BattleService:**
- Mock `ApiService` and `HeroesService`.
- `startBattle()` calls the correct API endpoint.
- `startBattle()` converts PlayerHero to BattleHero correctly.
- `startBattle()` runs the simulator and returns a valid BattleLog.
- `completeBattle()` sends the correct payload.

**BattleComponent:**
- Creates Phaser.Game on init.
- Destroys Phaser.Game on destroy.
- Routes to lobby when EventBus emits navigate.
- Shows loading state while battle is starting.

### 14.2 Integration Tests

**Full battle flow (E2E-style):**
1. Navigate to `/battle/1-1`.
2. Verify loading state appears.
3. Verify Phaser canvas renders.
4. Verify hero sprites are placed.
5. Verify speed controls work.
6. Verify battle completes and result screen shows.
7. Verify Continue button navigates back.

Note: Full Phaser scene testing in JSDOM is limited (no WebGL context). Integration tests should use Playwright/Cypress in a real browser. For Sprint 4, focus on:
- Unit tests for services and EventBus (JSDOM-compatible).
- Manual smoke testing for visual correctness.
- Automated browser tests deferred to Sprint 7 (polish).

### 14.3 Test Files

```
apps/client/src/app/features/battle/
├── battle.component.spec.ts
├── services/
│   └── battle-event-bus.spec.ts
apps/client/src/app/core/services/
└── battle.service.spec.ts
```

### 14.4 Manual Testing Checklist

- [ ] Phaser canvas renders at correct size.
- [ ] Canvas scales correctly when browser window resizes.
- [ ] Player heroes appear on the left, enemies on the right.
- [ ] HP bars display correctly and animate on damage.
- [ ] Auto-attack animation: lunge + hit + damage number.
- [ ] Skill animation: projectile flies to target.
- [ ] AoE animation: expanding circle over multiple targets.
- [ ] Heal animation: green glow + heal number.
- [ ] Buff/debuff animation: particles.
- [ ] DoT animation: purple flash + damage number.
- [ ] Death animation: fade out.
- [ ] Turn counter updates in Angular overlay.
- [ ] Speed controls (1x, 2x, 4x) affect animation speed.
- [ ] Skip button jumps to result screen.
- [ ] Victory screen shows stars + rewards.
- [ ] Defeat screen shows appropriate message.
- [ ] Continue button returns to lobby.
- [ ] No memory leaks (Phaser game destroyed on route change).
- [ ] No console errors during battle playback.

---

## 15. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Phaser + Angular build conflicts | High -- blocks all work | Low -- Phaser 3 is a self-contained bundle | Test build immediately in Task 13.1; fallback to dynamic script loading if bundler fails |
| Phaser canvas not rendering in JSDOM tests | Medium -- test coverage gap | High -- WebGL requires real browser | Focus unit tests on services/EventBus; defer visual tests to Playwright (Sprint 7) |
| Animation timing feels wrong at different speeds | Medium -- poor UX | Medium | Use consistent `baseDuration / speedMultiplier` pattern; tune base durations during playtesting |
| Memory leaks from Phaser textures/tweens | Medium -- performance degradation | Medium | Always destroy() game on ngOnDestroy; clean up tweens and particles in scene shutdown |
| Large number of TurnActions (50-turn battle) causes animation queue to feel slow | Medium -- UX patience | High | Default to 2x speed; provide skip button; show progress indicator |
| HeroSprite texture resolution for unknown hero names | Low -- visual glitch | Medium | Fallback to `hero-warrior` texture; add hero class to `BattleHero` interface in a future sprint |
| BattleSimulator run() blocks UI thread | Low -- < 10ms for 50 turns | Low | Already verified in Sprint 3; if needed, move to Web Worker |
| Phaser Scale.FIT does not work with Angular's change detection | Low -- layout issue | Low | Use `ResizeObserver` on container div as fallback; test on init |
| RxJS Subject leaks between route navigations | Medium -- memory leak | Medium | Complete all subjects in `EventBus.destroy()`; unsubscribe in component `ngOnDestroy` |

---

## 16. Dependencies on Sprint 3

This plan assumes the following Sprint 3 deliverables are complete and working:

1. **`BattleSimulator.run()`** returns a valid `BattleLog` with `TurnAction[]` that includes `resultHp` snapshots. (Verified: `libs/battle-engine/src/simulator.ts:117-128`)
2. **`POST /battles/start`** returns `{ battleId, seed, seedHash, enemyTeam }`. (Defined in `BattleStartResponse` interface.)
3. **`POST /battles/:id/complete`** accepts `{ battleId, clientLog }` and returns `BattleCompleteResponse`. (Defined in shared types.)
4. **`playerHeroToBattleHero()`** correctly converts client-side hero data to simulator input. (Verified: `libs/battle-engine/src/hero-converter.ts`)
5. **`HeroesService.loadTeam()`** returns the player's current team. (Verified: `apps/client/src/app/core/services/heroes.service.ts:31-34`)

---

## 17. Implementation Order and Dependencies

```
Phase A (Parallel, No Dependencies):
  [13.1] Install Phaser + Config  ----\
  [13.2] BattleEventBus            ----+---> Phase B
  [13.3] BattleService             ----/

Phase B (Depends on A):
  [13.4] PreloadScene              ----\
  [13.5] HeroSprite                ----+---> Phase C
  [13.6] SkillEffectFactory        ----/
  [13.7] BattleScene               ---------> Phase C
  [13.8] ResultScene               ---------> Phase C

  Note: 13.4, 13.5, 13.6 can be built in parallel.
  13.7 depends on 13.5 and 13.6.
  13.8 has no scene dependencies.

Phase C (Depends on B):
  [13.9]  BattleComponent          ----\
  [13.10] Route + Lobby Update     ----+---> Phase D

Phase D (Depends on C):
  [13.11] Skip + Speed Controls    ----\
  [13.12] Error Handling           ----+---> Done
  [13.13] Submission Timing        ----/
```

### Estimated Total Effort

| Task | Effort | Hours |
|------|--------|-------|
| 13.1 Install Phaser + Config | S | 1-2 |
| 13.2 BattleEventBus | S | 1-2 |
| 13.3 BattleService | M | 3-4 |
| 13.4 PreloadScene | S | 2-3 |
| 13.5 HeroSprite | M | 3-4 |
| 13.6 SkillEffectFactory | S | 2-3 |
| 13.7 BattleScene | L | 6-8 |
| 13.8 ResultScene | S | 2-3 |
| 13.9 BattleComponent | M | 4-5 |
| 13.10 Route + Lobby | S | 1 |
| 13.11 Skip + Speed | S | 2 |
| 13.12 Error Handling | S | 2 |
| 13.13 Submission Timing | S | 1-2 |
| **Total** | | **30-43 hours** |

This fits within the 2-week sprint window (80 working hours) with significant buffer for integration debugging, visual tuning, and playtesting.

---

## 18. Files Created / Modified Summary

### New Files
- `apps/client/src/app/features/battle/battle.component.ts`
- `apps/client/src/app/features/battle/battle.component.spec.ts`
- `apps/client/src/app/features/battle/scenes/PreloadScene.ts`
- `apps/client/src/app/features/battle/scenes/BattleScene.ts`
- `apps/client/src/app/features/battle/scenes/ResultScene.ts`
- `apps/client/src/app/features/battle/objects/HeroSprite.ts`
- `apps/client/src/app/features/battle/objects/SkillEffectFactory.ts`
- `apps/client/src/app/features/battle/services/battle-event-bus.ts`
- `apps/client/src/app/features/battle/services/battle-event-bus.spec.ts`
- `apps/client/src/app/core/services/battle.service.ts`
- `apps/client/src/app/core/services/battle.service.spec.ts`

### Modified Files
- `package.json` -- Add `phaser@3` dependency
- `apps/client/project.json` -- Add `allowedCommonJsDependencies`
- `apps/client/tsconfig.app.json` -- Add Phaser types
- `apps/client/src/app/app.routes.ts` -- Add `/battle/:stageId` route
- `apps/client/src/app/features/lobby/lobby.component.ts` -- Enable Battle card

---

## Plan Review -- Expert Assessment

**Reviewer:** Plan Reviewer Agent
**Date:** 2026-02-22
**Verdict:** APPROVE WITH CHANGES

---

### Strengths

1. **Excellent architecture alignment.** The plan faithfully follows the architecture doc (Section 8) for Angular+Phaser integration: standalone component host, `Phaser.Scale.FIT`, canvas-in-div approach, EventBus via RxJS Subjects, and Angular UI overlays on top of the Phaser canvas. The `transparent: true` flag from the architecture doc is replaced with a solid `backgroundColor` in the plan, which is actually a better choice for the MVP since there are no background Angular elements that need to show through the canvas.

2. **Correct "compute first, animate second" pattern.** Section 7.3 correctly identifies that `BattleSimulator.run()` produces the complete `BattleLog` synchronously before any Phaser rendering. The BattleScene then replays the `TurnAction[]` as a visual sequence. This is the right approach -- it decouples simulation determinism from rendering.

3. **Accurate battle engine integration.** The plan correctly references:
   - `BattleSimulator` from `libs/battle-engine/src/simulator.ts` and its `BattleConfig` interface (`playerTeam`, `enemyTeam`, `seed`).
   - `playerHeroToBattleHero` from `libs/battle-engine/src/hero-converter.ts`.
   - The `BattleLog`, `TurnAction`, `BattleHero`, `BattleStartResponse`, and `BattleCompleteResponse` types from `libs/shared/src/models/battle.ts`.
   - The `resultHp` snapshot field on `TurnAction` for HP bar synchronization.
   - The `SeededRandom` Mulberry32 implementation in `libs/battle-engine/src/rng.ts`.

4. **Comprehensive action handling.** The BattleScene implementation covers all `TurnAction` types produced by the simulator: auto-attack, single-target skills, AoE skills, heals, buffs/debuffs/shields, DoT ticks, and death. Each has a distinct visual treatment.

5. **Strong file structure.** Follows the architecture doc's module layout: `features/battle/scenes/`, `features/battle/objects/`, `features/battle/services/`. The separation of BattleService (core service for API/simulation), BattleEventBus (communication), and BattleComponent (orchestrator) is clean.

6. **Phased implementation plan.** Section 17 defines a clear dependency graph (Phase A -> B -> C -> D) with realistic task sizing. The 30-43 hour estimate fits within the 2-week sprint.

7. **Complete current state assessment.** Section 2 accurately inventories all Sprint 1-3 deliverables and correctly identifies every file reference (verified against actual codebase).

8. **Good risk identification.** The risk table in Section 15 covers the key concerns (build conflicts, JSDOM test limitations, memory leaks, long battle animations) with practical mitigations.

---

### Issues Found

#### Critical Issues

None.

#### Major Issues

**M1. `BattleService.startBattle()` constructs `PlayerHero` from `PlayerHeroResponse` with a lossy conversion.**
Location: Section 7.2, the `startBattle` method.

The plan maps `PlayerHeroResponse` fields to a `PlayerHero` object to pass to `playerHeroToBattleHero()`. However, `PlayerHeroResponse.template` has type `HeroTemplateResponse`, which is structurally identical to `HeroTemplate` (verified in `libs/shared/src/models/hero.ts:55-66` vs `5-16`). The cast `h.template as HeroTemplate` works, but the `playerId` is set to an empty string `''`. While `playerHeroToBattleHero` does not use `playerId` (it only uses `template`, `level`, `stars`, `teamPosition`), this is fragile. If `playerHeroToBattleHero` is ever extended to use `playerId`, this will silently produce wrong data.

**Recommendation:** Either (a) set `playerId` from the auth service's current player ID, or (b) create a lightweight adapter function in the BattleService that maps `PlayerHeroResponse` directly to `BattleHero` without going through the full `PlayerHero` interface. Option (b) avoids the intermediate conversion entirely.

**M2. The `completeBattle` API call timing has a race condition edge case.**
Location: Section 13.13 and the BattleComponent lifecycle.

The plan says to fire `completeBattle()` immediately after `startBattle()` returns (before animations begin) and store the result for the ResultScene. However, if the user navigates away during the battle (Angular `ngOnDestroy` fires), the EventBus is destroyed and the in-flight HTTP response has nowhere to go. The subscription to the `completeBattle` observable will still complete, but its callback references a destroyed EventBus.

**Recommendation:** Use `takeUntilDestroyed()` (Angular 16+) or an explicit `destroy$` subject to cancel the in-flight HTTP call when the component is destroyed. Also store the validation result in `BattleService` (persisted in memory) rather than only on the EventBus, so it survives component destruction/recreation.

**M3. The `HeroSprite.resolveTextureKey()` uses fragile name-based matching.**
Location: Section 6.2, `resolveTextureKey` method.

The method does `hero.name.toLowerCase().includes('warrior')` to determine the texture. This is brittle -- it depends on the `name` field from `HeroTemplate` containing class keywords. Looking at the actual hero template IDs in `campaign-stages.ts` (e.g., `warrior_bold`, `mage_fire`, `healer_light`, `archer_swift`, `tank_iron`), the names contain these keywords, but this is a naming convention, not a contract.

The `HeroTemplate` has a `class` field (`HeroClass`) and a `spriteKey` field. The `BattleHero` interface does NOT carry the `class` or `spriteKey` fields -- it only has `id`, `name`, `stats`, `skills`, `team`, `position`, `statusEffects`.

**Recommendation:** Either (a) extend `BattleHero` in `libs/shared/src/models/battle.ts` to include an optional `spriteKey` or `heroClass` field, and populate it in `playerHeroToBattleHero`/`campaignEnemyToBattleHero`, or (b) pass the hero templates alongside the BattleLog in the `BattleData` so the PreloadScene/HeroSprite can look up the class directly. Option (a) is cleaner and only requires a minor shared model change.

#### Minor Issues

**m1. `backgroundColor` config instead of `transparent: true`.**
Section 3.4 uses `backgroundColor: '#1a1a2e'` while the architecture doc (Section 8.2) specifies `transparent: true`. Both approaches work, but the plan should explicitly note this is a deliberate deviation from the architecture doc, and explain that `transparent` is not needed because no Angular content renders behind the canvas in this design.

**m2. Missing unsubscribe pattern for EventBus subscriptions in BattleScene.**
Section 5.2 calls `this.eventBus.onSpeedChange((speed) => { ... })` which creates a subscription, but there is no teardown when the scene shuts down. Phaser scenes can be stopped/restarted, and leftover RxJS subscriptions will leak.

**Recommendation:** Store the subscription and unsubscribe in the scene's `shutdown()` or `destroy()` lifecycle method. Or use `eventBus.onSpeedChange` to return a `Subscription` object.

**m3. The `SkillEffectFactory` (Section 9.3) is defined but never referenced in the BattleScene code.**
The BattleScene in Section 5.2 has inline effect creation code (projectile tweens, AoE circles) in `playSkillEffect()` rather than delegating to `SkillEffectFactory`. Either remove the factory (YAGNI for MVP) or refactor BattleScene to use it.

**m4. Missing `durationMs` tracking on the battle submission.**
`BattleLog.durationMs` is set to `0` by the simulator (verified: `simulator.ts:177`). The plan does not track wall-clock time from battle start to completion for submission. The `POST /battles/:id/complete` endpoint expects `duration_ms` per the architecture doc Section 6.2.

**Recommendation:** Track `Date.now()` at the start of `BattleService.startBattle()` and compute `durationMs = Date.now() - startTime` when calling `completeBattle()`. Pass this value in the submission payload.

**m5. The `AoE circle radius` tween on line 666 of Section 5.2 may not work as expected.**
`Phaser.GameObjects.Arc.radius` is not a standard tween-able property in Phaser 3. The `this.add.circle()` creates an `Arc` object, but tweening `radius` requires Phaser to recognize it. Phaser tweens work on any numeric property, so it should technically work because `Arc` exposes `radius` as a setter, but it may not trigger the re-draw. The circle's geometry updates lazily.

**Recommendation:** Test this in an early spike. If it does not animate correctly, switch to scaling a fixed-size circle (`scaleX`/`scaleY` tween) or use a `Graphics` object that redraws each frame.

**m6. Production budget warning.**
The `project.json` has an initial bundle budget of 500kb warning / 1mb error. Phaser 3 (minified) is approximately 1-1.2MB. This will blow the budget.

**Recommendation:** Update the production budget in `project.json` or use dynamic `import()` with code splitting so Phaser is loaded only on the battle route (the plan already uses lazy-loaded routes, so this should happen naturally, but verify that Phaser's UMD bundle gets properly code-split).

---

### Missing Items to Add

1. **Pause/resume functionality.** The plan has speed controls and skip, but no pause button. For longer battles (50 turns), users may want to pause and inspect the state. Low priority for MVP but worth noting.

2. **Battle retry flow.** After a defeat, the ResultScene shows "DEFEAT" and a Continue button that goes to the lobby. Consider adding a "Retry" button that re-starts the same stage without navigating away.

3. **Accessibility considerations.** No mention of screen reader support or keyboard navigation for the Angular overlays. While Phaser canvas is inherently inaccessible, the Angular overlay buttons (speed controls, skip, continue) should have proper `aria-label` attributes.

4. **Battle state persistence.** If the user refreshes the page during a battle, all state is lost. Consider storing the `battleId` and `BattleLog` in `sessionStorage` so the result can still be submitted after a refresh. Low priority for MVP.

5. **Network error handling on `completeBattle`.** What happens if the server validation call fails (network timeout, 500 error)? The plan mentions showing a "Validating..." spinner, but does not handle the failure case. Recommendation: show a retry button on the ResultScene if validation fails, with the option to continue without validation (rewards pending).

6. **The `BattleHero` `team` field vs `side` parameter.** In the plan's `HeroSprite` constructor, the `side` parameter is passed separately from `hero.team`. These should always match, but the redundancy could lead to bugs. Consider removing the `side` parameter and using `hero.team` directly.

---

### Summary

This is a well-structured, thorough plan that demonstrates strong understanding of both the existing codebase and the Phaser 3 framework. The core architectural decisions are sound: compute-first-animate-second, RxJS EventBus, Angular overlay pattern, and phased task breakdown. The major issues identified (M1-M3) are all fixable within the sprint scope and do not require architectural changes. The minor issues are quality-of-life improvements that can be addressed during implementation.

**Verdict: APPROVE WITH CHANGES** -- Address M1, M2, M3, and m6 before implementation begins. The remaining minor items can be resolved during development.

---

## Major Issue Resolutions

The following changes address the 3 major issues (M1, M2, M3) identified in the expert review. These changes have been applied to the plan sections above and are summarized here as a consolidated reference.

### M1 Resolution: Direct `PlayerHeroResponse` → `BattleHero` Adapter

**Problem:** `BattleService.startBattle()` constructed an intermediate `PlayerHero` with `playerId: ''` to pass to `playerHeroToBattleHero()`. This is fragile and lossy.

**Fix:** Replaced with a direct `playerHeroResponseToBattleHero()` adapter function defined in `battle.service.ts` that maps `PlayerHeroResponse` → `BattleHero` without the intermediate `PlayerHero` construction. The function:
- Uses `hero.template` directly (no `as HeroTemplate` cast needed since `HeroTemplateResponse` is structurally identical)
- Carries `hero.template.class` and `hero.template.spriteKey` into the new `BattleHero` fields (ties into M3)
- Eliminates the `playerId: ''` hack entirely

**Updated in:** Section 7.2 (BattleService)

### M2 Resolution: Race-Condition-Safe Battle Validation

**Problem:** If the user navigates away during battle animations, `ngOnDestroy` fires, the EventBus is destroyed, and the in-flight `completeBattle()` HTTP response has nowhere to go.

**Fix:** Three-part solution:
1. **`BattleService` caches the validation result** in `_lastValidationResult`. This persists in memory (service is `providedIn: 'root'`) even if the component is destroyed and recreated.
2. **`BattleComponent` uses `takeUntilDestroyed()`** (Angular 16+) for all EventBus subscriptions, ensuring automatic cleanup.
3. **`completeBattle()` returns a `Promise`** (via `firstValueFrom`) instead of an `Observable`, making the fire-and-forget pattern explicit. The `.catch()` in the component gracefully handles the case where the component is destroyed before the response arrives — the result is still cached in `BattleService`.
4. **`BattleService` reference is passed to Phaser** via `game.registry.set('battleService', ...)` so `ResultScene` can fall back to `battleService.lastValidationResult` if the EventBus result is not yet set.

**Updated in:** Sections 3.4 (BattleComponent) and 7.2 (BattleService)

### M3 Resolution: `heroClass` and `spriteKey` on `BattleHero`

**Problem:** `HeroSprite.resolveTextureKey()` used fragile name-based string matching (`hero.name.includes('warrior')`) to determine textures. The `BattleHero` interface lacked `class`/`spriteKey` fields.

**Fix:** Two changes required:

**1. Extend `BattleHero` in `libs/shared/src/models/battle.ts`:**

```typescript
export interface BattleHero {
  id: string;
  name: string;
  heroClass?: HeroClass;    // ← NEW: 'warrior' | 'mage' | 'healer' | 'archer' | 'tank'
  spriteKey?: string;        // ← NEW: e.g. 'warrior_bold' for future sprite lookup
  stats: HeroStats;
  currentHp: number;
  skills: BattleSkill[];
  team: 'player' | 'enemy';
  position: number;
  statusEffects: StatusEffect[];
}
```

Both fields are optional to maintain backward compatibility with existing converters.

**2. Update converters in `libs/battle-engine/src/hero-converter.ts`:**

```typescript
export function playerHeroToBattleHero(
  playerHero: PlayerHero,
  team: 'player' | 'enemy',
): BattleHero {
  const stats = calculateHeroStats(playerHero.template, playerHero.level, playerHero.stars);
  return {
    id: playerHero.id,
    name: playerHero.template.name,
    heroClass: playerHero.template.class,       // ← NEW
    spriteKey: playerHero.template.spriteKey,    // ← NEW
    stats,
    currentHp: stats.hp,
    skills: mapSkills(playerHero.template),
    team,
    position: playerHero.teamPosition ?? 0,
    statusEffects: [],
  };
}

export function campaignEnemyToBattleHero(
  enemy: CampaignEnemy,
  template: HeroTemplate,
  index: number,
): BattleHero {
  const stats = calculateHeroStats(template, enemy.level, enemy.stars);
  return {
    id: `enemy-${template.id}-${index}`,
    name: template.name,
    heroClass: template.class,       // ← NEW
    spriteKey: template.spriteKey,    // ← NEW
    stats,
    currentHp: stats.hp,
    skills: mapSkills(template),
    team: 'enemy',
    position: index,
    statusEffects: [],
  };
}
```

**3. `HeroSprite.resolveTextureKey()` simplified** to use `hero.heroClass` directly with a safe fallback.

**Updated in:** Sections 6.2 (HeroSprite), 7.2 (BattleService), and this resolution section.

### Files Modified by These Resolutions

| File | Change |
|------|--------|
| `libs/shared/src/models/battle.ts` | Add optional `heroClass` and `spriteKey` to `BattleHero` |
| `libs/battle-engine/src/hero-converter.ts` | Populate `heroClass` and `spriteKey` in both converter functions |
| `apps/client/src/app/core/services/battle.service.ts` | New `playerHeroResponseToBattleHero()` adapter, cached validation result, `durationMs` tracking |
| `apps/client/src/app/features/battle/battle.component.ts` | `takeUntilDestroyed()`, `DestroyRef`, pass `battleService` to Phaser registry |
| `apps/client/src/app/features/battle/objects/HeroSprite.ts` | `resolveTextureKey()` uses `hero.heroClass` instead of name matching |
