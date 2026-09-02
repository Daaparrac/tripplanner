import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    return true;
  }

  // Si no está logueado, abre el modal de login y redirige a itinerary (o se queda donde está pero bloqueado)
  authService.openLoginModal();
  
  // Puedes redirigir a una página de "landing" o simplemente bloquear la navegación.
  // Como actualmente /itinerary y /map están protegidos, no tenemos landing pública.
  // Retornamos false para bloquear la ruta actual hasta que se loguee.
  return false;
};
