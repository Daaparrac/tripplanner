import { Router, Request, Response } from 'express';
import { verifyGoogleToken } from '../services/auth.service';

const router = Router();

/**
 * GET /api/auth/config
 * Retorna la configuración pública de OAuth (Google Client ID)
 */
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    data: {
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    },
  });
});

/**
 * POST /api/auth/verify
 * Verifica un Google ID Token y retorna los datos del usuario con su rol.
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tokenFromBody = req.body?.idToken;

    const idToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : tokenFromBody;

    if (!idToken) {
      return res.status(400).json({
        error: 'ID_TOKEN_REQUIRED',
        message: 'Debes proporcionar un ID token de Google.',
      });
    }

    const user = await verifyGoogleToken(idToken);

    return res.json({
      data: user,
      message: `¡Bienvenido/a ${user.name}!`,
    });
  } catch (error: any) {
    console.error('[AuthRoutes] Error verificando token de Google:', error?.message);
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: error?.message || 'Token de autenticación inválido.',
    });
  }
});

export default router;
