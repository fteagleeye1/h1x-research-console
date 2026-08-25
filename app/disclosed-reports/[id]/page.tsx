"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app-shell";
import ResearchAssistant from "@/components/research-assistant";
import Markdown from "@/components/markdown";
import type { DisclosedReport } from "@/lib/disclosed";

const SEVERITY_BADGE: Record<string, string> = {
  critical: "border-red-500/30 bg-red-500/10 text-red-300",
  high: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  medium: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  low: "border-white/15 bg-raised/70 text-ink-secondary",
};

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DisclosedReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [report, setReport] = useState<DisclosedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { id } = await params;
      setReportId(id);
      setLoading(true);

      try {
        if (!id || !/^\d{1,12}$/.test(id)) {
          throw new Error("Invalid report ID.");
        }

        const response = await fetch(`/api/disclosed-reports/${id}`);

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "Unable to load this disclosed report.");
        }

        if (!cancelled) setReport((await response.json()) as DisclosedReport);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params]);

  const timeline = [
    { label: "Submitted", at: report?.submittedAt ?? null },
    { label: "Triaged", at: report?.triagedAt ?? null },
    { label: "Closed", at: report?.closedAt ?? null },
    { label: "Disclosed", at: report?.disclosedAt ?? null },
  ].filter((entry) => entry.at);

  return (
    <AppShell>
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-line px-6 lg:px-10">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-accent/90">
            <Link
              href="/disclosed-reports"
              className="hover:text-accent"
            >
              disclosed reports
            </Link>
            <span className="mx-2 text-ink-faint">/</span>
            <span className="font-mono text-ink-muted">#{reportId}</span>
          </p>
          {!loading && report && (
            <h1 className="mt-1 truncate text-xl font-semibold">{report.title}</h1>
          )}
        </div>

        {report && (
          <Link
            href={report.url ?? `https://hackerone.com/reports/${reportId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-line bg-raised/70 px-3 py-2 text-xs text-ink-secondary transition-colors hover:border-accent/35 hover:text-accent"
          >
            Open on HackerOne ↗
          </Link>
        )}
      </header>

      <div className="p-6 lg:p-10">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
            <div className="mt-3">
              <Link href="/disclosed-reports" className="text-ink-secondary underline hover:text-ink">
                ← Back to library
              </Link>
            </div>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            <div className="h-6 w-2/3 animate-pulse rounded bg-raised/70" />
            <div className="h-40 w-full animate-pulse rounded-xl bg-surface/60" />
            <div className="h-96 w-full animate-pulse rounded-xl bg-surface/60" />
          </div>
        )}

        {!loading && report && !report.useful && (
          <div className="mb-8 rounded-lg border border-line-strong bg-raised/50 p-5 text-sm leading-relaxed text-ink-secondary">
            <p className="font-medium text-ink-secondary">
              This is a low-information disclosure.
            </p>
            <p className="mt-1.5">
              {report.uselessReason ??
                "This disclosure contains too little information to study."}{" "}
              It is hidden from library listings but shown here because you
              opened it directly.
            </p>
          </div>
        )}

        {!loading && report && (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
            {/* Left column: the research material */}
            <main className="min-w-0 space-y-6">
              {/* Meta strip */}
              <section className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-4">
                {report.severity && (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${SEVERITY_BADGE[report.severity] ?? "border-line bg-raised/70 text-ink-secondary"}`}
                  >
                    {report.severity}
                  </span>
                )}

                <span className="rounded-full border border-accent/30 bg-accent-dim px-2.5 py-1 text-[11px] text-accent">
                  {report.vulnClass === "unclassified"
                    ? "Unclassified"
                    : report.vulnClass
                      .split("-")
                      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(" ")}
                </span>

                {report.originalWeakness && (
                  <span className="rounded-full border border-line bg-raised/60 px-2.5 py-1 text-[11px] text-ink-muted">
                    original: {report.originalWeakness}
                  </span>
                )}

                {report.bountyAmount !== null && report.bountyAmount > 0 && (
                  <span className="font-mono text-[11px] text-accent/90">
                    ${report.bountyAmount.toLocaleString("en-US")}
                  </span>
                )}

                <span className="ml-auto font-mono text-[11px] text-ink-faint">
                  ♥ {report.votes}
                </span>
              </section>

              {/* Technical details */}
              {report.vulnerabilityInformation && (
                <section className="rounded-xl border border-line bg-surface p-6">
                  <h2 className="mb-3 border-b border-line pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent/90">
                    Technical details
                  </h2>

                  <Markdown source={report.vulnerabilityInformation} />
                </section>
              )}

              {/* Affected asset */}
              {report.structuredScope?.assetIdentifier && (
                <section className="rounded-xl border border-line bg-surface p-6">
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-secondary">
                    Affected asset
                  </h2>

                  <p className="font-mono text-sm text-ink">
                    {report.structuredScope.assetType ?? "asset"}
                    :{" "}
                    {report.structuredScope.assetIdentifier}
                  </p>

                  {report.structuredScope.instruction && (
                    <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                      {report.structuredScope.instruction.slice(0, 400)}
                    </p>
                  )}
                </section>
              )}
            </main>

            {/* Right column: metadata + assistant */}
            <aside className="min-w-0 space-y-6">
              <section className="rounded-xl border border-line bg-surface p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-secondary">
                  Overview
                </h2>

                <dl className="space-y-2.5 text-sm">
                  <MetaRow label="Program">
                    {report.programHandle ? (
                      <a
                        href={`https://hackerone.com/${report.programHandle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-accent hover:text-accent"
                      >
                        {report.programHandle}
                      </a>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </MetaRow>

                  {report.programName && (
                    <MetaRow label="Program name">
                      <span className="text-ink-secondary">{report.programName}</span>
                    </MetaRow>
                  )}

                  {report.reporterUsername && (
                    <MetaRow label="Reporter">
                      <span className="font-mono text-ink-secondary">
                        {report.reporterUsername}
                      </span>
                    </MetaRow>
                  )}

                  <MetaRow label="State">
                    <span className="capitalize text-ink-secondary">
                      {(report.substate ?? report.state ?? "—").replace(/_/g, " ")}
                    </span>
                  </MetaRow>

                  {report.cveIds.length > 0 && (
                    <MetaRow label="CVE IDs">
                      <span className="font-mono text-ink-secondary">
                        {report.cveIds.join(", ")}
                      </span>
                    </MetaRow>
                  )}
                </dl>
              </section>

              {/* Timeline */}
              {timeline.length > 0 && (
                <section className="rounded-xl border border-line bg-surface p-5">
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-secondary">
                    Timeline
                  </h2>

                  <ol className="space-y-2.5">
                    {timeline.map((entry) => (
                      <li key={entry.label} className="flex items-center gap-3 text-sm">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                        <span className="w-20 text-ink-muted">{entry.label}</span>
                        <span className="font-mono text-xs text-ink-secondary">
                          {formatDate(entry.at)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              <ResearchAssistant
                key={report.id}
                target={{ kind: "report", reportId: report.id }}
              />
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-xs uppercase tracking-wider text-ink-faint">
        {label}
      </dt>
      <dd className="truncate text-right">{children}</dd>
    </div>
  );
}
