import React from "react";
import { BriefcaseBusiness } from "lucide-react";
import { Link } from "react-router-dom";
import usePolling from "../hooks/usePolling";
import Stat from "../components/Stat";

export default function JobDetailsPage() {
  const jobId = window.location.pathname.split("/").filter(Boolean)[1];
  const state = usePolling(`/jobs/${jobId}`, 3000);
  if (state.loading)
    return (
      <div className="page">
        <div className="loading">Loading job details...</div>
      </div>
    );
  if (state.error || !state.data?.job)
    return (
      <div className="page">
        <Link className="back-link" to="/jobs">
          ← Back to Jobs
        </Link>
        <div className="panel empty">
          <BriefcaseBusiness size={30} />
          <h3>Job not found</h3>
          <p>The requested job could not be found or is no longer available.</p>
        </div>
      </div>
    );
  const job = state.data.job;
  const executions = job.executions || [];
  const logs = job.logs || [];
  return (
    <div className="page">
      <Link className="back-link" to="/jobs">
        ← Back to Jobs
      </Link>
      <div className="page-intro detail-heading">
        <div>
          <p className="kicker">JOB DETAILS / {job.id}</p>
          <h2>{job.name}</h2>
          <p className="muted">
            {job.project?.name || "Project"} / {job.queue?.name || "Queue"}
          </p>
        </div>
        <span
          className={`status detail-status ${job.status === "DLQ" || job.status === "FAILED" ? "danger-status" : ""}`}
        >
          {job.status}
        </span>
      </div>
      <div className="stat-grid">
        <Stat
          label="Priority"
          value={job.priority}
          detail="scheduling weight"
        />
        <Stat
          label="Attempts"
          value={`${job.attempts} / ${job.maxAttempts}`}
          detail="queue retry policy"
          tone="teal"
        />
        <Stat label="Type" value={job.type} detail="schedule mode" />
        <Stat
          label="Worker"
          value={
            job.claimedBy ||
            executions.find((execution) => execution.workerId)?.workerId ||
            "Unassigned"
          }
          detail="current or last worker"
        />
      </div>
      <div className="detail-grid">
        <section className="panel detail-panel">
          <span className="eyebrow">SCHEDULE</span>
          <h3>
            {job.type === "RECURRING"
              ? job.cronExpression || "Recurring"
              : job.scheduledAt
                ? new Date(job.scheduledAt).toLocaleString()
                : "Immediate"}
          </h3>
          <div className="metadata">
            <span>Created: {new Date(job.createdAt).toLocaleString()}</span>
            <span>Updated: {new Date(job.updatedAt).toLocaleString()}</span>
            <span>
              Started:{" "}
              {job.startedAt
                ? new Date(job.startedAt).toLocaleString()
                : "Not started"}
            </span>
            <span>
              Completed:{" "}
              {job.completedAt
                ? new Date(job.completedAt).toLocaleString()
                : "Not completed"}
            </span>
          </div>
        </section>
        <section className="panel detail-panel">
          <span className="eyebrow">RETRY / ERROR</span>
          <h3>
            {job.dlqEntry
              ? "Dead letter queue"
              : job.lastError
                ? "Last attempt failed"
                : "No errors recorded"}
          </h3>
          <p className={job.lastError ? "error detail-error" : "muted"}>
            {job.lastError ||
              job.dlqEntry?.lastError ||
              "This job has not reported an error."}
          </p>
          {job.dlqEntry && (
            <p className="muted">
              Attempts: {job.dlqEntry.attempts} · Reason:{" "}
              {job.dlqEntry.failureReason}
            </p>
          )}
        </section>
      </div>
      <div className="detail-grid">
        <section className="panel detail-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">PAYLOAD</span>
              <h3>Controlled job input</h3>
            </div>
          </div>
          <pre className="payload">{JSON.stringify(job.payload, null, 2)}</pre>
        </section>
        <section className="panel detail-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">EXECUTION HISTORY</span>
              <h3>{executions.length} attempts</h3>
            </div>
          </div>
          {executions.length === 0 ? (
            <p className="muted">No executions recorded yet.</p>
          ) : (
            <div className="timeline">
              {executions.map((execution) => (
                <div className="timeline-item" key={execution.id}>
                  <strong>Attempt {execution.attemptNumber}</strong>
                  <span>
                    {execution.status} · {execution.workerId || "unassigned"}
                  </span>
                  <small>
                    {new Date(execution.startedAt).toLocaleString()}
                    {execution.error ? ` · ${execution.error}` : ""}
                  </small>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="panel detail-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">EXECUTION LOGS</span>
            <h3>Activity</h3>
          </div>
        </div>
        {logs.length === 0 ? (
          <p className="muted">No logs recorded yet.</p>
        ) : (
          <div className="log-list">
            {logs.map((log) => (
              <div className="log-item" key={log.id}>
                <span className="eyebrow">{log.level}</span>
                <strong>{log.message}</strong>
                <small>
                  {new Date(log.createdAt).toLocaleString()}{" "}
                  {log.workerId ? `· ${log.workerId}` : ""}
                </small>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
