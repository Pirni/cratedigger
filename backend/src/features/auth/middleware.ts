import type { NextFunction, Request, Response } from 'express';
import { jwtVerify } from 'jose';

import { getUser } from '../users/controller.js';
import type { UserWithRole } from '../users/model.js';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export async function requireBearer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.get('authorization');
  const [scheme, token] = header?.split(' ') ?? [];

  if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token.length === 0) {
    res.set('WWW-Authenticate', 'Bearer').status(401).end();
    return;
  }

  const user = await verifyToken(token);
  if (user === undefined) {
    res.set('WWW-Authenticate', 'Bearer error="invalid_token"').status(401).end();
    return;
  }

  res.locals['user'] = user;
  next();
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  if (currentUser(res).role !== 'admin') {
    res.status(403).json({ error: 'This endpoint requires the admin role.' });
    return;
  }
  next();
}

export function currentUser(res: Response): UserWithRole {
  const user = res.locals['user'] as UserWithRole | undefined;
  if (user === undefined) {
    throw new Error('currentUser called on a route that is not behind requireBearer.');
  }
  return user;
}

async function verifyToken(token: string): Promise<UserWithRole | undefined> {
  let subject: string;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return undefined;
    subject = payload.sub;
  } catch {
    return undefined;
  }
  return getUser(subject);
}
