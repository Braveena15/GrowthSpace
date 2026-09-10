import { render, screen } from "@testing-library/react";
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

describe("App authentication", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
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
    expect(screen.queryByText("Protected home")).not.toBeInTheDocument();
  });

  it("posts credentials, verifies the token, and shows protected content", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "jwt-token", token_type: "bearer" }))
      .mockResolvedValueOnce(jsonResponse(currentUser))
      .mockResolvedValueOnce(jsonResponse({ api: "connected", database: "connected" }));

    render(<App />);

    await userEvent.type(screen.getByLabelText("Username"), "growth_owner");
    await userEvent.type(screen.getByLabelText("Password"), "Strong-password1!");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Protected home")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:8000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "growth_owner",
        password: "Strong-password1!",
      }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:8000/api/auth/me", {
      headers: {
        Authorization: "Bearer jwt-token",
      },
    });
    expect(screen.getByText("Signed in as growth_owner")).toBeInTheDocument();
    expect(await screen.findByText("API Connected")).toBeInTheDocument();
  });

  it("uses a generic error for invalid credentials", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: "Invalid username or password." }, { status: 401 }),
    );

    render(<App />);

    await userEvent.type(screen.getByLabelText("Username"), "growth_owner");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password.");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.queryByText("Protected home")).not.toBeInTheDocument();
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

  it("logs out by clearing protected state", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "jwt-token", token_type: "bearer" }))
      .mockResolvedValueOnce(jsonResponse(currentUser))
      .mockResolvedValueOnce(jsonResponse({ api: "connected", database: "connected" }));

    render(<App />);

    await userEvent.type(screen.getByLabelText("Username"), "growth_owner");
    await userEvent.type(screen.getByLabelText("Password"), "Strong-password1!");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Protected home");

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Protected home")).not.toBeInTheDocument();
  });
});
