import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { env } from "@/lib/env";
import { AuthError } from "@/lib/supabase/server";

/**
 * Request guards for API routes.
 * - Writes must come from this app's own origin and carry the app's custom header,
 *   which a cross-site form cannot set (CSRF defense on top of SameSite cookies).
 * - Bodies are size-limited and validated with zod; unknown fields are rejected.
 * - Errors return generic messages; details are never sent to the client.
 */

export const CLIENT_HEADER = "x-temple-client";

export class HttpError extends Error {
  constructor(
    public status: number,
    public publicMessage: string,
  ) {
    super(publicMessage);
  }
}

export function assertWriteAllowed(req: Request): void {
  const origin = req.headers.get("origin");
  const expected = env().APP_ORIGIN ?? new URL(req.url).origin;
  if (!origin || origin !== expected) throw new HttpError(403, "Forbidden");
  if (req.headers.get(CLIENT_HEADER) !== "1") throw new HttpError(403, "Forbidden");
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T, maxBytes = 64_000): Promise<z.infer<T>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json")) throw new HttpError(415, "Expected JSON");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new HttpError(413, "Request too large");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "Invalid request");
  return parsed.data;
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/** Maps any thrown error to a safe response. Logs a short, non-sensitive line. */
export function handleError(err: unknown, route: string): NextResponse {
  if (err instanceof AuthError) return json({ error: "Not signed in" }, 401);
  if (err instanceof HttpError) return json({ error: err.publicMessage }, err.status);
  const name = err instanceof Error ? err.name : "UnknownError";
  console.error(JSON.stringify({ level: "error", route, error: name }));
  return json({ error: "Something went wrong" }, 500);
}

/** Small in-memory rate limiter (per server instance). Enough for a single-user app. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new HttpError(429, "Too many requests, try again later");
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
