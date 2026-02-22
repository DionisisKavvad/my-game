import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeroesService } from '../../core/services/heroes.service';

@Component({
  selector: 'app-heroes-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="heroes-container">
      <header class="heroes-header">
        <button class="back-btn" (click)="goBack()">Back</button>
        <h1>Hero Collection</h1>
      </header>

      <div class="heroes-grid">
        @for (hero of heroesService.heroes(); track hero.id) {
          <div class="hero-card" [class]="'hero-card rarity-' + hero.template.rarity" (click)="viewHero(hero.id)">
            <div class="hero-sprite">{{ hero.template.spriteKey }}</div>
            <h3 class="hero-name">{{ hero.template.name }}</h3>
            <div class="hero-class">{{ hero.template.class }}</div>
            <div class="hero-stars">
              @for (s of starArray(hero.stars); track $index) {
                <span class="star filled">&#9733;</span>
              }
              @for (s of starArray(7 - hero.stars); track $index) {
                <span class="star empty">&#9733;</span>
              }
            </div>
            <div class="hero-level">Lv.{{ hero.level }}</div>
            <div class="hero-stats">
              <span>HP {{ hero.computedStats.hp }}</span>
              <span>ATK {{ hero.computedStats.attack }}</span>
              <span>DEF {{ hero.computedStats.defense }}</span>
              <span>SPD {{ hero.computedStats.speed }}</span>
            </div>
            @if (hero.isInTeam) {
              <div class="team-badge">In Team</div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .heroes-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
    }
    .heroes-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 2rem;
      background: rgba(15, 52, 96, 0.8);
      border-bottom: 2px solid #e94560;
    }
    .heroes-header h1 {
      color: #e94560;
      font-size: 1.5rem;
    }
    .back-btn {
      padding: 0.5rem 1rem;
      background: transparent;
      color: #e94560;
      border: 1px solid #e94560;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .back-btn:hover {
      background: #e94560;
      color: white;
    }
    .heroes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 1rem;
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    .hero-card {
      background: #0f3460;
      padding: 1.5rem;
      border-radius: 12px;
      text-align: center;
      border: 2px solid transparent;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    }
    .hero-card:hover {
      border-color: #e94560;
      transform: translateY(-2px);
    }
    .hero-card.rarity-common { border-left: 4px solid #aaa; }
    .hero-card.rarity-rare { border-left: 4px solid #4dabf7; }
    .hero-card.rarity-epic { border-left: 4px solid #be4bdb; }
    .hero-card.rarity-legendary { border-left: 4px solid #ffd700; }
    .hero-sprite {
      font-size: 2rem;
      margin-bottom: 0.5rem;
      color: #888;
    }
    .hero-name {
      color: #fff;
      margin-bottom: 0.25rem;
      font-size: 1.1rem;
    }
    .hero-class {
      color: #888;
      font-size: 0.8rem;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }
    .hero-stars {
      margin-bottom: 0.5rem;
    }
    .star.filled { color: #ffd700; }
    .star.empty { color: #444; }
    .hero-level {
      color: #e94560;
      font-weight: bold;
      margin-bottom: 0.5rem;
    }
    .hero-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.25rem;
      font-size: 0.75rem;
      color: #aaa;
    }
    .team-badge {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: #e94560;
      color: white;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: bold;
    }
  `],
})
export class HeroesListComponent implements OnInit {
  constructor(
    public heroesService: HeroesService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.heroesService.loadMyHeroes().subscribe();
  }

  viewHero(heroId: string): void {
    this.router.navigate(['/heroes', heroId]);
  }

  goBack(): void {
    this.router.navigate(['/lobby']);
  }

  starArray(count: number): number[] {
    return Array(count).fill(0);
  }
}
