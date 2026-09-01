import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { Trip, ItineraryItem } from '../models';
import { googleMapsService, GoogleMapsServiceError } from '../services/googleMaps.service';
import { CONSTANTS } from '../config/constants';
import type { ItineraryItemCreationAttributes } from '../models/ItineraryItem.model';

// ── Schemas de validación (Zod) ───────────────────────────────────────────────

const addItemSchema = z.object({
  tripId: z.string().uuid('tripId must be a valid UUID'),
  placeId: z.string().min(1, 'placeId is required'),
  placeName: z.string().min(1, 'placeName is required'),
  placeAddress: z.string().min(1, 'placeAddress is required'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  // dateTime es opcional — null indica "guardado sin fecha"
  dateTime: z.string().datetime({ offset: true, message: 'dateTime must be an ISO 8601 datetime' }).nullable().optional(),
  durationMinutes: z.number().int().min(1).max(1440).default(60),
  ownerId: z.enum(['DANIEL', 'MAFE', 'SHARED']),
  type: z.enum(['SHARED', 'SOLO_DANIEL', 'SOLO_MAFE']),
  notes: z.string().max(2000).nullable().optional(),
});

const checkProximitySchema = z.object({
  tripId: z.string().uuid('tripId must be a valid UUID'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
});

// ── Tipos de respuesta ────────────────────────────────────────────────────────

export interface ProximityAlert {
  danielItem: {
    id: string;
    placeName: string;
    placeAddress: string;
    dateTime: string;
  };
  mafeItem: {
    id: string;
    placeName: string;
    placeAddress: string;
    dateTime: string;
  };
  distanceKm: number;
  durationMinutes: number;
  distanceText: string;
  durationText: string;
  thresholdKm: number;
  message: string;
}

export interface ProximityCheckResponse {
  tripId: string;
  date: string;
  thresholdKm: number;
  soloItemsAnalyzed: number;
  conflictingPairs: number;
  alerts: ProximityAlert[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Construye el rango de tiempo para consultar un día completo.
 * Usa UTC midnight → next day midnight.
 */
function buildDayRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(`${dateStr}T23:59:59.999Z`);
  return { start, end };
}

// ── Controlador ───────────────────────────────────────────────────────────────

const createTripSchema = z.object({
  name: z.string().min(1, 'Trip name is required'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
  destinations: z.array(z.enum(['CDMX', 'GUADALAJARA', 'CANCUN'])).default([]),
  proximityThresholdKm: z.number().min(0.1).default(5),
});

/**
 * GET /api/trips
 * Lista todos los viajes disponibles.
 */
export async function getTrips(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const trips = await Trip.findAll({ order: [['startDate', 'ASC']] });
    res.json({ data: trips });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/trips
 * Crea un nuevo viaje.
 */
export async function createTrip(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createTripSchema.parse(req.body);
    const trip = await Trip.create({
      name: body.name,
      startDate: body.startDate,
      endDate: body.endDate,
      destinations: body.destinations,
      proximityThresholdKm: body.proximityThresholdKm,
    });
    res.status(201).json({ data: trip });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/trips/:tripId/itinerary?date=YYYY-MM-DD
 * Retorna todos los ItineraryItems de un viaje, opcionalmente filtrados por fecha.
 */
export async function getItinerary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tripId } = req.params;
    const { date, saved } = req.query;

    const whereClause: Record<string, unknown> = { tripId };

    if (saved === 'true') {
      // Retorna solo los ítems guardados (sin fecha)
      whereClause.dateTime = null;
    } else if (date && typeof date === 'string') {
      // Filtra por día específico (excluye los guardados)
      const { start, end } = buildDayRange(date);
      whereClause.dateTime = { [Op.between]: [start, end] };
    } else {
      // Sin filtros: retorna TODOS los ítems (scheduled + no scheduled)
      // No añadimos whereClause.dateTime
    }

    const items = await ItineraryItem.findAll({
      where: whereClause,
      order: [['dateTime', 'ASC']],
    });

    res.json({ data: items });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/trips/:tripId/itinerary
 * Agrega un nuevo lugar al itinerario.
 */
export async function addItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = addItemSchema.parse({ ...req.body, tripId: req.params.tripId });

    // Verificar que el Trip exista
    const trip = await Trip.findByPk(body.tripId);
    if (!trip) {
      res.status(404).json({ error: 'Trip not found', tripId: body.tripId });
      return;
    }

    const itemData: ItineraryItemCreationAttributes = {
      tripId: body.tripId,
      placeId: body.placeId,
      placeName: body.placeName,
      placeAddress: body.placeAddress,
      lat: body.lat,
      lng: body.lng,
      dateTime: body.dateTime ? new Date(body.dateTime) : null,
      durationMinutes: body.durationMinutes,
      ownerId: body.ownerId,
      type: body.type,
      notes: body.notes ?? null,
    };

    const item = await ItineraryItem.create(itemData);

    res.status(201).json({ data: item });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/trips/:tripId/itinerary/:itemId
 * Actualiza parcialmente un ItineraryItem.
 */
export async function updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tripId, itemId } = req.params;

    const item = await ItineraryItem.findOne({ where: { id: itemId, tripId } });
    if (!item) {
      res.status(404).json({ error: 'ItineraryItem not found' });
      return;
    }

    const allowedFields = ['dateTime', 'durationMinutes', 'type', 'ownerId', 'notes'];
    const updates: Partial<ItineraryItemCreationAttributes> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'dateTime') {
          // Permite establecer a null (mover a "Lugares Guardados") o a una fecha válida
          const rawVal = req.body[field];
          (updates as Record<string, unknown>)[field] = rawVal === null ? null : new Date(rawVal);
        } else {
          (updates as Record<string, unknown>)[field] = req.body[field];
        }
      }
    }

    await item.update(updates);
    res.json({ data: item });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/trips/:tripId/itinerary/:itemId
 * Elimina un ItineraryItem.
 */
export async function deleteItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tripId, itemId } = req.params;
    const item = await ItineraryItem.findOne({ where: { id: itemId, tripId } });

    if (!item) {
      res.status(404).json({ error: 'ItineraryItem not found' });
      return;
    }

    await item.destroy();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/trips/:tripId/itinerary/check-proximity?date=YYYY-MM-DD
 *
 * ─── LÓGICA PRINCIPAL DE ESTA ITERACIÓN ───────────────────────────────────────
 *
 * Analiza un día específico del itinerario y detecta pares de actividades
 * SOLO (una de Daniel y una de Mafe) que ocurren aproximadamente a la misma
 * hora y cuya distancia supera el umbral configurado en el Trip.
 *
 * Algoritmo:
 * 1. Obtiene el Trip para leer su proximityThresholdKm.
 * 2. Obtiene todos los items SOLO del día solicitado.
 * 3. Separa en solosDaniel[] y solosMafe[].
 * 4. Para cada par (danielItem, mafeItem) con solapamiento temporal:
 *    a. Llama a Distance Matrix API con las coordenadas cacheadas.
 *    b. Si distanceKm > threshold → agrega una ProximityAlert.
 * 5. Retorna el resumen con todas las alertas.
 *
 * @query tripId - UUID del viaje
 * @query date   - Fecha en formato YYYY-MM-DD
 */
export async function checkProximity(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // ── 1. Validar parámetros ─────────────────────────────────
    const params = checkProximitySchema.parse({
      tripId: req.params.tripId,
      date: req.query.date,
    });

    // ── 2. Obtener el Trip y su threshold ─────────────────────
    const trip = await Trip.findByPk(params.tripId);
    if (!trip) {
      res.status(404).json({ error: 'Trip not found', tripId: params.tripId });
      return;
    }

    const thresholdKm =
      Number(trip.proximityThresholdKm) || CONSTANTS.DEFAULT_PROXIMITY_THRESHOLD_KM;

    // ── 3. Obtener items SOLO del día ─────────────────────────
    const { start, end } = buildDayRange(params.date);

    const soloItems = await ItineraryItem.findAll({
      where: {
        tripId: params.tripId,
        type: { [Op.in]: ['SOLO_DANIEL', 'SOLO_MAFE'] },
        dateTime: { [Op.between]: [start, end] },
      },
      order: [['dateTime', 'ASC']],
    });

    const solosDaniel = soloItems.filter((item) => item.type === 'SOLO_DANIEL');
    const solosMafe = soloItems.filter((item) => item.type === 'SOLO_MAFE');

    // ── 4. Analizar pares con solapamiento temporal ───────────
    const alerts: ProximityAlert[] = [];
    const overlapWindowMs = CONSTANTS.SOLO_OVERLAP_WINDOW_MINUTES * 60 * 1000;

    for (const danielItem of solosDaniel) {
      for (const mafeItem of solosMafe) {
        // Los items del proxy check siempre tienen dateTime (filtrado por Op.between arriba)
        if (!danielItem.dateTime || !mafeItem.dateTime) continue;

        // Verificar solapamiento temporal
        const timeDiffMs = Math.abs(
          danielItem.dateTime.getTime() - mafeItem.dateTime.getTime()
        );

        if (timeDiffMs > overlapWindowMs) {
          continue; // No son concurrentes, saltar
        }

        // ── 5. Calcular distancia con Distance Matrix API ─────
        let distanceResult;
        try {
          distanceResult = await googleMapsService.getDistance(
            { lat: Number(danielItem.lat), lng: Number(danielItem.lng) },
            { lat: Number(mafeItem.lat), lng: Number(mafeItem.lng) }
          );
        } catch (mapError) {
          // Si la API de Maps falla, registrar pero continuar con otros pares
          console.error(
            `[checkProximity] Distance Matrix error for pair (${danielItem.id}, ${mafeItem.id}):`,
            mapError instanceof GoogleMapsServiceError
              ? `${mapError.code}: ${mapError.message}`
              : mapError
          );
          continue;
        }

        // ── 6. Emitir alerta si supera el umbral ──────────────
        if (distanceResult.distanceKm > thresholdKm) {
          alerts.push({
            danielItem: {
              id: danielItem.id,
              placeName: danielItem.placeName,
              placeAddress: danielItem.placeAddress,
              dateTime: danielItem.dateTime!.toISOString(),
            },
            mafeItem: {
              id: mafeItem.id,
              placeName: mafeItem.placeName,
              placeAddress: mafeItem.placeAddress,
              dateTime: mafeItem.dateTime!.toISOString(),
            },
            distanceKm: distanceResult.distanceKm,
            durationMinutes: distanceResult.durationMinutes,
            distanceText: distanceResult.distanceText,
            durationText: distanceResult.durationText,
            thresholdKm,
            message:
              `⚠️ Daniel (${danielItem.placeName}) y Mafe (${mafeItem.placeName}) ` +
              `están a ${distanceResult.distanceText} de distancia ` +
              `(umbral: ${thresholdKm} km). ` +
              `Tiempo estimado de traslado: ${distanceResult.durationText}.`,
          });
        }
      }
    }

    // ── 7. Respuesta ──────────────────────────────────────────
    const response: ProximityCheckResponse = {
      tripId: params.tripId,
      date: params.date,
      thresholdKm,
      soloItemsAnalyzed: soloItems.length,
      conflictingPairs: alerts.length,
      alerts,
    };

    res.json({ data: response });
  } catch (error) {
    next(error);
  }
}
