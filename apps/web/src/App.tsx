import { FormEvent, useEffect, useState } from "react";

import { CurrentUser, getCurrentUser, login } from "./api/auth";
import { AuthenticatedApp } from "./AuthenticatedApp";
import { BrandMark } from "./components/BrandMark";

type AuthState =
  | { status: "restoring" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; accessToken: string; user: CurrentUser };

const ACCESS_TOKEN_STORAGE_KEY = "growthspace.access_token";

function App() {
  const [auth, setAuth] = useState<AuthState>(() =>
    sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
      ? { status: "restoring" }
      : { status: "unauthenticated" },
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const accessToken = sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    if (!accessToken) return;
    let active = true;
    void getCurrentUser(accessToken)
      .then((user) => { if (active) setAuth({ status: "authenticated", accessToken, user }); })
      .catch(() => { sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY); if (active) setAuth({ status: "unauthenticated" }); });
    return () => { active = false; };
  }, []);

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
      sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token.access_token);
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
    sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    setAuth({ status: "unauthenticated" });
    setUsername("");
    setPassword("");
    setIsPasswordVisible(false);
    setLoginError("");
  }

  if (auth.status === "restoring") {
    return <main className="login-page"><p role="status">Restoring your session…</p></main>;
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
      <div className="login-shape login-shape-one" aria-hidden="true" />
      <div className="login-shape login-shape-two" aria-hidden="true" />
      <section className="auth-card" aria-labelledby="login-heading">
        <BrandMark />
        <p className="eyebrow">Your personal growth companion</p>
        <h1 id="login-heading">Sign in</h1>
        <p className="login-introduction">Plan with intention, reflect with clarity, and make meaningful progress every day.</p>

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
