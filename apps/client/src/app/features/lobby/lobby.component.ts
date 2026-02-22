import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="lobby-container">
      <header class="lobby-header">
        <h1>Hero Wars</h1>
        <div class="player-info">
          @if (authService.player(); as player) {
            <span class="player-name">{{ player.username }}</span>
            <span class="player-level">Lv.{{ player.level }}</span>
            <div class="resources">
              <span class="gold">{{ player.gold }} Gold</span>
              <span class="gems">{{ player.gems }} Gems</span>
              <span class="energy">{{ player.energy }}/{{ player.maxEnergy }} Energy</span>
            </div>
          }
          <button class="logout-btn" (click)="authService.logout()">Logout</button>
        </div>
      </header>

      <main class="lobby-content">
        <div class="menu-grid">
          <div class="menu-card disabled">
            <h3>Campaign</h3>
            <p>Coming in Sprint 2</p>
          </div>
          <div class="menu-card" routerLink="/heroes">
            <h3>Heroes</h3>
            <p>Manage your hero collection</p>
          </div>
          <div class="menu-card" routerLink="/battle/1-1">
            <h3>Battle</h3>
            <p>Enter the battlefield</p>
          </div>
          <div class="menu-card disabled">
            <h3>Shop</h3>
            <p>Coming in Sprint 4</p>
          </div>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .lobby-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    }
    .lobby-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 2rem;
      background: rgba(15, 52, 96, 0.8);
      border-bottom: 2px solid #e94560;
    }
    .lobby-header h1 {
      color: #e94560;
      font-size: 1.5rem;
    }
    .player-info {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .player-name { color: #fff; font-weight: bold; }
    .player-level {
      background: #e94560;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
    }
    .resources {
      display: flex;
      gap: 0.75rem;
      font-size: 0.875rem;
    }
    .gold { color: #ffd700; }
    .gems { color: #00d4ff; }
    .energy { color: #7fff00; }
    .logout-btn {
      padding: 0.5rem 1rem;
      background: transparent;
      color: #e94560;
      border: 1px solid #e94560;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .logout-btn:hover {
      background: #e94560;
      color: white;
    }
    .lobby-content {
      padding: 2rem;
      max-width: 800px;
      margin: 0 auto;
    }
    .menu-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }
    .menu-card {
      background: #0f3460;
      padding: 2rem;
      border-radius: 12px;
      text-align: center;
      border: 2px solid transparent;
      transition: all 0.2s;
    }
    .menu-card:not(.disabled) {
      cursor: pointer;
    }
    .menu-card:not(.disabled):hover {
      border-color: #e94560;
      transform: translateY(-2px);
    }
    .menu-card:not(.disabled) p {
      color: #aaa;
    }
    .menu-card.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .menu-card h3 {
      color: #e94560;
      margin-bottom: 0.5rem;
      font-size: 1.25rem;
    }
    .menu-card p {
      color: #888;
      font-size: 0.875rem;
    }
  `],
})
export class LobbyComponent {
  constructor(public authService: AuthService) {}
}
