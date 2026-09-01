import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

// ── Tipos de dominio ─────────────────────────────────────────────────────────

/**
 * Propietario de la actividad.
 * Fase 1: IDs estáticos. Fase 2: reemplazar con sub de Cognito.
 */
export type OwnerId = 'DANIEL' | 'MAFE' | 'SHARED';

/**
 * Tipo de actividad:
 * - SHARED: ambos participan juntos
 * - SOLO_DANIEL: solo Daniel, en paralelo a alguna actividad de Mafe
 * - SOLO_MAFE: solo Mafe, en paralelo a alguna actividad de Daniel
 */
export type ItemType = 'SHARED' | 'SOLO_DANIEL' | 'SOLO_MAFE';

// ── Atributos del modelo ─────────────────────────────────────────────────────

export interface ItineraryItemAttributes {
  id: string;
  tripId: string;

  // ── Google Maps ────────────────────────────────────────────
  /** Place ID de Google Maps (ej: ChIJN1t_tDeuEmsRUsoyG83frY4) */
  placeId: string;
  /** Nombre legible del lugar */
  placeName: string;
  /** Dirección formateada */
  placeAddress: string;
  /** Latitud cacheada (evita llamadas extra a Places API) */
  lat: number;
  /** Longitud cacheada */
  lng: number;

  // ── Temporalidad ────────────────────────────────────────────────
  /**
   * Fecha y hora de inicio de la actividad (con timezone).
   * NULL si el ítem está guardado sin fecha asignada ("Lugares Guardados").
   */
  dateTime: Date | null;
  /** Duración estimada en minutos */
  durationMinutes: number;

  // ── Ownership ──────────────────────────────────────────────
  ownerId: OwnerId;
  type: ItemType;

  // ── Extras ────────────────────────────────────────────────
  notes?: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface ItineraryItemCreationAttributes
  extends Optional<
    ItineraryItemAttributes,
    'id' | 'notes' | 'durationMinutes' | 'dateTime' | 'createdAt' | 'updatedAt'
  > {}

// ── Clase del Modelo ─────────────────────────────────────────────────────────

export class ItineraryItem
  extends Model<ItineraryItemAttributes, ItineraryItemCreationAttributes>
  implements ItineraryItemAttributes
{
  declare id: string;
  declare tripId: string;
  declare placeId: string;
  declare placeName: string;
  declare placeAddress: string;
  declare lat: number;
  declare lng: number;
  declare dateTime: Date | null;
  declare durationMinutes: number;
  declare ownerId: OwnerId;
  declare type: ItemType;
  declare notes: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // ── Métodos de instancia ────────────────────────────────────

  /**
   * Calcula la fecha de fin de la actividad (dateTime + durationMinutes).
   */
  getEndTime(): Date | null {
    if (!this.dateTime) return null;
    return new Date(this.dateTime.getTime() + this.durationMinutes * 60 * 1000);
  }

  /**
   * Verifica si esta actividad se solapa temporalmente con otra,
   * usando la ventana en minutos provista.
   */
  overlapsWith(other: ItineraryItem, windowMinutes = 60): boolean {
    if (!this.dateTime || !other.dateTime) return false;
    const thisStart = this.dateTime.getTime();
    const otherStart = other.dateTime.getTime();
    const diff = Math.abs(thisStart - otherStart);
    return diff <= windowMinutes * 60 * 1000;
  }
}

// ── Definición del esquema ────────────────────────────────────────────────────

ItineraryItem.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tripId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'trips',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    placeId: {
      type: DataTypes.STRING(500),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'placeId cannot be empty' },
      },
    },
    placeName: {
      type: DataTypes.STRING(300),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'placeName cannot be empty' },
      },
    },
    placeAddress: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    lat: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
      validate: {
        min: { args: [-90], msg: 'lat must be >= -90' },
        max: { args: [90], msg: 'lat must be <= 90' },
      },
    },
    lng: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
      validate: {
        min: { args: [-180], msg: 'lng must be >= -180' },
        max: { args: [180], msg: 'lng must be <= 180' },
      },
    },
    dateTime: {
      type: DataTypes.DATE, // TIMESTAMPTZ en PostgreSQL
      allowNull: true,     // NULL = item guardado sin fecha ("Lugares Guardados")
      defaultValue: null,
      validate: {
        isDate: {
          msg: 'dateTime must be a valid datetime',
          args: true,
        },
      },
    },
    durationMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60,
      validate: {
        min: { args: [1], msg: 'durationMinutes must be at least 1' },
        max: { args: [1440], msg: 'durationMinutes cannot exceed 1440 (24h)' },
      },
    },
    ownerId: {
      type: DataTypes.ENUM('DANIEL', 'MAFE', 'SHARED'),
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('SHARED', 'SOLO_DANIEL', 'SOLO_MAFE'),
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize,
    tableName: 'itinerary_items',
    timestamps: true,
    indexes: [
      // Consultas más frecuentes: itinerary de un trip por día
      {
        fields: ['tripId', 'dateTime'],
        name: 'itinerary_items_trip_datetime_idx',
      },
      // Filtrar por tipo para la lógica de proximidad
      {
        fields: ['tripId', 'type'],
        name: 'itinerary_items_trip_type_idx',
      },
      // Lookup por placeId (para evitar duplicados)
      {
        fields: ['tripId', 'placeId'],
        name: 'itinerary_items_trip_place_idx',
      },
    ],
  }
);
