import { Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { CampaignStageResponse } from '@hero-wars/shared';

@Injectable({ providedIn: 'root' })
export class CampaignService {
  readonly stages = signal<CampaignStageResponse[]>([]);
  readonly loading = signal(false);

  constructor(private api: ApiService) {}

  loadStages(): Observable<CampaignStageResponse[]> {
    this.loading.set(true);
    return this.api.get<CampaignStageResponse[]>('/campaign/stages').pipe(
      tap((stages) => {
        this.stages.set(stages);
        this.loading.set(false);
      }),
    );
  }
}
