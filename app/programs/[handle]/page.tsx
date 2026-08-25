"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/app-shell";
import Markdown from "@/components/markdown";
import ResearchAssistant from "@/components/research-assistant";

/**
 * In-app program profile with tabs: Scope (structured scope table + policy),
 * Hacktivity (library disclosures for this program + your submissions) and
 * Thanks. Submission stays on hackerone.com — the documented Hacker API is
 * read-only, so "Report" opens the program on H1 where the form lives.
 */

interface ScopeAsset {
  assetIdentifier: string | null;
  assetType: string | null;
  eligibleForBounty: boolean | null;
  eligibleForSubmission: boolean | null;
  maxSeverity: string | null;
  instruction: string | null;
}

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
  structuredScopes: ScopeAsset[];
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

interface DisclosedHit {
  id: string;
  title: string | null;
  bountyAmount: number | null;
  disclosedAt: string | null;
}

type Tab = "scope" | "hacktivity" | "thanks";

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

const ASSET_TYPE_LABELS: Record<string, string> = {
  URL: "URL",
  WILDCARD: "Wildcard",
  CIDR: "IP range (CIDR)",
  IPV4: "IPv4",
  IPV6: "IPv6",
  OTHER: "Other",
};

export default function ProgramDetailPage() {
  const params = useParams<{ handle: string }>();
  const handle = params.handle;

  const [tab, setTab] = useState<Tab>("scope");
  const [program, setProgram] = useState<ProgramProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [myReports, setMyReports] = useState<MyReportItem[] | null>(null);
  const [disclosed, setDisclosed] = useState<DisclosedHit[] | null>(null);

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

    // Own submissions (existing reports endpoint, filtered locally).
    (async () => {
      try {
        const response = await fetch("/api/reports?page=1&size=100");
        const payload = await response.json();

        if (!cancelled && Array.isArray(payload?.data)) {
          setMyReports(payload.data as MyReportItem[]);
        }
      } catch {
        if (!cancelled) setMyReports([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle]);

  // Disclosed reports for this program come from the local library snapshot.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `/api/disclosed-reports?program=${encodeURIComponent(handle)}&size=20`
        );

        if (!response.ok) throw new Error();

        const payload = (await response.json()) as { items: DisclosedHit[] };

        if (!cancelled) setDisclosed(payload.items ?? []);
      } catch {
        if (!cancelled) setDisclosed([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle]);

  const myProgramReports = useMemo(() => {
    if (!myReports) return null;

    return myReports.filter(
      (report) => report.relationships?.program?.data?.attributes?.handle === handle
    );
  }, [myReports, handle]);

  const inScopeAssets = useMemo(
    () =>
      (program?.structuredScopes ?? []).filter(
        (scope) => scope.eligibleForSubmission !== false
      ),
    [program]
  );

  const oosAssets = useMemo(
    () =>
      (program?.structuredScopes ?? []).filter(
        (scope) => scope.eligibleForSubmission === false
      ),
    [program]
  );

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
                <span className="font-mono text-xs text-ink-faint">@{handle}</span>
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

                {program.offersBounties != null && (
                  <span className="rounded-full border border-line bg-raised/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
                    {program.offersBounties ? "BBP · pays bounties" : "VDP"}
                  </span>
                )}
              </div>
            </div>

            <a
              href={`https://hackerone.com/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-accent/35 bg-accent-dim px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            >
              Report to this program ↗
            </a>
          </div>
        ) : null}
      </header>

      {program && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-line px-6 pt-4 lg:px-10">
            {(
              [
                { key: "scope", label: `Scope (${inScopeAssets.length})` },
                { key: "hacktivity", label: "Hacktivity" },
                { key: "thanks", label: "Thanks" },
              ] as { key: Tab; label: string }[]
            ).map((entry) => (
              <button
                key={entry.key}
                onClick={() => setTab(entry.key)}
                className={`-mb-px rounded-t-lg border-x border-t px-4 py-2 text-xs transition-colors ${
                  tab === entry.key
                    ? "border-line bg-surface font-medium text-ink"
                    : "border-transparent text-ink-muted hover:text-ink-secondary"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="grid gap-6 p-6 pt-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-10 lg:pt-6">
            {/* Tab content */}
            <main className="min-w-0">
              {tab === "scope" && (
                <>
                  <section className="overflow-hidden rounded-xl border border-line bg-surface">
                    <p className="border-b border-line px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-accent/90">
                      structured scope — in scope ({inScopeAssets.length})
                    </p>

                    {inScopeAssets.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-ink-muted">
                        No structured scope entries are exposed via the API.
                        Check the policy below and the program page on
                        HackerOne.
                      </p>
                    ) : (
                      <ul className="divide-y divide-white/[0.06]">
                        {inScopeAssets.map((scope, index) => (
                          <li key={index} className="px-5 py-3.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-line bg-raised/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ink-muted">
                                {ASSET_TYPE_LABELS[scope.assetType ?? "OTHER"] ??
                                  scope.assetType ??
                                  "asset"}
                              </span>

                              <span className="break-all font-mono text-xs text-ink">
                                {scope.assetIdentifier ?? "—"}
                              </span>

                              {scope.eligibleForBounty && (
                                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-emerald-300">
                                  bounty eligible
                                </span>
                              )}

                              {scope.maxSeverity && scope.maxSeverity !== "none" && (
                                <span className="font-mono text-[10px] capitalize text-ink-faint">
                                  max: {scope.maxSeverity}
                                </span>
                              )}
                            </div>

                            {scope.instruction && (
                              <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-ink-muted">
                                {scope.instruction}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {oosAssets.length > 0 && (
                      <>
                        <p className="border-y border-line bg-red-500/[0.04] px-5 py-2.5 text-[10px] uppercase tracking-[0.18em] text-red-300/80">
                          out of scope / ineligible ({oosAssets.length})
                        </p>

                        <ul className="divide-y divide-white/[0.06] opacity-70">
                          {oosAssets.map((scope, index) => (
                            <li key={index} className="px-5 py-2.5">
                              <span className="mr-2 rounded-full border border-line bg-raised/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-ink-faint">
                                {ASSET_TYPE_LABELS[scope.assetType ?? "OTHER"] ??
                                  scope.assetType ??
                                  "asset"}
                              </span>
                              <span className="break-all font-mono text-xs text-ink-muted">
                                {scope.assetIdentifier ?? "—"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>

                  <section className="mt-5 overflow-hidden rounded-xl border border-line bg-surface">
                    <p className="border-b border-line px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-accent/90">
                      full policy
                    </p>

                    <div className="px-5 py-4">
                      {program.policy ? (
                        <Markdown source={program.policy} />
                      ) : (
                        <p className="text-sm text-ink-muted">
                          This program has no visible policy text via the API.
                        </p>
                      )}
                    </div>
                  </section>
                </>
              )}

              {tab === "hacktivity" && (
                <>
                  {/* Disclosed reports from the library snapshot */}
                  <section className="overflow-hidden rounded-xl border border-line bg-surface">
                    <p className="border-b border-line px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-accent/90">
                      disclosed reports ({disclosed ? disclosed.length : "..."})
                    </p>

                    {!disclosed ? (
                      <p className="px-5 py-4 font-mono text-xs text-ink-faint">loading...</p>
                    ) : disclosed.length === 0 ? (
                      <p className="px-5 py-4 text-xs leading-relaxed text-ink-muted">
                        No disclosed reports for this program in your synced
                        library snapshot (newest 100 global disclosures). Run{" "}
                        <code className="rounded bg-canvas px-1.5 py-0.5 font-mono">
                          npm run sync-disclosed
                        </code>{" "}
                        to refresh, or browse everything in Disclosed Reports.
                      </p>
                    ) : (
                      <ul className="divide-y divide-white/[0.06]">
                        {disclosed.map((hit) => (
                          <li key={hit.id}>
                            <Link
                              href={`/disclosed-reports/${hit.id}`}
                              className="block px-5 py-3 transition-colors hover:bg-raised/60"
                            >
                              <p className="line-clamp-2 text-xs leading-snug text-ink">
                                {hit.title ?? `Report #${hit.id}`}
                              </p>

                              <p className="mt-1 flex flex-wrap items-center gap-x-3 font-mono text-[10px] text-ink-faint">
                                <span>#{hit.id}</span>
                                {hit.bountyAmount != null && hit.bountyAmount > 0 && (
                                  <span className="text-accent/90">
                                    ${hit.bountyAmount.toLocaleString("en-US")}
                                  </span>
                                )}
                              </p>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {/* Your own submissions */}
                  <section className="mt-5 overflow-hidden rounded-xl border border-line bg-surface">
                    <p className="border-b border-line px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-accent/90">
                      your submissions ({myProgramReports ? myProgramReports.length : "..."})
                    </p>

                    {!myProgramReports ? (
                      <p className="px-5 py-4 font-mono text-xs text-ink-faint">loading...</p>
                    ) : myProgramReports.length === 0 ? (
                      <p className="px-5 py-4 text-xs text-ink-muted">
                        No submissions to this program in your latest 100 reports.
                      </p>
                    ) : (
                      <ul className="divide-y divide-white/[0.06]">
                        {myProgramReports.map((report) => (
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
                </>
              )}

              {tab === "thanks" && (
                <section className="overflow-hidden rounded-xl border border-line bg-surface">
                  <p className="border-b border-line px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-accent/90">
                    thanks &amp; recognition
                  </p>

                  <div className="space-y-4 px-5 py-4 text-sm leading-relaxed text-ink-muted">
                    <p>
                      HackerOne does not expose per-program thanks/reputation
                      data through the documented API, so this console cannot
                      list who has been thanked here.
                    </p>

                    <p>
                      What we do know about your footprint in this program is
                      in the sidebar — reports submitted, valid/resolved count,
                      and bounties earned.
                    </p>

                    <a
                      href={`https://hackerone.com/${handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-lg border border-line bg-raised/70 px-4 py-2 text-xs text-ink-secondary transition-colors hover:bg-line-strong hover:text-ink"
                    >
                      Open @{handle} on HackerOne ↗
                    </a>
                  </div>
                </section>
              )}
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
                    ["Valid / resolved", program.numberOfValidReportsForUser],
                    [
                      "Bounties earned",
                      program.bountyEarnedForUser != null
                        ? `$${program.bountyEarnedForUser.toLocaleString("en-US")}`
                        : null,
                    ],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between px-5 py-3">
                      <dt className="text-ink-muted">{label}</dt>
                      <dd className="font-mono text-ink">{value == null ? "—" : value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <p className="mt-4 hidden max-w-[260px] text-[10px] leading-relaxed text-ink-faint lg:block">
                Scope, hacktivity and stats are read-only views over the
                documented HackerOne API. Always confirm against the live
                policy before submitting.
              </p>
            </aside>
          </div>

          {/* Program-grounded research assistant */}
          <div className="px-6 pb-8 lg:px-10">
            <ResearchAssistant
              key={handle}
              target={{ kind: "program", programHandle: handle }}
            />
          </div>
        </>
      )}
    </AppShell>
  );
}
