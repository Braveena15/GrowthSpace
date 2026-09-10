import { FormEvent, useEffect, useState } from "react";

import { CurrentUser, getCurrentUser, login } from "./api/auth";

const HEALTH_URL = "http://localhost:8000/api/health";

type HealthResponse = {
  api: "connected";
  database: "connected";
};

type HealthState =
  | { status: "loading" }
  | { status: "connected"; data: HealthResponse }
  | { status: "error"; message: string };

type AuthState =
  | { status: "unauthenticated" }
  | { status: "authenticated"; accessToken: string; user: CurrentUser };

function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "unauthenticated" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    if (auth.status !== "authenticated") {
      return;
    }

    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await fetch(HEALTH_URL, { signal: controller.signal });

        if (!response.ok) {
          throw new Error("The backend is running, but a service is unavailable.");
        }

        const data = (await response.json()) as HealthResponse;
        setHealth({ status: "connected", data });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setHealth({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The backend could not be reached. Make sure FastAPI is running on port 8000.",
        });
      }
    }

    void checkHealth();
    return () => controller.abort();
  }, [auth.status]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setLoginError("");

    try {
      const token = await login({ username, password });
      const user = await getCurrentUser(token.access_token);
      setAuth({
        status: "authenticated",
        accessToken: token.access_token,
        user,
      });
      setHealth({ status: "loading" });
    } catch {
      setAuth({ status: "unauthenticated" });
      setLoginError("Invalid username or password.");
    } finally {
      setPassword("");
      setIsSubmitting(false);
    }
  }

  function handleLogout() {
    setAuth({ status: "unauthenticated" });
    setUsername("");
    setPassword("");
    setLoginError("");
    setHealth({ status: "loading" });
  }

  if (auth.status !== "authenticated") {
    return (
      <main>
        <section className="auth-card" aria-labelledby="login-heading">
          <p className="eyebrow">Growth Space</p>
          <h1 id="login-heading">Sign in</h1>

          <form className="login-form" onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {loginError && (
              <p className="form-error" role="alert">
                {loginError}
              </p>
            )}

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="home-card">
        <div className="home-header">
          <div>
            <p className="eyebrow">Growth Space</p>
            <h1>Home</h1>
            <p className="welcome">Signed in as {auth.user.username}</p>
          </div>

          <button className="secondary-button" type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>

        <div className="placeholder">
          <h2>Protected home</h2>
          <p>This area is visible only after your token is verified by FastAPI.</p>
        </div>

        <section className="health-panel" aria-live="polite" aria-labelledby="health-heading">
          <h2 id="health-heading">System health</h2>

          {health.status === "loading" && <p>Checking services...</p>}

          {health.status === "connected" && (
            <div className="status-list">
              <p>API Connected</p>
              <p>Database Connected</p>
            </div>
          )}

          {health.status === "error" && (
            <div className="error" role="alert">
              <strong>Health check failed</strong>
              <p>{health.message}</p>
              <p>Confirm FastAPI is running and PostgreSQL is configured.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
