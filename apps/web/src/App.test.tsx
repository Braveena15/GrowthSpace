import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

const currentUser = {
  id: 1,
  username: "growth_owner",
  is_active: true,
  created_at: "2026-09-10T12:00:00Z",
};

function jsonResponse(body: object, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

async function signIn(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ access_token: "jwt-token", token_type: "bearer" }))
    .mockResolvedValueOnce(jsonResponse(currentUser))
    .mockImplementation(async (input) => {
      if (String(input).endsWith("/api/health")) {
        return jsonResponse({ api: "connected", database: "connected" });
      }
      if (String(input).includes("/api/planner/tasks?")) {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });

  await userEvent.type(screen.getByLabelText("Username"), "growth_owner");
  await userEvent.type(screen.getByLabelText("Password"), "Strong-password1!");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("App authentication and navigation", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    sessionStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the login screen before authentication", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
  });

  it("toggles password visibility with the visibility button and keyboard", async () => {
    const user = userEvent.setup();
    render(<App />);

    const passwordInput = screen.getByLabelText("Password");
    const showButton = screen.getByRole("button", { name: "Show password" });

    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(showButton);

    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.keyboard("{Enter}");

    expect(passwordInput).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toHaveFocus();
  });

  it("verifies login and shows the authenticated application shell", async () => {
    render(<App />);
    await signIn(fetchMock);

    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByText("GrowthSpace")).toBeInTheDocument();
    expect(screen.getByText("Signed in as growth_owner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:8000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "growth_owner",
        password: "Strong-password1!",
      }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:8000/api/auth/me", {
      headers: { Authorization: "Bearer jwt-token" },
    });
    expect(await screen.findByText("API Connected")).toBeInTheDocument();
  });

  it("shows an honest empty state on Home", async () => {
    render(<App />);
    await signIn(fetchMock);

    expect(await screen.findByRole("heading", { name: "Today's Plan" })).toBeInTheDocument();
    expect(await screen.findByText("Nothing planned for today.")).toBeInTheDocument();
    expect(screen.getByText("Use the Weekly Planner to add a task.")).toBeInTheDocument();
    expect(screen.getByText(/\w+, \w+ \d{1,2}, \d{4}/)).toHaveAttribute("datetime");
  });

  it("navigates between pages and marks the active navigation item", async () => {
    render(<App />);
    await signIn(fetchMock);

    const navigation = await screen.findByRole("navigation", { name: "Primary navigation" });
    const homeLink = within(navigation).getByRole("link", { name: "Home" });
    const journalLink = within(navigation).getByRole("link", { name: "Journal" });

    expect(homeLink).toHaveAttribute("aria-current", "page");
    expect(journalLink).not.toHaveAttribute("aria-current");

    await userEvent.click(journalLink);

    expect(screen.getByRole("heading", { name: "Journal" })).toBeInTheDocument();
    expect(screen.getByText("Write and revisit your thoughts privately in GrowthSpace.")).toBeInTheDocument();
    expect(journalLink).toHaveAttribute("aria-current", "page");
    expect(homeLink).not.toHaveAttribute("aria-current");

    await userEvent.click(within(navigation).getByRole("link", { name: "Weekly Reports" }));
    expect(screen.getByRole("heading", { name: "Weekly Report" })).toBeInTheDocument();
  });

  it("uses a generic error for invalid credentials", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: "Invalid username or password." }, { status: 401 }),
    );

    render(<App />);

    await userEvent.type(screen.getByLabelText("Username"), "growth_owner");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password.");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
  });

  it("prevents repeated submissions while login is loading", async () => {
    let resolveLogin: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveLogin = resolve;
      }),
    );

    render(<App />);

    await userEvent.type(screen.getByLabelText("Username"), "growth_owner");
    await userEvent.type(screen.getByLabelText("Password"), "Strong-password1!");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const button = screen.getByRole("button", { name: "Signing in..." });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveLogin(jsonResponse({ detail: "Invalid username or password." }, { status: 401 }));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("logs out and removes the authenticated shell", async () => {
    render(<App />);
    await signIn(fetchMock);
    await screen.findByRole("navigation", { name: "Primary navigation" });

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
    expect(screen.queryByText("Signed in as growth_owner")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("growthspace.access_token")).toBeNull();
  });

  it("restores a verified session after a browser refresh", async () => {
    sessionStorage.setItem("growthspace.access_token", "saved-jwt");
    fetchMock.mockResolvedValueOnce(jsonResponse(currentUser));
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Restoring your session");
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/auth/me", {
      headers: { Authorization: "Bearer saved-jwt" },
    });
  });
});
