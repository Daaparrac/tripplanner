import { Injectable, signal, computed, effect } from '@angular/core';

export type ThemeMode = 'auto' | 'dark' | 'light';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly STORAGE_KEY = 'trip_planner_theme_mode';

  /** Modo seleccionado por el usuario: 'auto' | 'dark' | 'light' */
  readonly themeMode = signal<ThemeMode>(this.getInitialMode());

  /** Si el sistema operativo tiene preferencia oscura */
  readonly systemPrefersDark = signal<boolean>(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );

  /** Tema efectivo aplicado: 'dark' (OLED #000000) o 'light' */
  readonly currentTheme = computed<'dark' | 'light'>(() => {
    const mode = this.themeMode();
    if (mode === 'auto') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return mode;
  });

  constructor() {
    // Escuchar cambios de preferencia del sistema si está en 'auto'
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        this.systemPrefersDark.set(e.matches);
      });
    }

    // Aplicar clase y atributo al documento cada vez que cambie currentTheme
    effect(() => {
      const theme = this.currentTheme();
      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        root.setAttribute('data-theme', theme);
        if (theme === 'dark') {
          root.classList.add('theme-oled');
          root.classList.remove('theme-light');
          document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#000000');
        } else {
          root.classList.add('theme-light');
          root.classList.remove('theme-oled');
          document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f8fafc');
        }
      }
    });
  }

  setThemeMode(mode: ThemeMode): void {
    this.themeMode.set(mode);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, mode);
    }
  }

  cycleTheme(): void {
    const current = this.themeMode();
    const next: Record<ThemeMode, ThemeMode> = {
      auto: 'dark',
      dark: 'light',
      light: 'auto',
    };
    this.setThemeMode(next[current]);
  }

  private getInitialMode(): ThemeMode {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(this.STORAGE_KEY) as ThemeMode | null;
      if (saved && ['auto', 'dark', 'light'].includes(saved)) {
        return saved;
      }
    }
    return 'auto';
  }
}
