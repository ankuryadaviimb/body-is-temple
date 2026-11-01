import "server-only";
import { z } from "zod";

/**
 * Server-only configuration. Every secret comes from environment variables
 * (Vercel project settings or a git-ignored .env.local). Nothing is hardcoded.
 */
const BaseSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  /** Comma-separated emails allowed to sign in to this deployment. */
  ALLOWED_EMAILS: z
    .string()
    .min(3)
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  /** Public origin of the app, used to check the Origin header on writes (required in production). */
  APP_ORIGIN: z.url().optional(),
  /** Account creation is off unless this is "true" (turn it on only to create the first account). */
  ALLOW_SIGNUP: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  CLOUDFLARE_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/).optional(),
  CLOUDFLARE_AI_TOKEN: z.string().min(20).optional(),
  GROQ_API_KEY: z.string().min(20).optional(),
  GEMINI_API_KEY: z.string().min(20).optional(),
  /** Which provider reads meal and stool photos first. Gemini is opt-in only. */
  AI_PHOTO_PROVIDER: z.enum(["cloudflare", "groq", "gemini"]).default("cloudflare"),
});

const EnvSchema = BaseSchema.superRefine((e, ctx) => {
  if (process.env.NODE_ENV === "production" && !e.APP_ORIGIN) {
    ctx.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "APP_ORIGIN is required in production" });
  }
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  // An empty value (for example ALLOW_SIGNUP= copied from .env.example) means "not set".
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    // Name the missing keys, never their values.
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server configuration: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return env().ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}
