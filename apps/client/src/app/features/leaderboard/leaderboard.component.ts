import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LeaderboardService } from '../../core/services/leaderboard.service';
import { AuthService } from '../../core/services/auth.service';
import { LeaderboardType } from '@hero-wars/shared';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="leaderboard-container">
      <header class="leaderboard-header">
        <button class="back-btn" routerLink="/lobby">Back</button>
        <h2>Leaderboard</h2>
      </header>

      <div class="tabs">
        <button
          [class.active]="leaderboardService.activeType() === 'power'"
          (click)="switchTab('power')"
        >
          Power
        </button>
        <button
          [class.active]="leaderboardService.activeType() === 'campaign'"
          (click)="switchTab('campaign')"
        >
          Campaign
        </button>
        <button
          [class.active]="leaderboardService.activeType() === 'battles'"
          (click)="switchTab('battles')"
        >
          Battles
        </button>
      </div>

      @if (leaderboardService.loading()) {
        <div class="loading">Loading leaderboard...</div>
      }

      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Level</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          @for (entry of leaderboardService.entries(); track entry.playerId) {
            <tr [class.self]="entry.playerId === currentPlayerId()">
              <td class="rank">{{ entry.rank }}</td>
              <td>{{ entry.username }}</td>
              <td>{{ entry.level }}</td>
              <td class="score">{{ entry.score }}</td>
            </tr>
          }
        </tbody>
      </table>

      @if (leaderboardService.playerRank(); as myRank) {
        <div class="my-rank">
          Your Rank: #{{ myRank.rank }} (Score: {{ myRank.score }})
        </div>
      } @else if (!leaderboardService.loading()) {
        <div class="my-rank not-ranked">Not yet ranked</div>
      }
    </div>
  `,
  styles: [`
    .leaderboard-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      padding: 1rem 2rem;
    }
    .leaderboard-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .leaderboard-header h2 {
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
    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      max-width: 700px;
      margin-left: auto;
      margin-right: auto;
    }
    .tabs button {
      flex: 1;
      padding: 0.75rem;
      background: #0f3460;
      color: #aaa;
      border: 2px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: bold;
      transition: all 0.2s;
    }
    .tabs button.active {
      color: #e94560;
      border-color: #e94560;
    }
    .tabs button:hover {
      color: #fff;
    }
    .loading {
      color: #aaa;
      text-align: center;
      padding: 2rem;
    }
    .leaderboard-table {
      width: 100%;
      max-width: 700px;
      margin: 0 auto;
      border-collapse: collapse;
    }
    .leaderboard-table thead th {
      color: #e94560;
      padding: 0.75rem;
      text-align: left;
      border-bottom: 2px solid #e94560;
      font-size: 0.875rem;
    }
    .leaderboard-table tbody tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      transition: background 0.2s;
    }
    .leaderboard-table tbody tr:hover {
      background: rgba(15, 52, 96, 0.5);
    }
    .leaderboard-table tbody tr.self {
      background: rgba(233, 69, 96, 0.15);
      border-left: 3px solid #e94560;
    }
    .leaderboard-table td {
      color: #fff;
      padding: 0.75rem;
      font-size: 0.875rem;
    }
    .rank {
      font-weight: bold;
      color: #ffd700;
    }
    .score {
      font-weight: bold;
      color: #7fff00;
    }
    .my-rank {
      max-width: 700px;
      margin: 1.5rem auto 0;
      padding: 1rem;
      background: #0f3460;
      border-radius: 8px;
      color: #e94560;
      font-weight: bold;
      text-align: center;
      border: 2px solid #e94560;
    }
    .my-rank.not-ranked {
      color: #aaa;
      border-color: #aaa;
    }
  `],
})
export class LeaderboardComponent implements OnInit {
  readonly currentPlayerId = signal('');

  constructor(
    public leaderboardService: LeaderboardService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    const player = this.authService.player();
    if (player) {
      this.currentPlayerId.set(player.id);
    }
    this.leaderboardService.loadLeaderboard('power').subscribe();
  }

  switchTab(type: LeaderboardType): void {
    this.leaderboardService.loadLeaderboard(type).subscribe();
  }
}
