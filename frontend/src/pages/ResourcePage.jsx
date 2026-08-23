import React from "react";
import { Boxes, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import usePolling from "../hooks/usePolling";
import CreateQueueModal from "../components/CreateQueueModal";
import CreateResourceModal from "../components/CreateResourceModal";

export default function ResourcePage({ type }) {
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
