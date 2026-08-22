import { calculateBackoff } from "../../backend/src/services/jobState.js";

export function retryDecision(job, queue) {
  const canRetry = job.attempts < job.maxAttempts;
  const retryDelay = queue?.retryPolicy
    ? calculateBackoff(
        queue.retryPolicy.strategy,
        queue.retryPolicy.initialDelaySeconds,
        job.attempts,
        queue.retryPolicy.maximumDelaySeconds,
      )
    : 10;
  return { canRetry, retryDelay, status: canRetry ? "RETRYING" : "DLQ" };
}
