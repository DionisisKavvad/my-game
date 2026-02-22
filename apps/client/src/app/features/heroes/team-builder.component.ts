import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { HeroesService } from '../../core/services/heroes.service';
import { PlayerHeroResponse } from '@hero-wars/shared';

interface TeamSlot {
  position: number;
  hero: PlayerHeroResponse | null;
}

@Component({
  selector: 'app-team-builder',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="team-container">
      <header class="team-header">
        <button class="back-btn" (click)="goBack()">Back</button>
        <h1>Team Builder</h1>
      </header>

      <div class="team-content">
        <div class="team-slots">
          <h3>Battle Team</h3>
          <div class="slots-row">
            @for (slot of slots(); track slot.position) {
              <div class="slot" (click)="removeFromSlot(slot.position)">
                @if (slot.hero; as h) {
                  <div class="slot-hero">
                    <div class="slot-sprite">{{ h.template.spriteKey }}</div>
                    <div class="slot-name">{{ h.template.name }}</div>
                    <div class="slot-level">Lv.{{ h.level }}</div>
                  </div>
                } @else {
                  <div class="slot-empty">
                    <span>Position {{ slot.position }}</span>
                    <span class="slot-hint">Click hero below</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>

        <div class="available-heroes">
          <h3>Available Heroes</h3>
          <div class="heroes-list">
            @for (hero of availableHeroes(); track hero.id) {
              <div class="available-card" (click)="assignToNextSlot(hero)">
                <div class="avail-sprite">{{ hero.template.spriteKey }}</div>
                <div class="avail-info">
                  <div class="avail-name">{{ hero.template.name }}</div>
                  <div class="avail-details">
                    Lv.{{ hero.level }} | {{ hero.template.class }}
                  </div>
                </div>
                <div class="avail-stats">
                  HP {{ hero.computedStats.hp }} | ATK {{ hero.computedStats.attack }}
                </div>
              </div>
            }
            @if (availableHeroes().length === 0) {
              <div class="no-heroes">All heroes are assigned to the team.</div>
            }
          </div>
        </div>

        <div class="team-actions">
          <button class="save-btn" (click)="saveTeam()" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save Team' }}
          </button>
        </div>

        @if (message()) {
          <div class="toast" [class.error]="isError()">{{ message() }}</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .team-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
    }
    .team-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 2rem;
      background: rgba(15, 52, 96, 0.8);
      border-bottom: 2px solid #e94560;
    }
    .team-header h1 { color: #e94560; font-size: 1.5rem; }
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
    .team-content {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
    }
    .team-slots h3, .available-heroes h3 {
      color: #e94560;
      margin-bottom: 1rem;
    }
    .slots-row {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 2rem;
    }
    .slot {
      flex: 1;
      min-height: 140px;
      background: #0f3460;
      border: 2px dashed #334;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .slot:hover { border-color: #e94560; }
    .slot-hero { text-align: center; }
    .slot-sprite { font-size: 1.5rem; color: #888; margin-bottom: 0.25rem; }
    .slot-name { font-size: 0.85rem; font-weight: bold; }
    .slot-level { font-size: 0.75rem; color: #e94560; }
    .slot-empty { text-align: center; color: #555; font-size: 0.85rem; }
    .slot-hint { display: block; font-size: 0.7rem; margin-top: 0.25rem; }
    .heroes-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 400px;
      overflow-y: auto;
    }
    .available-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: #0f3460;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .available-card:hover {
      background: #133a6a;
      transform: translateX(4px);
    }
    .avail-sprite { font-size: 1.25rem; color: #888; }
    .avail-info { flex: 1; }
    .avail-name { font-weight: bold; font-size: 0.9rem; }
    .avail-details { font-size: 0.75rem; color: #888; }
    .avail-stats { font-size: 0.75rem; color: #aaa; }
    .no-heroes { color: #555; text-align: center; padding: 1rem; }
    .team-actions { margin-top: 1.5rem; }
    .save-btn {
      width: 100%;
      padding: 1rem;
      background: #e94560;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
    }
    .save-btn:hover:not(:disabled) { background: #c23152; }
    .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .toast {
      margin-top: 1rem;
      padding: 0.75rem;
      background: #2ecc71;
      color: white;
      border-radius: 6px;
      text-align: center;
    }
    .toast.error { background: #e74c3c; }
  `],
})
export class TeamBuilderComponent implements OnInit {
  slots = signal<TeamSlot[]>([
    { position: 0, hero: null },
    { position: 1, hero: null },
    { position: 2, hero: null },
    { position: 3, hero: null },
    { position: 4, hero: null },
  ]);

  allHeroes = signal<PlayerHeroResponse[]>([]);
  saving = signal(false);
  message = signal('');
  isError = signal(false);

  availableHeroes = computed(() => {
    const assignedIds = new Set(
      this.slots()
        .filter((s) => s.hero !== null)
        .map((s) => s.hero!.id),
    );
    return this.allHeroes().filter((h) => !assignedIds.has(h.id));
  });

  constructor(
    private heroesService: HeroesService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    forkJoin([
      this.heroesService.loadMyHeroes(),
      this.heroesService.loadTeam(),
    ]).subscribe(([heroes, teamRes]) => {
      this.allHeroes.set(heroes);

      // Populate slots from current team
      const newSlots: TeamSlot[] = [
        { position: 0, hero: null },
        { position: 1, hero: null },
        { position: 2, hero: null },
        { position: 3, hero: null },
        { position: 4, hero: null },
      ];
      for (const h of teamRes.heroes) {
        if (h.teamPosition !== null && h.teamPosition >= 0 && h.teamPosition <= 4) {
          newSlots[h.teamPosition] = { position: h.teamPosition, hero: h };
        }
      }
      this.slots.set(newSlots);
    });
  }

  assignToNextSlot(hero: PlayerHeroResponse): void {
    const current = this.slots();
    const emptyIndex = current.findIndex((s) => s.hero === null);
    if (emptyIndex === -1) return;

    const updated = current.map((s, i) =>
      i === emptyIndex ? { ...s, hero } : s,
    );
    this.slots.set(updated);
  }

  removeFromSlot(position: number): void {
    const current = this.slots();
    const updated = current.map((s) =>
      s.position === position ? { ...s, hero: null } : s,
    );
    this.slots.set(updated);
  }

  saveTeam(): void {
    this.saving.set(true);
    const heroPositions = this.slots()
      .filter((s) => s.hero !== null)
      .map((s) => ({ heroId: s.hero!.id, position: s.position }));

    this.heroesService.updateTeam(heroPositions).subscribe({
      next: () => {
        this.saving.set(false);
        this.isError.set(false);
        this.message.set('Team saved successfully!');
        setTimeout(() => this.message.set(''), 3000);
      },
      error: (err) => {
        this.saving.set(false);
        this.isError.set(true);
        this.message.set(err.error?.message ?? 'Failed to save team');
        setTimeout(() => this.message.set(''), 3000);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/heroes']);
  }
}
