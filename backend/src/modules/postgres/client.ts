import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function query<T extends pg.QueryResultRow>(
  sql: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(sql, [...values]);
  return result.rows;
}

export async function queryOne<T extends pg.QueryResultRow>(
  sql: string,
  values: readonly unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(sql, values);
  return rows[0];
}

export async function closePool(): Promise<void> {
  await pool.end();
}
