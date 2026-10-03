export interface ProcessCliRunnerConfig {
  readonly binaryPath: string;
  readonly defaultTimeoutMs?: number | undefined;
}

export interface CliRunOptions {
  readonly onLine: (line: string) => void;
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface CliRunResult {
  readonly exitCode: number | null;
  readonly stderrTail: string;
}

export type CliFailureReason =
  | 'binary-not-found'
  | 'timeout'
  | 'cancelled'
  | 'spawn-failed';

export class CliRunError extends Error {
  readonly reason: CliFailureReason;

  constructor(reason: CliFailureReason, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'CliRunError';
    this.reason = reason;
  }
}
