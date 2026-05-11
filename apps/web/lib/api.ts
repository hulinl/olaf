const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  full_name: string;
  phone: string;
  dob: string | null;
  avatar_blob_id: string;
  fitness_level: "" | "beginner" | "intermediate" | "advanced";
  sport_tags: string[];
  bio: string;
  email_verified: boolean;
  date_joined: string;
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(status: number, data: Record<string, unknown>) {
    super(
      typeof data?.detail === "string"
        ? data.detail
        : `Request failed with status ${status}`,
    );
    this.status = status;
    this.data = data;
  }

  /** Convenience for showing the first per-field error in a form. */
  firstFieldError(): string | null {
    for (const key of Object.keys(this.data)) {
      const value = this.data[key];
      if (Array.isArray(value) && value.length > 0) {
        return `${key}: ${value[0]}`;
      }
    }
    return null;
  }
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name + "=([^;]+)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfToken(): Promise<void> {
  if (getCookie("csrftoken")) return;
  await fetch(`${API_URL}/api/auth/csrf/`, {
    credentials: "include",
  });
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    await ensureCsrfToken();
  }
  const csrf = getCookie("csrftoken");
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  if (csrf) headers["X-CSRFToken"] = csrf;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // empty body is fine
  }

  if (!res.ok) throw new ApiError(res.status, data);
  return data as unknown as T;
}

export const auth = {
  signup: (payload: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
  }) =>
    apiFetch<{ detail: string }>("/api/auth/signup/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verifyEmail: (token: string) =>
    apiFetch<{ detail: string }>("/api/auth/verify/", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  login: (payload: { email: string; password: string }) =>
    apiFetch<User>("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () =>
    apiFetch<{ detail: string }>("/api/auth/logout/", {
      method: "POST",
    }),
  me: () => apiFetch<User>("/api/auth/me/"),
  requestPasswordReset: (email: string) =>
    apiFetch<{ detail: string }>("/api/auth/password/reset/request/", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  confirmPasswordReset: (token: string, password: string) =>
    apiFetch<{ detail: string }>("/api/auth/password/reset/confirm/", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
};
