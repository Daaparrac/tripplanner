import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { connectDatabase } from './config/database';
import { syncModels } from './models';
import authRoutes from './routes/auth.routes';
import itineraryRoutes from './routes/itinerary.routes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

// Cargar variables de entorno ANTES de cualquier otra importación
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT ?? '3002', 10);

// ── Middlewares de Seguridad ───────────────────────────────────────────────────

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:4300,http://localhost:4200')
        .split(',')
        .map((o) => o.trim());

      // Permitir requests sin origin (apps móviles, PWA), localhost, red local, y URLs de Google Cloud Run (.run.app)
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.endsWith('.run.app') || // <-- Clave para que funcione la nube sin bloquearse
        /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Origen bloqueado: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ── Body Parsing ──────────────────────────────────────────────────────────────

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health Check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? 'development',
  });
});

import { authMiddleware } from './middlewares/auth.middleware';
import { getCountries } from './controllers/itinerary.controller';

// ── Rutas de la API ───────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.get('/api/countries', getCountries);
app.use('/api/trips', authMiddleware, itineraryRoutes);

// ── Handlers de Error (siempre al final) ─────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();

    // En desarrollo sincronizamos el schema automáticamente.
    // En producción usar migraciones con sequelize-cli.
    if (process.env.NODE_ENV === 'development') {
      await syncModels(false); // alter: true → actualiza sin borrar datos
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Trip Planner API running on http://0.0.0.0:${PORT}`);
      console.log(`📋 Health: http://0.0.0.0:${PORT}/health`);
      console.log(`🗺️  Itinerary: http://0.0.0.0:${PORT}/api/trips`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();

export default app;
