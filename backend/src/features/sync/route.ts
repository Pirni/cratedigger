import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { currentUser } from '../auth/middleware.js';
import { SpotifyNotLinkedError } from '../shared/model.js';
import { cancelSync, getSyncStatus, startSync } from './controller.js';
import { NoSyncRunningError, SyncAlreadyRunningError } from './model.js';

const router = Router();

router.post('/', (_req: Request, res: Response) => {
  const user = currentUser(res);
  if (user.spotifyUserId === null) {
    throw new SpotifyNotLinkedError();
  }
  res.status(202).json({ syncId: startSync(user.id, user.spotifyUserId) });
});

router.get('/', (_req: Request, res: Response) => {
  res.json(getSyncStatus());
});

router.post('/cancel', (_req: Request, res: Response) => {
  cancelSync();
  res.status(202).json({ state: 'cancelling' });
});

router.use(handleSyncError);

export default router;

function handleSyncError(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof SpotifyNotLinkedError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof SyncAlreadyRunningError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof NoSyncRunningError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: 'internal error' });
}
