import React from "react";
import { Boxes } from "lucide-react";
import { Link } from "react-router-dom";
import usePolling from "../hooks/usePolling";
import Stat from "../components/Stat";
import api from "../lib/api";

export default function QueuePage() {
  const queueId = window.location.pathname.split("/")[2];
  const state = usePolling(`/queues/${queueId}`, 5000);
  const [working, setWorking] = React.useState(false);
  async function toggleQueue() {
    setWorking(true);
    try {
      await api.post(
        `/queues/${queueId}/${state.data.queue.paused ? "resume" : "pause"}`,
      );
      window.location.reload();
    } finally {
      setWorking(false);
    }
  }
  if (state.loading) return <div className="loading">Loading queue...</div>;
  if (state.error)
    return (
      <div className="page">
        <div className="notice error">{state.error}</div>
      </div>
    );
  const queue = state.data.queue;
  const jobs = queue.jobs || [];
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="kicker">QUEUE / {queue.project?.name || "PROJECT"}</p>
          <h2>{queue.name}</h2>
          <p className="muted">
            {queue.description || "Queue configuration and controls."}
          </p>
        </div>
        <button className="primary" disabled={working} onClick={toggleQueue}>
          {queue.paused ? "Resume queue" : "Pause queue"}
        </button>
      </div>
      <div className="stat-grid">
        <Stat
          label="Priority"
          value={queue.priority}
          detail="scheduling weight"
        />
        <Stat
          label="Concurrency"
          value={queue.concurrency}
          detail="maximum active jobs"
          tone="teal"
        />
        <Stat
          label="Jobs"
          value={queue._count?.jobs || 0}
          detail="owned by queue"
        />
      </div>
      <section className="panel">
        <span className="eyebrow">RETRY POLICY</span>
        <h3>{queue.retryPolicy?.strategy || "EXPONENTIAL"}</h3>
        <p className="muted">
          Maximum attempts: {queue.retryPolicy?.maximumAttempts || 3}
        </p>
      </section>
      <section className="panel table-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">JOB RUNS</span>
            <h3>All jobs in this queue</h3>
          </div>
        </div>
        {jobs.length === 0 ? (
          <div className="empty">
            <Boxes size={28} />
            <h3>No jobs found</h3>
            <p>Jobs routed to this queue will appear here.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Runs</th>
                <th>Last run</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const runs = job.executions || [];
                const lastRun = runs[0];
                return (
                  <tr key={job.id}>
                    <td>
                      <Link to={`/jobs/${job.id}`}>
                        <strong>{job.name}</strong>
                        <small>{job.id}</small>
                      </Link>
                    </td>
                    <td>
                      <span
                        className={`status ${job.status === "FAILED" || job.status === "DLQ" ? "danger-status" : ""}`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td>
                      {job.attempts} / {job.maxAttempts}
                    </td>
                    <td>{runs.length}</td>
                    <td>
                      {lastRun
                        ? `${new Date(lastRun.startedAt).toLocaleString()} (${lastRun.status})`
                        : "Not run yet"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
