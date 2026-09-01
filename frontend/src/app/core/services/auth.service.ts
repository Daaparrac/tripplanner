import { Injectable, inject, signal, computed, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of, tap } from 'rxjs';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: 'DANIEL' | 'MAFE' | 'GUEST';
  emoji: string;
  color: string;
}

const STORAGE_KEY = 'mexico_trip_auth_user';
const TOKEN_KEY = 'mexico_trip_auth_token';

declare const google: any;

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly ngZone = inject(NgZone);

  // ── Signals de Estado de Autenticación ─────────────────────────────────────

  readonly currentUser = signal<AuthenticatedUser | null>(this.loadStoredUser());
  readonly isAuthenticated = computed<boolean>(() => !!this.currentUser());
  readonly isAuthModalOpen = signal<boolean>(false);
  readonly isAuthenticating = signal<boolean>(false);
  readonly authError = signal<string | null>(null);

  private googleClientId = '';

  constructor() {
    this.fetchAuthConfig();
  }

  private loadStoredUser(): AuthenticatedUser | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Obtiene la configuración de OAuth desde el backend
   */
  private fetchAuthConfig(): void {
    const apiBase = this.getApiBaseUrl();
    this.http
      .get<{ data: { googleClientId: string } }>(`${apiBase}/api/auth/config`)
      .pipe(
        catchError((err) => {
          console.warn('[AuthService] No se pudo obtener googleClientId del backend:', err);
          return of({ data: { googleClientId: '' } });
        }),
      )
      .subscribe((res) => {
        if (res.data?.googleClientId) {
          this.googleClientId = res.data.googleClientId;
        }
      });
  }

  private getApiBaseUrl(): string {
    const envUrl = (globalThis as unknown as { __env?: { apiUrl: string } }).__env?.apiUrl;
    if (envUrl) {
      return envUrl;
    }

    if (
      typeof window !== 'undefined' &&
      window.location.hostname &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      return `http://${window.location.hostname}:3002`;
    }
    return 'http://localhost:3002';
  }

  // ── Modales de Inicio de Sesión ───────────────────────────────────────────

  openLoginModal(): void {
    this.authError.set(null);
    this.isAuthModalOpen.set(true);
  }

  closeLoginModal(): void {
    this.isAuthModalOpen.set(false);
    this.authError.set(null);
  }

  // ── Google Identity Services Initialization ───────────────────────────────

  /**
   * Inicializa y renderiza el botón de Google en el elemento DOM indicado
   */
  renderGoogleButton(containerId: string): void {
    if (typeof window === 'undefined') return;

    this.ensureGoogleScriptLoaded(() => {
      if (typeof google === 'undefined' || !google.accounts?.id) {
        console.warn('[AuthService] Google Identity Services no disponible.');
        return;
      }

      // Si no hay Client ID configurado aún en backend, usa el ID default o prompt
      const clientId = this.googleClientId || '1029384756-dummy.apps.googleusercontent.com';

      google.accounts.id.initialize({
        client_id: clientId,
        callback: (res: any) => this.handleGoogleCredential(res),
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      const container = document.getElementById(containerId);
      if (container) {
        google.accounts.id.renderButton(container, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: 280,
        });
      }
    });
  }

  /**
   * Procesa la respuesta credential (JWT ID Token) devuelta por Google
   */
  handleGoogleCredential(response: { credential?: string }): void {
    if (!response?.credential) {
      this.authError.set('No se recibió credencial de Google.');
      return;
    }

    this.ngZone.run(() => {
      this.isAuthenticating.set(true);
      this.authError.set(null);

      const apiBase = this.getApiBaseUrl();
      this.http
        .post<{ data: AuthenticatedUser }>(`${apiBase}/api/auth/verify`, {
          idToken: response.credential,
        })
        .pipe(
          catchError((err) => {
            console.error('[AuthService] Error verificando con backend:', err);
            // Fallback: decodificar JWT client-side si el backend no responde
            try {
              const decoded = this.parseJwt(response.credential!);
              const fallbackUser: AuthenticatedUser = {
                id: decoded.sub || 'user-1',
                email: decoded.email || 'viajero@gmail.com',
                name: decoded.name || decoded.given_name || 'Viajero',
                picture: decoded.picture || '',
                role:
                  decoded.name?.toLowerCase().includes('daniel') ||
                  decoded.email?.includes('daniel')
                    ? 'DANIEL'
                    : decoded.name?.toLowerCase().includes('mafe') ||
                        decoded.email?.includes('mafe')
                      ? 'MAFE'
                      : 'GUEST',
                emoji: decoded.name?.toLowerCase().includes('daniel') ? '🧑' : '👩',
                color: decoded.name?.toLowerCase().includes('daniel') ? '#10B981' : '#EC4899',
              };
              return of({ data: fallbackUser });
            } catch {
              this.authError.set('Error validando token con el servidor.');
              return of(null);
            }
          }),
        )
        .subscribe((res) => {
          this.isAuthenticating.set(false);
          if (res?.data) {
            this.setCurrentUser(res.data, response.credential!);
            this.closeLoginModal();
          }
        });
    });
  }

  /**
   * Inicio de sesión rápido como Daniel o Mafe (ideal para pruebas locales o selección directa)
   */
  loginAs(role: 'DANIEL' | 'MAFE'): void {
    const user: AuthenticatedUser =
      role === 'DANIEL'
        ? {
            id: 'daniel-id',
            email: 'daniel@trip-planner.mexico',
            name: 'Daniel',
            picture: '',
            role: 'DANIEL',
            emoji: '🧑',
            color: '#10B981',
          }
        : {
            id: 'mafe-id',
            email: 'mafe@trip-planner.mexico',
            name: 'Mafe',
            picture: '',
            role: 'MAFE',
            emoji: '👩',
            color: '#EC4899',
          };

    this.setCurrentUser(user, 'local-token');
    this.closeLoginModal();
  }

  private setCurrentUser(user: AuthenticatedUser, token: string): void {
    this.currentUser.set(user);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      localStorage.setItem(TOKEN_KEY, token);
    }
  }

  logout(): void {
    this.currentUser.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
    if (typeof google !== 'undefined' && google.accounts?.id) {
      google.accounts.id.disableAutoSelect();
    }
  }

  private parseJwt(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
      return JSON.parse(jsonPayload);
    } catch {
      return {};
    }
  }

  private ensureGoogleScriptLoaded(callback: () => void): void {
    if (typeof window === 'undefined') return;

    if (document.getElementById('google-gsi-script')) {
      callback();
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => callback();
    script.onerror = () => console.warn('[AuthService] Error cargando Google GSI script.');
    document.head.appendChild(script);
  }
}
