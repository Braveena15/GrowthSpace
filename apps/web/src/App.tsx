import { FormEvent, useState } from "react";

import { CurrentUser, getCurrentUser, login } from "./api/auth";
import { AuthenticatedApp } from "./AuthenticatedApp";

type AuthState =
  | { status: "unauthenticated" }
  | { status: "authenticated"; accessToken: string; user: CurrentUser };

function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "unauthenticated" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    } catch {
      setAuth({ status: "unauthenticated" });
      setLoginError("Invalid username or password.");
    } finally {
      setPassword("");
      setIsPasswordVisible(false);
      setIsSubmitting(false);
    }
  }

  function handleLogout() {
    setAuth({ status: "unauthenticated" });
    setUsername("");
    setPassword("");
    setIsPasswordVisible(false);
    setLoginError("");
  }

  if (auth.status === "authenticated") {
    return (
      <AuthenticatedApp
        accessToken={auth.accessToken}
        user={auth.user}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <main className="login-page">
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
            <div className="password-input-wrapper">
              <input
                id="password"
                name="password"
                type={isPasswordVisible ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="password-visibility-button"
                type="button"
                aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                aria-pressed={isPasswordVisible}
                onClick={() => setIsPasswordVisible((isVisible) => !isVisible)}
              >
                {isPasswordVisible ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="m3 3 18 18" />
                    <path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.1 2.8" />
                    <path d="M6.6 6.6C3.6 8.4 2 12 2 12s3.5 6 10 6a10.7 10.7 0 0 0 5.4-1.4" />
                    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="2.5" />
                  </svg>
                )}
              </button>
            </div>
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

export default App;
