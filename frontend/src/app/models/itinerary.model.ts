// ── Tipos base ────────────────────────────────────────────────────────────────

/** Destinos disponibles para el viaje México 2026 */
export type Destination = 'CDMX' | 'GUADALAJARA' | 'CANCUN';

/**
 * Propietario de la actividad.
 * Fase 1: IDs estáticos. Fase 2: sub de Cognito.
 */
export type OwnerId = 'DANIEL' | 'MAFE' | 'SHARED';

/** Tipo de actividad en el itinerario */
export type ItemType = 'SHARED' | 'SOLO_DANIEL' | 'SOLO_MAFE';

// ── Modelos de dominio ────────────────────────────────────────────────────────

export interface Country {
  code: string;
  name: string;
}

export interface TripDestination {
  id?: string;
  tripId?: string;
  name: string;        // Ej: "Ciudad de México"
  shortCode: string;   // Ej: "CDMX"
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  color: string;       // HEX Ej: "#06B6D4"
  emoji: string;       // Ej: "🏛️"
}

export interface Trip {
  id: string;
  name: string;
  /** Código de país ISO 3166-1 alpha-2, ej: 'mx', 'co', 'jp', 'es' */
  countryCode?: string;
  country?: Country;
  /** Formato YYYY-MM-DD */
  startDate: string;
  /** Formato YYYY-MM-DD */
  endDate: string;
  destinations: string[];
  destinationsList?: TripDestination[];
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
