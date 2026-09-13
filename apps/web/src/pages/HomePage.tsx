import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { TodaysPlan } from "../components/TodaysPlan";
import { formatDateKey } from "../utils/planner";

const HEALTH_URL = "http://localhost:8000/api/health";

type HealthResponse = {
  api: "connected";
  database: "connected";
};

type HealthState =
  | { status: "loading" }
  | { status: "connected"; data: HealthResponse }
  | { status: "error"; message: string };

const quickLinks = [
  { label: "Daily Check-in", description: "Reflect on today", to: "/daily-check-in" },
  { label: "Weekly Planner", description: "Shape your week", to: "/weekly-planner" },
  { label: "Journal", description: "Capture your thoughts", to: "/journal" },
];

type HomePageProps = {
  accessToken: string;
};

export function HomePage({ accessToken }: HomePageProps) {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const today = new Date();
  const dateTime = formatDateKey(today);
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(today);

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
    <section className="page home-page" aria-labelledby="home-heading">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Overview</p>
          <h1 id="home-heading">Home</h1>
        </div>
        <time className="today-date" dateTime={dateTime}>
          {formattedDate}
        </time>
      </div>

      <TodaysPlan
        accessToken={accessToken}
        dateKey={dateTime}
        formattedDate={formattedDate}
      />

      <section className="quick-links-section" aria-labelledby="quick-links-heading">
        <h2 id="quick-links-heading">Quick links</h2>
        <div className="quick-links">
          {quickLinks.map((link) => (
            <Link key={link.to} to={link.to}>
              <span><strong>{link.label}</strong><small>{link.description}</small></span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="content-panel health-panel" aria-live="polite" aria-labelledby="health-heading">
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
  );
}
