import jwt from 'jsonwebtoken';
import { AuthPayload } from '@sportsadmin/shared';

export function signToken(payload: AuthPayload): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  const maxAge = parseInt(process.env.SESSION_MAX_AGE_MS ?? '28800000', 10);
  return jwt.sign(payload, secret, { expiresIn: Math.floor(maxAge / 1000) });
}

export function verifyToken(token: string): AuthPayload {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  return jwt.verify(token, secret) as AuthPayload;
}
