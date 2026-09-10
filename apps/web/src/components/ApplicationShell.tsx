import { ReactNode } from "react";
import { NavLink } from "react-router-dom";

type ApplicationShellProps = {
  username: string;
  onLogout: () => void;
  children: ReactNode;
};

const navigationItems = [
  { label: "Home", to: "/", end: true },
  { label: "Daily Check-in", to: "/daily-check-in" },
  { label: "Weekly Planner", to: "/weekly-planner" },
  { label: "Journal", to: "/journal" },
  { label: "Weekly Reports", to: "/weekly-reports" },
  { label: "Settings", to: "/settings" },
];

export function ApplicationShell({ username, onLogout, children }: ApplicationShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="app-title">GrowthSpace</p>
        <div className="account-actions">
          <span className="signed-in-user">Signed in as {username}</span>
          <button className="secondary-button" type="button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <div className="app-layout">
        <nav className="primary-navigation" aria-label="Primary navigation">
          <ul>
            {navigationItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? "active" : undefined)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
