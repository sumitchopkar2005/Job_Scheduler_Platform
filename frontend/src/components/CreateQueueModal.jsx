import React from "react";
import { ChevronRight } from "lucide-react";
import api from "../lib/api";
import usePolling from "../hooks/usePolling";

export default function CreateQueueModal({ onClose, onCreated }) {
  const projectsState = usePolling("/projects", 10000);
  const [form, setForm] = React.useState({
    projectId: "",
    name: "",
    description: "",
    priority: "NORMAL",
    concurrency: 1,
    strategy: "EXPONENTIAL",
    maximumAttempts: 3,
  });
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const priorityValues = { HIGH: 10, NORMAL: 0, LOW: -10 };
      const body = {
        ...form,
        concurrency: Number(form.concurrency),
        priority: priorityValues[form.priority],
        maximumAttempts: Number(form.maximumAttempts),
      };
      const response = await api.post("/queues", body);
      onCreated(response.data.data.queue);
      onClose();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message ||
          requestError.message ||
          "Unable to create resource",
      );
    } finally {
      setSaving(false);
    }
  }
  const projects = projectsState.data?.projects || [];
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="modal-card" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <span className="eyebrow">CREATE QUEUE</span>
            <h3>Configure a queue</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
        </div>
        <label>
          Project
          <select
            required
            value={form.projectId}
            onChange={(event) =>
              setForm({ ...form, projectId: event.target.value })
            }
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Queue Name
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Description
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
        </label>
        <label>
          Priority
          <select
            value={form.priority}
            onChange={(event) =>
              setForm({ ...form, priority: event.target.value })
            }
          >
            <option value="HIGH">High</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label>
          Concurrency Limit
          <input
            required
            min="1"
            max="100"
            type="number"
            value={form.concurrency}
            onChange={(event) =>
              setForm({ ...form, concurrency: event.target.value })
            }
          />
        </label>
        <label>
          Retry Policy
          <select
            value={form.strategy}
            onChange={(event) =>
              setForm({ ...form, strategy: event.target.value })
            }
          >
            <option value="FIXED">Fixed Delay</option>
            <option value="LINEAR">Linear Backoff</option>
            <option value="EXPONENTIAL">Exponential Backoff</option>
          </select>
        </label>
        <label>
          Max Attempts
          <input
            required
            min="1"
            max="20"
            type="number"
            value={form.maximumAttempts}
            onChange={(event) =>
              setForm({ ...form, maximumAttempts: event.target.value })
            }
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button
          className="primary"
          disabled={saving || projectsState.loading}
          type="submit"
        >
          {saving ? "Saving..." : "Create"} <ChevronRight size={17} />
        </button>
      </form>
    </div>
  );
}
