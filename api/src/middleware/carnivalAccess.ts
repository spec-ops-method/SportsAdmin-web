import { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/client';
import { ForbiddenError, NotFoundError } from './errors';

/**
 * For routes with :carnivalId param — verify the carnival exists and the user
 * is allowed to access it. Admins bypass the user_carnivals check.
 * Attaches req.carnivalId for downstream handlers.
 */
export async function requireCarnivalAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const carnivalId = parseInt(req.params.carnivalId, 10);
    if (isNaN(carnivalId)) {
      throw new NotFoundError('Carnival');
    }

    const carnival = await prisma.carnival.findUnique({ where: { id: carnivalId } });
    if (!carnival) throw new NotFoundError('Carnival', carnivalId);

    // Admins have access to all carnivals
    if (req.user?.role !== 'admin') {
      const access = await prisma.userCarnival.findUnique({
        where: { userId_carnivalId: { userId: req.user!.userId, carnivalId } },
      });
      if (!access) throw new ForbiddenError('You do not have access to this carnival.');
    }

    req.carnivalId = carnivalId;
    next();
  } catch (err) {
    next(err);
  }
}
