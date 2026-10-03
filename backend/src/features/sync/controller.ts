import { randomUUID } from 'node:crypto';

import type { AudioSource } from '../../modules/ytdlp/model.js';
import { downloadTrack, getTrackProgress } from '../downloads/controller.js';
import type { Track } from '../shared/model.js';
import type { ActiveDownload, FailedDownload, Job, Run, SyncStatus } from './model.js';
import { NoSyncRunningError, SyncAlreadyRunningError } from './model.js';

const MAX_PARALLEL_DOWNLOADS = parseConcurrency(process.env.MAX_PARALLEL_DOWNLOADS!);
const MAX_REPORTED_FAILURES = 50;

let current: Run | undefined;

export function startSync(userId: string, spotifyUserId: string): string {
  if (current !== undefined && !current.finished) {
    throw new SyncAlreadyRunningError();
  }

  const run: Run = {
    syncId: randomUUID(),
    startedAt: new Date().toISOString(),
    userId,
    spotifyUserId,
    jobs: listTracksToSync().map((track) => ({ track, state: 'queued', reason: undefined })),
    abort: new AbortController(),
    cursor: 0,
    cancelling: false,
    finished: false,
  };
  current = run;
  void drain(run);
  return run.syncId;
}

export function cancelSync(): void {
  if (current === undefined || current.finished) {
    throw new NoSyncRunningError();
  }
  current.cancelling = true;
  current.abort.abort();
}

export function getSyncStatus(): SyncStatus {
  const run = current;
  if (run === undefined) {
    return {
      state: 'idle',
      syncId: undefined,
      startedAt: undefined,
      totals: { queued: 0, active: 0, completed: 0, failed: 0 },
      active: [],
      failures: [],
    };
  }

  const active: ActiveDownload[] = [];
  const failures: FailedDownload[] = [];
  const totals = { queued: 0, active: 0, completed: 0, failed: 0 };

  for (const job of run.jobs) {
    totals[job.state] += 1;
    if (job.state === 'active') {
      const progress = getTrackProgress(run.userId, job.track.id);
      active.push({
        trackId: job.track.id,
        title: job.track.title,
        percent: progress?.percent ?? null,
        etaSeconds: progress?.etaSeconds ?? null,
      });
    }
    if (job.state === 'failed' && failures.length < MAX_REPORTED_FAILURES) {
      failures.push({
        trackId: job.track.id,
        title: job.track.title,
        reason: job.reason ?? 'unknown',
      });
    }
  }

  return {
    state: run.finished ? 'idle' : run.cancelling ? 'cancelling' : 'running',
    syncId: run.syncId,
    startedAt: run.startedAt,
    totals,
    active,
    failures,
  };
}

async function drain(run: Run): Promise<void> {
  const workers = Array.from({ length: MAX_PARALLEL_DOWNLOADS }, () => work(run));
  try {
    await Promise.all(workers);
  } finally {
    run.finished = true;
  }
}

async function work(run: Run): Promise<void> {
  for (;;) {
    if (run.cancelling) return;
    const job = nextQueued(run);
    if (job === undefined) return;

    job.state = 'active';
    try {
      await downloadTrack(
        {
          userId: run.userId,
          spotifyUserId: run.spotifyUserId,
          track: job.track,
          source: searchSourceFor(job.track),
        },
        { signal: run.abort.signal },
      );
      job.state = 'completed';
    } catch (error) {
      job.state = 'failed';
      job.reason = reasonOf(error);
    }
  }
}

function nextQueued(run: Run): Job | undefined {
  while (run.cursor < run.jobs.length) {
    const job = run.jobs[run.cursor];
    run.cursor += 1;
    if (job !== undefined && job.state === 'queued') return job;
  }
  return undefined;
}

function searchSourceFor(track: Track): AudioSource {
  return { kind: 'search', query: `${track.albumArtist} ${track.title}` };
}

function reasonOf(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'reason' in error) {
    return String((error as { reason: unknown }).reason);
  }
  return error instanceof Error ? error.message : 'unknown';
}

function parseConcurrency(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`MAX_PARALLEL_DOWNLOADS must be a positive integer, got "${raw}".`);
  }
  return value;
}

function listTracksToSync(): Track[] {
  return [
    {
      id: 'stub-1',
      albumArtist: 'Daft Punk',
      album: 'Discovery',
      title: 'One More Time',
      trackNumber: 1,
      releaseYear: 2001,
    },
    {
      id: 'stub-2',
      albumArtist: 'Daft Punk',
      album: 'Discovery',
      title: 'Aerodynamic',
      trackNumber: 2,
      releaseYear: 2001,
    },
    {
      id: 'stub-3',
      albumArtist: 'Daft Punk',
      album: 'Random Access Memories',
      title: 'Get Lucky',
      trackNumber: 8,
      releaseYear: 2013,
    },
  ];
}
