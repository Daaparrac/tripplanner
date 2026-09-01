import {
  Component,
  AfterViewInit,
  inject,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (authService.isAuthModalOpen()) {
      <div class="login-modal-backdrop" (click)="authService.closeLoginModal()">
        <div
          class="login-modal-dialog"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-label="Iniciar Sesión">

          <header class="login-modal-header">
            <div class="brand-avatar">🇲🇽</div>
            <h2 class="login-title">¿Quién está planificando?</h2>
            <p class="login-subtitle">
              Inicia sesión con Google para identificar tus actividades en el viaje a México.
            </p>
          </header>

          <div class="login-modal-body">
            @if (authService.authError()) {
              <div class="login-error-alert" role="alert">
                ⚠️ {{ authService.authError() }}
              </div>
            }

            <!-- Botón Oficial de Google Identity Services -->
            <div class="google-btn-wrapper">
              <div id="google-signin-btn-container" class="google-btn-container"></div>
            </div>

            <div class="login-divider">
              <span>o selecciona tu perfil rápido</span>
            </div>

            <!-- Acceso Rápido Directo Daniel / Mafe -->
            <div class="quick-profiles-grid">
              <button
                type="button"
                class="btn-profile-quick btn-daniel"
                (click)="authService.loginAs('DANIEL')"
                aria-label="Entrar como Daniel">
                <span class="profile-emoji">🧑</span>
                <div class="profile-info">
                  <span class="profile-name">Daniel</span>
                  <span class="profile-badge badge-daniel">Solo Daniel</span>
                </div>
              </button>

              <button
                type="button"
                class="btn-profile-quick btn-mafe"
                (click)="authService.loginAs('MAFE')"
                aria-label="Entrar como Mafe">
                <span class="profile-emoji">👩</span>
                <div class="profile-info">
                  <span class="profile-name">Mafe</span>
                  <span class="profile-badge badge-mafe">Solo Mafe</span>
                </div>
              </button>
            </div>
          </div>

          <footer class="login-modal-footer">
            <button
              type="button"
              class="btn-close-modal"
              (click)="authService.closeLoginModal()">
              Cerrar
            </button>
          </footer>

        </div>
      </div>
    }
  `,
  styles: [`
    .login-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 3000;
      padding: 16px;
      animation: fadeIn 0.2s ease;
    }

    .login-modal-dialog {
      background: var(--app-modal-bg);
      border: 1px solid var(--app-border);
      border-radius: var(--radius-xl);
      width: 100%;
      max-width: 420px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
      animation: modalScale 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    @keyframes modalScale {
      from { transform: scale(0.92); opacity: 0; }
      to   { transform: scale(1); opacity: 1; }
    }

    .login-modal-header {
      padding: 24px 24px 16px;
      text-align: center;
      background: var(--app-surface-elevated);
      border-bottom: 1px solid var(--app-border);
    }

    .brand-avatar {
      font-size: 2.2rem;
      margin-bottom: 8px;
    }

    .login-title {
      font-family: var(--font-display, sans-serif);
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--app-text-primary);
      margin-bottom: 4px;
    }

    .login-subtitle {
      font-size: 0.8rem;
      color: var(--app-text-muted);
      line-height: 1.4;
    }

    .login-modal-body {
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .google-btn-wrapper {
      display: flex;
      justify-content: center;
      min-height: 44px;
    }

    .google-btn-container {
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .login-divider {
      display: flex;
      align-items: center;
      text-align: center;
      color: var(--app-text-muted);
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;

      &::before, &::after {
        content: '';
        flex: 1;
        border-bottom: 1px solid var(--app-border);
      }
      span {
        padding: 0 10px;
      }
    }

    .quick-profiles-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .btn-profile-quick {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 14px 10px;
      background: var(--app-surface-card);
      border: 1px solid var(--app-border);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      text-align: center;
      gap: 6px;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
      }

      &.btn-daniel:hover {
        border-color: #10B981;
        background: rgba(16, 185, 129, 0.08);
      }

      &.btn-mafe:hover {
        border-color: #EC4899;
        background: rgba(236, 72, 153, 0.08);
      }
    }

    .profile-emoji {
      font-size: 2rem;
      line-height: 1;
    }

    .profile-info {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }

    .profile-name {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--app-text-primary);
    }

    .profile-badge {
      font-size: 0.68rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 100px;

      &.badge-daniel {
        background: rgba(16, 185, 129, 0.15);
        color: #10B981;
      }
      &.badge-mafe {
        background: rgba(236, 72, 153, 0.15);
        color: #EC4899;
      }
    }

    .login-error-alert {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #ef4444;
      padding: 8px 12px;
      border-radius: var(--radius-md);
      font-size: 0.78rem;
      font-weight: 500;
    }

    .login-modal-footer {
      padding: 12px 24px 18px;
      display: flex;
      justify-content: flex-end;
      background: var(--app-surface-elevated);
      border-top: 1px solid var(--app-border);
    }

    .btn-close-modal {
      padding: 8px 16px;
      background: transparent;
      border: 1px solid var(--app-border);
      color: var(--app-text-muted);
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        color: var(--app-text-primary);
        background: var(--app-border);
      }
    }
  `],
})
export class LoginModalComponent {
  readonly authService = inject(AuthService);

  constructor() {
    effect(() => {
      if (this.authService.isAuthModalOpen()) {
        setTimeout(() => {
          this.authService.renderGoogleButton('google-signin-btn-container');
        }, 150);
      }
    });
  }
}
