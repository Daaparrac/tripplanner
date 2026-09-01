/**
 * Punto de entrada centralizado para todos los modelos Sequelize.
 *
 * Importar siempre desde aquí, no directamente desde los archivos de modelo,
 * para garantizar que las asociaciones ya estén registradas.
 *
 * Uso:
 *   import { Trip, ItineraryItem } from '../models';
 */

import { sequelize } from '../config/database';
import { Trip } from './Trip.model';
import { ItineraryItem } from './ItineraryItem.model';

// ── Asociaciones ─────────────────────────────────────────────────────────────

/**
 * Un Trip tiene muchos ItineraryItems.
 * Al eliminar un Trip, se eliminan en cascada todos sus items (onDelete: CASCADE en FK).
 */
Trip.hasMany(ItineraryItem, {
  foreignKey: 'tripId',
  as: 'items',
  onDelete: 'CASCADE',
});

ItineraryItem.belongsTo(Trip, {
  foreignKey: 'tripId',
  as: 'trip',
});

// ── Exports ──────────────────────────────────────────────────────────────────

export { Trip, ItineraryItem, sequelize };

/**
 * Sincroniza los modelos con la base de datos.
 *
 * ⚠️ Solo usar `force: true` en desarrollo para recrear tablas.
 * En producción usar migraciones (sequelize-cli).
 */
export async function syncModels(force = false): Promise<void> {
  await sequelize.sync({ force, alter: !force });
  console.log(`✅ Models synchronized (force=${force})`);
}
