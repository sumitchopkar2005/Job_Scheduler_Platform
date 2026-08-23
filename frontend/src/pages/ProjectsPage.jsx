import React from "react";
import { BriefcaseBusiness, ChevronRight } from "lucide-react";
import usePolling from "../hooks/usePolling";
import ProjectForm from "../components/ProjectForm";

export default function ProjectsPage() {
  const projectsState = usePolling("/projects", 5000);
  const organizationsState = usePolling("/organizations", 10000);
  const [editing, setEditing] = React.useState(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const projects = projectsState.data?.projects || [];
  const organizations = organizationsState.data?.organizations || [];
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <p className="kicker">WORKSPACE</p>
          <h2>Projects</h2>
          <p className="muted">
            Select a project when configuring queues and jobs.
          </p>
        </div>
        <button className="primary" onClick={() => setShowCreate(true)}>
          New project <ChevronRight size={17} />
        </button>
      </div>
      <section className="project-grid">
        {projects.map((project) => (
          <article className="project-card" key={project.id}>
            <div>
              <span className="eyebrow">
                {project.organization?.name || "Organization"}
              </span>
              <h3>{project.name}</h3>
              <p>{project.description || "No description provided."}</p>
            </div>
            <div className="project-meta">
              <span>{project._count?.queues || 0} queues</span>
              <span>{project._count?.jobs || 0} jobs</span>
              <button className="text-link" onClick={() => setEditing(project)}>
                Edit
              </button>
            </div>
          </article>
        ))}
        {!projectsState.loading && projects.length === 0 && (
          <div className="panel empty">
            <BriefcaseBusiness size={28} />
            <h3>No projects yet</h3>
            <p>Create a project to start organizing queues.</p>
          </div>
        )}
      </section>
      {(showCreate || editing) && (
        <ProjectForm
          project={editing}
          organizations={organizations}
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
