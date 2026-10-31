import Link from "next/link";
import { ChatIcon, ChevronRightIcon } from "../icons";

const QUICK = [
  { intent: "gas", label: "Why am I gassy?" },
  { intent: "ate_right", label: "Did I eat right?" },
  { intent: "dinner", label: "What for dinner?" },
];

/** Entry to the coach from Today: one tap opens a ready answer. */
export function AskCard() {
  return (
    <section aria-label="Ask Temple" className="rounded-[24px] bg-surface p-4 shadow-card">
      <Link href="/coach" className="pressable flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-brand">
          <ChatIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold leading-tight">Ask Temple</span>
          <span className="block text-[13px] text-ink-3">Answers from your own logs, in seconds</span>
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-ink-3" />
      </Link>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {QUICK.map((q) => (
          <Link key={q.intent} href={`/coach?ask=${q.intent}`} className="pressable shrink-0 whitespace-nowrap rounded-full bg-surface-2 px-3.5 py-2 text-[14px] font-medium">
            {q.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
