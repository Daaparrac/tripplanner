import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import {
  Observable,
  throwError,
  BehaviorSubject,
  catchError,
  map,
  tap,
  shareReplay,
  switchMap,
  distinctUntilChanged,
} from 'rxjs';
import type {
  Trip,
  ItineraryItem,
  CreateItineraryItemDto,
  UpdateItineraryItemDto,
  ProximityCheckResponse,
  ApiResponse,
} from '../../models/itinerary.model';

// ── Configuración ─────────────────────────────────────────────────────────────

/**
 * En Angular 22 con ESM, las variables de entorno se inyectan
 * a través de environment.ts generado por el CLI.
 *
 * Ejemplo en environment.ts:
 *   export const environment = { apiUrl: 'http://localhost:3000' };
 */
const getApiBaseUrl = (): string => {
  if (
    typeof window !== 'undefined' &&
    window.location.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return `http://${window.location.hostname}`;
  }
  return 'http://localhost:3002';
};

const API_BASE_URL =
  (globalThis as unknown as { __env?: { apiUrl: string } }).__env?.apiUrl ?? getApiBaseUrl();

// ── Estado reactivo local ─────────────────────────────────────────────────────

interface ItineraryState {
  items: ItineraryItem[];
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: ItineraryState = {
  items: [],
  loading: false,
  error: null,
};

// ── Servicio ──────────────────────────────────────────────────────────────────

/**
 * ItineraryService
 *
 * Servicio Angular que encapsula toda la comunicación con el backend
 * del Trip Planner usando HttpClient + RxJS.
 *
 * Patrón: BehaviorSubject para estado local + métodos que retornan Observable
 * para integración con componentes (async pipe, signals, etc.)
 *
 * Uso básico:
 * ```ts
 * // En un componente
 * readonly items$ = this.itineraryService.items$;
 * readonly proximityAlerts$ = this.itineraryService.checkProximity$(tripId, date);
 *
 * this.itineraryService.addItem$(tripId, dto).subscribe();
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ItineraryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/api/trips`;

  // ── Estado reactivo ───────────────────────────────────────────────────────

  private readonly _state$ = new BehaviorSubject<ItineraryState>(INITIAL_STATE);

  /** Stream del array de ItineraryItems cargados actualmente */
  readonly items$: Observable<ItineraryItem[]> = this._state$.pipe(
    map((s) => s.items),
    distinctUntilChanged(),
  );

  /** Stream del estado de carga */
  readonly loading$: Observable<boolean> = this._state$.pipe(
    map((s) => s.loading),
    distinctUntilChanged(),
  );

  /** Stream del último error ocurrido */
  readonly error$: Observable<string | null> = this._state$.pipe(
    map((s) => s.error),
    distinctUntilChanged(),
  );

  // ── Helpers de estado ─────────────────────────────────────────────────────

  private setState(partial: Partial<ItineraryState>): void {
    this._state$.next({ ...this._state$.getValue(), ...partial });
  }

  // ── API: Trips ────────────────────────────────────────────────────────────

  /**
   * Obtiene la lista de todos los viajes disponibles.
   *
   * Usa shareReplay(1) para cachear la respuesta y evitar
   * múltiples llamadas HTTP si varios componentes se suscriben.
   */
  getTrips$(): Observable<Trip[]> {
    return this.http.get<ApiResponse<Trip[]>>(this.baseUrl).pipe(
      map((res) => res.data),
      shareReplay(1),
      catchError(this.handleError),
    );
  }

  // ── API: Itinerario ───────────────────────────────────────────────────────

  /**
   * Carga el itinerario de un viaje (opcionalmente filtrado por fecha)
   * y actualiza el estado local reactivo.
   *
   * @param tripId - UUID del viaje
   * @param date   - Fecha en formato YYYY-MM-DD (opcional)
   */
  loadItinerary$(tripId: string, date?: string): Observable<ItineraryItem[]> {
    this.setState({ loading: true, error: null });

    let params = new HttpParams();
    if (date) params = params.set('date', date);

    return this.http
      .get<ApiResponse<ItineraryItem[]>>(`${this.baseUrl}/${tripId}/itinerary`, { params })
      .pipe(
        map((res) => res.data),
        tap((items) => this.setState({ items, loading: false })),
        catchError((err) => {
          const message = this.extractErrorMessage(err);
          this.setState({ loading: false, error: message });
          return throwError(() => new Error(message));
        }),
      );
  }

  /**
   * Agrega un nuevo lugar al itinerario y actualiza el estado local
   * optimistamente (append al array local).
   *
   * @param tripId - UUID del viaje
   * @param dto    - Datos del nuevo ItineraryItem
   */
  addItem$(tripId: string, dto: CreateItineraryItemDto): Observable<ItineraryItem> {
    return this.http
      .post<ApiResponse<ItineraryItem>>(`${this.baseUrl}/${tripId}/itinerary`, dto)
      .pipe(
        map((res) => res.data),
        tap((newItem) => {
          const current = this._state$.getValue().items;
          // Insertar manteniendo el orden cronológico
          const updated = [...current, newItem].sort((a, b) => {
            if (!a.dateTime) return 1;
            if (!b.dateTime) return -1;
            return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
          });
          this.setState({ items: updated });
        }),
        catchError(this.handleError),
      );
  }

  /**
   * Actualiza parcialmente un ItineraryItem en backend y en el estado local.
   *
   * @param tripId - UUID del viaje
   * @param itemId - UUID del item
   * @param dto    - Campos a actualizar
   */
  updateItem$(
    tripId: string,
    itemId: string,
    dto: UpdateItineraryItemDto,
  ): Observable<ItineraryItem> {
    return this.http
      .patch<ApiResponse<ItineraryItem>>(`${this.baseUrl}/${tripId}/itinerary/${itemId}`, dto)
      .pipe(
        map((res) => res.data),
        tap((updatedItem) => {
          const current = this._state$.getValue().items;
          const updated = current.map((item) => (item.id === updatedItem.id ? updatedItem : item));
          this.setState({ items: updated });
        }),
        catchError(this.handleError),
      );
  }

  /**
   * Elimina un ItineraryItem del backend y del estado local.
   *
   * @param tripId - UUID del viaje
   * @param itemId - UUID del item a eliminar
   */
  deleteItem$(tripId: string, itemId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${tripId}/itinerary/${itemId}`).pipe(
      tap(() => {
        const current = this._state$.getValue().items;
        this.setState({ items: current.filter((item) => item.id !== itemId) });
      }),
      catchError(this.handleError),
    );
  }

  // ── API: Verificación de Proximidad ──────────────────────────────────────

  /**
   * Consulta el endpoint de proximidad para un día específico.
   *
   * Retorna un Observable con las alertas de distancia entre actividades
   * SOLO de Daniel y Mafe que ocurren simultáneamente.
   *
   * Ejemplo de uso en componente:
   * ```ts
   * this.itineraryService
   *   .checkProximity$(this.tripId, '2026-10-25')
   *   .subscribe(response => {
   *     if (response.alerts.length > 0) {
   *       // Mostrar alertas en el UI
   *     }
   *   });
   * ```
   *
   * @param tripId - UUID del viaje
   * @param date   - Fecha a analizar (YYYY-MM-DD)
   */
  checkProximity$(tripId: string, date: string): Observable<ProximityCheckResponse> {
    const params = new HttpParams().set('date', date);

    return this.http
      .get<ApiResponse<ProximityCheckResponse>>(
        `${this.baseUrl}/${tripId}/itinerary/check-proximity`,
        { params },
      )
      .pipe(
        map((res) => res.data),
        catchError(this.handleError),
      );
  }

  /**
   * Variante reactiva: recibe un Observable de fecha y re-ejecuta
   * la verificación de proximidad cada vez que cambia la fecha seleccionada.
   *
   * Ideal para conectar con un date-picker en la vista.
   *
   * ```ts
   * readonly selectedDate$ = new BehaviorSubject<string>('2026-10-23');
   *
   * readonly proximity$ = this.itineraryService.checkProximityOnDate$(
   *   this.tripId,
   *   this.selectedDate$
   * );
   * ```
   *
   * @param tripId    - UUID del viaje
   * @param date$     - Observable que emite fechas YYYY-MM-DD
   */
  checkProximityOnDate$(
    tripId: string,
    date$: Observable<string>,
  ): Observable<ProximityCheckResponse> {
    return date$.pipe(
      distinctUntilChanged(),
      switchMap((date) => this.checkProximity$(tripId, date)),
    );
  }

  // ── Manejo de errores ─────────────────────────────────────────────────────

  /**
   * Extrae un mensaje legible de un HttpErrorResponse.
   */
  private extractErrorMessage(error: HttpErrorResponse): string {
    if (error.error?.message) return error.error.message;
    if (error.error?.error) return error.error.error;
    if (error.statusText) return `${error.status}: ${error.statusText}`;
    return 'An unexpected error occurred';
  }

  /**
   * Operador de error reutilizable para el pipe de RxJS.
   * Extrae el mensaje y lanza un nuevo Error tipado.
   */
  private handleError = (error: HttpErrorResponse): Observable<never> => {
    const message = this.extractErrorMessage(error);
    console.error('[ItineraryService]', message, error);
    return throwError(() => new Error(message));
  };
}
