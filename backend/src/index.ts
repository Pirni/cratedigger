import 'dotenv/config';

import { requireEnv } from './utils/env-util.js';

requireEnv('PORT');
requireEnv('YTDLP_PATH');
requireEnv('LIBRARY_ROOT');
requireEnv('MAX_PARALLEL_DOWNLOADS');
requireEnv('DATABASE_URL');
requireEnv('JWT_SECRET');
requireEnv('SPOTIFY_CLIENT_ID');
requireEnv('SPOTIFY_CLIENT_SECRET');
requireEnv('SPOTIFY_REDIRECT_URI');
requireEnv('FRONTEND_URL');

const { runMigrations } = await import('./modules/postgres/migrate.js');
await runMigrations();

const { default: app } = await import('./app.js');
const { checkDownloaderAvailability } = await import('./features/downloads/controller.js');

const PORT = process.env.PORT!;

console.log(`yt-dlp ${await checkDownloaderAvailability()}`);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
