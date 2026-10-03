import { spawn } from 'node:child_process';

import type { CliRunOptions, CliRunResult, ProcessCliRunnerConfig } from './cli-model.js';
import { CliRunError } from './cli-model.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const STDERR_TAIL_LIMIT = 4000;

export interface CliRunner {
  run(args: readonly string[], options: CliRunOptions): Promise<CliRunResult>;
}

export class ProcessCliRunner implements CliRunner {
  private readonly binaryPath: string;
  private readonly defaultTimeoutMs: number;

  constructor(config: ProcessCliRunnerConfig) {
    this.binaryPath = config.binaryPath;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async run(args: readonly string[], options: CliRunOptions): Promise<CliRunResult> {
    const externalSignal = options.signal;
    if (externalSignal?.aborted === true) {
      throw new CliRunError('cancelled', 'Cancelled before the process started.');
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? this.defaultTimeoutMs);

    const forwardAbort = (): void => {
      controller.abort();
    };
    externalSignal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      return await this.spawnAndCollect(args, options.onLine, controller, () => timedOut);
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', forwardAbort);
    }
  }

  private spawnAndCollect(
    args: readonly string[],
    onLine: (line: string) => void,
    controller: AbortController,
    hasTimedOut: () => boolean,
  ): Promise<CliRunResult> {
    return new Promise<CliRunResult>((resolve, reject) => {
      const child = spawn(this.binaryPath, [...args], {
        signal: controller.signal,
        windowsHide: true,
      });

      let pending = '';
      let stderrTail = '';

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        pending += chunk;
        let newline = pending.indexOf('\n');
        while (newline !== -1) {
          emit(pending.slice(0, newline), onLine);
          pending = pending.slice(newline + 1);
          newline = pending.indexOf('\n');
        }
      });

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_LIMIT);
      });

      child.on('error', (error: NodeJS.ErrnoException) => {
        reject(this.toRunError(error, hasTimedOut()));
      });

      child.on('close', (exitCode) => {
        emit(pending, onLine);
        resolve({ exitCode, stderrTail });
      });
    });
  }

  private toRunError(error: NodeJS.ErrnoException, timedOut: boolean): CliRunError {
    if (error.name === 'AbortError') {
      return timedOut
        ? new CliRunError('timeout', `"${this.binaryPath}" timed out.`, error)
        : new CliRunError('cancelled', `"${this.binaryPath}" was cancelled.`, error);
    }
    if (error.code === 'ENOENT') {
      return new CliRunError('binary-not-found', `Not found: "${this.binaryPath}".`, error);
    }
    return new CliRunError(
      'spawn-failed',
      `Failed to start "${this.binaryPath}": ${error.message}`,
      error,
    );
  }
}

function emit(raw: string, onLine: (line: string) => void): void {
  const line = raw.replace(/\r$/, '');
  if (line.length > 0) onLine(line);
}
