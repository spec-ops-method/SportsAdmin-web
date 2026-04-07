import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import prisma from '../prisma/client';
import { signToken } from '../services/token';
import { authenticate } from '../middleware/auth';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimiter';
import { AppError, NotFoundError } from '../middleware/errors';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const resetRequestSchema = z.object({
  email: z.string().email(),
});

// POST /auth/login
router.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });

    // Use constant-time comparison even when user not found to avoid timing attacks
    const hash = user?.passwordHash ?? '$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXXX';
    const valid = await bcrypt.compare(password, hash);

    if (!user || !valid || !user.isActive) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout  (client discards token; server is stateless)
router.post('/logout', authenticate, (_req: Request, res: Response) => {
  res.json({ message: 'Logged out successfully.' });
});

// GET /auth/me
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, displayName: true, role: true, isActive: true },
    });
    if (!user) throw new NotFoundError('User', req.user!.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /auth/reset-password  (placeholder — full email flow is optional per Doc 10)
router.post(
  '/reset-password',
  passwordResetLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      resetRequestSchema.parse(req.body);
      // Always return 200 to avoid revealing whether an email is registered
      res.json({ message: 'If that email is registered, a reset link has been sent.' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
