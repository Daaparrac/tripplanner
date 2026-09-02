import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CountryAttributes {
  code: string; // ISO alpha-2 en minúsculas (ej: 'mx', 'co', 'us', 'jp')
  name: string; // Nombre del país (ej: 'Mexico', 'Colombia')
}

export class Country extends Model<CountryAttributes> implements CountryAttributes {
  declare code: string;
  declare name: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Country.init(
  {
    code: {
      type: DataTypes.STRING(10),
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'countries',
    timestamps: true,
  }
);
