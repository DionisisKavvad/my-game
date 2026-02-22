import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.authReady;

  if (authService.getToken()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};
