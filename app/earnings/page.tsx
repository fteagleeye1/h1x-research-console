"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app-shell";
import type {
  EarningsSummary,
  NormalizedEarning,
} from "@/lib/earnings";

type EarningsPayload = {
  earnings: NormalizedEarning[];
  summary: EarningsSummary;
};

function formatUsd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
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

export default function EarningsPage() {
  const [payload, setPayload] = useState<EarningsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEarnings() {
      try {
        const response = await fetch("/api/earnings");

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to load earnings");
        }

        setPayload(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadEarnings();
  }, []);

  const { summary, earnings } = payload ?? {};

  const maxMonthly = useMemo(
    () => Math.max(1, ...(summary?.byMonth.map((m) => m.total) ?? [1])),
    [summary]
  );

  const quartersByYear = useMemo(() => {
    const map = new Map<string, { key: string; total: number; count: number }[]>();

    for (const quarter of summary?.byQuarter ?? []) {
      const year = quarter.key.split("-")[0];
      map.set(year, [...(map.get(year) ?? []), quarter]);
    }

    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [summary]);

  const recent = useMemo(
    () =>
      [...(earnings ?? [])]
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .slice(0, 10),
    [earnings]
  );

  return (
    <AppShell>
          <header className="flex min-h-20 items-center justify-between border-b border-line px-6 lg:px-10">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">
                HackerOne
              </p>
              <h1 className="mt-1 text-xl font-semibold">Earnings</h1>
            </div>

            <div className="rounded-full border border-line bg-raised/70 px-3 py-1.5 text-xs text-ink-secondary">
              /hackers/payments/earnings
            </div>
          </header>

          <div className="p-6 lg:p-10">
            {error && (
              <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Headline cards */}
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total Earned"
                value={loading ? "—" : formatUsd(summary?.stats.total ?? 0)}
                description={`${summary?.stats.count ?? 0} bounty awards`}
              />

              <StatCard
                label="This Month"
                value={
                  loading ? "—" : formatUsd(summary?.currentMonth.total ?? 0)
                }
                description={summary?.currentMonth.label ?? ""}
              />

              <StatCard
                label="This Quarter"
                value={
                  loading ? "—" : formatUsd(summary?.currentQuarter.total ?? 0)
                }
                description={summary?.currentQuarter.key ?? ""}
              />

              <StatCard
                label={`${new Date().getFullYear()} Total`}
                value={
                  loading ? "—" : formatUsd(summary?.currentYearTotal ?? 0)
                }
                description="Year to date"
              />
            </section>

            {/* Stats strip */}
            <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat
                label="Average"
                value={formatUsd(summary?.stats.average ?? 0)}
              />
              <MiniStat
                label="Median"
                value={formatUsd(summary?.stats.median ?? 0)}
              />
              <MiniStat
                label="Highest"
                value={formatUsd(summary?.stats.highest ?? 0)}
              />
              <MiniStat
                label="Last Award"
                value={formatDate(summary?.stats.lastAwardAt)}
              />
            </section>

            {/* Monthly chart */}
            <section className="mt-8">
              <SectionHeading
                title="Monthly Earnings"
                hint="Aggregated by bounty award date (UTC)"
              />

              <div className="rounded-xl border border-line bg-surface p-6">
                {!loading && (summary?.byMonth.length ?? 0) === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-muted">
                    No bounty earnings recorded yet.
                  </p>
                ) : (
                  <div className="flex h-48 items-end gap-2 overflow-x-auto pb-1">
                    {(summary?.byMonth ?? []).map((month) => (
                      <div
                        key={month.key}
                        className="group flex min-w-[38px] flex-1 flex-col items-center gap-2"
                      >
                        <span className="text-[10px] text-ink-muted opacity-0 transition-opacity group-hover:opacity-100">
                          {formatUsd(month.total)}
                        </span>

                        <div
                          className="w-full rounded-t bg-accent/30 transition-colors group-hover:bg-accent/50"
                          style={{
                            height: `${Math.max(
                              4,
                              ((month.total ?? 0) / maxMonthly) * 150
                            )}px`,
                          }}
                          title={`${month.label}: ${formatUsd(month.total)} (${month.count})`}
                        />

                        <span className="whitespace-nowrap text-[9px] uppercase tracking-wide text-ink-faint">
                          {month.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <div className="mt-8 grid gap-8 xl:grid-cols-2">
              {/* Quarterly */}
              <section>
                <SectionHeading
                  title="Quarterly Earnings"
                  hint="Q1 Jan–Mar · Q2 Apr–Jun · Q3 Jul–Sep · Q4 Oct–Dec"
                />

                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  {quartersByYear.length === 0 && !loading ? (
                    <p className="p-8 text-center text-sm text-ink-muted">
                      No data.
                    </p>
                  ) : (
                    quartersByYear.map(([year, quarters]) => (
                      <div key={year}>
                        <div className="border-b border-line bg-raised/50 px-5 py-2.5 text-xs font-semibold text-ink-secondary">
                          {year}
                        </div>

                        {(["Q1", "Q2", "Q3", "Q4"] as const).map((q) => {
                          const entry = quarters.find((item) =>
                            item.key.endsWith(q)
                          );

                          return (
                            <div
                              key={q}
                              className="flex items-center justify-between border-b border-line/60 px-5 py-3 last:border-b-0"
                            >
                              <span className="font-mono text-xs text-ink-muted">
                                {year}-{q}
                              </span>

                              <span className="flex items-center gap-4">
                                <span className="text-[10px] text-ink-faint">
                                  {entry?.count ?? 0} awards
                                </span>

                                <span className="text-sm text-ink">
                                  {formatUsd(entry?.total ?? 0)}
                                </span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* By program */}
              <section>
                <SectionHeading title="Earnings by Program" />

                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  {!loading && (summary?.byProgram.length ?? 0) === 0 ? (
                    <p className="p-8 text-center text-sm text-ink-muted">
                      No data.
                    </p>
                  ) : (
                    <div className="divide-y divide-white/[0.06]">
                      {(summary?.byProgram ?? []).map((program) => {
                        const share =
                          summary && summary.stats.total > 0
                            ? Math.round(
                                (program.total / summary.stats.total) * 100
                              )
                            : 0;

                        return (
                          <div
                            key={program.handle}
                            className="px-5 py-4"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <Link
                                href={`https://hackerone.com/${program.handle}`}
                                target="_blank"
                                className="truncate text-sm text-ink hover:text-accent"
                              >
                                {program.handle}
                              </Link>

                              <div className="shrink-0 text-right">
                                <span className="text-sm text-ink">
                                  {formatUsd(program.total)}
                                </span>

                                <span className="ml-3 text-[10px] text-ink-faint">
                                  ×{program.count}
                                </span>
                              </div>
                            </div>

                            <div className="mt-2 h-1 w-full rounded-full bg-raised/70">
                              <div
                                className="h-1 rounded-full bg-accent/40"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Recent awards */}
            <section className="mt-8">
              <SectionHeading
                title="Recent Awards"
                hint="Newest bounty earnings first"
              />

              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                {loading ? (
                  <p className="p-10 text-center text-sm text-ink-muted">
                    Loading earnings...
                  </p>
                ) : recent.length === 0 ? (
                  <p className="p-10 text-center text-sm text-ink-muted">
                    No bounty earnings recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {recent.map((earning) => (
                      <div
                        key={earning.id}
                        className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] text-ink-faint">
                              {earning.programHandle ?? "unknown"}
                            </span>

                            <span className="text-[10px] text-ink-faint">
                              {formatDate(earning.createdAt)}
                            </span>
                          </div>

                          {earning.reportId ? (
                            <Link
                              href={`/reports/${earning.reportId}`}
                              className="mt-1 block truncate text-sm text-ink-secondary hover:text-accent"
                            >
                              {earning.reportTitle ??
                                `Report #${earning.reportId}`}
                            </Link>
                          ) : (
                            <span className="mt-1 block truncate text-sm text-ink-secondary">
                              {earning.reportTitle ?? "Bounty award"}
                            </span>
                          )}
                        </div>

                        <div className="shrink-0 sm:text-right">
                          <p className="text-sm font-medium text-accent">
                            +{formatUsd(earning.amount)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
      <p className="mt-2 text-xs capitalize text-ink-faint">{description}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3">
      <span className="text-xs uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <span className="text-sm text-ink-secondary">{value}</span>
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
