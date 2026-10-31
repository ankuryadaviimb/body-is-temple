import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in · Temple" };

/** Brand mark: the breathing ring, drawn inline (no image request, CSP safe). */
function Mark() {
  return (
    <svg viewBox="0 0 64 64" className="size-16" aria-hidden>
      <defs>
        <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#0b5d57" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#mark)" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="white" strokeOpacity="0.95" strokeWidth="4.5" />
      <circle cx="32" cy="32" r="5" fill="white" fillOpacity="0.95" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <main className="pt-safe relative mx-auto flex min-h-dvh max-w-sm flex-col overflow-hidden px-6 pb-10">
      <div className="pointer-events-none absolute -top-32 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" aria-hidden />
      <div className="relative flex flex-1 flex-col justify-center">
        <Mark />
        <h1 className="mt-6 text-[34px] font-bold leading-tight tracking-tight">Temple</h1>
        <p className="mt-2 text-[17px] leading-relaxed text-ink-2">A calm, private coach for your gut and your fitness. Logging takes seconds.</p>
        <LoginForm />
      </div>
      <p className="relative text-center text-xs leading-relaxed text-ink-3">
        Your logs live in your own database. Nothing is sold, shared or used to train AI.
      </p>
    </main>
  );
}
