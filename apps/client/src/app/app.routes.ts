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
    path: '',
    redirectTo: 'lobby',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'lobby',
  },
];
