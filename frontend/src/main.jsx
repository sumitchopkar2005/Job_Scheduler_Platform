import React from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  Link,
  useLocation,
} from "react-router-dom";
import {
  Activity,
  Boxes,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  CircleGauge,
  LogOut,
  Menu,
  Server,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import axios from "axios";
import "./styles.css";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1",
});
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("scheduler_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("scheduler_token");
      window.dispatchEvent(new Event("scheduler:auth-invalid"));
    }
    return Promise.reject(error);
  },
);
const AuthContext = React.createContext(null);
function AuthProvider({ children }) {
  const [state, setState] = React.useState({
    ready: false,
    authenticated: false,
  });
  React.useEffect(() => {
    let active = true;
    const invalidate = () =>
      active && setState({ ready: true, authenticated: false });
    const token = localStorage.getItem("scheduler_token");
    if (!token) invalidate();
    else
      api
        .get("/auth/me")
        .then(() => active && setState({ ready: true, authenticated: true }))
        .catch(invalidate);
    window.addEventListener("scheduler:auth-invalid", invalidate);
    return () => {
      active = false;
      window.removeEventListener("scheduler:auth-invalid", invalidate);
    };
  }, []);
  const establish = (token) => {
    localStorage.setItem("scheduler_token", token);
    setState({ ready: true, authenticated: true });
  };
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* The local token must still be removed. */
    }
    localStorage.removeItem("scheduler_token");
    setState({ ready: true, authenticated: false });
  };
  return (
    <AuthContext.Provider value={{ ...state, establish, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
const useAuth = () => React.useContext(AuthContext);

function AuthPage({ register = false }) {
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    password: "",
    passwordConfirmation: "",
  });
  const [error, setError] = React.useState("");
  const navigate = useNavigate();
  const auth = useAuth();
  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const body = register
        ? form
        : { email: form.email, password: form.password };
      const response = await api.post(
        `/auth/${register ? "register" : "login"}`,
        body,
      );
      auth.establish(response.data.data.token);
      navigate("/dashboard");
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message || "Unable to authenticate",
      );
    }
  }
  if (!auth.ready) return <div className="loading">Checking session...</div>;
  if (auth.authenticated) return <Navigate to="/dashboard" replace />;
  return (
    <main className="auth-page">
      <section className="auth-art">
        <span className="eyebrow">RUNWAY / CONTROL PLANE</span>
        <h1>
          Move every job
          <br />
          <em>with intent.</em>
        </h1>
        <p>Reliable background work, visible from claim to completion.</p>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <span className="eyebrow">
          {register ? "CREATE ACCOUNT" : "WELCOME BACK"}
        </span>
        <h2>{register ? "Start orchestrating" : "Sign in to Runway"}</h2>
        {register && (
          <label>
            Name
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
        )}
        <label>
          Email
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
          />
        </label>
        <label>
          Password
          <input
            required
            minLength="8"
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm({ ...form, password: event.target.value })
            }
          />
        </label>
        {register && (
          <label>
            Confirm Password
            <input
              required
              minLength="8"
              type="password"
              value={form.passwordConfirmation}
              onChange={(event) =>
                setForm({ ...form, passwordConfirmation: event.target.value })
              }
            />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">
          {register ? "Create account" : "Continue"} <ChevronRight size={17} />
        </button>
        <p className="switch">
          {register ? "Already have an account?" : "New to Runway?"}{" "}
          <Link to={register ? "/login" : "/register"}>
            {register ? "Sign in" : "Create account"}
          </Link>
        </p>
      </form>
    </main>
  );
}

function useNavigate() {
  return (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
}

function usePolling(path, interval = 5000) {
  const [state, setState] = React.useState({
    data: null,
    loading: true,
    error: "",
  });
  React.useEffect(() => {
    let active = true;
    const load = () =>
      api
        .get(path)
        .then(
          (response) =>
            active &&
            setState({ data: response.data.data, loading: false, error: "" }),
        )
        .catch(
          (error) =>
            active &&
            setState({
              data: null,
              loading: false,
              error: error.response?.data?.error?.message || "Request failed",
            }),
        );
    load();
    const timer = setInterval(load, interval);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, interval]);
  return state;
}

const navItems = [
  { path: "/dashboard", label: "Overview", icon: CircleGauge },
  { path: "/organizations", label: "Organizations", icon: Building2 },
  { path: "/projects", label: "Projects", icon: BriefcaseBusiness },
  { path: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { path: "/queues", label: "Queues", icon: Boxes },
  { path: "/workers", label: "Workers", icon: Server },
  { path: "/dlq", label: "Dead letter", icon: ShieldAlert },
];
function Shell({ children }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const auth = useAuth();
  return (
    <div className="app-shell">
      <aside className={menuOpen ? "menu-open" : ""}>
        <div className="brand">
          <span className="brand-mark">R</span>
          <span>Runway</span>
        </div>
        <nav>
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              onClick={() => setMenuOpen(false)}
              className={location.pathname === path ? "active" : ""}
              to={path}
              key={path}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <button className="logout" onClick={auth.logout}>
          <LogOut size={17} />
          Sign out
        </button>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <span className="eyebrow">
              OPERATIONS /{" "}
              {location.pathname.slice(1).toUpperCase() || "OVERVIEW"}
            </span>
            <h1>
              {navItems.find((item) => item.path === location.pathname)
                ?.label || "Control plane"}
            </h1>
          </div>
          <div className="live">
            <span />
            Live polling
          </div>
          <button
            className="icon-button"
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Stat({ label, value, detail, tone = "" }) {
  return (
    <div className={`stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function CreateQueueModal({ onClose, onCreated }) {
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
function CreateResourceModal({ onClose, onCreated }) {
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

function Dashboard() {
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
function ProjectForm({ project, organizations, onClose, onSaved }) {
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
function OrganizationForm({ organization, onClose, onSaved }) {
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
function OrganizationsPage() {
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
function ProjectsPage() {
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
function ResourcePage({ type }) {
  const [showCreate, setShowCreate] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const endpoint = type === "jobs" ? "/jobs" : "/queues";
  const { data, loading, error } = usePolling(
    endpoint,
    type === "jobs" ? 3000 : 5000,
  );
  const items = (data?.[type] || []).filter((item) =>
    item.name.toLowerCase().includes(query.toLowerCase()),
  );
  const createModal =
    type === "jobs" ? (
      <CreateResourceModal
        onClose={() => setShowCreate(false)}
        onCreated={() => window.location.reload()}
      />
    ) : (
      <CreateQueueModal
        onClose={() => setShowCreate(false)}
        onCreated={() => window.location.reload()}
      />
    );
  return (
    <div className="page">
      <div className="toolbar">
        <input
          className="search-box"
          placeholder={`Search ${type}...`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="primary" onClick={() => setShowCreate(true)}>
          Create {type === "jobs" ? "job" : "queue"} <ChevronRight size={17} />
        </button>
      </div>
      <section className="panel table-panel">
        {loading ? (
          <div className="loading">Loading {type}...</div>
        ) : error ? (
          <div className="notice error">{error}</div>
        ) : items.length === 0 ? (
          <div className="empty">
            <Boxes size={28} />
            <h3>No {type} yet</h3>
            <p>Resources created through the API will appear here.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link
                      to={
                        type === "queues"
                          ? `/queues/${item.id}`
                          : `/jobs/${item.id}`
                      }
                    >
                      <strong>{item.name}</strong>
                      <small>{item.id}</small>
                    </Link>
                  </td>
                  <td>
                    <span className="status">
                      {item.status || (item.paused ? "PAUSED" : "ACTIVE")}
                    </span>
                  </td>
                  <td>
                    {new Date(
                      item.updatedAt || item.createdAt,
                    ).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {showCreate && createModal}
    </div>
  );
}
function JobDetailsPage() {
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
function QueuePage() {
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
function OperationsList({ type }) {
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
function Protected({ children }) {
  const auth = useAuth();
  if (!auth.ready) return <div className="loading">Checking session...</div>;
  return auth.authenticated ? (
    <Shell>{children}</Shell>
  ) : (
    <Navigate to="/login" replace />
  );
}
function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage register />} />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/organizations"
        element={
          <Protected>
            <OrganizationsPage />
          </Protected>
        }
      />
      <Route
        path="/projects"
        element={
          <Protected>
            <ProjectsPage />
          </Protected>
        }
      />
      <Route
        path="/jobs"
        element={
          <Protected>
            <ResourcePage type="jobs" />
          </Protected>
        }
      />
      <Route
        path="/jobs/:jobId"
        element={
          <Protected>
            <JobDetailsPage />
          </Protected>
        }
      />
      <Route
        path="/queues"
        element={
          <Protected>
            <ResourcePage type="queues" />
          </Protected>
        }
      />
      <Route
        path="/queues/:id"
        element={
          <Protected>
            <QueuePage />
          </Protected>
        }
      />
      <Route
        path="/workers"
        element={
          <Protected>
            <OperationsList type="workers" />
          </Protected>
        }
      />
      <Route
        path="/dlq"
        element={
          <Protected>
            <OperationsList type="dlq" />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
