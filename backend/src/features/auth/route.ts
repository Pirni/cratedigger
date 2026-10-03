import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { SpotifyAuthError } from '../../modules/spotify/model.js';
import { BadRequestError } from '../shared/model.js';
import { requireQueryParam } from '../shared/request-util.js';
import { beginSpotifyLogin, completeSpotifyLogin } from './controller.js';
import { InvalidOAuthStateError } from './model.js';

const router = Router();

router.get('/spotify', (_req: Request, res: Response) => {
  res.redirect(beginSpotifyLogin());
});

router.get('/spotify/callback', async (req: Request, res: Response) => {
  if (typeof req.query['error'] === 'string') {
    throw new BadRequestError(`Spotify denied the login: ${req.query['error']}`);
  }
  const code = requireQueryParam(req, 'code');
  const state = requireQueryParam(req, 'state');

  const token = await completeSpotifyLogin(code, state);

  const target = new URL(process.env.FRONTEND_URL!);
  target.searchParams.set('token', token);
  res.redirect(target.toString());
});

router.use(handleAuthError);

export default router;

function handleAuthError(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof BadRequestError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof InvalidOAuthStateError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof SpotifyAuthError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: 'internal error' });
}
