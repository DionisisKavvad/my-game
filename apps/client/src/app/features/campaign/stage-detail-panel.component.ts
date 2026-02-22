import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CampaignStageResponse } from '@hero-wars/shared';

@Component({
  selector: 'app-stage-detail-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="panel-backdrop" (click)="close.emit()"></div>
    <div class="panel">
      <button class="close-btn" (click)="close.emit()">&times;</button>
      <h2>{{ stage.name }}</h2>
      <p class="chapter-label">Chapter {{ stage.chapter }} - Stage {{ stage.stage }}</p>

      <div class="stars-display">
        @for (s of [1, 2, 3]; track s) {
          <span class="star" [class.filled]="s <= stage.stars">&#9733;</span>
        }
      </div>

      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Difficulty</span>
          <span class="info-value">{{ stage.difficulty }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Energy Cost</span>
          <span class="info-value" [class.insufficient]="currentEnergy < stage.energyCost">
            {{ stage.energyCost }}
          </span>
        </div>
        <div class="info-item">
          <span class="info-label">Enemies</span>
          <span class="info-value">{{ stage.enemyTeam.length }}</span>
        </div>
      </div>

      <div class="rewards-section">
        <h3>Rewards</h3>
        <div class="rewards-list">
          <span class="reward gold">{{ stage.rewards.gold }} Gold</span>
          <span class="reward xp">{{ stage.rewards.xp }} XP</span>
          @if (stage.rewards.heroShards) {
            <span class="reward shards">{{ stage.rewards.heroShards.count }} Shards ({{ stage.rewards.heroShards.templateId }})</span>
          }
        </div>
      </div>

      <button
        class="start-btn"
        [disabled]="currentEnergy < stage.energyCost"
        (click)="startBattle.emit(stage.id)">
        @if (currentEnergy < stage.energyCost) {
          Not Enough Energy
        } @else {
          Start Battle
        }
      </button>
    </div>
  `,
  styles: [`
    .panel-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 100;
    }
    .panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #0f3460;
      border: 2px solid #e94560;
      border-radius: 16px;
      padding: 2rem;
      z-index: 101;
      width: 90%;
      max-width: 420px;
      color: #fff;
    }
    .close-btn {
      position: absolute;
      top: 0.75rem;
      right: 1rem;
      background: none;
      border: none;
      color: #888;
      font-size: 1.5rem;
      cursor: pointer;
    }
    .close-btn:hover { color: #e94560; }
    h2 {
      color: #e94560;
      margin-bottom: 0.25rem;
      font-size: 1.25rem;
    }
    .chapter-label {
      color: #888;
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }
    .stars-display {
      margin-bottom: 1rem;
      font-size: 1.5rem;
    }
    .star { color: #444; }
    .star.filled { color: #ffd700; }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    .info-item {
      text-align: center;
    }
    .info-label {
      display: block;
      color: #888;
      font-size: 0.75rem;
      margin-bottom: 0.25rem;
    }
    .info-value {
      font-weight: bold;
      font-size: 1rem;
    }
    .info-value.insufficient { color: #e94560; }
    .rewards-section {
      margin-bottom: 1.5rem;
    }
    .rewards-section h3 {
      color: #aaa;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
    }
    .rewards-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .reward {
      padding: 0.25rem 0.75rem;
      border-radius: 6px;
      font-size: 0.85rem;
      background: rgba(255,255,255,0.05);
    }
    .reward.gold { color: #ffd700; }
    .reward.xp { color: #7fff00; }
    .reward.shards { color: #be4bdb; }
    .start-btn {
      width: 100%;
      padding: 0.85rem;
      background: #e94560;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .start-btn:hover:not(:disabled) { opacity: 0.85; }
    .start-btn:disabled {
      background: #444;
      cursor: not-allowed;
    }
  `],
})
export class StageDetailPanelComponent {
  @Input({ required: true }) stage!: CampaignStageResponse;
  @Input({ required: true }) currentEnergy!: number;
  @Output() startBattle = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();
}
