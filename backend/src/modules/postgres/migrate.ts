import { fileURLToPath } from 'node:url';

import { runner } from 'node-pg-migrate';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../migrations', import.meta.url));

export async function runMigrations(): Promise<void> {
  const applied = await runner({
    databaseUrl: process.env.DATABASE_URL!,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });

  console.log(
    applied.length === 0
      ? 'migrations: up to date'
      : `migrations: applied ${String(applied.length)} (${applied.map((m) => m.name).join(', ')})`,
  );
}
