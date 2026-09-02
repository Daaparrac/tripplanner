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
  filter,
} from 'rxjs';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { ItineraryService } from './itinerary.service';
import { AppStateService } from './app-state.service';
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

// ── Servicio ──────────────────────────────────────────────────────────────────

/**
 * TripMapService — Estado centralizado para el componente del mapa e itinerario.
 */
@Injectable({ providedIn: 'root' })
export class TripMapService {
  private readonly itineraryService = inject(ItineraryService);
  private readonly appState = inject(AppStateService);

  // ── Estado interno ────────────────────────────────────────────────────────

  private readonly _selectedDate$ = new BehaviorSubject<string>('2026-10-23');
  private readonly _proximityAlerts$ = new BehaviorSubject<ProximityAlert[]>([]);
  private readonly _refreshTrigger$ = new BehaviorSubject<number>(0);
  private readonly _savedPlaces$ = new BehaviorSubject<ItineraryItem[]>([]);

  // ── Señales expuestas ─────────────────────────────────────────────────────

  /** Señal con el ID del viaje activo */
  readonly selectedTripId = this.appState.activeTripId;

  /** Señal con la fecha seleccionada (YYYY-MM-DD) */
  readonly selectedDate = toSignal(this._selectedDate$, {
    initialValue: '2026-10-25',
  });

  // ── Streams de datos ──────────────────────────────────────────────────────

  readonly activeTripId$: Observable<string> = toObservable(this.appState.activeTripId).pipe(
    filter((id): id is string => id !== null),
    distinctUntilChanged(),
  );

  readonly selectedDate$: Observable<string> = this._selectedDate$.pipe(distinctUntilChanged());

  /** Lugares guardados sin fecha asignada (compartidos con Kanban) */
  readonly savedPlaces$: Observable<ItineraryItem[]> = this._savedPlaces$.asObservable();

  /**
   * Items del día seleccionado.
   * Se recarga automáticamente al cambiar de viaje, fecha o al disparar _refreshTrigger$.
   */
  readonly items$: Observable<ItineraryItem[]> = combineLatest([
    this.activeTripId$,
    this.selectedDate$,
    this._refreshTrigger$.pipe(distinctUntilChanged()),
  ]).pipe(
    switchMap(([tripId, date]) => {
      if (!tripId) return of([]);
      return this.fetchItemsForDay(tripId, date);
    }),
    shareReplay(1),
  );

  /**
   * Todos los items del viaje completo (utilizado por el Kanban para ver los 20 días).
   * Se recarga automáticamente al modificar o crear items.
   */
  readonly allTripItems$: Observable<ItineraryItem[]> = combineLatest([
    this.activeTripId$,
    this._refreshTrigger$.pipe(distinctUntilChanged()),
  ]).pipe(
    switchMap(([tripId]) => {
      if (!tripId) return of([]);
      return this.itineraryService.loadItinerary$(tripId).pipe(
        catchError((err) => {
          console.warn('[TripMapService] Error loading all trip items:', err.message);
          return of([]);
        }),
      );
    }),
    shareReplay(1),
  );

  /** Alertas de proximidad del día actual */
  readonly proximityAlerts$: Observable<ProximityAlert[]> = this._proximityAlerts$.asObservable();

  /** Estadísticas del día seleccionado */
  readonly dayStats$: Observable<DayStats> = this.items$.pipe(
    map((items) => ({
      date: this._selectedDate$.getValue(),
      totalItems: items.length,
      sharedCount: items.filter((i) => i.type === 'SHARED').length,
      danielCount: items.filter((i) => i.type === 'SOLO_DANIEL').length,
      mafeCount: items.filter((i) => i.type === 'SOLO_MAFE').length,
    })),
  );

  /** Metadatos del viaje activo */
  readonly activeTrip$: Observable<Trip | null> = toObservable(this.appState.activeTrip);

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
    this.appState.setActiveTripId(tripId);
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

  private fetchItemsForDay(tripId: string, date: string): Observable<ItineraryItem[]> {
    return this.itineraryService.loadItinerary$(tripId, date).pipe(
      map((items) => {
        if (items && items.length > 0) return items;
        // Fallback a datos locales si la base de datos no tiene items para esa fecha
        return [];
      }),
      catchError((err) => {
        console.warn('[TripMapService] Error fetching itinerary:', err.message);
        return of([]);
      }),
    );
  }
}
