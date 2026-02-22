import { Component, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PlayerService } from '../../core/services/player.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, DecimalPipe],
  template: `
    <div class="profile-container">
      <header class="profile-header-bar">
        <button class="back-btn" routerLink="/lobby">Back</button>
        <h2>Player Profile</h2>
      </header>

      @if (playerService.loading()) {
        <div class="loading">Loading profile...</div>
      }

      @if (playerService.profile(); as p) {
        <div class="profile-card">
          <div class="profile-top">
            <div class="avatar">{{ p.username[0].toUpperCase() }}</div>
            <div class="profile-identity">
              <h3>{{ p.username }}</h3>
              <span class="level-badge">Level {{ p.level }}</span>
            </div>
          </div>
          <div class="xp-bar">
            <div class="fill" [style.width.%]="(p.xp / p.xpToNextLevel) * 100"></div>
            <span class="xp-text">{{ p.xp }}/{{ p.xpToNextLevel }} XP</span>
          </div>
          <div class="resources">
            <div class="resource">
              <span class="value gold">{{ p.gold }}</span>
              <span class="label">Gold</span>
            </div>
            <div class="resource">
              <span class="value gems">{{ p.gems }}</span>
              <span class="label">Gems</span>
            </div>
            <div class="resource">
              <span class="value energy">{{ p.energy }}/{{ p.maxEnergy }}</span>
              <span class="label">Energy</span>
            </div>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-value">{{ p.stats.powerScore }}</span>
            <span class="stat-label">Power</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ p.stats.totalBattles }}</span>
            <span class="stat-label">Battles</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ p.stats.winRate | number:'1.0-0' }}%</span>
            <span class="stat-label">Win Rate</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ p.stats.campaignStarsTotal }}</span>
            <span class="stat-label">Campaign Stars</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ p.stats.totalHeroes }}</span>
            <span class="stat-label">Heroes</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ p.stats.totalQuestsClaimed }}</span>
            <span class="stat-label">Quests Done</span>
          </div>
        </div>

        <div class="account-info">
          Playing since {{ p.createdAt | date:'mediumDate' }}
        </div>
      }
    </div>
  `,
  styles: [`
    .profile-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      padding: 1rem 2rem;
    }
    .profile-header-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .profile-header-bar h2 {
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
    .profile-card {
      max-width: 500px;
      margin: 0 auto 2rem;
      background: #0f3460;
      border-radius: 12px;
      padding: 1.5rem;
    }
    .profile-top {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .avatar {
      width: 60px;
      height: 60px;
      background: #e94560;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 1.5rem;
      font-weight: bold;
    }
    .profile-identity h3 {
      color: #fff;
      font-size: 1.25rem;
      margin-bottom: 0.25rem;
    }
    .level-badge {
      background: #e94560;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
    }
    .xp-bar {
      position: relative;
      background: #1a1a2e;
      border-radius: 8px;
      height: 20px;
      overflow: hidden;
      margin-bottom: 1rem;
    }
    .xp-bar .fill {
      background: linear-gradient(90deg, #0f3460, #e94560);
      height: 100%;
      border-radius: 8px;
      transition: width 0.3s;
      max-width: 100%;
    }
    .xp-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #fff;
      font-size: 0.75rem;
      font-weight: bold;
    }
    .resources {
      display: flex;
      justify-content: space-around;
    }
    .resource {
      text-align: center;
    }
    .resource .value {
      display: block;
      font-size: 1.1rem;
      font-weight: bold;
    }
    .resource .label {
      color: #aaa;
      font-size: 0.75rem;
    }
    .gold { color: #ffd700; }
    .gems { color: #00d4ff; }
    .energy { color: #7fff00; }
    .stats-grid {
      max-width: 500px;
      margin: 0 auto 2rem;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }
    .stat-card {
      background: #0f3460;
      border-radius: 12px;
      padding: 1rem;
      text-align: center;
    }
    .stat-value {
      display: block;
      color: #e94560;
      font-size: 1.25rem;
      font-weight: bold;
      margin-bottom: 0.25rem;
    }
    .stat-label {
      color: #aaa;
      font-size: 0.75rem;
    }
    .account-info {
      text-align: center;
      color: #666;
      font-size: 0.8rem;
    }
  `],
})
export class ProfileComponent implements OnInit {
  constructor(public playerService: PlayerService) {}

  ngOnInit(): void {
    this.playerService.loadProfile().subscribe();
  }
}
