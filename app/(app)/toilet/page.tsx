import { ToiletSession } from "@/components/toilet/toilet-session";

export const metadata = { title: "Toilet · Temple" };

export default async function ToiletPage({ searchParams }: { searchParams: Promise<{ back?: string; going?: string }> }) {
  const { back, going } = await searchParams;
  return <ToiletSession back={back === "1"} going={going === "1"} />;
}
