const API_BASE_URL = "http://localhost:8000";

export type LoginCredentials = {
  username: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: "bearer";
};

export type CurrentUser = {
  id: number;
  username: string;
  is_active: boolean;
  created_at: string;
};

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    throw new Error("Invalid username or password.");
  }

  return (await response.json()) as LoginResponse;
}

export async function getCurrentUser(accessToken: string): Promise<CurrentUser> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Your session could not be verified.");
  }

  return (await response.json()) as CurrentUser;
}
