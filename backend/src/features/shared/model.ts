export interface Track {
  readonly id: string;
  readonly albumArtist: string;
  readonly album: string;
  readonly title: string;
  readonly trackNumber: number;
  readonly releaseYear: number | undefined;
}

export class SpotifyNotLinkedError extends Error {
  constructor() {
    super('This account is not linked to Spotify yet. Log in through Spotify first.');
    this.name = 'SpotifyNotLinkedError';
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}
