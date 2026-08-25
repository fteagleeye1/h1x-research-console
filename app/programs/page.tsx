"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app-shell";
import type { JoinedProgram } from "@/lib/types";
import type { OpportunitiesPayload } from "@/app/api/opportunities/route";

type EngagedProgram = {
  handle: string;
  reportCount: number;
  validReportCount: number | null;
  earningsTotal: number;
  earningsCount: number;
};

type Tab = "opportunities" | "engaged" | "all";
type SortKey = "newest" | "reports" | "earnings" | "handle";
type StatusFilter = "all" | "open" | "paused";

function formatUsd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Visibility labels derived strictly from the API `state` attribute
 * (see /hackers/programs reference). No assumptions beyond documented values.
 */
function programStateBadge(state: string | null) {
  switch (state) {
    case "public_mode":
      return {
        label: "Public",
        className: "border-accent/25 bg-accent-dim text-accent",
      };
    case "soft_launched":
      return {
        label: "Private",
        className: "border-violet-500/20 bg-violet-500/10 text-violet-300",
      };
    default:
      return {
        label: state ?? "Unknown",
        className: "border-line bg-raised/70 text-ink-secondary",
      };
  }
}

function submissionBadge(submissionState: string | null) {
  switch (submissionState) {
    case "open":
      return {
        label: "Open",
        className: "border-accent/25 bg-accent-dim text-accent",
      };
    case "paused":
      return {
        label: "Paused",
        className: "border-red-500/20 bg-red-500/10 text-red-300",
      };
    default:
      return {
        label: submissionState ?? "—",
        className: "border-line bg-raised/70 text-ink-secondary",
      };
  }
}

export default function ProgramsPage() {
  const [joined, setJoined] = useState<JoinedProgram[]>([]);
  const [engaged, setEngaged] = useState<Map<string, EngagedProgram>>(
    () => new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("opportunities");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Joined programs are the primary source; engaged stats enrich them.
        const [oppResponse, engResponse] = await Promise.all([
          fetch("/api/opportunities"),
          fetch("/api/programs"),
        ]);

        if (!oppResponse.ok) {
          const body = await oppResponse.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to load programs");
        }

        const oppData: OpportunitiesPayload = await oppResponse.json();
        setJoined(oppData.programs ?? []);

        if (engResponse.ok) {
          const engData = await engResponse.json();
          const map = new Map<string, EngagedProgram>();

          for (const program of (engData.programs ?? []) as EngagedProgram[]) {
            map.set(program.handle, program);
          }

          setEngaged(map);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  /** Rows for the active tab after status/bookmark filters. */
  const scoped = useMemo(() => {
    let rows: JoinedProgram[];

    if (tab === "opportunities") {
      rows = joined.filter((program) => program.privateOpportunity);
    } else if (tab === "engaged") {
      rows = joined.filter(
        (program) =>
          program.reportsForUser > 0 || engaged.has(program.handle)
      );
    } else {
      rows = joined;
    }

    if (statusFilter !== "all") {
      rows = rows.filter(
        (program) => program.submissionState === statusFilter
      );
    }

    if (bookmarkedOnly) {
      rows = rows.filter((program) => program.bookmarked);
    }

    return rows;
  }, [tab, joined, engaged, statusFilter, bookmarkedOnly]);

  /** Then search + sort (search across handle/name). */
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();

    let rows = scoped;

    if (query) {
      rows = rows.filter(
        (program) =>
          program.handle.toLowerCase().includes(query) ||
          (program.name ?? "").toLowerCase().includes(query)
      );
    }

    const earningsOf = (program: JoinedProgram) =>
      engaged.get(program.handle)?.earningsTotal ??
      program.bountyEarnedForUser ??
      0;

    const sorted = [...rows];

    sorted.sort((a, b) => {
      switch (sortKey) {
        case "reports":
          return (
            b.reportsForUser - a.reportsForUser ||
            a.handle.localeCompare(b.handle)
          );
        case "earnings":
          return (
            earningsOf(b) - earningsOf(a) || a.handle.localeCompare(b.handle)
          );
        case "handle":
          return a.handle.localeCompare(b.handle);
        case "newest": {
          const at = a.startedAcceptingAt
            ? Date.parse(a.startedAcceptingAt)
            : 0;
          const bt = b.startedAcceptingAt
            ? Date.parse(b.startedAcceptingAt)
            : 0;

          return bt - at || a.handle.localeCompare(b.handle);
        }
      }
    });

    return sorted;
  }, [scoped, search, sortKey, engaged]);

  const totals = useMemo(() => {
    const opportunities = joined.filter((p) => p.privateOpportunity);
    const unexploredOpportunities = opportunities.filter(
      (p) => p.reportsForUser === 0
    );
    const withReports = joined.filter((p) => p.reportsForUser > 0);

    return {
      opportunities: opportunities.length,
      openOpportunities: opportunities.filter(
        (p) => p.submissionState === "open"
      ).length,
      unexplored: unexploredOpportunities.length,
      newPrograms: opportunities.filter((p) => p.openedRecently).length,
      totalJoined: joined.length,
      publicMode: joined.filter((p) => p.state === "public_mode").length,
      softLaunched: joined.filter((p) => p.state === "soft_launched").length,
      engaged: withReports.length,
      payingEngaged: withReports.filter((p) =>
        (engaged.get(p.handle)?.earningsTotal ?? p.bountyEarnedForUser ?? 0) > 0
      ).length,
    };
  }, [joined, engaged]);

  return (
    <AppShell>
      <header className="flex min-h-20 items-center justify-between border-b border-line px-6 lg:px-10">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
            HackerOne
          </p>
          <h1 className="mt-1 text-xl font-semibold">Programs</h1>
        </div>

        <div className="rounded-full border border-line bg-raised/70 px-3 py-1.5 text-xs text-ink-secondary">
          {loading ? "Loading..." : `${totals.totalJoined} joined programs`}
        </div>
      </header>

      <div className="p-6 lg:p-10">
        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex w-full gap-1 rounded-xl border border-line bg-surface p-1 sm:w-fit">
          <TabButton
            active={tab === "opportunities"}
            onClick={() => setTab("opportunities")}
            label="Private Opportunities"
            count={totals.opportunities}
            accent
          />

          <TabButton
            active={tab === "engaged"}
            onClick={() => setTab("engaged")}
            label="Engaged"
            count={totals.engaged}
          />

          <TabButton
            active={tab === "all"}
            onClick={() => setTab("all")}
            label="All My Programs"
            count={totals.totalJoined}
          />
        </div>

        {/* Stats per tab */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tab === "opportunities" && (
            <>
              <StatCard
                label="Private Opportunities"
                value={loading ? "—" : String(totals.opportunities)}
                description="Private BBP · open submissions (matches site filter)"
                accent
              />
              <StatCard
                label="Not Yet Explored"
                value={loading ? "—" : String(totals.unexplored)}
                description="Joined private programs with 0 of your reports"
              />
              <StatCard
                label="Opened Recently"
                value={loading ? "—" : String(totals.newPrograms)}
                description="Submissions opened in the last 30 days"
              />
              <StatCard
                label="Soft-launched Total"
                value={loading ? "—" : String(totals.softLaunched)}
                description="All private programs incl. paused/closed"
              />
            </>
          )}

          {tab === "engaged" && (
            <>
              <StatCard
                label="Programs Engaged"
                value={loading ? "—" : String(totals.engaged)}
                description="Programs with ≥1 of your reports"
              />
              <StatCard
                label="Public"
                value={loading ? "—" : String(totals.publicMode)}
                description="state: public_mode"
              />
              <StatCard
                label="Soft-launched"
                value={loading ? "—" : String(totals.softLaunched)}
                description="state: soft_launched (limited visibility)"
              />
              <StatCard
                label="Paying Programs"
                value={loading ? "—" : String(totals.payingEngaged)}
                description="Programs with recorded earnings"
              />
            </>
          )}

          {tab === "all" && (
            <>
              <StatCard
                label="Total Joined"
                value={loading ? "—" : String(totals.totalJoined)}
                description="All programs your account participates in"
                accent
              />
              <StatCard
                label="Public"
                value={loading ? "—" : String(totals.publicMode)}
                description="state: public_mode"
              />
              <StatCard
                label="Private"
                value={loading ? "—" : String(totals.softLaunched)}
                description="state: soft_launched"
              />
              <StatCard
                label="Bookmarked"
                value={
                  loading
                    ? "—"
                    : String(joined.filter((p) => p.bookmarked).length)
                }
                description="Starred on HackerOne"
              />
            </>
          )}
        </section>

        {/* Controls */}
        <div className="mt-8 mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${
              tab === "opportunities"
                ? "opportunities"
                : tab === "engaged"
                  ? "engaged programs"
                  : "programs"
            }...`}
            className="h-10 w-full max-w-sm rounded-lg border border-line bg-canvas/60 px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
          />

          <div className="flex flex-wrap items-center gap-3">
            {/* Submission status chips */}
            <div className="flex rounded-lg border border-line bg-surface p-0.5">
              {(["all", "open", "paused"] as StatusFilter[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-md px-3 py-1.5 text-xs capitalize transition-colors ${
                    statusFilter === value
                      ? "bg-line-strong text-ink"
                      : "text-ink-muted hover:text-ink-secondary"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            <button
              onClick={() => setBookmarkedOnly((current) => !current)}
              title="Bookmarked on HackerOne only"
              className={`h-9 rounded-lg border px-3 text-xs transition-colors ${
                bookmarkedOnly
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : "border-line bg-surface text-ink-muted hover:text-ink-secondary"
              }`}
            >
              ★ Saved
            </button>

            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="h-10 rounded-lg border border-line bg-surface px-3 text-xs text-ink-secondary outline-none focus:border-line-strong"
            >
              <option value="newest">Sort: Newest</option>
              <option value="reports">Sort: Most reports</option>
              <option value="earnings">Sort: Top earnings</option>
              <option value="handle">Sort: Handle A–Z</option>
            </select>

            <p className="text-xs text-ink-faint">{visible.length} shown</p>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_100px_90px_80px_120px_70px] gap-4 border-b border-line px-5 py-3 text-[10px] uppercase tracking-[0.15em] text-ink-faint lg:grid">
            <div>Program</div>
            <div>Visibility</div>
            <div>Status</div>
            <div>Reports</div>
            <div>Valid</div>
            <div>Earned</div>
            <div>Saved</div>
          </div>

          {loading ? (
            <p className="p-12 text-center text-sm text-ink-muted">
              Loading programs...
            </p>
          ) : visible.length === 0 ? (
            <p className="p-12 text-center text-sm text-ink-muted">
              No programs match.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {visible.map((program) => {
                const badge = programStateBadge(program.state);
                const status = submissionBadge(program.submissionState);
                const engagement = engaged.get(program.handle);
                const earned =
                  engagement?.earningsTotal ?? program.bountyEarnedForUser ?? 0;
                const reportCount =
                  engagement?.reportCount ?? program.reportsForUser;
                const isNew = program.openedRecently;

                return (
                  <div
                    key={program.id}
                    className="grid gap-3 px-5 py-4 transition-colors hover:bg-raised/60 lg:grid-cols-[minmax(0,1fr)_120px_100px_90px_80px_120px_70px] lg:items-center lg:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/programs/${program.handle}`}
                          className="truncate text-sm font-medium text-ink hover:text-accent"
                        >
                          {program.handle}
                        </Link>

                        {isNew && (
                          <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-300">
                            New
                          </span>
                        )}
                      </div>

                      {program.name && program.name !== program.handle && (
                        <p className="truncate text-xs text-ink-faint">
                          {program.name}
                        </p>
                      )}

                      <div className="mt-1 flex flex-wrap items-center gap-2 lg:hidden">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${badge.className}`}
                        >
                          {badge.label}
                        </span>

                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${status.className}`}
                        >
                          {status.label}
                        </span>

                        <span className="text-[10px] text-ink-faint">
                          {reportCount} reports · {formatUsd(earned)}
                        </span>
                      </div>
                    </div>

                    <div className="hidden lg:block">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div className="hidden lg:block">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>

                    <div className="hidden font-mono text-xs text-ink-secondary lg:block">
                      {reportCount}
                    </div>

                    <div className="hidden font-mono text-xs text-ink-muted lg:block">
                      {program.validReportsForUser ||
                        engagement?.validReportCount ||
                        "—"}
                    </div>

                    <div className="hidden lg:block">
                      <span
                        className={`text-xs ${earned > 0 ? "text-accent" : "text-ink-secondary"}`}
                      >
                        {formatUsd(earned)}
                      </span>

                      {(engagement?.earningsCount ?? 0) > 0 && (
                        <span className="ml-2 text-[10px] text-ink-faint">
                          ×{engagement?.earningsCount}
                        </span>
                      )}
                    </div>

                    <div className="hidden text-sm lg:block">
                      {program.bookmarked ? (
                        <span className="text-amber-300">★</span>
                      ) : (
                        <span className="text-ink-faint">☆</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
          Private Opportunities replicates{" "}
          <code className="text-ink-muted">
            hackerone.com/opportunities/my_programs?bbp=true&amp;private=true
          </code>{" "}
          — soft-launched programs with open submissions that pay bounties.
          Visibility comes straight from the API{" "}
          <code className="text-ink-muted">state</code> attribute; earnings merge
          payment records with per-program totals.
        </p>
      </div>
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
  accent = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm transition-colors ${
        active
          ? "bg-line-strong text-ink"
          : "text-ink-muted hover:bg-raised/70 hover:text-ink"
      }`}
    >
      {label}

      {typeof count === "number" && !Number.isNaN(count) && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            active
              ? accent
                ? "bg-accent-dim text-accent"
                : "bg-line-strong text-ink-secondary"
              : "bg-raised/70 text-ink-muted"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function StatCard({
  label,
  value,
  description,
  accent = false,
}: {
  label: string;
  value: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-xs uppercase tracking-[0.15em] text-ink-muted">
        {label}
      </p>

      <p
        className={`mt-4 text-3xl font-semibold tracking-tight ${
          accent ? "text-accent" : ""
        }`}
      >
        {value}
      </p>

      <p className="mt-2 truncate text-xs text-ink-faint">{description}</p>
    </div>
  );
}
