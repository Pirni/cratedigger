export type Role = 'admin' | 'user';

export interface User {
  readonly id: string;
  readonly email: string;
  readonly spotifyUserId: string | null;
  readonly libraryDirectory: string | null;
  readonly createdAt: Date;
}

export interface UserWithRole extends User {
  readonly role: Role;
}

export interface SelfUser {
  readonly id: string;
  readonly email: string;
  readonly spotifyUserId: string | null;
  readonly role: Role;
  readonly createdAt: Date;
}

export interface UserRow {
  readonly id: string;
  readonly email: string;
  readonly spotify_user_id: string | null;
  readonly library_directory: string | null;
  readonly created_at: Date;
}

export interface SpotifyAccount {
  readonly spotifyUserId: string;
  readonly email: string;
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: Date;
}

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`No user with id "${id}".`);
    this.name = 'UserNotFoundError';
  }
}

export class LibraryDirectoryTakenError extends Error {
  constructor(directory: string) {
    super(`Another user already uses the library directory "${directory}".`);
    this.name = 'LibraryDirectoryTakenError';
  }
}
