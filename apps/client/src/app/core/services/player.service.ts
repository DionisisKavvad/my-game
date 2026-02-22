import { Injectable, signal } from '@angular/core';
import { Observable, tap, finalize } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { PlayerProfileResponse } from '@hero-wars/shared';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  readonly profile = signal<PlayerProfileResponse | null>(null);
  readonly loading = signal(false);

  constructor(
    private api: ApiService,
    private authService: AuthService,
  ) {}

  loadProfile(): Observable<PlayerProfileResponse> {
    this.loading.set(true);
    return this.api.get<PlayerProfileResponse>('/players/me').pipe(
      tap((profile) => {
        this.profile.set(profile);
        // Update AuthService player data to keep in sync
        this.authService.player.set({
          id: profile.id,
          username: profile.username,
          email: '',
          level: profile.level,
          xp: profile.xp,
          gold: profile.gold,
          gems: profile.gems,
          energy: profile.energy,
          maxEnergy: profile.maxEnergy,
        });
      }),
      finalize(() => this.loading.set(false)),
    );
  }
}
