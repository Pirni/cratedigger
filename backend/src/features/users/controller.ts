import {
  deleteUserById,
  findUserById,
  selectAllUsers,
  updateLibraryDirectory,
} from './database.js';
import type { Role, SelfUser, User, UserWithRole } from './model.js';
import { LibraryDirectoryTakenError, UserNotFoundError } from './model.js';

const UNIQUE_VIOLATION = '23505';

const adminSpotifyIds = new Set(
  (process.env.ADMIN_SPOTIFY_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0),
);

export function roleFor(spotifyUserId: string | null): Role {
  return spotifyUserId !== null && adminSpotifyIds.has(spotifyUserId) ? 'admin' : 'user';
}

export function withRole(user: User): UserWithRole {
  return { ...user, role: roleFor(user.spotifyUserId) };
}

export function toSelf(user: UserWithRole): SelfUser {
  return {
    id: user.id,
    email: user.email,
    spotifyUserId: user.spotifyUserId,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export async function getUser(id: string): Promise<UserWithRole | undefined> {
  const user = await findUserById(id);
  return user === undefined ? undefined : withRole(user);
}

export async function listUsers(): Promise<UserWithRole[]> {
  return (await selectAllUsers()).map(withRole);
}

export async function removeUser(id: string): Promise<void> {
  if (!(await deleteUserById(id))) {
    throw new UserNotFoundError(id);
  }
}

export async function setLibraryDirectory(
  id: string,
  directory: string | null,
): Promise<UserWithRole> {
  let user: User | undefined;
  try {
    user = await updateLibraryDirectory(id, directory);
  } catch (error) {
    if (directory !== null && isUniqueViolation(error)) {
      throw new LibraryDirectoryTakenError(directory);
    }
    throw error;
  }
  if (user === undefined) {
    throw new UserNotFoundError(id);
  }
  return withRole(user);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION
  );
}
