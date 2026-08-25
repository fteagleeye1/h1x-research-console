"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/app-shell";
import Markdown from "@/components/markdown";
import ResearchAssistant from "@/components/research-assistant";

/**
 * In-app program profile: policy/scope + the user's own activity with this
 * program. Submission stays on hackerone.com — the documented Hacker API is
 * read-only, so "Report to this program" opens H1's authenticated form.
 */

interface ProgramProfile {
  id: string | null;
  handle: string;
  name: string | null;
  state: string | null;
  submissionState: string | null;
  offersBounties: boolean | null;
  triageActive: boolean | null;
  bookmarked: boolean | null;
  allowsBountySplitting: boolean | null;
  openScope: boolean | null;
  goldStandardSafeHarbor: boolean | null;
  fastPayments: boolean | null;
  startedAcceptingAt: string | null;
  numberOfReportsForUser: number | null;
  numberOfValidReportsForUser: number | null;
  bountyEarnedForUser: number | null;
  policy: string | null;
}

interface MyReportItem {
  id: string;
  attributes?: {
    title?: string | null;
    state?: string | null;
    submitted_at?: string | null;
  };
  relationships?: {
    program?: {
      data?: {
        attributes?: {
          handle?: string;
        };
      };
    };
  };
}

function stateLabel(state: string | null): string | null {
  switch (state) {
    case "public_mode":
      return "Public";
    case "soft_launched":
      return "Private";
    default:
      return state ? state.replaceAll("_", " ") : null;
  }
}

function submissionLabel(state: string | null): string | null {
  switch (state) {
    case "open":
      return "Submissions open";
    case "paused":
      return "Submissions paused";
    case "closed":
      return "Submissions closed";
    default:
      return state ? state.replaceAll("_", " ") : null;
  }
}

export default function ProgramDetailPage() {
  const params = useParams<{ handle: string }>();
  const handle = params.handle;

  const [program, setProgram] = useState<ProgramProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [myReports, setMyReports] = useState<MyReportItem[] | null>(null);
  const [reportsError, setReportsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/programs/${encodeURIComponent(handle)}`);

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to fetch this program.");
        }

        const payload = (await response.json()) as { program: ProgramProfile };

        if (!cancelled) {
          setProgram(payload.program);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Own activity: reuse the existing reports endpoint and filter locally.
    (async () => {
      try {
        const response = await fetch("/api/reports?page=1&size=100");
        const payload = await response.json();

        if (!cancelled && Array.isArray(payload?.data)) {
          setMyReports(payload.data as MyReportItem[]);
        }
      } catch {
        if (!cancelled) setReportsError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle]);

  const programReports = useMemo(() => {
    if (!myReports) return null;

    return myReports.filter(
      (report) => report.relationships?.program?.data?.attributes?.handle === handle
    );
  }, [myReports, handle]);

  const reportFormUrl = `https://hackerone.com/${handle}/report_form`;

  return (
    <AppShell>
      <header className="border-b border-line px-6 py-5 lg:px-10">
        <Link
          href="/programs"
          className="font-mono text-xs text-ink-faint transition-colors hover:text-accent"
        >
          &larr; all programs
        </Link>

        {loading ? (
          <div className="mt-4 space-y-2">
            <div className="h-5 w-48 animate-pulse rounded bg-raised/70" />
            <div className="h-3 w-72 animate-pulse rounded bg-raised/70" />
          </div>
        ) : error ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : program ? (
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold">{program.name ?? handle}</h1>
                <span className="font-mono text-xs text-ink-faint">@{program.handle}</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {stateLabel(program.state) && (
                  <span className="rounded-full border border-accent/30 bg-accent-dim px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                    {stateLabel(program.state)}
                  </span>
                )}

                {submissionLabel(program.submissionState) && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      program.submissionState === "open"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    {submissionLabel(program.submissionState)}
                  </span>
                )}

                {program.triageActive && (
                  <span className="rounded-full border border-line bg-raised/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
                    active triage
                  </span>
                )}

                {program.offersBounties && (
                  <span className="rounded-full border border-line bg-raised/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
                    pays bounties
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={reportFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-accent/35 bg-accent-dim px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
              >
                Report to this program ↗
              </a>

              <a
                href={`https://hackerone.com/${program.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-line bg-raised/70 px-4 py-2 text-sm text-ink-secondary transition-colors hover:bg-line-strong"
              >
                View on HackerOne ↗
              </a>
            </div>
          </div>
        ) : null}
      </header>

      {program && (
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-10">
          {/* Policy / scope */}
          <main className="min-w-0">
            <section className="overflow-hidden rounded-xl border border-line bg-surface">
              <p className="border-b border-line px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-accent/90">
                policy &amp; scope
              </p>

              <div className="px-5 py-4">
                {program.policy ? (
                  <Markdown source={program.policy} />
                ) : (
                  <p className="text-sm text-ink-muted">
                    This program has no visible policy text via the API. Check
                    the HackerOne page for its full scope.
                  </p>
                )}
              </div>
            </section>
          </main>

          {/* Your activity */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <section className="overflow-hidden rounded-xl border border-line bg-surface">
              <p className="border-b border-line px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-accent/90">
                your activity here
              </p>

              <dl className="divide-y divide-white/[0.06] text-sm">
                {[
                  ["Your reports", program.numberOfReportsForUser],
                  [
                    "Valid / resolved",
                    program.numberOfValidReportsForUser,
                  ],
                  [
                    "Bounties earned",
                    program.bountyEarnedForUser != null
                      ? `$${program.bountyEarnedForUser.toLocaleString("en-US")}`
                      : null,
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between px-5 py-3">
                    <dt className="text-ink-muted">{label}</dt>
                    <dd className="font-mono text-ink">
                      {value == null ? "—" : value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
              <p className="border-b border-line px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-accent/90">
                recent submissions ({programReports ? programReports.length : "..."})
              </p>

              {reportsError ? (
                <p className="px-5 py-4 text-xs text-red-300">
                  Could not load your reports.
                </p>
              ) : !programReports ? (
                <p className="px-5 py-4 font-mono text-xs text-ink-faint">loading...</p>
              ) : programReports.length === 0 ? (
                <p className="px-5 py-4 text-xs text-ink-muted">
                  No submissions to this program in your latest 100 reports.
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {programReports.slice(0, 10).map((report) => (
                    <li key={report.id}>
                      <Link
                        href={`/reports/${report.id}`}
                        className="block px-5 py-3 transition-colors hover:bg-raised/60"
                      >
                        <p className="line-clamp-2 text-xs leading-snug text-ink">
                          {report.attributes?.title ?? `Report #${report.id}`}
                        </p>

                        <p className="mt-1 font-mono text-[10px] capitalize text-ink-faint">
                          #{report.id} · {report.attributes?.state ?? "unknown"}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}

      {/* Program-grounded research assistant */}
      {program && (
        <div className="px-6 pb-8 lg:px-10">
          <ResearchAssistant
            key={handle}
            target={{ kind: "program", programHandle: handle }}
          />
        </div>
      )}
    </AppShell>
  );
}
