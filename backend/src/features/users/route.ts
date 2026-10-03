import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { currentUser, requireAdmin } from '../auth/middleware.js';
import { BadRequestError } from '../shared/model.js';
import { requirePathParam } from '../shared/request-util.js';
import { listUsers, removeUser, setLibraryDirectory, toSelf } from './controller.js';
import { LibraryDirectoryTakenError, UserNotFoundError } from './model.js';

const router = Router();

router.get('/me', (_req: Request, res: Response) => {
  res.json(toSelf(currentUser(res)));
});

// Below is admin-only
router.use(requireAdmin);

router.get('/', async (_req: Request, res: Response) => {
  res.json(await listUsers());
});

router.delete('/:id', async (req: Request, res: Response) => {
  await removeUser(requirePathParam(req, 'id'));
  res.status(204).end();
});

router.patch('/:id/library-directory', async (req: Request, res: Response) => {
  const id = requirePathParam(req, 'id');
  res.json(await setLibraryDirectory(id, parseLibraryDirectory(req.body)));
});

router.use(handleUserError);

export default router;

function parseLibraryDirectory(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestError('body must be an object');
  }
  const value = (body as Record<string, unknown>)['libraryDirectory'];
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError('libraryDirectory must be a non-empty string or null');
  }
  return value.trim();
}

function handleUserError(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof BadRequestError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof UserNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof LibraryDirectoryTakenError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: 'internal error' });
}
