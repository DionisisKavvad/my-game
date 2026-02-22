import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, BehaviorSubject, switchMap, filter, take } from 'rxjs';
import { ApiService } from './api.service';

interface AuthResponse {
  accessToken: string;
  player: PlayerData;
}

interface PlayerData {
  id: string;
  username: string;
  email: string;
  level: number;
  xp: number;
  gold: number;
  gems: number;
  energy: number;
  maxEnergy: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'hw_access_token';

  private isRefreshing = false;
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);

  readonly player = signal<PlayerData | null>(null);
  readonly isAuthenticated = computed(() => !!this.player() && !!this.getToken());

  constructor(
    private api: ApiService,
    private router: Router,
  ) {
    // Restore player data if token exists
    if (this.getToken()) {
      this.loadProfile();
    }
  }

  register(username: string, email: string, password: string): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('/auth/register', { username, email, password }).pipe(
      tap((res) => this.handleAuthResponse(res)),
    );
  }

  login(username: string, password: string): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('/auth/login', { username, password }).pipe(
      tap((res) => this.handleAuthResponse(res)),
    );
  }

  logout(): void {
    this.api.post('/auth/logout', {}).subscribe({ error: () => {} });
    this.clearTokens();
    this.player.set(null);
    this.router.navigate(['/login']);
  }

  refreshToken(): Observable<AuthResponse> {
    if (this.isRefreshing) {
      return this.refreshTokenSubject.pipe(
        filter((token) => token !== null),
        take(1),
        switchMap(() => this.api.get<AuthResponse>('/players/me') as Observable<AuthResponse>),
      );
    }

    this.isRefreshing = true;
    this.refreshTokenSubject.next(null);

    // Refresh token is sent automatically via HttpOnly cookie
    return this.api.post<AuthResponse>('/auth/refresh', {}).pipe(
      tap((res) => {
        this.isRefreshing = false;
        this.storeAccessToken(res.accessToken);
        this.refreshTokenSubject.next(res.accessToken);
      }),
      catchError((err) => {
        this.isRefreshing = false;
        this.logout();
        return throwError(() => err);
      }),
    );
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private handleAuthResponse(res: AuthResponse): void {
    this.storeAccessToken(res.accessToken);
    this.player.set(res.player);
  }

  private storeAccessToken(accessToken: string): void {
    localStorage.setItem(this.TOKEN_KEY, accessToken);
  }

  private clearTokens(): void {
    localStorage.removeItem(this.TOKEN_KEY);
  }

  private loadProfile(): void {
    this.api.get<PlayerData>('/players/me').subscribe({
      next: (player) => this.player.set(player),
      error: () => this.clearTokens(),
    });
  }
}
