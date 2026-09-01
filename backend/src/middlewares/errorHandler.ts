import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ValidationError, DatabaseError, UniqueConstraintError } from 'sequelize';
import { GoogleMapsServiceError } from '../services/googleMaps.service';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

/**
 * Middleware global de manejo de errores para Express.
 *
 * Orden de procesamiento:
 * 1. Errores de validación Zod → 400
 * 2. Errores de validación Sequelize → 400
 * 3. Errores de restricción única → 409
 * 4. Errores de DB Sequelize → 500
 * 5. Errores de Google Maps → código del servicio
 * 6. Errores genéricos
 */
export function errorHandler(
  error: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    error: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });

  // ── Zod: Errores de validación de request ─────────────────
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Validation Error',
      details: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // ── Sequelize: Errores de validación de modelo ────────────
  if (error instanceof ValidationError) {
    res.status(400).json({
      error: 'Model Validation Error',
      details: error.errors.map((e) => ({
        field: e.path,
        message: e.message,
      })),
    });
    return;
  }

  // ── Sequelize: Restricción única (duplicate key) ──────────
  if (error instanceof UniqueConstraintError) {
    res.status(409).json({
      error: 'Conflict',
      message: 'A record with these values already exists.',
    });
    return;
  }

  // ── Sequelize: Errores de base de datos ───────────────────
  if (error instanceof DatabaseError) {
    res.status(500).json({
      error: 'Database Error',
      message: 'An unexpected database error occurred.',
    });
    return;
  }

  // ── Google Maps Service Error ─────────────────────────────
  if (error instanceof GoogleMapsServiceError) {
    res.status(error.statusCode).json({
      error: 'Google Maps Error',
      code: error.code,
      message: error.message,
    });
    return;
  }

  // ── Error genérico ────────────────────────────────────────
  const statusCode = error.statusCode ?? 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal Server Error' : error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
}

/**
 * Middleware para rutas no encontradas (404).
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} does not exist.`,
  });
}
