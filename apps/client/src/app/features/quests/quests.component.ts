import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { QuestsService } from '../../core/services/quests.service';

@Component({
  selector: 'app-quests',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="quests-container">
      <header class="quests-header">
        <button class="back-btn" routerLink="/lobby">Back</button>
        <h2>Daily Quests</h2>
      </header>

      @if (questsService.loading()) {
        <div class="loading">Loading quests...</div>
      }

      <div class="quests-list">
        @for (quest of questsService.quests(); track quest.questId) {
          <div
            class="quest-card"
            [class.completed]="quest.completed && !quest.claimed"
            [class.claimed]="quest.claimed"
          >
            <div class="quest-info">
              <h3>{{ quest.name }}</h3>
              <p>{{ quest.description }}</p>
              <div class="progress-bar">
                <div
                  class="fill"
                  [style.width.%]="(quest.progress / quest.target) * 100"
                ></div>
                <span class="progress-text">{{ quest.progress }}/{{ quest.target }}</span>
              </div>
            </div>
            <div class="quest-rewards">
              <span class="gold">{{ quest.rewardGold }} Gold</span>
              <span class="xp">{{ quest.rewardXp }} XP</span>
              <span class="gems">{{ quest.rewardGems }} Gems</span>
            </div>
            <div class="quest-actions">
              @if (quest.completed && !quest.claimed) {
                <button class="claim-btn" (click)="claim(quest.questId)">Claim</button>
              }
              @if (quest.claimed) {
                <span class="claimed-badge">Claimed</span>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .quests-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      padding: 1rem 2rem;
    }
    .quests-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .quests-header h2 {
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
    .loading {
      color: #aaa;
      text-align: center;
      padding: 2rem;
    }
    .quests-list {
      max-width: 700px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .quest-card {
      background: #0f3460;
      border-radius: 12px;
      padding: 1.25rem;
      border: 2px solid transparent;
      display: flex;
      align-items: center;
      gap: 1rem;
      transition: border-color 0.2s;
    }
    .quest-card.completed {
      border-color: #7fff00;
    }
    .quest-card.claimed {
      opacity: 0.6;
      border-color: #ffd700;
    }
    .quest-info {
      flex: 1;
    }
    .quest-info h3 {
      color: #fff;
      margin-bottom: 0.25rem;
      font-size: 1rem;
    }
    .quest-info p {
      color: #aaa;
      font-size: 0.8rem;
      margin-bottom: 0.5rem;
    }
    .progress-bar {
      position: relative;
      background: #1a1a2e;
      border-radius: 8px;
      height: 20px;
      overflow: hidden;
    }
    .progress-bar .fill {
      background: linear-gradient(90deg, #0f3460, #e94560);
      height: 100%;
      border-radius: 8px;
      transition: width 0.3s;
      max-width: 100%;
    }
    .quest-card.completed .progress-bar .fill {
      background: linear-gradient(90deg, #0f3460, #7fff00);
    }
    .progress-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #fff;
      font-size: 0.75rem;
      font-weight: bold;
    }
    .quest-rewards {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.75rem;
      min-width: 80px;
      text-align: right;
    }
    .quest-rewards .gold { color: #ffd700; }
    .quest-rewards .xp { color: #7fff00; }
    .quest-rewards .gems { color: #00d4ff; }
    .quest-actions {
      min-width: 80px;
      text-align: center;
    }
    .claim-btn {
      padding: 0.5rem 1rem;
      background: #7fff00;
      color: #1a1a2e;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.2s;
    }
    .claim-btn:hover {
      background: #6cd900;
      transform: scale(1.05);
    }
    .claimed-badge {
      color: #ffd700;
      font-weight: bold;
      font-size: 0.875rem;
    }
  `],
})
export class QuestsComponent implements OnInit {
  constructor(public questsService: QuestsService) {}

  ngOnInit(): void {
    if (this.questsService.quests().length === 0) {
      this.questsService.loadQuests().subscribe();
    }
  }

  claim(questId: string): void {
    this.questsService.claimQuest(questId).subscribe();
  }
}
