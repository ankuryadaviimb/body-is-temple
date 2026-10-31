import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in · Temple" };

export default function LoginPage() {
  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Temple</h1>
      <p className="mt-2 text-ink-2">Your private gut and fitness coach.</p>
      <LoginForm />
    </main>
  );
}
