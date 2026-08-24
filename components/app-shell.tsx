"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/reports", label: "Reports" },
  { href: "/programs", label: "Programs" },
  { href: "/earnings", label: "Earnings" },
  { href: "/analytics", label: "Analytics" },
  { href: "/disclosed-reports", label: "Disclosed Library" },
];

function Brand() {
  return (
    <div className="flex h-20 items-center border-b border-line px-6">
      <div>
        <div className="text-lg font-bold tracking-[0.2em] text-ink">
          H1X
        </div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-ink-muted">
          Research Console
        </div>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-0.5 p-3">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`block rounded-lg px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-line-strong text-ink"
                : "text-ink-muted hover:bg-raised/70 hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ApiStatus() {
  return (
    <div className="border-t border-line p-4">
      <div className="rounded-lg border border-accent/25 bg-accent-dim p-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="text-xs font-medium text-accent">
            API CONNECTED
          </span>
        </div>
        <p className="mt-1 text-[11px] text-ink-muted">HackerOne API</p>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-canvas/95 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <button
            aria-label="Toggle navigation"
            onClick={() => setOpen((current) => !current)}
            className="rounded-lg border border-line bg-raised/70 p-2 text-ink-secondary"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              {open ? (
                <path d="M3 3l10 10M13 3L3 13" />
              ) : (
                <path d="M2 4h12M2 8h12M2 12h12" />
              )}
            </svg>
          </button>

          <span className="text-sm font-bold tracking-[0.2em] text-ink">
            H1X
          </span>
        </div>

        <span className="font-mono text-[11px] text-ink-faint">{pathname}</span>
      </div>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-line bg-canvas lg:flex">
          <div>
            <Brand />
            <NavLinks />
          </div>
          <ApiStatus />
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Mobile drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setOpen(false)}
          />

          <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col justify-between border-r border-line bg-canvas lg:hidden">
            <div>
              <Brand />
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <ApiStatus />
          </aside>
        </>
      )}
    </div>
  );
}
