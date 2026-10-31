"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatIcon, GearIcon, HomeIcon, ListIcon } from "./icons";

const TABS = [
  { href: "/", label: "Today", Icon: HomeIcon },
  { href: "/coach", label: "Coach", Icon: ChatIcon },
  { href: "/history", label: "History", Icon: ListIcon },
  { href: "/settings", label: "Settings", Icon: GearIcon },
];

/** Session screens are full-screen and focused, so the tab bar steps aside there. */
export const FOCUS_ROUTES = ["/toilet", "/practice", "/reset"];

export function isFocusRoute(path: string): boolean {
  return FOCUS_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));
}

export function BottomNav() {
  const path = usePathname();
  if (isFocusRoute(path)) return null;
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/80 backdrop-blur-xl backdrop-saturate-150">
      <ul className="mx-auto flex max-w-md justify-around px-2 pt-1.5">
        {TABS.map(({ href, label, Icon }) => {
          const active =
            href === "/"
              ? path === "/"
              : path.startsWith(href) || (href === "/coach" && (path.startsWith("/insights") || path.startsWith("/memory")));
          return (
            <li key={href}>
              <Link
                href={href}
                className={`pressable flex min-w-[72px] flex-col items-center gap-1 px-3 py-1 text-[11px] font-semibold ${active ? "text-brand" : "text-ink-3"}`}
                aria-current={active ? "page" : undefined}
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full ${active ? "bg-brand/15" : ""}`}>
                  <Icon className="size-[22px]" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
