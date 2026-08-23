import React from "react";
import { ChevronRight } from "lucide-react";
import api from "../lib/api";

export default function OrganizationForm({ organization, onClose, onSaved }) {
  const [form, setForm] = React.useState({
    name: organization?.name || "",
    description: organization?.description || "",
  });
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = organization
        ? await api.patch(`/organizations/${organization.id}`, form)
        : await api.post("/organizations", form);
      onSaved(response.data.data.organization);
      onClose();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message ||
          "Unable to save organization",
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
              {organization ? "EDIT ORGANIZATION" : "NEW ORGANIZATION"}
            </span>
            <h3>
              {organization ? "Update organization" : "Create an organization"}
            </h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
        </div>
        <label>
          Organization Name
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
          {saving
            ? "Saving..."
            : organization
              ? "Save changes"
              : "Create organization"}{" "}
          <ChevronRight size={17} />
        </button>
      </form>
    </div>
  );
}
