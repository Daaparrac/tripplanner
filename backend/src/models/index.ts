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
import { Country } from './Country.model';
import { Trip } from './Trip.model';
import { ItineraryItem } from './ItineraryItem.model';
import { TripDestination } from './TripDestination.model';
import { User } from './User.model';
import { seedCountries } from '../services/country.service';

// ── Asociaciones ─────────────────────────────────────────────────────────────

/**
 * Un Country tiene muchos Trips.
 * Un Trip pertenece a un Country (countryCode).
 */
Country.hasMany(Trip, {
  foreignKey: 'countryCode',
  sourceKey: 'code',
  as: 'trips',
});

Trip.belongsTo(Country, {
  foreignKey: 'countryCode',
  targetKey: 'code',
  as: 'country',
});

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

/**
 * Un Trip tiene muchos TripDestinations (tramos/ciudades).
 */
Trip.hasMany(TripDestination, {
  foreignKey: 'tripId',
  as: 'destinationsList',
  onDelete: 'CASCADE',
});

TripDestination.belongsTo(Trip, {
  foreignKey: 'tripId',
  as: 'trip',
});

// Relación User - Trip: M-N (Muchos a Muchos)
// Un viaje puede pertenecer a varios usuarios, un usuario puede tener varios viajes.
User.belongsToMany(Trip, { through: 'UserTrips' });
Trip.belongsToMany(User, { through: 'UserTrips' });

// ── Exports ──────────────────────────────────────────────────────────────────

export { Country, Trip, ItineraryItem, TripDestination, User, sequelize };

/**
 * Sincroniza los modelos con la base de datos de manera segura y siembra datos iniciales.
 */
export async function syncModels(force = false): Promise<void> {
  // Primero sincronizamos la tabla de países y la sembramos
  await Country.sync({ force });
  await seedCountries();

  // Sincronizar el resto de tablas
  await sequelize.sync({ force });

  // Sembrar destinos iniciales si el viaje de México no los tiene
  try {
    const mexicoTrips = await Trip.findAll({
      where: { countryCode: 'mx' },
      include: [{ model: TripDestination, as: 'destinationsList' }],
    });

    for (const trip of mexicoTrips) {
      const existing = (trip as any).destinationsList || [];
      if (existing.length === 0) {
        await TripDestination.bulkCreate([
          {
            tripId: trip.id,
            name: 'Ciudad de México',
            shortCode: 'CDMX',
            startDate: '2026-10-23',
            endDate: '2026-10-31',
            color: '#06B6D4',
            emoji: '🏛️',
          },
          {
            tripId: trip.id,
            name: 'Guadalajara',
            shortCode: 'GDL',
            startDate: '2026-11-01',
            endDate: '2026-11-04',
            color: '#10B981',
            emoji: '🌮',
          },
          {
            tripId: trip.id,
            name: 'Cancún',
            shortCode: 'CUN',
            startDate: '2026-11-05',
            endDate: '2026-11-11',
            color: '#F59E0B',
            emoji: '🏖️',
          },
        ]);
        console.log(`✅ Seeded default destinations for trip ${trip.name} (${trip.id})`);
      }
    }
  } catch (err: any) {
    console.warn('[syncModels] Destination seeding warning:', err.message);
  }

  console.log(`✅ Models synchronized (force=${force})`);
}
