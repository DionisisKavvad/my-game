import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HeroesService } from '../../core/services/heroes.service';
import { AuthService } from '../../core/services/auth.service';
import { PlayerHeroResponse, GAME_CONFIG } from '@hero-wars/shared';

@Component({
  selector: 'app-hero-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="detail-container">
      <header class="detail-header">
        <button class="back-btn" (click)="goBack()">Back</button>
        <h1>Hero Detail</h1>
      </header>

      @if (hero(); as h) {
        <div class="hero-detail">
          <div class="hero-main">
            <div class="hero-portrait">
              <div class="sprite">{{ h.template.spriteKey }}</div>
              <div class="rarity-label" [class]="'rarity-' + h.template.rarity">
                {{ h.template.rarity }}
              </div>
            </div>

            <div class="hero-info">
              <h2>{{ h.template.name }}</h2>
              <div class="hero-class">{{ h.template.class }}</div>

              <div class="stars-display">
                @for (s of starArray(h.stars); track $index) {
                  <span class="star filled">&#9733;</span>
                }
                @for (s of starArray(7 - h.stars); track $index) {
                  <span class="star empty">&#9733;</span>
                }
              </div>

              <div class="level-section">
                <div class="level-label">Level {{ h.level }}</div>
                <div class="xp-bar">
                  <div class="xp-fill" [style.width.%]="(h.xp / h.xpToNextLevel) * 100"></div>
                </div>
                <div class="xp-text">{{ h.xp }} / {{ h.xpToNextLevel }} XP</div>
              </div>
            </div>
          </div>

          <div class="stats-section">
            <h3>Stats</h3>
            <div class="stats-grid">
              <div class="stat">
                <span class="stat-label">HP</span>
                <span class="stat-value">{{ h.computedStats.hp }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Attack</span>
                <span class="stat-value">{{ h.computedStats.attack }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Defense</span>
                <span class="stat-value">{{ h.computedStats.defense }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Speed</span>
                <span class="stat-value">{{ h.computedStats.speed }}</span>
              </div>
            </div>
          </div>

          <div class="skills-section">
            <h3>Skills</h3>
            @for (skill of h.template.skills; track skill.id) {
              <div class="skill-card">
                <div class="skill-header">
                  <span class="skill-name">{{ skill.name }}</span>
                  <span class="skill-cooldown">CD: {{ skill.cooldown }}</span>
                </div>
                <div class="skill-desc">{{ skill.description }}</div>
                <div class="skill-damage">Damage: {{ skill.damage }}</div>
              </div>
            }
          </div>

          <div class="equipment-section">
            <h3>Equipment</h3>
            <div class="equipment-slots">
              @for (slot of equipmentSlots; track slot) {
                <div class="equip-slot locked">
                  <span>{{ slot }}</span>
                  <span class="lock-icon">Locked</span>
                </div>
              }
            </div>
          </div>

          <div class="actions-section">
            <button
              class="upgrade-btn level-btn"
              [disabled]="!canLevelUp(h)"
              (click)="upgrade('level')"
            >
              Level Up ({{ levelUpCost(h) }} Gold)
            </button>
            <button
              class="upgrade-btn star-btn"
              [disabled]="!canStarUp(h)"
              (click)="upgrade('star')"
            >
              Star Up ({{ starUpCost(h) }} Gold)
              @if (starLevelReq(h) > h.level) {
                <span class="req-label">Req Lv.{{ starLevelReq(h) }}</span>
              }
            </button>
          </div>

          @if (message()) {
            <div class="toast">{{ message() }}</div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .detail-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
    }
    .detail-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 2rem;
      background: rgba(15, 52, 96, 0.8);
      border-bottom: 2px solid #e94560;
    }
    .detail-header h1 { color: #e94560; font-size: 1.5rem; }
    .back-btn {
      padding: 0.5rem 1rem;
      background: transparent;
      color: #e94560;
      border: 1px solid #e94560;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .back-btn:hover { background: #e94560; color: white; }
    .hero-detail {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
    .hero-main {
      display: flex;
      gap: 2rem;
      margin-bottom: 2rem;
    }
    .hero-portrait {
      text-align: center;
      min-width: 150px;
    }
    .sprite {
      font-size: 3rem;
      color: #888;
      background: #0f3460;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 0.5rem;
    }
    .rarity-label {
      text-transform: uppercase;
      font-size: 0.75rem;
      font-weight: bold;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
    }
    .rarity-common { color: #aaa; }
    .rarity-rare { color: #4dabf7; }
    .rarity-epic { color: #be4bdb; }
    .rarity-legendary { color: #ffd700; }
    .hero-info { flex: 1; }
    .hero-info h2 { margin-bottom: 0.25rem; }
    .hero-class {
      color: #888;
      text-transform: uppercase;
      font-size: 0.85rem;
      margin-bottom: 0.75rem;
    }
    .stars-display { margin-bottom: 1rem; font-size: 1.25rem; }
    .star.filled { color: #ffd700; }
    .star.empty { color: #444; }
    .level-section { margin-bottom: 1rem; }
    .level-label { font-weight: bold; margin-bottom: 0.25rem; }
    .xp-bar {
      height: 8px;
      background: #1a1a2e;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.25rem;
    }
    .xp-fill {
      height: 100%;
      background: #7fff00;
      border-radius: 4px;
      transition: width 0.3s;
    }
    .xp-text { font-size: 0.8rem; color: #888; }
    .stats-section, .skills-section, .equipment-section {
      background: #0f3460;
      padding: 1.5rem;
      border-radius: 12px;
      margin-bottom: 1rem;
    }
    .stats-section h3, .skills-section h3, .equipment-section h3 {
      color: #e94560;
      margin-bottom: 1rem;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    .stat {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem;
      background: rgba(26, 26, 46, 0.5);
      border-radius: 6px;
    }
    .stat-label { color: #888; }
    .stat-value { font-weight: bold; }
    .skill-card {
      background: rgba(26, 26, 46, 0.5);
      padding: 0.75rem;
      border-radius: 6px;
      margin-bottom: 0.5rem;
    }
    .skill-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.25rem;
    }
    .skill-name { font-weight: bold; }
    .skill-cooldown { color: #888; font-size: 0.8rem; }
    .skill-desc { font-size: 0.85rem; color: #aaa; margin-bottom: 0.25rem; }
    .skill-damage { font-size: 0.8rem; color: #e94560; }
    .equipment-slots {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
    }
    .equip-slot {
      background: rgba(26, 26, 46, 0.5);
      padding: 1rem;
      border-radius: 6px;
      text-align: center;
    }
    .equip-slot.locked { opacity: 0.5; }
    .lock-icon { display: block; font-size: 0.7rem; color: #888; margin-top: 0.25rem; }
    .actions-section {
      display: flex;
      gap: 1rem;
      margin-top: 1.5rem;
    }
    .upgrade-btn {
      flex: 1;
      padding: 1rem;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
      color: white;
    }
    .upgrade-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .level-btn { background: #2ecc71; }
    .level-btn:not(:disabled):hover { background: #27ae60; }
    .star-btn { background: #f39c12; }
    .star-btn:not(:disabled):hover { background: #e67e22; }
    .req-label {
      display: block;
      font-size: 0.75rem;
      font-weight: normal;
      margin-top: 0.25rem;
    }
    .toast {
      margin-top: 1rem;
      padding: 0.75rem;
      background: #2ecc71;
      color: white;
      border-radius: 6px;
      text-align: center;
      animation: fadeIn 0.3s;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class HeroDetailComponent implements OnInit {
  hero = signal<PlayerHeroResponse | null>(null);
  message = signal<string>('');
  equipmentSlots = ['Weapon', 'Armor', 'Helmet', 'Boots', 'Ring', 'Amulet'];

  private heroId = '';

  constructor(
    private heroesService: HeroesService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.heroId = this.route.snapshot.paramMap.get('id') ?? '';
    this.loadHero();
  }

  canLevelUp(h: PlayerHeroResponse): boolean {
    const player = this.authService.player();
    if (!player) return false;
    if (h.level >= GAME_CONFIG.hero.maxLevel) return false;
    if (h.xp < h.xpToNextLevel) return false;
    if (player.gold < GAME_CONFIG.hero.goldCostPerLevel(h.level)) return false;
    return true;
  }

  canStarUp(h: PlayerHeroResponse): boolean {
    const player = this.authService.player();
    if (!player) return false;
    if (h.stars >= GAME_CONFIG.hero.maxStars) return false;
    const targetStars = h.stars + 1;
    if (h.level < GAME_CONFIG.hero.starUpgradeLevelRequirement(targetStars)) return false;
    if (player.gold < GAME_CONFIG.hero.starUpgradeGoldCost(h.stars)) return false;
    return true;
  }

  levelUpCost(h: PlayerHeroResponse): number {
    return GAME_CONFIG.hero.goldCostPerLevel(h.level);
  }

  starUpCost(h: PlayerHeroResponse): number {
    return GAME_CONFIG.hero.starUpgradeGoldCost(h.stars);
  }

  starLevelReq(h: PlayerHeroResponse): number {
    return GAME_CONFIG.hero.starUpgradeLevelRequirement(h.stars + 1);
  }

  upgrade(type: 'level' | 'star'): void {
    this.heroesService.upgradeHero(this.heroId, type).subscribe({
      next: (result) => {
        this.hero.set(result.hero);
        this.updatePlayerGold(result.playerGoldRemaining);
        const label = type === 'level' ? 'Level' : 'Star';
        this.message.set(`${label} upgrade successful! Spent ${result.goldSpent} gold.`);
        setTimeout(() => this.message.set(''), 3000);
      },
      error: (err) => {
        this.message.set(err.error?.message ?? 'Upgrade failed');
        setTimeout(() => this.message.set(''), 3000);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/heroes']);
  }

  starArray(count: number): number[] {
    return Array(Math.max(0, count)).fill(0);
  }

  private loadHero(): void {
    this.heroesService.getHeroDetail(this.heroId).subscribe({
      next: (hero) => this.hero.set(hero),
    });
  }

  private updatePlayerGold(gold: number): void {
    const player = this.authService.player();
    if (player) {
      this.authService.player.set({ ...player, gold });
    }
  }
}
