"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app-shell";
import type { OverviewPayload } from "@/app/api/overview/route";

function formatUsd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(date: string | null | undefined) {
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

export default function Home() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opportunityCount, setOpportunityCount] = useState<number | null>(null);

  useEffect(() => {
    async function loadOverview() {
      try {
        const response = await fetch("/api/overview");

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to load overview");
        }

        setData(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    async function loadOpportunities() {
      try {
        const response = await fetch("/api/opportunities");

        if (!response.ok) return;

        const body = await response.json();
        setOpportunityCount(body?.summary?.privateOpportunities ?? 0);
      } catch {
        // Non-critical; the banner simply stays hidden.
      }
    }

    loadOverview();
    loadOpportunities();
  }, []);

  const monthDelta =
    data && data.summary.previousMonthTotal > 0
      ? Math.round(
          ((data.summary.currentMonth.total -
            data.summary.previousMonthTotal) /
            data.summary.previousMonthTotal) *
            100
        )
      : null;

  return (
    <AppShell>
      <header className="flex min-h-20 items-center justify-between border-b border-line px-6 lg:px-10">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
            Security Research
          </p>
          <h1 className="mt-1 text-xl font-semibold">Research Overview</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-xs text-ink-muted">Data source</p>
            <p className="text-sm text-ink-secondary">HackerOne API</p>
          </div>

          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-raised/70 text-xs font-semibold">
            H1
          </div>
        </div>
      </header>

      <div className="p-6 lg:p-10">
        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Report stats */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Reports"
            value={loading ? "—" : String(data?.reports.total ?? 0)}
            description="All submissions on record"
          />

          <StatCard
            label="Triaged"
            value={loading ? "—" : String(data?.reports.triaged ?? 0)}
            description="Reports accepted for review"
          />

          <StatCard
            label="Resolved / Closed"
            value={loading ? "—" : String(data?.reports.resolved ?? 0)}
            description="Completed reports"
          />

          <StatCard
            label="Bounty Awarded"
            value={loading ? "—" : String(data?.reports.bountyAwarded ?? 0)}
            description="Reports with bounty events"
          />
        </section>

        {/* Money row */}
        <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Account Balance"
            value={loading ? "—" : formatUsd(data?.balance ?? 0)}
            description="Available for payout"
            accent
          />

          <StatCard
            label="This Month"
            value={
              loading ? "—" : formatUsd(data?.summary.currentMonth.total ?? 0)
            }
            description={
              monthDelta === null
                ? (data?.summary.currentMonth.label ?? "")
                : `${monthDelta >= 0 ? "+" : ""}${monthDelta}% vs last month`
            }
            accent
          />

          <StatCard
            label="This Quarter"
            value={
              loading ? "—" : formatUsd(data?.summary.currentQuarter.total ?? 0)
            }
            description={data?.summary.currentQuarter.key ?? ""}
            accent
          />

          <StatCard
            label="Total Earned"
            value={loading ? "—" : formatUsd(data?.summary.stats.total ?? 0)}
            description={`${data?.summary.stats.count ?? 0} bounty awards`}
            accent
          />
        </section>

        {/* Private opportunities banner */}
        {(opportunityCount ?? 0) > 0 && (
          <Link
            href="/programs"
            className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-5 py-4 transition-colors hover:bg-violet-500/10"
          >
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-300">
                Private
              </span>
              <p className="text-sm text-ink-secondary">
                <span className="font-semibold text-white">
                  {opportunityCount}
                </span>{" "}
                private bug-bounty opportunities with open submissions are
                waiting in your programs.
              </p>
            </div>
            <span className="shrink-0 text-xs text-ink-muted">
              Browse →
            </span>
          </Link>
        )}

        {/* State distribution */}
        <section className="mt-8">
          <SectionHeading title="Report Status" />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {Object.entries(data?.reports.byState ?? {})
              .sort((a, b) => b[1] - a[1])
              .map(([state, count]) => (
                <div
                  key={state}
                  className="rounded-lg border border-line bg-surface p-4"
                >
                  <p className="text-xs capitalize text-ink-muted">
                    {stateLabel(state)}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{count}</p>
                </div>
              ))}

            {loading && (
              <div className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-faint">
                Loading...
              </div>
            )}
          </div>
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* Recent reports */}
          <section>
            <div className="mb-4 flex items-end justify-between">
              <SectionHeading title="Recent Activity" />
              <Link
                href="/reports"
                className="mb-4 text-xs text-ink-muted transition-colors hover:text-ink"
              >
                All reports →
              </Link>
            </div>

            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {loading ? (
                <p className="p-10 text-center text-sm text-ink-muted">
                  Loading HackerOne reports...
                </p>
              ) : (data?.recentReports.length ?? 0) === 0 ? (
                <p className="p-10 text-center text-sm text-ink-muted">
                  No reports returned.
                </p>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {(data?.recentReports ?? []).map((report) => (
                    <Link
                      key={report.id}
                      href={`/reports/${report.id}`}
                      className="block px-5 py-4 transition-colors hover:bg-raised/60"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-ink-faint">
                          #{report.id}
                        </span>

                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${stateStyle(
                            report.state
                          )}`}
                        >
                          {stateLabel(report.state)}
                        </span>

                        {report.severityRating && (
                          <span className="rounded-full border border-line bg-raised/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-secondary">
                            {report.severityRating}
                          </span>
                        )}
                      </div>

                      <h3 className="mt-2 truncate text-sm font-medium text-ink">
                        {report.title}
                      </h3>

                      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-ink-muted">
                        <span>{report.programHandle ?? "Unknown program"}</span>
                        <span>{formatDate(report.lastActivityAt)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Recent awards */}
          <section>
            <div className="mb-4 flex items-end justify-between">
              <SectionHeading title="Recent Awards" />
              <Link
                href="/earnings"
                className="mb-4 text-xs text-ink-muted transition-colors hover:text-ink"
              >
                Earnings →
              </Link>
            </div>

            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              {loading ? (
                <p className="p-10 text-center text-sm text-ink-muted">
                  Loading...
                </p>
              ) : (data?.recentAwards.length ?? 0) === 0 ? (
                <p className="p-10 text-center text-sm text-ink-muted">
                  No bounty awards yet.
                </p>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {(data?.recentAwards ?? []).map((award) => (
                    <div
                      key={award.id}
                      className="flex items-center justify-between gap-4 px-5 py-4"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-ink-muted">
                          {award.programHandle ?? "unknown"}
                        </p>

                        <p className="mt-0.5 text-[11px] text-ink-faint">
                          {formatDate(award.createdAt)}
                        </p>
                      </div>

                      <Link
                        href={award.reportId ? `/reports/${award.reportId}` : "#"}
                        className="shrink-0 text-sm font-medium text-accent hover:text-accent"
                      >
                        +{formatUsd(award.amount)}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top earning programs mini list */}
            <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
              <div className="border-b border-line px-5 py-3 text-[10px] uppercase tracking-[0.15em] text-ink-faint">
                Top Earning Programs
              </div>

              <div className="divide-y divide-white/[0.06]">
                {(data?.summary.byProgram ?? []).slice(0, 5).map((program) => (
                  <div
                    key={program.handle}
                    className="flex items-center justify-between px-5 py-3.5"
                  >
                    <span className="truncate font-mono text-xs text-ink-secondary">
                      {program.handle}
                    </span>

                    <span className="text-xs text-ink-secondary">
                      {formatUsd(program.total)}
                    </span>
                  </div>
                ))}

                {!loading && (data?.summary.byProgram.length ?? 0) === 0 && (
                  <p className="px-5 py-4 text-xs text-ink-faint">
                    No earnings recorded.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
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

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-ink-secondary">
      {title}
    </h2>
  );
}
