import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeService, ThemeMode } from './core/services/theme.service';
import { AuthService } from './core/services/auth.service';
import { LoginModalComponent } from './core/components/login-modal/login-modal.component';

@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LoginModalComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  readonly themeService = inject(ThemeService);
  readonly authService  = inject(AuthService);

  get themeMode(): ThemeMode {
    return this.themeService.themeMode();
  }

  get currentTheme(): 'dark' | 'light' {
    return this.themeService.currentTheme();
  }

  setTheme(mode: ThemeMode): void {
    this.themeService.setThemeMode(mode);
  }

  cycleTheme(): void {
    this.themeService.cycleTheme();
  }
}
