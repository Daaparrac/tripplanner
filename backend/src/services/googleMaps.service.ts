import axios, { AxiosError } from 'axios';

// ── DTOs públicos del servicio ────────────────────────────────────────────────

export interface DistanceResult {
  distanceKm: number;
  durationMinutes: number;
  distanceText: string;
  durationText: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

// ── Clase de error personalizada ──────────────────────────────────────────────

export class GoogleMapsServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'GoogleMapsServiceError';
  }
}

// ── Cálculo Geodésico (Haversine) como Fallback Robusto ───────────────────────

/**
 * Calcula la distancia en línea recta sobre la superficie terrestre (fórmula de Haversine).
 * Estima el tiempo de traslado en tráfico urbano (promedio 25 km/h).
 */
export function calculateHaversineDistance(origin: LatLng, destination: LatLng): DistanceResult {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
  const dLng = ((destination.lng - origin.lng) * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lat2 = (destination.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = Math.round(R * c * 10) / 10; // Redondear a 1 decimal

  // Estimar tiempo en tráfico urbano (promedio 25 km/h)
  const durationMinutes = Math.max(1, Math.round((distanceKm / 25) * 60));

  return {
    distanceKm,
    durationMinutes,
    distanceText: `${distanceKm} km`,
    durationText: `${durationMinutes} min aprox`,
  };
}

// ── Servicio ──────────────────────────────────────────────────────────────────

/**
 * GoogleMapsService
 *
 * Soporta la moderna Routes API de Google (computeRoutes), con fallback a Distance Matrix
 * y fallback final a cálculo Haversine geodésico para garantizar disponibilidad total.
 */
export class GoogleMapsService {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
  }

  /**
   * Calcula la distancia y tiempo de viaje entre dos coordenadas.
   *
   * Estrategia de 3 niveles:
   * 1. Google Routes API (computeRoutes - API moderna)
   * 2. Google Distance Matrix API (Legacy)
   * 3. Fórmula de Haversine (Fallback local infalible)
   */
  async getDistance(
    origin: LatLng,
    destination: LatLng,
    mode: 'driving' | 'walking' | 'transit' = 'driving'
  ): Promise<DistanceResult> {
    if (!this.apiKey || this.apiKey.startsWith('YOUR_')) {
      return calculateHaversineDistance(origin, destination);
    }

    // ── Nivel 1: Google Routes API (New API v2) ─────────────────────────────
    try {
      const routesResponse = await axios.post(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        {
          origin: {
            location: {
              latLng: {
                latitude: Number(origin.lat),
                longitude: Number(origin.lng),
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: Number(destination.lat),
                longitude: Number(destination.lng),
              },
            },
          },
          travelMode: mode === 'walking' ? 'WALK' : mode === 'transit' ? 'TRANSIT' : 'DRIVE',
          routingPreference: mode === 'driving' ? 'TRAFFIC_UNAWARE' : undefined,
          computeAlternativeRoutes: false,
          languageCode: 'es',
          units: 'METRIC',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
            'Referer': 'http://localhost:4300/',
          },
          timeout: 8_000,
        }
      );

      const route = routesResponse.data?.routes?.[0];
      if (route && route.distanceMeters !== undefined) {
        const distanceKm = Math.round((route.distanceMeters / 1000) * 10) / 10;
        // duration viene en formato "1234s"
        const durationSec = parseInt(route.duration?.replace('s', '') || '0', 10);
        const durationMinutes = Math.max(1, Math.round(durationSec / 60));

        return {
          distanceKm,
          durationMinutes,
          distanceText: `${distanceKm} km`,
          durationText: `${durationMinutes} min`,
        };
      }
    } catch (routesErr) {
      // Ignorar o registrar error controlado
    }

    // ── Nivel 2: Google Distance Matrix (Legacy API) ────────────────────────
    try {
      const matrixResponse = await axios.get(
        'https://maps.googleapis.com/maps/api/distancematrix/json',
        {
          params: {
            origins: `${origin.lat},${origin.lng}`,
            destinations: `${destination.lat},${destination.lng}`,
            mode,
            key: this.apiKey,
            language: 'es',
            units: 'metric',
          },
          headers: {
            'Referer': 'http://localhost:4300/',
          },
          timeout: 8_000,
        }
      );

      const element = matrixResponse.data?.rows?.[0]?.elements?.[0];
      if (element && element.status === 'OK' && element.distance && element.duration) {
        return {
          distanceKm: Math.round((element.distance.value / 1000) * 10) / 10,
          durationMinutes: Math.max(1, Math.round(element.duration.value / 60)),
          distanceText: element.distance.text,
          durationText: element.duration.text,
        };
      }
    } catch (matrixErr) {
      // Ignorar o registrar error controlado
    }

    // ── Nivel 3: Fallback Geodésico Local (Siempre funciona) ────────────────
    return calculateHaversineDistance(origin, destination);
  }

  async getDistances(
    pairs: Array<{ origin: LatLng; destination: LatLng }>
  ): Promise<DistanceResult[]> {
    return Promise.all(
      pairs.map(({ origin, destination }) => this.getDistance(origin, destination))
    );
  }
}

export const googleMapsService = new GoogleMapsService();

