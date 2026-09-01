import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const {
  DATABASE_URL,
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_SSL,
  NODE_ENV,
} = process.env;

/**
 * Opciones SSL para Aiven PostgreSQL.
 *
 * Problema: pg v8+ + Node.js TLS estricto trata `sslmode=require` como
 * `verify-full`, lo que rechaza el certificado autofirmado de Aiven con
 * el error SELF_SIGNED_CERT_IN_CHAIN.
 *
 * Solución: `rejectUnauthorized: false` le indica a Node.js que NO
 * verifique la cadena de CA del certificado del servidor. La conexión
 * sigue siendo encriptada con TLS — solo se omite la validación del CA.
 *
 * En producción con AWS Lambda: usar el CA cert de Aiven descargado desde
 * el dashboard (Settings → CA Certificate) y pasar `ca: fs.readFileSync(...)`.
 */
const SSL_OPTIONS = {
  require: true,
  rejectUnauthorized: false, // ← Fix: acepta el cert autofirmado de Aiven
};

let sequelize: Sequelize;

if (DATABASE_URL) {
  // ── Opción A: Connection string (recomendado para Aiven) ──────────────────
  //
  // Limpiamos los params SSL del URL y dejamos que dialectOptions los maneje,
  // ya que pg interpreta ?sslmode=require de forma diferente en v8+.
  const cleanUrl = DATABASE_URL
    .replace(/[?&]sslmode=[^&]*/g, '')
    .replace(/[?&]uselibpqcompat=[^&]*/g, '')
    .replace(/\?$/, '');

  sequelize = new Sequelize(cleanUrl, {
    dialect: 'postgres',
    logging: NODE_ENV === 'development' ? (sql: string) => console.log(`[SQL] ${sql}`) : false,
    dialectOptions: {
      ssl: SSL_OPTIONS,
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30_000,
      idle: 10_000,
    },
  });
} else {
  // ── Opción B: Variables individuales ──────────────────────────────────────
  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error(
      'Missing database configuration. Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME in .env'
    );
  }

  sequelize = new Sequelize({
    dialect: 'postgres',
    host: DB_HOST,
    port: parseInt(DB_PORT ?? '5432', 10),
    username: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    logging: NODE_ENV === 'development' ? (sql: string) => console.log(`[SQL] ${sql}`) : false,
    dialectOptions: {
      ssl: DB_SSL === 'true' ? SSL_OPTIONS : false,
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30_000,
      idle: 10_000,
    },
  });
}

/**
 * Prueba la conexión a la base de datos.
 * Llamar al arrancar el servidor.
 */
export async function connectDatabase(): Promise<void> {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    throw error;
  }
}

export { sequelize };
