/**
 * Single fetch wrapper. All API calls go through here so:
 * - cookies/sessions are sent (credentials: 'include')
 * - errors are turned into thrown ApiError objects
 * - JSON is parsed once
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * In production the backend is a separate origin, so requests must target its
 * absolute URL (VITE_API_BASE_URL, e.g. https://api.example.com). In dev this is
 * unset and paths stay relative — the Vite proxy forwards /api to :3000, keeping
 * requests same-origin. No trailing slash; paths already start with '/'.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include',
    // X-Requested-With is the backend's CSRF defense (a cross-site request can't
    // set a custom header without a preflight the origin allowlist controls).
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let payload: unknown = undefined;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const message =
      (typeof payload === 'object' && payload && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : null) ?? `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }

  return payload as T;
}
