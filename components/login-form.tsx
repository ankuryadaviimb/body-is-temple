"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiSend } from "@/lib/client/api";

/**
 * Sign in with a 6-digit email code typed inside the app. (A magic link would open in
 * Safari, which keeps separate cookies from the installed app on iOS.)
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiSend("POST", "/api/auth/send-code", { email });
      setStep("code");
      setMessage("If this email can sign in, a code is on its way. Check your inbox.");
    } catch (err) {
      setMessage(err instanceof ApiError && err.status === 429 ? "Too many tries. Wait a few minutes." : "Could not send the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiSend("POST", "/api/auth/verify", { email, code: code.trim() });
      router.replace("/");
      router.refresh();
    } catch {
      setMessage("That code did not work. Check it, or send a new one.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-12 rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60"
          >
            {busy ? "Sending..." : "Send me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <label className="text-sm font-medium" htmlFor="code">
            Code from the email
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="h-12 rounded-xl border border-line bg-surface px-4 text-center text-2xl tracking-[0.4em] outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={busy || code.length < 6}
            className="h-12 rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60"
          >
            {busy ? "Checking..." : "Sign in"}
          </button>
          <button type="button" onClick={() => setStep("email")} className="h-10 text-sm text-ink-2">
            Use a different email
          </button>
        </form>
      )}
      {message ? <p className="mt-4 text-sm text-ink-2">{message}</p> : null}
    </div>
  );
}
