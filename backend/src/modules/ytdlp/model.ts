export type AudioSource =
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'search'; readonly query: string };

export interface DownloadedAudio {
  readonly path: string;
  readonly durationSeconds: number | undefined;
}

export interface DownloadProgress {
  readonly downloadedBytes: number;
  readonly totalBytes: number | undefined;
  readonly percent: number | undefined;
  readonly etaSeconds: number | undefined;
}

export type AudioDownloadFailure =
  | 'binary-not-found'
  | 'source-unavailable'
  | 'rate-limited'
  | 'invalid-request'
  | 'timeout'
  | 'cancelled'
  | 'unknown';

export interface AudioDownloadRequest {
  readonly downloadId: string;
  readonly source: AudioSource;
  readonly targetDirectory: string;
  readonly filenameStem: string;
}

export interface AudioDownloadOptions {
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface FakeYtDlpConfig {
  readonly durationSeconds?: number | undefined;
  readonly totalBytes?: number | undefined;
}

export class AudioDownloadError extends Error {
  readonly reason: AudioDownloadFailure;
  readonly exitCode: number | null;
  readonly stderrTail: string;

  constructor(
    reason: AudioDownloadFailure,
    message: string,
    details: {
      readonly exitCode?: number | null | undefined;
      readonly stderrTail?: string | undefined;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = 'AudioDownloadError';
    this.reason = reason;
    this.exitCode = details.exitCode ?? null;
    this.stderrTail = details.stderrTail ?? '';
  }
}
