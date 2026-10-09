const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

type ApiError = { message?: string };

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | (T & ApiError)
    | null;
  if (!response.ok) {
    throw new Error(
      payload?.message || `API request failed (${response.status})`,
    );
  }

  return payload as T;
}
