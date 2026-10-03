import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { AudioDownloadError } from '../../modules/ytdlp/model.js';
import { currentUser } from '../auth/middleware.js';
import { BadRequestError } from '../shared/model.js';
import { requirePathParam } from '../shared/request-util.js';
import { getTrackProgress } from './controller.js';

const router = Router();

router.get('/:trackId/progress', (req: Request, res: Response) => {
  const trackId = requirePathParam(req, 'trackId');
  const progress = getTrackProgress(currentUser(res).id, trackId);
  if (progress === undefined) {
    res.status(404).json({ error: 'no download in progress for this track' });
    return;
  }
  res.json(progress);
});

router.use(handleDownloadError);

export default router;

function handleDownloadError(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof BadRequestError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof AudioDownloadError) {
    res.status(statusFor(error)).json({ error: error.message, reason: error.reason });
    return;
  }
  res.status(500).json({ error: 'internal error' });
}

function statusFor(error: AudioDownloadError): number {
  switch (error.reason) {
    case 'invalid-request':
      return 400;
    case 'source-unavailable':
      return 404;
    case 'rate-limited':
      return 429;
    case 'timeout':
      return 504;
    case 'cancelled':
      return 503;
    default:
      return 500;
  }
}

