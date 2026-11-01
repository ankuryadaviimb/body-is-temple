"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { UNAUTHORIZED_EVENT } from "@/lib/client/api";
import { startSync } from "@/lib/client/sync";
import { BottomNav, isFocusRoute } from "./bottom-nav";
import { PullToRefresh } from "./pull-to-refresh";
import { ToastProvider } from "./toast";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const focus = isFocusRoute(path);

  useEffect(() => {
    startSync();
    // Ask the browser to keep this app's storage, so entries waiting to sync are never cleared.
    void navigator.storage?.persist?.().catch(() => false);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }
    const onUnauthorized = () => router.replace("/login");
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  return (
    <ToastProvider>
      {/* Solid strip behind the iPhone status bar so scrolled content never shows under the clock. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] bg-bg" />
      <div className={`pt-safe mx-auto min-h-dvh max-w-md px-4 ${focus ? "pb-safe" : "pb-32"}`}>{children}</div>
      {!focus ? <PullToRefresh /> : null}
      <BottomNav />
    </ToastProvider>
  );
}
