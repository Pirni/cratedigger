import type { SpotifyProfile, SpotifyTokens } from './model.js';
import { SpotifyAuthError } from './model.js';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const PROFILE_URL = 'https://api.spotify.com/v1/me';

const SCOPES = [
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
];

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    scope: SCOPES.join(' '),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basicAuth()}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    }),
  });
  return toTokens(await readJson(response, 'token exchange'));
}

export async function refreshTokens(refreshToken: string): Promise<SpotifyTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basicAuth()}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const tokens = toTokens(await readJson(response, 'token refresh'));
  return tokens.refreshToken === null ? { ...tokens, refreshToken } : tokens;
}

export async function fetchProfile(accessToken: string): Promise<SpotifyProfile> {
  const response = await fetch(PROFILE_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = await readJson(response, 'profile');

  const id = body['id'];
  const email = body['email'];
  if (typeof id !== 'string' || typeof email !== 'string') {
    throw new SpotifyAuthError('Spotify profile is missing id or email.', 502);
  }
  return { spotifyUserId: id, email: email.trim().toLowerCase() };
}

function basicAuth(): string {
  const pair = `${process.env.SPOTIFY_CLIENT_ID!}:${process.env.SPOTIFY_CLIENT_SECRET!}`;
  return Buffer.from(pair).toString('base64');
}

async function readJson(
  response: Response,
  what: string,
): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new SpotifyAuthError(
      `Spotify ${what} failed with ${String(response.status)}: ${text.slice(0, 200)}`,
      502,
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new SpotifyAuthError(`Spotify ${what} returned invalid JSON.`, 502);
  }
}

function toTokens(body: Record<string, unknown>): SpotifyTokens {
  const accessToken = body['access_token'];
  const expiresIn = body['expires_in'];
  const refreshToken = body['refresh_token'];

  if (typeof accessToken !== 'string' || typeof expiresIn !== 'number') {
    throw new SpotifyAuthError('Spotify token response is malformed.', 502);
  }
  return {
    accessToken,
    refreshToken: typeof refreshToken === 'string' ? refreshToken : null,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}
