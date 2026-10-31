"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiSend } from "@/lib/client/api";

/**
 * Email and password sign-in inside the installed app. iPhone offers to save the
 * password to Keychain, so later sign-ins are one Face ID tap.
 */
export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "create") {
        await apiSend("POST", "/api/auth/sign-up", { email, password });
        setMode("sign-in");
        setMessage("Check your inbox and tap the confirmation link (any browser is fine). Then come back here and sign in.");
      } else {
        await apiSend("POST", "/api/auth/sign-in", { email, password });
        router.replace("/");
        router.refresh();
        return;
      }
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.status === 429
          ? "Too many tries. Wait a few minutes."
          : mode === "create"
            ? "Could not create the account. Use at least 12 characters."
            : "Email or password is not right, or the email is not confirmed yet.",
      );
    }
    setBusy(false);
  }

  const input = "h-12 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-brand";

  return (
    <div className="mt-10">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input id="email" type="email" inputMode="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        <label className="text-sm font-medium" htmlFor="password">
          {mode === "create" ? "Choose a password (12 or more characters)" : "Password"}
        </label>
        <input
          id="password"
          type="password"
          autoComplete={mode === "create" ? "new-password" : "current-password"}
          required
          minLength={mode === "create" ? 12 : 1}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        <button type="submit" disabled={busy} className="h-12 rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60">
          {busy ? "Please wait..." : mode === "create" ? "Create my account" : "Sign in"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "create" ? "sign-in" : "create");
            setMessage(null);
          }}
          className="h-10 text-sm text-ink-2"
        >
          {mode === "create" ? "I already have an account" : "First time here? Create your account"}
        </button>
      </form>
      {message ? <p className="mt-4 text-sm leading-relaxed text-ink-2">{message}</p> : null}
    </div>
  );
}
