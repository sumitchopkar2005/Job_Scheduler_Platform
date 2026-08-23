import React from "react";
import { Activity, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import usePolling from "../hooks/usePolling";
import Stat from "../components/Stat";

export default function Dashboard() {
  const { data, loading, error } = usePolling("/metrics");
  if (loading) return <div className="loading">Loading system pulse...</div>;
  if (error)
    return (
      <div className="notice error">
        {error}. Start the API and sign in to view live metrics.
      </div>
    );
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="kicker">FRIDAY, AUGUST 21, 2026</p>
          <h2>Good morning, operator.</h2>
          <p className="muted">Your distributed system at a glance.</p>
        </div>
        <Link className="primary" to="/jobs">
          Create job <ChevronRight size={17} />
        </Link>
      </div>
      <div className="stat-grid">
        <Stat label="Total jobs" value={data.totalJobs} detail="all time" />
        <Stat
          label="Running"
          value={data.runningJobs}
          detail="across active queues"
          tone="teal"
        />
        <Stat
          label="Completed"
          value={data.completedJobs}
          detail={`${Math.round(data.successRate * 100)}% success rate`}
          tone="green"
        />
        <Stat
          label="DLQ"
          value={data.dlqJobs}
          detail="needs attention"
          tone="red"
        />
      </div>
      <div className="content-grid">
        <section className="panel chart-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">SYSTEM HEALTH</span>
              <h3>Execution pulse</h3>
            </div>
            <Activity size={20} className="teal-text" />
          </div>
          <div className="pulse">
            <div className="pulse-line" />
            <span>Metrics are updating from PostgreSQL</span>
          </div>
          <div className="health-row">
            <div>
              <strong>{data.activeWorkers}</strong>
              <span>active workers</span>
            </div>
            <div>
              <strong>{data.queuedJobs + data.scheduledJobs}</strong>
              <span>queue backlog</span>
            </div>
            <div>
              <strong>{Math.round(data.averageExecutionTimeMs)}ms</strong>
              <span>avg duration</span>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">WORKER FLEET</span>
              <h3>Availability</h3>
            </div>
            <Link to="/workers" className="text-link">
              View all
            </Link>
          </div>
          <div className="worker-orbit">
            <div className="orbit-center">
              <strong>{data.activeWorkers}</strong>
              <span>online</span>
            </div>
            <div className="orbit-ring" />
          </div>
          <p className="center-note">{data.offlineWorkers} offline workers</p>
        </section>
      </div>
    </div>
  );
}
