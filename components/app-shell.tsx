"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { UNAUTHORIZED_EVENT } from "@/lib/client/api";
import { startSync } from "@/lib/client/sync";
import { BottomNav } from "./bottom-nav";
import { ToastProvider } from "./toast";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    startSync();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }
    const onUnauthorized = () => router.replace("/login");
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  return (
    <ToastProvider>
      <div className="pt-safe mx-auto min-h-dvh max-w-md px-4 pb-28">{children}</div>
      <BottomNav />
    </ToastProvider>
  );
}
