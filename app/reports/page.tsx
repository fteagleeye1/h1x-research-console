"use client";

import AppShell from "@/components/app-shell";

import { useEffect, useMemo, useState } from "react";

type Report = {
  id: string;
  type: string;
  attributes: {
    title: string;
    state: string;
    created_at: string;
    submitted_at: string;
    triaged_at: string | null;
    closed_at: string | null;
    bounty_awarded_at: string | null;
    last_activity_at: string;
  };
  relationships: {
    program?: {
      data?: {
        id: string;
        type: string;
        attributes?: {
          handle?: string;
        };
      };
    };
    weakness?: {
      data?: {
        id: string;
        type: string;
        attributes?: {
          name?: string;
        };
      };
    };
  };
};

type ReportsResponse = {
  data: Report[];
  links?: {
    self?: string;
    next?: string;
  };
};

function formatDate(date: string | null) {
  if (!date) return "—";

  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function stateLabel(state: string) {
  return state.replace(/_/g, " ");
}

function stateStyle(state: string) {
  const normalized = state.toLowerCase();

  if (
    normalized.includes("resolved") ||
    normalized.includes("closed") ||
    normalized.includes("reward")
  ) {
    return "border-accent/25 bg-accent-dim text-accent";
  }

  if (
    normalized.includes("triaged") ||
    normalized.includes("new") ||
    normalized.includes("pending")
  ) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  }

  return "border-line bg-raised/70 text-ink-secondary";
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(
          `/api/reports?page=${page}&size=25`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Failed to load reports");
        }

        const data: ReportsResponse = await response.json();

        if (!cancelled) {
          setReports(data.data ?? []);
          setHasNext(Boolean(data.links?.next));
          setError(null);
        }
      } catch (err) {
        if (!cancelled && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [page]);

  const states = useMemo(() => {
    return Array.from(
      new Set(reports.map((report) => report.attributes.state))
    ).sort();
  }, [reports]);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();

    return reports.filter((report) => {
      const title = report.attributes.title.toLowerCase();

      const program =
        report.relationships.program?.data?.attributes?.handle?.toLowerCase() ||
        "";

      const weakness =
        report.relationships.weakness?.data?.attributes?.name?.toLowerCase() ||
        "";

      const matchesSearch =
        !query ||
        title.includes(query) ||
        program.includes(query) ||
        weakness.includes(query) ||
        report.id.includes(query);

      const matchesState =
        stateFilter === "all" ||
        report.attributes.state === stateFilter;

      return matchesSearch && matchesState;
    });
  }, [reports, search, stateFilter]);

  return (
    <AppShell>

      {/* Main */}
      <main className="min-w-0 flex-1">
          <header className="flex min-h-20 items-center justify-between border-b border-line px-6 lg:px-10">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
                HackerOne
              </p>

              <h1 className="mt-1 text-xl font-semibold">
                Reports
              </h1>
            </div>

            <div className="rounded-full border border-line bg-raised/70 px-3 py-1.5 text-xs text-ink-secondary">
              Page {page}
            </div>
          </header>

          <div className="p-6 lg:p-10">
            {/* Heading */}
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight">
                Your reports
              </h2>

              <p className="mt-1 text-sm text-ink-muted">
                Browse reports returned by the HackerOne Hacker API.
              </p>
            </div>

            {/* Controls */}
            <div className="mb-6 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 md:flex-row">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, program, weakness, or ID..."
                className="h-10 flex-1 rounded-lg border border-line bg-canvas/60 px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
              />

              <select
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
                className="h-10 rounded-lg border border-line bg-raised px-3 text-sm text-ink-secondary outline-none"
              >
                <option value="all">All states</option>

                {states.map((state) => (
                  <option key={state} value={state}>
                    {stateLabel(state)}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Table */}
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="hidden border-b border-line px-5 py-3 text-[10px] uppercase tracking-[0.15em] text-ink-faint md:grid md:grid-cols-[minmax(0,1fr)_180px_150px_120px] md:gap-4">
                <div>Report</div>
                <div>Program</div>
                <div>Weakness</div>
                <div>Submitted</div>
              </div>

              {loading ? (
                <div className="p-12 text-center text-sm text-ink-muted">
                  Loading reports...
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="p-12 text-center text-sm text-ink-muted">
                  No reports match your filters.
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {filteredReports.map((report) => {
                    const program =
                      report.relationships.program?.data?.attributes
                        ?.handle ?? "Unknown";

                    const weakness =
                      report.relationships.weakness?.data?.attributes
                        ?.name ?? "Unknown";

                    return (
                      <a
                        key={report.id}
                        href={`/reports/${report.id}`}
                        className="block px-5 py-5 transition-colors hover:bg-raised/60"
                      >
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_150px_120px] md:items-center md:gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[10px] text-ink-faint">
                                #{report.id}
                              </span>

                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${stateStyle(
                                  report.attributes.state
                                )}`}
                              >
                                {stateLabel(report.attributes.state)}
                              </span>
                            </div>

                            <h3 className="mt-2 truncate text-sm font-medium text-ink">
                              {report.attributes.title}
                            </h3>
                          </div>

                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-ink-faint md:hidden">
                              Program
                            </p>

                            <p className="mt-1 truncate text-xs text-ink-secondary">
                              {program}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-ink-faint md:hidden">
                              Weakness
                            </p>

                            <p className="mt-1 truncate text-xs text-ink-secondary">
                              {weakness}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-ink-faint md:hidden">
                              Submitted
                            </p>

                            <p className="mt-1 text-xs text-ink-muted">
                              {formatDate(report.attributes.submitted_at)}
                            </p>
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="mt-5 flex items-center justify-between">
              <button
                disabled={page <= 1 || loading}
                onClick={() => {
                  setLoading(true);
                  setPage((current) => current - 1);
                }}
                className="rounded-lg border border-line bg-raised/70 px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-line-strong disabled:cursor-not-allowed disabled:opacity-30"
              >
                Previous
              </button>

              <span className="text-xs text-ink-faint">
                Page {page}
              </span>

              <button
                disabled={!hasNext || loading}
                onClick={() => {
                  setLoading(true);
                  setPage((current) => current + 1);
                }}
                className="rounded-lg border border-line bg-raised/70 px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-line-strong disabled:cursor-not-allowed disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
      </main>
    </AppShell>
  );
}
