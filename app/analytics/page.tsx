"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import type { OverviewPayload } from "@/app/api/overview/route";
import type { EarningsSummary } from "@/lib/earnings";

function formatUsd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDays(value: number | null) {
  if (value === null) return "—";

  if (value >= 30) {
    return `${Math.round((value / 30) * 10) / 10} mo`;
  }

  return `${Math.round(value * 10) / 10} d`;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [overviewResponse, earningsResponse] = await Promise.all([
          fetch("/api/overview"),
          fetch("/api/earnings"),
        ]);

        if (!overviewResponse.ok || !earningsResponse.ok) {
          throw new Error("Failed to load analytics data");
        }

        setOverview(await overviewResponse.json());
        setSummary((await earningsResponse.json()).summary);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const analytics = overview?.analytics;
  const maxSubmissions = Math.max(
    1,
    ...(analytics?.submissionsByMonth.map((m) => m.count) ?? [1])
  );
  const topProgramMax = Math.max(
    1,
    ...(analytics?.topProgramsByReports.map((p) => p.reports) ?? [1])
  );

  return (
    <AppShell>
      <header className="flex min-h-20 items-center justify-between border-b border-line px-6 lg:px-10">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
            HackerOne
          </p>
          <h1 className="mt-1 text-xl font-semibold">Analytics</h1>
        </div>

        <div className="rounded-full border border-line bg-raised/70 px-3 py-1.5 text-xs text-ink-secondary">
          Derived from API data
        </div>
      </header>

      <div className="p-6 lg:p-10">
        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Rates */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Triage Rate"
            value={loading ? "—" : `${analytics?.triageRate ?? 0}%`}
            description="Reports accepted for review"
          />

          <StatCard
            label="Resolution Rate"
            value={loading ? "—" : `${analytics?.resolutionRate ?? 0}%`}
            description="Resolved / closed share"
          />

          <StatCard
            label="Bounty Rate"
            value={loading ? "—" : `${analytics?.bountyRate ?? 0}%`}
            description="Reports with bounty events"
          />

          <StatCard
            label="Avg Bounty"
            value={
              loading ? "—" : formatUsd(summary?.stats.average ?? 0)
            }
            description={`Median ${formatUsd(summary?.stats.median ?? 0)}`}
          />
        </section>

        {/* Response speed */}
        <section className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-5 py-4">
            <span className="text-xs uppercase tracking-wider text-ink-faint">
              Median Time to Triage
            </span>
            <span className="text-sm text-ink">
              {loading ? "—" : formatDays(analytics?.medianDaysToTriage ?? null)}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-5 py-4">
            <span className="text-xs uppercase tracking-wider text-ink-faint">
              Average Time to Close
            </span>
            <span className="text-sm text-ink">
              {loading ? "—" : formatDays(analytics?.averageDaysToClose ?? null)}
            </span>
          </div>
        </section>

        {/* Submissions over time */}
        <section className="mt-8">
          <SectionHeading
            title="Submissions Over Time"
            hint="Reports per submission month (UTC)"
          />

          <div className="rounded-xl border border-line bg-surface p-6">
            {!loading &&
            (analytics?.submissionsByMonth.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">
                No submissions recorded.
              </p>
            ) : (
              <div className="flex h-44 items-end gap-1.5 overflow-x-auto pb-1">
                {(analytics?.submissionsByMonth ?? []).map((month) => (
                  <div
                    key={month.key}
                    className="group flex min-w-[26px] flex-1 flex-col items-center gap-2"
                    title={`${month.key}: ${month.count}`}
                  >
                    <div
                      className="w-full rounded-t bg-sky-500/25 transition-colors group-hover:bg-sky-400/50"
                      style={{
                        height: `${Math.max(3, (month.count / maxSubmissions) * 130)}px`,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {!loading && (analytics?.submissionsByMonth.length ?? 0) > 0 && (
              <div className="mt-2 flex justify-between text-[10px] text-ink-faint">
                <span>{analytics?.submissionsByMonth[0]?.key}</span>
                <span>
                  {analytics?.submissionsByMonth[
                    analytics.submissionsByMonth.length - 1
                  ]?.key}
                </span>
              </div>
            )}
          </div>
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-2">
          {/* Programs by reports */}
          <section>
            <SectionHeading title="Top Programs by Reports" />

            <div className="overflow-hidden rounded-xl border border-line bg-surface px-5 py-2">
              {(analytics?.topProgramsByReports ?? []).map((program) => (
                <div key={program.handle} className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-ink-secondary">
                      {program.handle}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {program.reports}
                    </span>
                  </div>

                  <div className="mt-1.5 h-1 w-full rounded-full bg-raised/70">
                    <div
                      className="h-1 rounded-full bg-sky-500/40"
                      style={{
                        width: `${(program.reports / topProgramMax) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}

              {loading && (
                <p className="py-8 text-center text-sm text-ink-muted">
                  Loading...
                </p>
              )}
            </div>
          </section>

          {/* Weaknesses */}
          <section>
            <SectionHeading title="Most Reported Weaknesses" />

            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {(analytics?.topWeaknesses ?? []).map((weakness) => (
                <div
                  key={weakness.name}
                  className="flex items-center justify-between border-b border-line/60 px-5 py-3 last:border-b-0"
                >
                  <span className="truncate pr-4 text-xs text-ink-secondary">
                    {weakness.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-ink-muted">
                    {weakness.reports}
                  </span>
                </div>
              ))}

              {loading && (
                <p className="py-8 text-center text-sm text-ink-muted">
                  Loading...
                </p>
              )}

              {!loading &&
                (analytics?.topWeaknesses.length ?? 0) === 0 && (
                  <p className="py-8 text-center text-sm text-ink-muted">
                    No weakness data.
                  </p>
                )}
            </div>
          </section>
        </div>

        {/* Earnings by severity proxy: highest award + program spread */}
        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-surface px-5 py-4">
            <p className="text-xs uppercase tracking-wider text-ink-faint">
              Highest Single Award
            </p>
            <p className="mt-2 text-xl font-semibold text-accent">
              {loading ? "—" : formatUsd(summary?.stats.highest ?? 0)}
            </p>
          </div>

          <div className="rounded-lg border border-line bg-surface px-5 py-4">
            <p className="text-xs uppercase tracking-wider text-ink-faint">
              Programs With Earnings
            </p>
            <p className="mt-2 text-xl font-semibold">
              {loading ? "—" : summary?.byProgram.length ?? 0}
            </p>
          </div>

          <div className="rounded-lg border border-line bg-surface px-5 py-4">
            <p className="text-xs uppercase tracking-wider text-ink-faint">
              First Award
            </p>
            <p className="mt-2 text-sm font-medium">
              {summary?.stats.firstAwardAt
                ? new Date(summary.stats.firstAwardAt).toLocaleDateString(
                    "en-US",
                    { year: "numeric", month: "short", day: "numeric" }
                  )
                : loading
                  ? "—"
                  : "No awards yet"}
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-xs uppercase tracking-[0.15em] text-ink-muted">
        {label}
      </p>
      <p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 truncate text-xs text-ink-faint">{description}</p>
    </div>
  );
}

function SectionHeading({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-ink-secondary">
        {title}
      </h2>
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}
