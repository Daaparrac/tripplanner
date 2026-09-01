// ── Tipos base ────────────────────────────────────────────────────────────────

/** Destinos disponibles para el viaje México 2025 */
export type Destination = 'CDMX' | 'GUADALAJARA' | 'CANCUN';

/**
 * Propietario de la actividad.
 * Fase 1: IDs estáticos. Fase 2: sub de Cognito.
 */
export type OwnerId = 'DANIEL' | 'MAFE' | 'SHARED';

/** Tipo de actividad en el itinerario */
export type ItemType = 'SHARED' | 'SOLO_DANIEL' | 'SOLO_MAFE';

// ── Modelos de dominio ────────────────────────────────────────────────────────

export interface Trip {
  id: string;
  name: string;
  /** Formato YYYY-MM-DD */
  startDate: string;
  /** Formato YYYY-MM-DD */
  endDate: string;
  destinations: Destination[];
  /**
   * Umbral de proximidad en km para alertas de actividades SOLO concurrentes.
   * Configurable por viaje.
   */
  proximityThresholdKm: number;
  createdAt: string;
  updatedAt: string;
}

export interface ItineraryItem {
  id: string;
  tripId: string;
  /** Place ID de Google Maps */
  placeId: string;
  placeName: string;
  placeAddress: string;
  lat: number;
  lng: number;
  /**
   * ISO 8601 datetime con offset.
   * NULL si el ítem está en "Lugares Guardados" (sin fecha asignada).
   */
  dateTime: string | null;
  durationMinutes: number;
  ownerId: OwnerId;
  type: ItemType;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── DTOs para creación y actualización ───────────────────────────────────────

export interface CreateItineraryItemDto {
  placeId: string;
  placeName: string;
  placeAddress: string;
  lat: number;
  lng: number;
  /** ISO 8601 datetime */
  dateTime: string;
  durationMinutes?: number;
  ownerId: OwnerId;
  type: ItemType;
  notes?: string | null;
}

export interface UpdateItineraryItemDto {
  /** Null para mover el ítem a "Lugares Guardados" sin fecha */
  dateTime?: string | null;
  durationMinutes?: number;
  type?: ItemType;
  ownerId?: OwnerId;
  notes?: string | null;
}

// ── Respuestas del endpoint de proximidad ────────────────────────────────────

export interface ProximityAlertItem {
  id: string;
  placeName: string;
  placeAddress: string;
  /** ISO 8601 datetime */
  dateTime: string;
}

export interface ProximityAlert {
  danielItem: ProximityAlertItem;
  mafeItem: ProximityAlertItem;
  distanceKm: number;
  durationMinutes: number;
  distanceText: string;
  durationText: string;
  thresholdKm: number;
  message: string;
}

export interface ProximityCheckResponse {
  tripId: string;
  /** Formato YYYY-MM-DD */
  date: string;
  thresholdKm: number;
  soloItemsAnalyzed: number;
  conflictingPairs: number;
  alerts: ProximityAlert[];
}

// ── Respuestas genéricas de la API ────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: Array<{ field: string; message: string }>;
}
