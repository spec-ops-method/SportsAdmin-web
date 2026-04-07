import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthPayload, UserRole } from '@sportsadmin/shared';

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      carnivalId?: number;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured');

  try {
    const payload = jwt.verify(token, secret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Token is invalid or expired.' } });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } });
      return;
    }
    next();
  };
}

// Role hierarchy for "at least X" checks
const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  operator: 1,
  coordinator: 2,
  admin: 3,
};

export function requireMinRole(minRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
      return;
    }
    if (ROLE_RANK[req.user.role] < ROLE_RANK[minRole]) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } });
      return;
    }
    next();
  };
}
