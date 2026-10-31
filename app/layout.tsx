import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { splashStartupImages } from "@/lib/brand/splash";
import "./globals.css";

export const metadata: Metadata = {
  title: "Temple",
  description: "A private gut and fitness coach that logs your day in seconds.",
  applicationName: "Temple",
  appleWebApp: { capable: true, title: "Temple", statusBarStyle: "default", startupImage: splashStartupImages() },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d0c" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request so every page carries the fresh CSP nonce from proxy.ts.
  await connection();
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
