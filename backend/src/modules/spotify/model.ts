export interface SpotifyTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: Date;
}

export interface SpotifyProfile {
  readonly spotifyUserId: string;
  readonly email: string;
}

export class SpotifyAuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SpotifyAuthError';
    this.status = status;
  }
}
