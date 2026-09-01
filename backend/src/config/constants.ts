import dotenv from 'dotenv';

dotenv.config();

export const CONSTANTS = {
  // ── Google Maps ────────────────────────────────────────────
  GOOGLE_MAPS_BASE_URL: 'https://maps.googleapis.com/maps/api',

  // ── Proximidad ─────────────────────────────────────────────
  /**
   * Umbral de proximidad por defecto (km).
   * Se usa como fallback si el campo `proximityThresholdKm` del Trip es nulo.
   * El valor real por viaje se configura en la tabla Trip.
   */
  DEFAULT_PROXIMITY_THRESHOLD_KM: parseFloat(
    process.env.DEFAULT_PROXIMITY_THRESHOLD_KM ?? '5'
  ),

  /**
   * Ventana de solapamiento temporal (minutos).
   * Dos actividades SOLO se consideran "en conflicto" si su diferencia horaria
   * es menor a este valor.
   */
  SOLO_OVERLAP_WINDOW_MINUTES: 60,

  // ── Usuarios estáticos (Fase 1 — sin Cognito) ─────────────
  OWNERS: {
    DANIEL: 'DANIEL',
    MAFE: 'MAFE',
    SHARED: 'SHARED',
  } as const,

  // ── Destinos del viaje ────────────────────────────────────
  DESTINATIONS: ['CDMX', 'GUADALAJARA', 'CANCUN'] as const,

  // ── Viaje base ────────────────────────────────────────────
  TRIP_DEFAULT_START: '2025-10-23',
  TRIP_DEFAULT_END: '2025-11-11',
} as const;

export type OwnerType = (typeof CONSTANTS.OWNERS)[keyof typeof CONSTANTS.OWNERS];
export type DestinationType = (typeof CONSTANTS.DESTINATIONS)[number];
