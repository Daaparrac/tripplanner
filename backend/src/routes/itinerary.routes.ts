import { Router } from 'express';
import {
  getTrips,
  createTrip,
  getItinerary,
  addItem,
  updateItem,
  deleteItem,
  checkProximity,
} from '../controllers/itinerary.controller';

const router = Router();

// ── Trips ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/trips
 * Lista todos los viajes.
 */
router.get('/', getTrips);

/**
 * POST /api/trips
 * Crea un nuevo viaje.
 */
router.post('/', createTrip);

// ── Itinerario ────────────────────────────────────────────────────────────────

/**
 * GET /api/trips/:tripId/itinerary
 * Retorna items del itinerario. Acepta ?date=YYYY-MM-DD para filtrar por día.
 *
 * GET /api/trips/:tripId/itinerary?date=2025-10-23
 */
router.get('/:tripId/itinerary', getItinerary);

/**
 * POST /api/trips/:tripId/itinerary
 * Agrega un lugar al itinerario.
 *
 * Body: { placeId, placeName, placeAddress, lat, lng, dateTime, ownerId, type, durationMinutes?, notes? }
 */
router.post('/:tripId/itinerary', addItem);

/**
 * PATCH /api/trips/:tripId/itinerary/:itemId
 * Actualiza parcialmente un item (dateTime, type, notes, etc.)
 */
router.patch('/:tripId/itinerary/:itemId', updateItem);

/**
 * DELETE /api/trips/:tripId/itinerary/:itemId
 * Elimina un item del itinerario.
 */
router.delete('/:tripId/itinerary/:itemId', deleteItem);

/**
 * GET /api/trips/:tripId/itinerary/check-proximity?date=YYYY-MM-DD
 *
 * Analiza actividades SOLO del día y retorna alertas de proximidad
 * si Daniel y Mafe están programados en lugares muy distantes al mismo tiempo.
 *
 * ⚠️ Esta ruta DEBE declararse ANTES de /:tripId/itinerary/:itemId
 * para evitar que Express interprete 'check-proximity' como un itemId.
 */
router.get('/:tripId/itinerary/check-proximity', checkProximity);

export default router;
