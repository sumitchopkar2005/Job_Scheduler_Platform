import React from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function AuthPage({ register = false }) {
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
