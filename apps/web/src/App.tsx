import { useEffect, useState } from "react";

const HEALTH_URL = "http://localhost:8000/api/health";

type HealthResponse = {
  api: "connected";
  database: "connected";
};

type HealthState =
  | { status: "loading" }
  | { status: "connected"; data: HealthResponse }
  | { status: "error"; message: string };

function App() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
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
  }, []);

  return (
    <main>
      <section className="health-card" aria-live="polite">
        <p className="eyebrow">Growth Space</p>
        <h1>System health</h1>

        {health.status === "loading" && <p>Checking services…</p>}

        {health.status === "connected" && (
          <div className="status-list">
            <p><span aria-hidden="true">●</span> API Connected</p>
            <p><span aria-hidden="true">●</span> Database Connected</p>
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
    </main>
  );
}

export default App;

