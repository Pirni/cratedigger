import type { Track } from '../shared/model.js';

export type JobState = 'queued' | 'active' | 'completed' | 'failed';

export interface Job {
  readonly track: Track;
  state: JobState;
  reason: string | undefined;
}

export interface Run {
  readonly syncId: string;
  readonly startedAt: string;
  readonly userId: string;
  readonly spotifyUserId: string;
  readonly jobs: Job[];
  readonly abort: AbortController;
  cursor: number;
  cancelling: boolean;
  finished: boolean;
}

export type SyncState = 'idle' | 'running' | 'cancelling';

export interface SyncTotals {
  readonly queued: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
}

export interface ActiveDownload {
  readonly trackId: string;
  readonly title: string;
  readonly percent: number | null;
  readonly etaSeconds: number | null;
}

export interface FailedDownload {
  readonly trackId: string;
  readonly title: string;
  readonly reason: string;
}

export interface SyncStatus {
  readonly state: SyncState;
  readonly syncId: string | undefined;
  readonly startedAt: string | undefined;
  readonly totals: SyncTotals;
  readonly active: readonly ActiveDownload[];
  readonly failures: readonly FailedDownload[];
}

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super('A sync is already running.');
    this.name = 'SyncAlreadyRunningError';
  }
}

export class NoSyncRunningError extends Error {
  constructor() {
    super('No sync is running.');
    this.name = 'NoSyncRunningError';
  }
}
