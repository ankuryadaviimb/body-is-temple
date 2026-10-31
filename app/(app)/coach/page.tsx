import { CoachScreen } from "@/components/coach/coach-screen";

export const metadata = { title: "Coach · Temple" };

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ ask?: string }> }) {
  const { ask } = await searchParams;
  return <CoachScreen initialAsk={typeof ask === "string" ? ask.slice(0, 20) : undefined} />;
}
