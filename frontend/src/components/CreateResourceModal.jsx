import React from "react";
import { ChevronRight } from "lucide-react";
import api from "../lib/api";
import usePolling from "../hooks/usePolling";

export default function CreateResourceModal({ onClose, onCreated }) {
  const projectsState = usePolling("/projects", 10000);
  const [projectId, setProjectId] = React.useState("");
  const [queueId, setQueueId] = React.useState("");
  const [form, setForm] = React.useState({
    name: "",
    handlerType: "PROCESS_DATA",
    scheduleType: "IMMEDIATE",
    delaySeconds: 30,
    scheduledAt: "",
    cronExpression: "",
    priority: "NORMAL",
  });
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const queuesState = usePolling(
    projectId
      ? `/queues?projectId=${encodeURIComponent(projectId)}`
      : "/queues?projectId=none",
    10000,
  );
  const queues = (queuesState.data?.queues || []).filter(
    (queue) => !projectId || queue.project?.id === projectId,
  );
  function updateProject(event) {
    setProjectId(event.target.value);
    setQueueId("");
  }
  const requiresDate = ["SCHEDULED", "RECURRING"].includes(form.scheduleType);
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!projectId || !queueId) return setError("Select a project and queue");
    if (
      form.scheduleType === "DELAYED" &&
      (!form.delaySeconds || Number(form.delaySeconds) < 1)
    )
      return setError("Enter a delay of at least one second");
    if (requiresDate && !form.scheduledAt)
      return setError("Select a scheduled date and time");
    if (form.scheduleType === "RECURRING" && !form.cronExpression.trim())
      return setError("Enter a cron expression for recurring jobs");
    setSaving(true);
    try {
      const priorityValues = { HIGH: 10, NORMAL: 0, LOW: -10 };
      const body = {
        projectId,
        queueId,
        name: form.name,
        handlerType: form.handlerType,
        type: form.scheduleType,
        priority: priorityValues[form.priority],
      };
      if (form.scheduleType === "DELAYED")
        body.delaySeconds = Number(form.delaySeconds);
      if (requiresDate)
        body.scheduledAt = new Date(form.scheduledAt).toISOString();
      if (form.scheduleType === "RECURRING")
        body.cronExpression = form.cronExpression.trim();
      const response = await api.post("/jobs", body);
      onCreated(response.data.data.job);
      onClose();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message || "Unable to create job",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="modal-card" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <span className="eyebrow">CREATE JOB</span>
            <h3>Dispatch a controlled job</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
        </div>
        <label>
          Project
          <select required value={projectId} onChange={updateProject}>
            <option value="">Select a project</option>
            {(projectsState.data?.projects || []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Queue
          <select
            required
            value={queueId}
            onChange={(event) => setQueueId(event.target.value)}
            disabled={!projectId}
          >
            <option value="">
              {projectId ? "Select a queue" : "Select a project first"}
            </option>
            {queues.map((queue) => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Job Name
          <input
            required
            minLength="1"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Handler Type
          <select
            value={form.handlerType}
            onChange={(event) =>
              setForm({ ...form, handlerType: event.target.value })
            }
          >
            <option value="DELAY_TEST">DELAY_TEST</option>
            <option value="FAIL_TEST">FAIL_TEST</option>
            <option value="PROCESS_DATA">PROCESS_DATA</option>
            <option value="SEND_EMAIL">SEND_EMAIL</option>
            <option value="GENERATE_REPORT">GENERATE_REPORT</option>
          </select>
        </label>
        <label>
          Schedule Type
          <select
            value={form.scheduleType}
            onChange={(event) =>
              setForm({
                ...form,
                scheduleType: event.target.value,
                scheduledAt: "",
                cronExpression: "",
              })
            }
          >
            <option value="IMMEDIATE">Immediate</option>
            <option value="DELAYED">Delayed</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="RECURRING">Recurring</option>
          </select>
        </label>
        {form.scheduleType === "DELAYED" && (
          <label>
            Run After (seconds)
            <input
              required
              min="1"
              type="number"
              value={form.delaySeconds}
              onChange={(event) =>
                setForm({ ...form, delaySeconds: event.target.value })
              }
            />
          </label>
        )}
        {requiresDate && (
          <label>
            {form.scheduleType === "RECURRING"
              ? "Scheduled Start Date/Time"
              : "Scheduled Date/Time"}
            <input
              required
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) =>
                setForm({ ...form, scheduledAt: event.target.value })
              }
            />
          </label>
        )}
        {form.scheduleType === "RECURRING" && (
          <label>
            Cron Expression
            <input
              required
              placeholder="0 * * * *"
              value={form.cronExpression}
              onChange={(event) =>
                setForm({ ...form, cronExpression: event.target.value })
              }
            />
          </label>
        )}
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
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={saving} type="submit">
          {saving ? "Saving..." : "Create job"} <ChevronRight size={17} />
        </button>
      </form>
    </div>
  );
}
