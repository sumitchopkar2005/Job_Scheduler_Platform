import React from "react";
import { Building2, ChevronRight, Trash2 } from "lucide-react";
import api from "../lib/api";
import usePolling from "../hooks/usePolling";
import OrganizationForm from "../components/OrganizationForm";

export default function OrganizationsPage() {
  const state = usePolling("/organizations", 5000);
  const [editing, setEditing] = React.useState(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const organizations = state.data?.organizations || [];
  async function remove(organization) {
    if (
      !window.confirm(
        `Delete ${organization.name}? Its projects and queues will also be deleted.`,
      )
    )
      return;
    try {
      await api.delete(`/organizations/${organization.id}`);
      window.location.reload();
    } catch (error) {
      window.alert(
        error.response?.data?.error?.message || "Unable to delete organization",
      );
    }
  }
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="kicker">WORKSPACE</p>
          <h2>Organizations</h2>
          <p className="muted">Manage the workspaces that own your projects.</p>
        </div>
        <button className="primary" onClick={() => setShowCreate(true)}>
          New organization <ChevronRight size={17} />
        </button>
      </div>
      <section className="project-grid">
        {organizations.map((organization) => (
          <article className="project-card" key={organization.id}>
            <div>
              <span className="eyebrow">OWNER WORKSPACE</span>
              <h3>{organization.name}</h3>
              <p>{organization.description || "No description provided."}</p>
            </div>
            <div className="project-meta">
              <span>{organization._count?.members || 1} members</span>
              <span>{organization._count?.projects || 0} projects</span>
              <button
                className="text-link"
                onClick={() => setEditing(organization)}
              >
                Edit
              </button>
              <button
                className="danger-icon"
                aria-label={`Delete ${organization.name}`}
                onClick={() => remove(organization)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
        {!state.loading && organizations.length === 0 && (
          <div className="panel empty">
            <Building2 size={28} />
            <h3>No organizations yet</h3>
            <p>Create an organization to own your projects.</p>
          </div>
        )}
      </section>
      {(showCreate || editing) && (
        <OrganizationForm
          organization={editing}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
          onSaved={() => window.location.reload()}
        />
      )}
    </div>
  );
}
