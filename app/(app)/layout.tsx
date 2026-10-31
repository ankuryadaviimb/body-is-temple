import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AuthError, requireUser } from "@/lib/supabase/server";

/** Every app page checks the session on the server too (defense in depth with proxy.ts). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof AuthError) redirect("/login");
    throw err;
  }
  return <AppShell>{children}</AppShell>;
}
