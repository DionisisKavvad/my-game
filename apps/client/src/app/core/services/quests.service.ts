import { Injectable, signal } from '@angular/core';
import { Observable, tap, finalize } from 'rxjs';
import { ApiService } from './api.service';
import { DailyQuestResponse } from '@hero-wars/shared';

@Injectable({ providedIn: 'root' })
export class QuestsService {
  readonly quests = signal<DailyQuestResponse[]>([]);
  readonly loading = signal(false);

  constructor(private api: ApiService) {}

  loadQuests(): Observable<DailyQuestResponse[]> {
    this.loading.set(true);
    return this.api.get<DailyQuestResponse[]>('/quests').pipe(
      tap((quests) => this.quests.set(quests)),
      finalize(() => this.loading.set(false)),
    );
  }

  claimQuest(questId: string): Observable<{ questId: string; rewards: { gold: number; xp: number; gems: number } }> {
    return this.api.post<{ questId: string; rewards: { gold: number; xp: number; gems: number } }>(`/quests/${questId}/claim`, {}).pipe(
      tap(() => {
        this.quests.update((quests) =>
          quests.map((q) => (q.questId === questId ? { ...q, claimed: true } : q)),
        );
      }),
    );
  }
}
