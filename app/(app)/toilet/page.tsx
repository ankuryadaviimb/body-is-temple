import { ToiletSession } from "@/components/toilet/toilet-session";

export const metadata = { title: "Toilet · Temple" };

export default async function ToiletPage({ searchParams }: { searchParams: Promise<{ back?: string; going?: string; earlier?: string }> }) {
  const { back, going, earlier } = await searchParams;
  return <ToiletSession back={back === "1"} going={going === "1"} earlier={earlier === "1"} />;
}
