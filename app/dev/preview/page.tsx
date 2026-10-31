import { notFound } from "next/navigation";
import { PreviewClient } from "./preview-client";

/**
 * Development-only design preview with made-up sample data. Returns 404 in production,
 * and the proxy only lets it through without a session in development.
 */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { screen = "today" } = await searchParams;
  return <PreviewClient screen={screen} />;
}
