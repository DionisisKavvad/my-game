import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CampaignService } from '../../core/services/campaign.service';
import { AuthService } from '../../core/services/auth.service';
import { StageDetailPanelComponent } from './stage-detail-panel.component';
import { CampaignStageResponse } from '@hero-wars/shared';

@Component({
  selector: 'app-campaign-map',
  standalone: true,
  imports: [CommonModule, StageDetailPanelComponent],
  template: `
    <div class="campaign-container">
      <header class="campaign-header">
        <button class="back-btn" (click)="goBack()">Back</button>
        <h1>Campaign</h1>
        <div class="energy-display">
          @if (authService.player(); as player) {
            <span class="energy">{{ player.energy }}/{{ player.maxEnergy }} Energy</span>
          }
        </div>
      </header>

      @if (campaignService.loading()) {
        <div class="loading">Loading stages...</div>
      } @else {
        <div class="chapters-list">
          @for (chapter of chapters(); track chapter.number) {
            <div class="chapter-card">
              <h2 class="chapter-title">Chapter {{ chapter.number }}</h2>
              <div class="stages-row">
                @for (stage of chapter.stages; track stage.id; let i = $index) {
                  @if (i > 0) {
                    <div class="connector" [class.completed]="chapter.stages[i - 1].completed"></div>
                  }
                  <div
                    class="stage-node"
                    [class.completed]="stage.completed"
                    [class.locked]="!stage.unlocked"
                    [class.stars-1]="stage.stars === 1"
                    [class.stars-2]="stage.stars === 2"
                    [class.stars-3]="stage.stars === 3"
                    (click)="selectStage(stage)">
                    @if (!stage.unlocked) {
                      <span class="lock-icon">&#128274;</span>
                    } @else {
                      <span class="stage-num">{{ stage.stage }}</span>
                    }
                    <div class="stage-stars">
                      @for (s of [1, 2, 3]; track s) {
                        <span class="star" [class.filled]="s <= stage.stars">&#9733;</span>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }

      @if (selectedStage(); as stage) {
        <app-stage-detail-panel
          [stage]="stage"
          [currentEnergy]="currentEnergy()"
          (startBattle)="onStartBattle($event)"
          (close)="selectedStage.set(null)" />
      }
    </div>
  `,
  styles: [`
    .campaign-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
    }
    .campaign-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 2rem;
      background: rgba(15, 52, 96, 0.8);
      border-bottom: 2px solid #e94560;
    }
    .campaign-header h1 {
      color: #e94560;
      font-size: 1.5rem;
      flex: 1;
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
    .energy-display .energy {
      color: #7fff00;
      font-size: 0.875rem;
    }
    .loading {
      text-align: center;
      padding: 4rem;
      color: #888;
      font-size: 1.25rem;
    }
    .chapters-list {
      padding: 2rem;
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .chapter-card {
      background: #0f3460;
      border-radius: 12px;
      padding: 1.5rem;
    }
    .chapter-title {
      color: #e94560;
      font-size: 1rem;
      margin-bottom: 1rem;
    }
    .stages-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
    }
    .connector {
      width: 3rem;
      height: 3px;
      background: #333;
    }
    .connector.completed {
      background: #e94560;
    }
    .stage-node {
      width: 4.5rem;
      height: 4.5rem;
      border-radius: 50%;
      background: #1a1a2e;
      border: 3px solid #333;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .stage-node:not(.locked):hover {
      border-color: #e94560;
      transform: scale(1.1);
    }
    .stage-node.locked {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .stage-node.completed {
      border-color: #e94560;
    }
    .stage-node.stars-3 {
      border-color: #ffd700;
    }
    .stage-num {
      font-size: 1.25rem;
      font-weight: bold;
    }
    .lock-icon {
      font-size: 1rem;
    }
    .stage-stars {
      display: flex;
      gap: 1px;
      font-size: 0.6rem;
      margin-top: 2px;
    }
    .star { color: #333; }
    .star.filled { color: #ffd700; }
  `],
})
export class CampaignMapComponent implements OnInit {
  readonly selectedStage = signal<CampaignStageResponse | null>(null);

  readonly chapters = computed(() => {
    const stages = this.campaignService.stages();
    const map = new Map<number, CampaignStageResponse[]>();
    for (const stage of stages) {
      const list = map.get(stage.chapter) ?? [];
      list.push(stage);
      map.set(stage.chapter, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([number, stagesInChapter]) => ({ number, stages: stagesInChapter }));
  });

  readonly currentEnergy = computed(() => {
    return this.authService.player()?.energy ?? 0;
  });

  constructor(
    public campaignService: CampaignService,
    public authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.campaignService.loadStages().subscribe();
  }

  selectStage(stage: CampaignStageResponse): void {
    if (!stage.unlocked) return;
    this.selectedStage.set(stage);
  }

  onStartBattle(stageId: string): void {
    this.router.navigate(['/battle', stageId]);
  }

  goBack(): void {
    this.router.navigate(['/lobby']);
  }
}
