import { Injectable, signal } from '@angular/core';
import { Observable, tap, finalize } from 'rxjs';
import { ApiService } from './api.service';
import {
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardType,
} from '@hero-wars/shared';

@Injectable({ providedIn: 'root' })
export class LeaderboardService {
  readonly entries = signal<LeaderboardEntry[]>([]);
  readonly playerRank = signal<LeaderboardEntry | null>(null);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly activeType = signal<LeaderboardType>('power');

  constructor(private api: ApiService) {}

  loadLeaderboard(
    type: LeaderboardType,
    offset = 0,
    limit = 50,
  ): Observable<LeaderboardResponse> {
    this.loading.set(true);
    this.activeType.set(type);
    return this.api
      .get<LeaderboardResponse>(`/leaderboard/${type}?offset=${offset}&limit=${limit}`)
      .pipe(
        tap((res) => {
          this.entries.set(res.leaderboard);
          this.playerRank.set(res.playerRank);
          this.total.set(res.total);
        }),
        finalize(() => this.loading.set(false)),
      );
  }
}
