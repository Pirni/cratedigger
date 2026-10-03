import { join } from 'node:path';

import { YtDlpAudioDownloader } from '../../modules/ytdlp/client.js';
import type {
  AudioDownloadOptions,
  DownloadProgress,
  DownloadedAudio,
} from '../../modules/ytdlp/model.js';
import { ProcessCliRunner } from '../../utils/cli-runner.js';
import type { Track } from '../shared/model.js';
import type { DownloadTrackCommand } from './model.js';

const downloader = new YtDlpAudioDownloader(
  new ProcessCliRunner({ binaryPath: process.env.YTDLP_PATH! }),
);

export async function downloadTrack(
  command: DownloadTrackCommand,
  options: AudioDownloadOptions = {},
): Promise<DownloadedAudio> {
  const libraryDirectory = join(process.env.LIBRARY_ROOT!, command.spotifyUserId);

  return downloader.download({
    downloadId: downloadIdFor(command.userId, command.track.id),
    source: command.source,
    targetDirectory: trackDirectory(libraryDirectory, command.track),
    filenameStem: trackFilenameStem(command.track),
  }, options);
}

export function getTrackProgress(
  userId: string,
  trackId: string,
): DownloadProgress | undefined {
  return downloader.getProgress(downloadIdFor(userId, trackId));
}

export async function checkDownloaderAvailability(): Promise<string> {
  return downloader.checkAvailability();
}

function downloadIdFor(userId: string, trackId: string): string {
  return `${userId}:${trackId}`;
}

function trackDirectory(libraryDirectory: string, track: Track): string {
  const album =
    track.releaseYear === undefined
      ? sanitizeSegment(track.album)
      : `${sanitizeSegment(track.album)} (${String(track.releaseYear)})`;

  return [libraryDirectory, sanitizeSegment(track.albumArtist), album].join('/');
}

function trackFilenameStem(track: Track): string {
  const number = String(track.trackNumber).padStart(2, '0');
  return `${number} - ${sanitizeSegment(track.title)}`;
}

function sanitizeSegment(value: string): string {
  const cleaned = value
    .replace(/[/\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return cleaned.length > 0 ? cleaned : 'Unknown';
}
