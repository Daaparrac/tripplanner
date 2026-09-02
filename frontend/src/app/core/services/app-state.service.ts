import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap, catchError, of } from 'rxjs';
import { Trip, Country } from '../../models/itinerary.model';

@Injectable({
  providedIn: 'root'
})
export class AppStateService {
  // Estado
  readonly trips = signal<Trip[]>([]);
  readonly activeTripId = signal<string | null>(null);
  readonly countries = signal<Country[]>([]);
  
  // Computed
  readonly activeTrip = computed(() => {
    const id = this.activeTripId();
    if (!id) return null;
    return this.trips().find(t => t.id === id) || null;
  });

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
      console.warn(
        '[AppStateService] window.__env.apiUrl not found — falling back to relative /api. ' +
        'Ensure entrypoint.sh injects API_URL into assets/env.js.'
      );
      return '';
    }
    return 'http://localhost:3002';
  }

  constructor(private http: HttpClient) {}

  /**
   * Carga el catálogo oficial de países sincronizado con FlagCDN desde la base de datos.
   */
  loadCountries() {
    const apiBase = this.getApiBaseUrl();
    return this.http.get<{ data: Country[] }>(`${apiBase}/api/countries`).pipe(
      tap(res => {
        if (res.data) {
          this.countries.set(res.data);
        }
      }),
      catchError(err => {
        console.error('Error loading countries', err);
        return of(null);
      })
    );
  }

  /**
   * Carga la lista de viajes y selecciona el primero por defecto si no hay ninguno.
   */
  loadTrips() {
    const apiBase = this.getApiBaseUrl();
    return this.http.get<{ data: Trip[] }>(`${apiBase}/api/trips`).pipe(
      tap(res => {
        if (res.data) {
          this.trips.set(res.data);
          
          // Si no hay viaje seleccionado, o el actual ya no existe, selecciona el primero
          const currentId = this.activeTripId();
          if (!currentId || !res.data.some(t => t.id === currentId)) {
            if (res.data.length > 0) {
              this.setActiveTripId(res.data[0].id);
            }
          }
        }
      }),
      catchError(err => {
        console.error('Error loading trips', err);
        return of(null);
      })
    );
  }

  setActiveTripId(id: string) {
    this.activeTripId.set(id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('activeTripId', id);
    }
  }

  restoreActiveTripId() {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('activeTripId');
      if (stored) {
        this.activeTripId.set(stored);
      }
    }
  }

  createTrip(payload: Partial<Trip>) {
    const apiBase = this.getApiBaseUrl();
    return this.http.post<{ data: Trip }>(`${apiBase}/api/trips`, payload).pipe(
      tap(res => {
        if (res.data) {
          const current = this.trips();
          this.trips.set([...current, res.data]);
          this.setActiveTripId(res.data.id);
        }
      })
    );
  }

  updateTripSettings(tripId: string, payload: Partial<Trip>) {
    const apiBase = this.getApiBaseUrl();
    return this.http.patch<{ data: Trip }>(`${apiBase}/api/trips/${tripId}`, payload).pipe(
      tap(res => {
        if (res.data) {
          // Update local state
          const updated = this.trips().map(t => t.id === tripId ? res.data : t);
          this.trips.set(updated);
        }
      })
    );
  }
}
