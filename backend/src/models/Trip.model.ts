import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import type { DestinationType } from '../config/constants';

// ── Atributos del modelo ──────────────────────────────────────────────────────

export interface TripAttributes {
  id: string;
  name: string;
  countryCode?: string; // ISO 3166-1 alpha-2, ej: 'MX', 'CO', 'JP', 'ES'
  startDate: string;        // DATEONLY → string en Sequelize (YYYY-MM-DD)
  endDate: string;
  destinations: string[];
  /**
   * Umbral de proximidad configurable por viaje (km).
   * Si la distancia entre Daniel y Mafe supera este valor, se emite una alerta.
   * Default: 5.0 km
   */
  proximityThresholdKm: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Campos opcionales al crear (se generan automáticamente) */
export interface TripCreationAttributes
  extends Optional<TripAttributes, 'id' | 'countryCode' | 'proximityThresholdKm' | 'createdAt' | 'updatedAt'> {}

// ── Clase del Modelo ──────────────────────────────────────────────────────────

export class Trip
  extends Model<TripAttributes, TripCreationAttributes>
  implements TripAttributes
{
  declare id: string;
  declare name: string;
  declare countryCode?: string;
  declare startDate: string;
  declare endDate: string;
  declare destinations: string[];
  declare proximityThresholdKm: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // ── Métodos de instancia ────────────────────────────────────

  /**
   * Calcula la duración total del viaje en días (ambos extremos incluidos).
   */
  getDaysCount(): number {
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
  }

  /**
   * Retorna el array de fechas diarias del viaje en formato YYYY-MM-DD.
   */
  getDailyDates(): string[] {
    const dates: string[] = [];
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    const current = new Date(start);

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }
}

// ── Definición del esquema ────────────────────────────────────────────────────

Trip.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Trip name cannot be empty' },
        len: { args: [1, 200], msg: 'Trip name must be between 1 and 200 characters' },
      },
    },
    countryCode: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: 'mx',
      references: {
        model: 'countries',
        key: 'code',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      validate: {
        isDate: { msg: 'startDate must be a valid date', args: true },
      },
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      validate: {
        isDate: { msg: 'endDate must be a valid date', args: true },
        isAfterStartDate(value: string) {
          if (new Date(value) <= new Date(this.startDate as string)) {
            throw new Error('endDate must be strictly after startDate');
          }
        },
      },
    },
    destinations: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      validate: {
        isValidDestinations(value: unknown) {
          if (!Array.isArray(value) || value.some((d) => typeof d !== 'string')) {
            throw new Error('destinations must be an array of strings');
          }
        },
      },
    },
    proximityThresholdKm: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 5.0,
      validate: {
        min: { args: [0.1], msg: 'Threshold must be at least 0.1 km' },
        max: { args: [500], msg: 'Threshold cannot exceed 500 km' },
      },
    },
  },
  {
    sequelize,
    tableName: 'trips',
    timestamps: true,
    indexes: [
      {
        fields: ['startDate', 'endDate'],
        name: 'trips_dates_idx',
      },
    ],
  }
);
