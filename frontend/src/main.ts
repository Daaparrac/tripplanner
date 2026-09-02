import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

// Registro y auto-actualización del Service Worker (PWA en celular)
if ('serviceWorker' in navigator && typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Chequea si hay nueva versión desplegada al abrir la app
        reg.update().catch(() => {});
      })
      .catch((err) => console.warn('[SW] Registration failed:', err));
  });
}
