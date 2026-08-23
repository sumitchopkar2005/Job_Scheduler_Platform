import React from "react";
import { Server } from "lucide-react";
import usePolling from "../hooks/usePolling";

export default function OperationsList({ type }) {
  const endpoint = type === "workers" ? "/workers" : "/dlq";
  const { data, loading, error } = usePolling(endpoint, 5000);
  const items = data?.[type === "workers" ? "workers" : "entries"] || [];
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="kicker">OPERATIONS</p>
          <h2>{type === "workers" ? "Worker fleet" : "Dead letter queue"}</h2>
          <p className="muted">
            {type === "workers"
              ? "Heartbeat and execution ownership across the fleet."
              : "Permanent failures awaiting inspection and replay."}
          </p>
        </div>
      </div>
      <section className="panel table-panel">
        {loading ? (
          <div className="loading">Loading {type}...</div>
        ) : error ? (
          <div className="notice error">{error}</div>
        ) : items.length === 0 ? (
          <div className="empty">
            <Server size={28} />
            <h3>No {type} found</h3>
            <p>Live operational records will appear here.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{type === "workers" ? "Worker" : "Job"}</th>
                <th>Status</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const label =
                  type === "workers" ? item.id : item.job?.name || item.jobId;
                const status = type === "workers" ? item.status : "DLQ";
                const timestamp =
                  type === "workers" ? item.lastHeartbeatAt : item.createdAt;
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{label}</strong>
                      <small>
                        {type === "workers" ? item.hostname : item.lastError}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`status ${status === "OFFLINE" || status === "DLQ" ? "danger-status" : ""}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td>{new Date(timestamp).toLocaleString()}</td>
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
