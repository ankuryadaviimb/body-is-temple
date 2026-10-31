"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GearIcon, HomeIcon, ListIcon } from "./icons";

const TABS = [
  { href: "/", label: "Today", Icon: HomeIcon },
  { href: "/history", label: "History", Icon: ListIcon },
  { href: "/settings", label: "Settings", Icon: GearIcon },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md justify-around">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex min-w-20 flex-col items-center gap-0.5 px-3 py-2 text-xs font-medium ${active ? "text-brand" : "text-ink-2"}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-6" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
