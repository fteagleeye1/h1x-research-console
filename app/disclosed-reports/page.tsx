"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import type { DisclosedListPayload } from "@/app/api/disclosed-reports/route";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "none"] as const;

const SEVERITY_BADGE: Record<string, string> = {
  critical: "border-red-500/30 bg-red-500/10 text-red-300",
  high: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  medium: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  low: "border-white/15 bg-raised/70 text-ink-secondary",
  none: "border-line bg-raised/60 text-ink-faint",
};

const SORT_OPTIONS = [
  { key: "newest-disclosed", label: "Newest disclosed" },
  { key: "oldest-disclosed", label: "Oldest disclosed" },
  { key: "newest-submitted", label: "Newest submitted" },
  { key: "oldest-submitted", label: "Oldest submitted" },
  { key: "severity-desc", label: "Severity: Critical first" },
  { key: "severity-asc", label: "Severity: Low first" },
];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatUsd(value: number | null) {
  if (!value || value <= 0) return null;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Accepts a full hackerone.com/reports/<id> URL or a bare numeric ID. */
function extractReportId(input: string): string | null {
  const trimmed = input.trim();

  const urlMatch = /^https?:\/\/(?:www\.)?hackerone\.com\/reports\/(\d{1,12})\/?$/i.exec(trimmed);

  if (urlMatch) return urlMatch[1];

  return /^\d{1,12}$/.test(trimmed) ? trimmed : null;
}

export default function DisclosedReportsPage() {
  const router = useRouter();

  const [classFilter, setClassFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sort, setSort] = useState("newest-disclosed");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<DisclosedListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [idInput, setIdInput] = useState("");
  const [idError, setIdError] = useState<string | null>(null);

  // Debounce search so typing does not hammer the API; resets pagination.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = search.trim();

      setAppliedSearch((current) => {
        if (current !== next) setPage(1);
        return next;
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [search]);

  /** Every interactive control marks loading itself; effect just fetches. */
  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        class: classFilter,
        severity: severityFilter,
        sort,
        page: String(page),
        size: "20",
      });

      if (appliedSearch) params.set("q", appliedSearch);

      const response = await fetch(`/api/disclosed-reports?${params.toString()}`);

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Unable to load disclosed reports.");
      }

      setData((await response.json()) as DisclosedListPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [classFilter, severityFilter, sort, appliedSearch, page]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await load();
      void cancelled;
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  function pickClass(key: string) {
    setClassFilter(key);
    setPage(1);
    setLoading(true);
  }

  function pickSeverity(key: string) {
    setSeverityFilter(key);
    setPage(1);
    setLoading(true);
  }

  function pickSort(key: string) {
    setSort(key);
    setPage(1);
    setLoading(true);
  }

  function goPage(next: number) {
    setLoading(true);
    setPage(next);
  }

  function openById(event: React.FormEvent) {
    event.preventDefault();
    setIdError(null);

    const id = extractReportId(idInput);

    if (!id) {
      setIdError(
        "Enter a numeric report ID or a https://hackerone.com/reports/<id> link."
      );
      return;
    }

    router.push(`/disclosed-reports/${id}`);
  }

  const activeClassLabel = useMemo(() => {
    if (classFilter === "all") return "All classes";
    return data?.classes.find((c) => c.key === classFilter)?.label ?? classFilter;
  }, [classFilter, data]);

  return (
    <AppShell>
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-line px-6 lg:px-10">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent/90">
            research library
          </p>
          <h1 className="mt-1 text-xl font-semibold">Disclosed Reports</h1>
        </div>

        {/* Report ID / URL jump */}
        <form onSubmit={openById} className="flex items-center gap-2">
          <input
            value={idInput}
            onChange={(event) => {
              setIdInput(event.target.value);
              setIdError(null);
            }}
            placeholder="hackerone.com/reports/<id> or 123456"
            className="h-9 w-64 rounded-lg border border-line bg-canvas/60 px-3 font-mono text-xs text-ink outline-none placeholder:text-ink-faint focus:border-accent/50 lg:w-72"
          />
          <button
            type="submit"
            className="h-9 rounded-lg border border-accent/35 bg-accent-dim px-3 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            Open
          </button>
        </form>
      </header>

      {idError && (
        <p className="border-b border-line bg-red-500/5 px-6 py-2 text-xs text-red-300 lg:px-10">
          {idError}
        </p>
      )}

      <div className="grid gap-6 p-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:p-10">
        {/* Class sidebar */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            Vulnerability classes
          </p>

          <nav className="flex flex-wrap gap-1.5 lg:flex-col">
            <button
              onClick={() => pickClass("all")}
              className={`rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
                classFilter === "all"
                  ? "bg-accent-dim text-accent"
                  : "text-ink-secondary hover:bg-raised/70 hover:text-ink"
              }`}
            >
              All classes
              {data && (
                <span className="ml-2 text-[10px] text-ink-faint">
                  {data.classes.reduce((sum, c) => sum + c.count, 0)}
                </span>
              )}
            </button>

            {(data?.classes ?? []).map((entry) => (
              <button
                key={entry.key}
                onClick={() => pickClass(entry.key)}
                className={`rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
                  classFilter === entry.key
                    ? "bg-accent-dim text-accent"
                    : "text-ink-secondary hover:bg-raised/70 hover:text-ink"
                }`}
              >
                {entry.label}
                <span className="ml-2 text-[10px] text-ink-faint">{entry.count}</span>
              </button>
            ))}

            {loading && !data && (
              <p className="px-3 py-1.5 text-xs text-ink-faint">loading...</p>
            )}
          </nav>

          {data && (
            <p className="mt-4 hidden max-w-[220px] text-[10px] leading-relaxed text-ink-faint lg:block">
              Library covers the {data.metaLimit} most recent disclosures;
              low-information reports are filtered out.
            </p>
          )}
        </aside>

        {/* Main column */}
        <main className="min-w-0">
          {/* Active context */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink">
              {activeClassLabel}
              {data && severityFilter !== "all" && (
                <span className="ml-2 text-xs normal-case text-ink-muted">
                  · {severityFilter === "none" ? "unrated" : severityFilter}
                </span>
              )}
            </h2>

            <span className="font-mono text-[11px] text-ink-faint">
              {loading ? "..." : `${data?.total ?? 0} reports`}
            </span>
          </div>

          {/* Controls */}
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 xl:flex-row xl:items-center xl:justify-between">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, program, weakness, body..."
              className="h-9 w-full rounded-lg border border-line bg-canvas/60 px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent/50"
            />

            <div className="flex flex-wrap items-center gap-2">
              {/* Severity chips in explicit rank order Low -> Critical */}
              <div className="flex rounded-lg border border-line bg-canvas/60 p-0.5">
                <button
                  onClick={() => pickSeverity("all")}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] transition-colors ${
                    severityFilter === "all"
                      ? "bg-line-strong text-ink"
                      : "text-ink-muted hover:text-ink-secondary"
                  }`}
                >
                  All
                </button>

                {[...SEVERITY_ORDER].reverse().map((level) => (
                  <button
                    key={level}
                    onClick={() => pickSeverity(level)}
                    title={
                      data?.severities.find((s) => s.key === level)?.count.toString()
                    }
                    className={`rounded-md px-2.5 py-1.5 text-[11px] capitalize transition-colors ${
                      severityFilter === level
                        ? level === "critical"
                          ? "bg-red-500/20 text-red-200"
                          : level === "high"
                            ? "bg-amber-500/20 text-amber-200"
                            : "bg-line-strong text-ink"
                        : "text-ink-muted hover:text-ink-secondary"
                    }`}
                  >
                    {level === "none" ? "unrated" : level}
                    {data && (
                      <span className="ml-1 text-[9px] opacity-60">
                        {data.severities.find((s) => s.key === level)?.count ?? 0}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <select
                value={sort}
                onChange={(event) => pickSort(event.target.value)}
                className="h-9 rounded-lg border border-line bg-raised px-2.5 text-xs text-ink-secondary outline-none focus:border-accent/50"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    Sort: {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Results */}
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl border border-line/60 bg-surface/60 p-5"
                >
                  <div className="h-3 w-24 rounded bg-raised/70" />
                  <div className="mt-3 h-4 w-3/4 rounded bg-raised/70" />
                  <div className="mt-2 h-3 w-full rounded bg-raised/70" />
                </div>
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-12 text-center text-sm text-ink-muted">
              No disclosed reports match these filters.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-line bg-surface">
              {data.items.map((report) => (
                <Link
                  key={report.id}
                  href={`/disclosed-reports/${report.id}`}
                  className="block px-5 py-4 transition-colors hover:bg-raised/60"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-ink-faint">
                      #{report.id}
                    </span>

                    {report.severity && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${SEVERITY_BADGE[report.severity]}`}
                      >
                        {report.severity}
                      </span>
                    )}

                    <span className="rounded-full border border-accent/30 bg-accent-dim px-2 py-0.5 text-[10px] text-accent">
                      {report.vulnClassLabel}
                    </span>

                    {formatUsd(report.bountyAmount) && (
                      <span className="font-mono text-[10px] text-accent/90">
                        {formatUsd(report.bountyAmount)}
                      </span>
                    )}

                    <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-faint">
                      {formatDate(report.disclosedAt)}
                    </span>
                  </div>

                  <h3 className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-ink">
                    {report.title ?? `Report #${report.id}`}
                  </h3>

                  {report.excerpt && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                      {report.excerpt}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-faint">
                    <span className="font-mono">
                      {report.programHandle ?? "unknown-program"}
                    </span>

                    {report.originalWeakness &&
                      report.originalWeakness.toLowerCase() !==
                        report.vulnClassLabel.toLowerCase() && (
                        <span>
                          original: {report.originalWeakness}
                        </span>
                      )}

                    {report.cveIds.length > 0 && (
                      <span className="font-mono">{report.cveIds.join(", ")}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && data && data.pageCount > 1 && (
            <div className="mt-5 flex items-center justify-between">
              <button
                disabled={data.page <= 1 || loading}
                onClick={() => goPage(Math.max(1, data.page - 1))}
                className="rounded-lg border border-line bg-raised/70 px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-line-strong disabled:cursor-not-allowed disabled:opacity-30"
              >
                Previous
              </button>

              <span className="font-mono text-xs text-ink-faint">
                page {data.page} / {data.pageCount}
              </span>

              <button
                disabled={data.page >= data.pageCount || loading}
                onClick={() => goPage(Math.min(data.pageCount, data.page + 1))}
                className="rounded-lg border border-line bg-raised/70 px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-line-strong disabled:cursor-not-allowed disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}
