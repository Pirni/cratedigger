import { isAbsolute, join } from 'node:path';

import type {
  AudioDownloadFailure,
  AudioDownloadOptions,
  AudioDownloadRequest,
  AudioSource,
  DownloadProgress,
  DownloadedAudio,
} from './model.js';
import { AudioDownloadError } from './model.js';
import type { CliRunner } from '../../utils/cli-runner.js';
import { CliRunError } from '../../utils/cli-model.js';

export const FILE_TAG = '###FILE###';
export const PROGRESS_TAG = '###PROG###';

const AUDIO_FORMAT = 'mp3';

export class YtDlpAudioDownloader {
  private readonly cli: CliRunner;
  private readonly progress = new Map<string, DownloadProgress>();

  constructor(cli: CliRunner) {
    this.cli = cli;
  }

  async download(
    request: AudioDownloadRequest,
    options: AudioDownloadOptions = {},
  ): Promise<DownloadedAudio> {
    validateRequest(request);

    let downloaded: DownloadedAudio | undefined;
    let run;

    try {
      run = await this.cli.run(buildDownloadArgs(request), {
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        onLine: (line) => {
          const progress = readProgress(line);
          if (progress !== undefined) {
            this.progress.set(request.downloadId, progress);
            return;
          }
          downloaded = readDownloadedAudio(line) ?? downloaded;
        },
      });
    } catch (error) {
      throw toAudioDownloadError(error);
    } finally {
      this.progress.delete(request.downloadId);
    }

    if (run.exitCode !== 0) {
      throw new AudioDownloadError(
        classifyFailure(run.stderrTail),
        `yt-dlp exited with code ${String(run.exitCode)}.`,
        { exitCode: run.exitCode, stderrTail: run.stderrTail },
      );
    }
    if (downloaded === undefined) {
      throw new AudioDownloadError(
        'unknown',
        'yt-dlp exited successfully but reported no output file.',
      );
    }
    return downloaded;
  }

  getProgress(downloadId: string): DownloadProgress | undefined {
    return this.progress.get(downloadId);
  }

  async checkAvailability(): Promise<string> {
    let version = '';
    try {
      await this.cli.run(['--version'], {
        onLine: (line) => {
          if (version === '') version = line.trim();
        },
      });
    } catch (error) {
      throw toAudioDownloadError(error);
    }
    return version;
  }
}

export function buildDownloadArgs(request: AudioDownloadRequest): string[] {
  const outputTemplate = join(
    request.targetDirectory,
    `${escapeOutputTemplate(request.filenameStem)}.%(ext)s`,
  );

  return [
    '--no-simulate',
    '--print',
    `after_move:${FILE_TAG}%(filepath)s\t%(duration)s`,
    '--no-playlist',
    '--no-overwrites',
    '--progress',
    '--newline',
    '--progress-template',
    `${PROGRESS_TAG}%(progress)j`,
    '--extract-audio',
    '--audio-format',
    AUDIO_FORMAT,
    '--audio-quality',
    '0',
    '--output',
    outputTemplate,
    '--',
    sourceToArgument(request.source),
  ];
}

function validateRequest(request: AudioDownloadRequest): void {
  if (!isAbsolute(request.targetDirectory)) {
    throw new AudioDownloadError(
      'invalid-request',
      `targetDirectory must be absolute, got "${request.targetDirectory}".`,
    );
  }
  if (/[/\\]/.test(request.filenameStem) || request.filenameStem.trim().length === 0) {
    throw new AudioDownloadError(
      'invalid-request',
      `filenameStem must be a non-empty single path segment, got "${request.filenameStem}".`,
    );
  }
}

function sourceToArgument(source: AudioSource): string {
  return source.kind === 'url' ? source.url : `ytsearch1:${source.query}`;
}

function escapeOutputTemplate(value: string): string {
  return value.replaceAll('%', '%%');
}

function readDownloadedAudio(line: string): DownloadedAudio | undefined {
  if (!line.startsWith(FILE_TAG)) return undefined;
  const [path, durationRaw] = line.slice(FILE_TAG.length).split('\t');
  if (path === undefined || path.length === 0) return undefined;
  const duration = Number(durationRaw);
  return { path, durationSeconds: Number.isFinite(duration) ? duration : undefined };
}

function readProgress(line: string): DownloadProgress | undefined {
  if (!line.startsWith(PROGRESS_TAG)) return undefined;

  let raw: unknown;
  try {
    raw = JSON.parse(line.slice(PROGRESS_TAG.length));
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;

  const record = raw as Record<string, unknown>;
  const downloadedBytes = toFiniteNumber(record['downloaded_bytes']);
  if (downloadedBytes === undefined) return undefined;

  return {
    downloadedBytes,
    totalBytes:
      toFiniteNumber(record['total_bytes']) ?? toFiniteNumber(record['total_bytes_estimate']),
    percent: toFiniteNumber(record['_percent']),
    etaSeconds: toFiniteNumber(record['eta']),
  };
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function classifyFailure(stderr: string): AudioDownloadFailure {
  if (/HTTP Error 429|rate.?limit|sign in to confirm|not a bot/i.test(stderr)) {
    return 'rate-limited';
  }
  if (/unavailable|private video|has been removed|does not exist/i.test(stderr)) {
    return 'source-unavailable';
  }
  return 'unknown';
}

function toAudioDownloadError(error: unknown): AudioDownloadError {
  if (error instanceof AudioDownloadError) return error;
  if (error instanceof CliRunError) {
    const reason: AudioDownloadFailure =
      error.reason === 'spawn-failed' ? 'unknown' : error.reason;
    return new AudioDownloadError(reason, error.message, { cause: error });
  }
  return new AudioDownloadError('unknown', 'yt-dlp failed to run.', { cause: error });
}
