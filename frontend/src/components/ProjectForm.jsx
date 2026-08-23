import React from "react";
import { ChevronRight } from "lucide-react";
import api from "../lib/api";

export default function ProjectForm({
  project,
  organizations,
  onClose,
  onSaved,
}) {
  const [form, setForm] = React.useState({
    organizationId: project?.organizationId || organizations[0]?.id || "",
    name: project?.name || "",
    description: project?.description || "",
  });
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = project
        ? await api.patch(`/projects/${project.id}`, {
            name: form.name,
            description: form.description,
          })
        : await api.post("/projects", form);
      onSaved(response.data.data.project);
      onClose();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message || "Unable to save project",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <span className="eyebrow">
              {project ? "EDIT PROJECT" : "NEW PROJECT"}
            </span>
            <h3>{project ? "Update project" : "Create a project"}</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
        </div>
        {!project && (
          <label>
            Organization
            <select
              required
              value={form.organizationId}
              onChange={(event) =>
                setForm({ ...form, organizationId: event.target.value })
              }
            >
              <option value="">Select an organization</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Project Name
          <input
            required
            minLength="2"
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
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={saving} type="submit">
          {saving ? "Saving..." : project ? "Save changes" : "Create project"}{" "}
          <ChevronRight size={17} />
        </button>
      </form>
    </div>
  );
}
