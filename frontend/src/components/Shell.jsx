import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Boxes,
  BriefcaseBusiness,
  Building2,
  CircleGauge,
  LogOut,
  Menu,
  Server,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { path: "/dashboard", label: "Overview", icon: CircleGauge },
  { path: "/organizations", label: "Organizations", icon: Building2 },
  { path: "/projects", label: "Projects", icon: BriefcaseBusiness },
  { path: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { path: "/queues", label: "Queues", icon: Boxes },
  { path: "/workers", label: "Workers", icon: Server },
  { path: "/dlq", label: "Dead letter", icon: ShieldAlert },
];

export default function Shell({ children }) {
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
