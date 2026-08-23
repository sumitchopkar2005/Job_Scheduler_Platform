import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Shell from "./components/Shell";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import OrganizationsPage from "./pages/OrganizationsPage";
import ProjectsPage from "./pages/ProjectsPage";
import ResourcePage from "./pages/ResourcePage";
import JobDetailsPage from "./pages/JobDetailsPage";
import QueuePage from "./pages/QueuePage";
import OperationsList from "./pages/OperationsList";

function Protected({ children }) {
  const auth = useAuth();
  if (!auth.ready) return <div className="loading">Checking session...</div>;
  return auth.authenticated ? (
    <Shell>{children}</Shell>
  ) : (
    <Navigate to="/login" replace />
  );
}

function RoutesView() {
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

export default function App() {
  return (
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <RoutesView />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}
