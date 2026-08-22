import { JobStatus, RetryStrategy } from "@prisma/client";

const transitions = {
  [JobStatus.QUEUED]: [
    JobStatus.CLAIMED,
    JobStatus.SCHEDULED,
    JobStatus.CANCELLED,
  ],
  [JobStatus.SCHEDULED]: [
    JobStatus.QUEUED,
    JobStatus.CLAIMED,
    JobStatus.CANCELLED,
  ],
  [JobStatus.CLAIMED]: [
    JobStatus.RUNNING,
    JobStatus.FAILED,
    JobStatus.CANCELLED,
  ],
  [JobStatus.RUNNING]: [
    JobStatus.COMPLETED,
    JobStatus.FAILED,
    JobStatus.CANCELLED,
  ],
  [JobStatus.FAILED]: [JobStatus.RETRYING, JobStatus.DLQ],
  [JobStatus.RETRYING]: [JobStatus.QUEUED, JobStatus.CANCELLED],
  [JobStatus.COMPLETED]: [],
  [JobStatus.DLQ]: [JobStatus.QUEUED],
  [JobStatus.CANCELLED]: [],
};

export function assertTransition(from, to) {
  if (!transitions[from]?.includes(to)) {
    const error = new Error(`Invalid job transition from ${from} to ${to}`);
    error.statusCode = 409;
    error.code = "INVALID_JOB_TRANSITION";
    error.expose = true;
    throw error;
  }
}

export function calculateBackoff(
  strategy,
  initialDelaySeconds,
  attemptNumber,
  maximumDelaySeconds,
) {
  const multiplier =
    strategy === RetryStrategy.FIXED
      ? 1
      : strategy === RetryStrategy.LINEAR
        ? attemptNumber
        : 2 ** Math.max(0, attemptNumber - 1);
  return Math.min(initialDelaySeconds * multiplier, maximumDelaySeconds);
}
