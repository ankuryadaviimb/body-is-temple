import { notFound } from "next/navigation";
import { ResetRoutineView } from "@/components/reset/reset-routine";
import { RESETS } from "@/lib/content/resets";

export const metadata = { title: "Reset · Temple" };

export default async function ResetPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "heavy" && kind !== "gas") notFound();
  return <ResetRoutineView routine={RESETS[kind]} />;
}
