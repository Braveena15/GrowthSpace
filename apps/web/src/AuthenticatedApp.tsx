import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { CurrentUser } from "./api/auth";
import { ApplicationShell } from "./components/ApplicationShell";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { HomePage } from "./pages/HomePage";
import { WeeklyPlannerPage } from "./pages/WeeklyPlannerPage";
import { DailyCheckInPage } from "./pages/DailyCheckInPage";

type AuthenticatedAppProps = {
  accessToken: string;
  user: CurrentUser;
  onLogout: () => void;
};

export function AuthenticatedApp({ accessToken, user, onLogout }: AuthenticatedAppProps) {
  return (
    <BrowserRouter>
      <ApplicationShell username={user.username} onLogout={onLogout}>
        <Routes>
          <Route path="/" element={<HomePage accessToken={accessToken} />} />
          <Route
            path="/daily-check-in"
            element={<DailyCheckInPage accessToken={accessToken} />}
          />
          <Route
            path="/weekly-planner"
            element={<WeeklyPlannerPage accessToken={accessToken} />}
          />
          <Route
            path="/journal"
            element={
              <ComingSoonPage
                title="Journal"
                description="Journal entries will be available here in a future step."
              />
            }
          />
          <Route
            path="/weekly-reports"
            element={
              <ComingSoonPage
                title="Weekly Reports"
                description="Weekly summaries and reports will be added later."
              />
            }
          />
          <Route
            path="/settings"
            element={
              <ComingSoonPage
                title="Settings"
                description="Application preferences will be managed here in a future step."
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ApplicationShell>
    </BrowserRouter>
  );
}
