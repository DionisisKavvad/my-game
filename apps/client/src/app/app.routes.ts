import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'lobby',
    loadComponent: () =>
      import('./features/lobby/lobby.component').then((m) => m.LobbyComponent),
    canActivate: [authGuard],
  },
  {
    path: 'heroes',
    loadComponent: () =>
      import('./features/heroes/heroes-list.component').then((m) => m.HeroesListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'heroes/team',
    loadComponent: () =>
      import('./features/heroes/team-builder.component').then((m) => m.TeamBuilderComponent),
    canActivate: [authGuard],
  },
  {
    path: 'heroes/:id',
    loadComponent: () =>
      import('./features/heroes/hero-detail.component').then((m) => m.HeroDetailComponent),
    canActivate: [authGuard],
  },
  {
    path: 'campaign',
    loadComponent: () =>
      import('./features/campaign/campaign-map.component').then(
        (m) => m.CampaignMapComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'battle/:stageId',
    loadComponent: () =>
      import('./features/battle/battle.component').then((m) => m.BattleComponent),
    canActivate: [authGuard],
  },
  {
    path: 'quests',
    loadComponent: () =>
      import('./features/quests/quests.component').then((m) => m.QuestsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'leaderboard',
    loadComponent: () =>
      import('./features/leaderboard/leaderboard.component').then(
        (m) => m.LeaderboardComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./features/profile/profile.component').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: '',
    redirectTo: 'lobby',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'lobby',
  },
];
