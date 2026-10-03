import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { SignJWT } from 'jose';

import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchProfile,
} from '../../modules/spotify/client.js';
import { upsertSpotifyUser } from '../users/database.js';
import type { User } from '../users/model.js';
import { InvalidOAuthStateError } from './model.js';

const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL = '7d';

const pendingStates = new Map<string, number>();

export function beginSpotifyLogin(): string {
  const state = randomUUID();
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  return buildAuthorizeUrl(state);
}

export async function completeSpotifyLogin(code: string, state: string): Promise<string> {
  consumeState(state);

  const tokens = await exchangeCodeForTokens(code);
  const profile = await fetchProfile(tokens.accessToken);

  const user = await upsertSpotifyUser({
    spotifyUserId: profile.spotifyUserId,
    email: profile.email,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });

  await mkdir(join(process.env.LIBRARY_ROOT!, profile.spotifyUserId), { recursive: true });

  return issueToken(user);
}

async function issueToken(user: User): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret);
}

function consumeState(state: string): void {
  dropExpiredStates();
  if (!pendingStates.delete(state)) {
    throw new InvalidOAuthStateError();
  }
}

function dropExpiredStates(): void {
  const now = Date.now();
  for (const [state, expiresAt] of pendingStates) {
    if (expiresAt < now) pendingStates.delete(state);
  }
}
