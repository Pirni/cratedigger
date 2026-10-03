import type { Request } from 'express';

import { BadRequestError } from './model.js';

export function requireQueryParam(req: Request, name: string): string {
  return requireString(req.query[name], name);
}

export function requirePathParam(req: Request, name: string): string {
  return requireString(req.params[name], name);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError(`${name} is missing or empty.`);
  }
  return value;
}
