import { query, queryOne } from '../../modules/postgres/client.js';
import type { SpotifyAccount, User, UserRow } from './model.js';

const READABLE_FIELDS = 'id, email, spotify_user_id, library_directory, created_at';

const SELECT_BY_ID = `SELECT ${READABLE_FIELDS} FROM users WHERE id = $1`;
const SELECT_ALL = `SELECT ${READABLE_FIELDS} FROM users ORDER BY created_at`;
const DELETE_BY_ID = 'DELETE FROM users WHERE id = $1 RETURNING id';
const UPDATE_LIBRARY_DIRECTORY = `
  UPDATE users SET library_directory = $2 WHERE id = $1 RETURNING ${READABLE_FIELDS}
`;

const UPSERT_FROM_SPOTIFY = `
  INSERT INTO users (email, spotify_user_id, spotify_access_token, spotify_refresh_token, spotify_token_expires_at)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (spotify_user_id) DO UPDATE SET
    email                    = EXCLUDED.email,
    spotify_access_token     = EXCLUDED.spotify_access_token,
    spotify_refresh_token    = COALESCE(EXCLUDED.spotify_refresh_token, users.spotify_refresh_token),
    spotify_token_expires_at = EXCLUDED.spotify_token_expires_at
  RETURNING ${READABLE_FIELDS}
`;

export async function findUserById(id: string): Promise<User | undefined> {
  const row = await queryOne<UserRow>(SELECT_BY_ID, [id]);
  return row === undefined ? undefined : toUser(row);
}

export async function selectAllUsers(): Promise<User[]> {
  return (await query<UserRow>(SELECT_ALL)).map(toUser);
}

export async function deleteUserById(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(DELETE_BY_ID, [id]);
  return row !== undefined;
}

export async function updateLibraryDirectory(
  id: string,
  directory: string | null,
): Promise<User | undefined> {
  const row = await queryOne<UserRow>(UPDATE_LIBRARY_DIRECTORY, [id, directory]);
  return row === undefined ? undefined : toUser(row);
}

export async function upsertSpotifyUser(account: SpotifyAccount): Promise<User> {
  const row = await queryOne<UserRow>(UPSERT_FROM_SPOTIFY, [
    account.email,
    account.spotifyUserId,
    account.accessToken,
    account.refreshToken,
    account.expiresAt,
  ]);
  if (row === undefined) {
    throw new Error('Upsert of the Spotify user returned no row.');
  }
  return toUser(row);
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    spotifyUserId: row.spotify_user_id,
    libraryDirectory: row.library_directory,
    createdAt: row.created_at,
  };
}
