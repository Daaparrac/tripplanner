import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: 'DANIEL' | 'MAFE' | 'GUEST';
  emoji: string;
  color: string;
}

/**
 * Valida un Google ID Token y determina el rol del usuario (Daniel / Mafe).
 */
export async function verifyGoogleToken(idToken: string): Promise<AuthenticatedUser> {
  if (!idToken) {
    throw new Error('No se proporcionó token de autenticación.');
  }

  // Si GOOGLE_CLIENT_ID está configurado, valida con la audiencia oficial
  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID || undefined,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new Error('Token de Google inválido.');
  }

  const email = payload.email.toLowerCase().trim();
  const name = payload.name || payload.given_name || 'Viajero';
  const picture = payload.picture || '';

  // Lista de correos configurados o heurística de nombre
  const danielEmails = (process.env.DANIEL_EMAILS || '')
    .toLowerCase()
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const mafeEmails = (process.env.MAFE_EMAILS || '')
    .toLowerCase()
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  let role: 'DANIEL' | 'MAFE' | 'GUEST' = 'GUEST';
  let emoji = '👤';
  let color = '#FF2D78';

  if (danielEmails.includes(email) || name.toLowerCase().includes('daniel') || email.includes('daniel')) {
    role = 'DANIEL';
    emoji = '🧑';
    color = '#10B981'; // Verde Bandera México
  } else if (
    mafeEmails.includes(email) ||
    name.toLowerCase().includes('mafe') ||
    name.toLowerCase().includes('maria') ||
    email.includes('mafe') ||
    email.includes('maria')
  ) {
    role = 'MAFE';
    emoji = '👩';
    color = '#EC4899'; // Magenta Bugambilia
  }

  return {
    id: payload.sub,
    email,
    name,
    picture,
    role,
    emoji,
    color,
  };
}
