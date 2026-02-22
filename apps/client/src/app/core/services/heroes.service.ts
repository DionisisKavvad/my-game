import { Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import {
  HeroTemplateResponse,
  PlayerHeroResponse,
  UpgradeResult,
  TeamResponse,
} from '@hero-wars/shared';

@Injectable({ providedIn: 'root' })
export class HeroesService {
  readonly heroes = signal<PlayerHeroResponse[]>([]);
  readonly templates = signal<HeroTemplateResponse[]>([]);
  readonly team = signal<PlayerHeroResponse[]>([]);

  constructor(private api: ApiService) {}

  loadTemplates(): Observable<HeroTemplateResponse[]> {
    return this.api.get<HeroTemplateResponse[]>('/heroes/templates').pipe(
      tap((templates) => this.templates.set(templates)),
    );
  }

  loadMyHeroes(): Observable<PlayerHeroResponse[]> {
    return this.api.get<PlayerHeroResponse[]>('/heroes').pipe(
      tap((heroes) => this.heroes.set(heroes)),
    );
  }

  loadTeam(): Observable<TeamResponse> {
    return this.api.get<TeamResponse>('/heroes/team').pipe(
      tap((res) => this.team.set(res.heroes)),
    );
  }

  getHeroDetail(heroId: string): Observable<PlayerHeroResponse> {
    return this.api.get<PlayerHeroResponse>(`/heroes/${heroId}`);
  }

  upgradeHero(heroId: string, type: 'level' | 'star'): Observable<UpgradeResult> {
    return this.api.post<UpgradeResult>(`/heroes/${heroId}/upgrade`, { type });
  }

  updateTeam(heroPositions: { heroId: string; position: number }[]): Observable<TeamResponse> {
    return this.api.put<TeamResponse>('/heroes/team', { heroPositions }).pipe(
      tap((res) => this.team.set(res.heroes)),
    );
  }
}
