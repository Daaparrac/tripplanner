import { Injectable, inject, signal, computed } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  of,
  distinctUntilChanged,
  map,
  switchMap,
  shareReplay,
  tap,
  catchError,
} from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { ItineraryService } from './itinerary.service';
import type { ItineraryItem, ProximityAlert, Trip } from '../../models/itinerary.model';

// ── Tipos internos del servicio ───────────────────────────────────────────────

export interface DayStats {
  date: string;
  totalItems: number;
  sharedCount: number;
  danielCount: number;
  mafeCount: number;
}

export interface TripMapState {
  selectedTripId: string | null;
  selectedDate: string;
  isLoadingRoute: boolean;
  proximityAlerts: ProximityAlert[];
}

// ── Datos mock para demostración (Fase 1 — sin API real aún) ─────────────────
// Estos datos simulan lo que el backend retornaría para un día de itinerario.
// En producción, se reemplazan por las llamadas a ItineraryService.

const MOCK_TRIP: Trip = {
  id: '98d78ff8-83a8-4276-87f8-3b61bc47e4d3',
  name: 'México 2025 — Daniel & Mafe 🇲🇽',
  startDate: '2025-10-23',
  endDate: '2025-11-11',
  destinations: ['CDMX', 'GUADALAJARA', 'CANCUN'],
  proximityThresholdKm: 5,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_ITEMS: ItineraryItem[] = [];

export const INITIAL_SAVED_PLACES: ItineraryItem[] = [];

// ── Servicio ──────────────────────────────────────────────────────────────────

/**
 * TripMapService — Estado centralizado para el componente del mapa e itinerario.
 */
@Injectable({ providedIn: 'root' })
export class TripMapService {
  private readonly itineraryService = inject(ItineraryService);

  // ── Estado interno ────────────────────────────────────────────────────────

  private readonly _selectedTripId$ = new BehaviorSubject<string>(MOCK_TRIP.id);
  private readonly _selectedDate$ = new BehaviorSubject<string>('2025-10-23');
  private readonly _proximityAlerts$ = new BehaviorSubject<ProximityAlert[]>([]);
  private readonly _refreshTrigger$ = new BehaviorSubject<number>(0);
  private readonly _savedPlaces$ = new BehaviorSubject<ItineraryItem[]>([]);

  // ── Señales expuestas ─────────────────────────────────────────────────────

  /** Señal con el ID del viaje activo */
  readonly selectedTripId = toSignal(this._selectedTripId$, {
    initialValue: MOCK_TRIP.id,
  });

  /** Señal con la fecha seleccionada (YYYY-MM-DD) */
  readonly selectedDate = toSignal(this._selectedDate$, {
    initialValue: '2025-10-25',
  });

  // ── Streams de datos ──────────────────────────────────────────────────────

  readonly activeTripId$: Observable<string> = this._selectedTripId$.pipe(
    distinctUntilChanged()
  );

  readonly selectedDate$: Observable<string> = this._selectedDate$.pipe(
    distinctUntilChanged()
  );

  /** Lugares guardados sin fecha asignada (compartidos con Kanban) */
  readonly savedPlaces$: Observable<ItineraryItem[]> = this._savedPlaces$.asObservable();

  /**
   * Items del día seleccionado.
   * Se recarga automáticamente al cambiar de viaje, fecha o al disparar _refreshTrigger$.
   */
  readonly items$: Observable<ItineraryItem[]> = combineLatest([
    this._selectedTripId$,
    this._selectedDate$,
    this._refreshTrigger$,
  ]).pipe(
    switchMap(([tripId, date]) => this.fetchItemsForDay(tripId, date)),
    shareReplay(1)
  );

  /**
   * Todos los items del viaje completo (utilizado por el Kanban para ver los 20 días).
   * Se recarga automáticamente al modificar o crear items.
   */
  readonly allTripItems$: Observable<ItineraryItem[]> = combineLatest([
    this._selectedTripId$,
    this._refreshTrigger$,
  ]).pipe(
    switchMap(([tripId]) =>
      this.itineraryService.loadItinerary$(tripId).pipe(
        catchError((err) => {
          console.warn('[TripMapService] Error loading all trip items:', err.message);
          return of([]);
        })
      )
    ),
    shareReplay(1)
  );

  /** Alertas de proximidad del día actual */
  readonly proximityAlerts$: Observable<ProximityAlert[]> =
    this._proximityAlerts$.asObservable();

  /** Estadísticas del día seleccionado */
  readonly dayStats$: Observable<DayStats> = this.items$.pipe(
    map((items) => ({
      date: this._selectedDate$.getValue(),
      totalItems: items.length,
      sharedCount: items.filter((i) => i.type === 'SHARED').length,
      danielCount: items.filter((i) => i.type === 'SOLO_DANIEL').length,
      mafeCount: items.filter((i) => i.type === 'SOLO_MAFE').length,
    }))
  );

  /** Metadatos del viaje activo */
  readonly activeTrip$: Observable<Trip> = of(MOCK_TRIP);

  // ── Acciones públicas ─────────────────────────────────────────────────────

  /**
   * Cambia el día visualizado en el mapa.
   * Dispara automáticamente la recarga de items$.
   */
  selectDate(date: string): void {
    this._selectedDate$.next(date);
    this._proximityAlerts$.next([]);
  }

  /** Cambia el viaje activo */
  selectTrip(tripId: string): void {
    this._selectedTripId$.next(tripId);
  }

  /** Forzar recarga de los items del día actual */
  refresh(): void {
    this._refreshTrigger$.next(this._refreshTrigger$.getValue() + 1);
  }

  /** Agrega un lugar directamente a la lista de lugares guardados */
  addSavedPlace(item: ItineraryItem): void {
    const current = this._savedPlaces$.getValue();
    this._savedPlaces$.next([item, ...current]);
  }

  /** Elimina un lugar de la lista de guardados */
  removeSavedPlace(itemId: string): void {
    const current = this._savedPlaces$.getValue();
    this._savedPlaces$.next(current.filter((i) => i.id !== itemId));
  }

  /** Notifica que un nuevo item fue añadido y refresca la vista del día */
  notifyItemAdded(item: ItineraryItem): void {
    const itemDate = item.dateTime?.substring(0, 10);
    if (itemDate && itemDate === this._selectedDate$.getValue()) {
      this.refresh();
    }
  }

  /** Notifica que un item fue modificado o eliminado y refresca */
  notifyItemChanged(): void {
    this.refresh();
  }

  /** Actualiza las alertas de proximidad */
  setProximityAlerts(alerts: ProximityAlert[]): void {
    this._proximityAlerts$.next(alerts);
  }

  // ── Helpers internos ──────────────────────────────────────────────────────

  private fetchItemsForDay(
    tripId: string,
    date: string
  ): Observable<ItineraryItem[]> {
    return this.itineraryService.loadItinerary$(tripId, date).pipe(
      map((items) => {
        if (items && items.length > 0) return items;
        // Fallback a datos locales si la base de datos no tiene items para esa fecha
        return MOCK_ITEMS.filter((item) => item.dateTime?.startsWith(date) ?? false);
      }),
      catchError((err) => {
        console.warn(`[TripMapService] Falling back to mock data:`, err.message);
        return of(MOCK_ITEMS.filter((item) => item.dateTime?.startsWith(date) ?? false));
      })
    );
  }
}
