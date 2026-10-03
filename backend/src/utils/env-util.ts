export function requireEnv(name: string): void {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  }
}
