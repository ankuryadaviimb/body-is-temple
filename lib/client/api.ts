"use client";

/** Same-origin fetch with the app's CSRF header. Never sends credentials elsewhere. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const HEADERS = { "x-temple-client": "1" };

/** Fired when the session has expired; the app shell routes to /login. */
export const UNAUTHORIZED_EVENT = "temple:unauthorized";

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(401, "Not signed in");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiError(res.status, body.error ?? "Request failed");
  return body;
}

export async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await fetch(path, { headers: HEADERS, credentials: "same-origin", cache: "no-store" }));
}

export async function apiSend<T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  return handle<T>(
    await fetch(path, {
      method,
      headers: { ...HEADERS, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    }),
  );
}

export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  return handle<T>(await fetch(path, { method: "POST", headers: HEADERS, body: form, credentials: "same-origin" }));
}
