import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface TripDestinationAttributes {
  id: string;
  tripId: string;
  name: string;        // Ej: "Ciudad de México"
  shortCode: string;   // Ej: "CDMX"
  startDate: string;   // DATEONLY YYYY-MM-DD
  endDate: string;     // DATEONLY YYYY-MM-DD
  color: string;       // HEX Ej: "#06B6D4"
  emoji: string;       // Ej: "🏛️"
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TripDestinationCreationAttributes
  extends Optional<TripDestinationAttributes, 'id' | 'color' | 'emoji' | 'createdAt' | 'updatedAt'> {}

export class TripDestination
  extends Model<TripDestinationAttributes, TripDestinationCreationAttributes>
  implements TripDestinationAttributes
{
  declare id: string;
  declare tripId: string;
  declare name: string;
  declare shortCode: string;
  declare startDate: string;
  declare endDate: string;
  declare color: string;
  declare emoji: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

TripDestination.init(
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
      onUpdate: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Destination name cannot be empty' },
      },
    },
    shortCode: {
      type: DataTypes.STRING(15),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Short code cannot be empty' },
      },
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      validate: {
        isDate: { args: true, msg: 'startDate must be a valid date' },
      },
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      validate: {
        isDate: { args: true, msg: 'endDate must be a valid date' },
      },
    },
    color: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: '#06B6D4',
    },
    emoji: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: '📍',
    },
  },
  {
    sequelize,
    tableName: 'trip_destinations',
    timestamps: true,
    indexes: [
      {
        name: 'trip_destinations_trip_id_idx',
        fields: ['tripId'],
      },
    ],
  },
);
