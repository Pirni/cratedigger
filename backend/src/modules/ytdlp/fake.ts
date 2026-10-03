import type { CliRunOptions, CliRunResult } from '../../utils/cli-model.js';
import type { CliRunner } from '../../utils/cli-runner.js';
import type { FakeYtDlpConfig } from './model.js';
import { FILE_TAG, PROGRESS_TAG } from './client.js';

const FAKE_VERSION = '0000.00.00';
const DEFAULT_DURATION_SECONDS = 180;
const DEFAULT_TOTAL_BYTES = 4_000_000;

export class FakeYtDlpCliRunner implements CliRunner {
  readonly calls: string[][] = [];

  private readonly durationSeconds: number;
  private readonly totalBytes: number;

  constructor(config: FakeYtDlpConfig = {}) {
    this.durationSeconds = config.durationSeconds ?? DEFAULT_DURATION_SECONDS;
    this.totalBytes = config.totalBytes ?? DEFAULT_TOTAL_BYTES;
  }

  async run(args: readonly string[], options: CliRunOptions): Promise<CliRunResult> {
    this.calls.push([...args]);

    if (args.includes('--version')) {
      options.onLine(FAKE_VERSION);
      return { exitCode: 0, stderrTail: '' };
    }

    const path = resolveOutputPath(args);
    if (path === undefined) {
      return { exitCode: 2, stderrTail: 'ERROR: fake runner found no --output template' };
    }

    for (const fraction of [0.5, 1]) {
      options.onLine(this.progressLine(fraction));
    }
    options.onLine(`${FILE_TAG}${path}\t${String(this.durationSeconds)}`);

    return { exitCode: 0, stderrTail: '' };
  }

  private progressLine(fraction: number): string {
    const downloaded = Math.round(this.totalBytes * fraction);
    return (
      PROGRESS_TAG +
      JSON.stringify({
        status: fraction < 1 ? 'downloading' : 'finished',
        downloaded_bytes: downloaded,
        total_bytes: this.totalBytes,
        _percent: fraction * 100,
        eta: fraction < 1 ? 1 : 0,
      })
    );
  }
}

function resolveOutputPath(args: readonly string[]): string | undefined {
  const template = args[args.indexOf('--output') + 1];
  if (template === undefined || !template.includes('%(ext)s')) return undefined;
  return template.replaceAll('%(ext)s', 'mp3').replaceAll('%%', '%');
}
