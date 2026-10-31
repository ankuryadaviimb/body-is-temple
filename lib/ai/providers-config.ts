/** Fixed provider endpoints and models (pure, shared by the app and the smoke test). */

export type ProviderId = "cloudflare" | "groq" | "gemini";
export type TaskKind = "vision" | "text";

export const MODELS: Record<ProviderId, Record<TaskKind, string>> = {
  cloudflare: { vision: "@cf/google/gemma-4-26b-a4b-it", text: "@cf/google/gemma-4-26b-a4b-it" },
  groq: { vision: "qwen/qwen3.8-27b", text: "openai/gpt-oss-120b" },
  gemini: { vision: "gemini-flash-latest", text: "gemini-flash-latest" },
};

export function endpointFor(provider: ProviderId, cloudflareAccountId?: string): string {
  if (provider === "cloudflare") {
    if (!cloudflareAccountId || !/^[a-f0-9]{32}$/.test(cloudflareAccountId)) throw new Error("Invalid Cloudflare account id");
    return `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai/v1/chat/completions`;
  }
  if (provider === "groq") return "https://api.groq.com/openai/v1/chat/completions";
  return "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
}

/**
 * Extra request fields per provider. Gemma 4 on Cloudflare "thinks" by default, which
 * took about 20 s per meal and could use the whole token budget; turning it off brings
 * replies to about 1 s with the same JSON. On Groq, the text model (gpt-oss) reasons
 * before answering; "low" keeps coach replies fast and inside the token budget.
 */
export function extraBody(provider: ProviderId, task?: TaskKind): Record<string, unknown> {
  if (provider === "cloudflare") return { chat_template_kwargs: { enable_thinking: false } };
  if (provider === "groq" && task === "text") return { reasoning_effort: "low" };
  return {};
}

/** Daily request caps, set below each provider's free allowance. */
export const DAILY_CAPS: Record<ProviderId, number> = { cloudflare: 300, groq: 800, gemini: 200 };
