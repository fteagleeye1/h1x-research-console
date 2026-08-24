"use client";

import AppShell from "@/components/app-shell";
import Link from "next/link";

import { useEffect, useState } from "react";

type Report = {
  id: string;
  type: string;
  attributes: {
    title: string;
    state: string;
    created_at: string;
    submitted_at: string;
    vulnerability_information: string;
    triaged_at: string | null;
    closed_at: string | null;
    last_reporter_activity_at: string | null;
    first_program_activity_at: string | null;
    last_program_activity_at: string | null;
    bounty_awarded_at: string | null;
    swag_awarded_at: string | null;
    disclosed_at: string | null;
    reporter_agreed_on_going_public_at: string | null;
    last_public_activity_at: string | null;
    last_activity_at: string | null;
    cve_ids?: string[];
  };
  relationships: {
    reporter?: Relationship;
    program?: Relationship;
    severity?: Relationship;
    weakness?: Relationship;
    structured_scope?: Relationship;
    bounties?: Relationship;
    activities?: Relationship;
  };
};

type Relationship = {
  data?: {
    id: string;
    type: string;
    attributes?: Record<string, unknown>;
  };
};

type Bounty = {
  id: string;
  type: string;
  attributes?: {
    amount?: string | null;
    bonus_amount?: string | null;
    awarded_amount?: string | null;
    awarded_bonus_amount?: string | null;
    awarded_currency?: string | null;
    created_at?: string | null;
  };
};

type Activity = {
  id: string;
  type: string;
  attributes?: {
    message?: string | null;
    internal?: boolean;
    created_at?: string | null;
  };
};

type ReportResponse = {
  data: Report;
};

function activityLabel(type: string) {
  return type
    .replace(/^activity-/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatBountyAmount(bounty: Bounty) {
  const attributes = bounty.attributes ?? {};
  const amount = Number(
    attributes.awarded_amount ?? attributes.amount ?? "0"
  );

  if (Number.isNaN(amount)) return "—";

  const currency = (attributes.awarded_currency ?? "USD").toUpperCase();

  return amount.toLocaleString("en-US", {
    style: "currency",
    currency,
  });
}

function formatDate(date: string | null | undefined) {
  if (!date) return "—";

  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stateLabel(state: string) {
  return state.replace(/_/g, " ");
}

function stateStyle(state: string) {
  const normalized = state.toLowerCase();

  if (
    normalized.includes("resolved") ||
    normalized.includes("closed")
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

export default function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReport() {
      try {
        const { id } = await params;

        const response = await fetch(`/api/reports/${id}`);

        if (!response.ok) {
          throw new Error("Failed to load report");
        }

        const result: ReportResponse = await response.json();

        setReport(result.data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unknown error"
        );
      } finally {
        setLoading(false);
      }
    }

    loadReport();
  }, [params]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-canvas p-10 text-ink">
        <Link
          href="/reports"
          className="text-sm text-ink-muted hover:text-ink"
        >
          ← Back to reports
        </Link>

        <div className="mt-10 rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <h1 className="text-lg font-semibold text-red-300">
            Unable to load report
          </h1>

          <p className="mt-2 text-sm text-ink-muted">
            {error ?? "Report not found."}
          </p>
        </div>
      </div>
    );
  }

  const program =
    report.relationships.program?.data?.attributes?.handle;

  const weakness =
    report.relationships.weakness?.data?.attributes?.name;

  const severityRating =
    (report.relationships.severity?.data?.attributes?.rating as
      | string
      | null
      | undefined) ?? null;

  const scope =
    report.relationships.structured_scope?.data?.attributes;

  const bounties: Bounty[] = Array.isArray(
    report.relationships.bounties?.data
  )
    ? (report.relationships.bounties.data as Bounty[])
    : [];

  const activities: Activity[] = Array.isArray(
    report.relationships.activities?.data
  )
    ? (report.relationships.activities.data as Activity[])
    : [];

  const totalBounty = bounties.reduce(
    (sum, bounty) =>
      sum + Number(bounty.attributes?.awarded_amount ?? bounty.attributes?.amount ?? "0"),
    0
  );

  return (
    <AppShell>

      {/* Main */}
      <main className="min-w-0 flex-1">
          <header className="border-b border-line px-6 py-6 lg:px-10">
            <Link
              href="/reports"
              className="text-xs text-ink-faint transition-colors hover:text-ink-secondary"
            >
              ← Back to reports
            </Link>

            <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-ink-faint">
                    #{report.id}
                  </span>

                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs capitalize ${stateStyle(
                      report.attributes.state
                    )}`}
                  >
                    {stateLabel(report.attributes.state)}
                  </span>
                </div>

                <h1 className="mt-3 max-w-4xl text-2xl font-semibold tracking-tight">
                  {report.attributes.title}
                </h1>
              </div>
            </div>
          </header>

          <div className="p-6 lg:p-10">
            {/* Metadata */}
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <InfoCard
                label="Program"
                value={String(program ?? "Unknown")}
              />

              <InfoCard
                label="Weakness"
                value={String(weakness ?? "Unknown")}
              />

              <InfoCard
                label="Severity"
                value={severityRating ? stateLabel(severityRating) : "—"}
              />

              <InfoCard
                label="Submitted"
                value={formatDate(report.attributes.submitted_at)}
              />

              <InfoCard
                label="Bounty Event"
                value={formatDate(
                  report.attributes.bounty_awarded_at
                )}
              />
            </section>

            {/* CVEs */}
            {(report.attributes.cve_ids?.length ?? 0) > 0 && (
              <section className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.15em] text-ink-faint">
                  CVE
                </span>

                {(report.attributes.cve_ids ?? []).map((cve) => (
                  <span
                    key={cve}
                    className="rounded border border-line bg-raised/70 px-2 py-0.5 font-mono text-[10px] text-ink-secondary"
                  >
                    {cve}
                  </span>
                ))}
              </section>
            )}

            {/* Vulnerability */}
            <section className="mt-8">
              <SectionTitle title="Vulnerability Information" />

              <div className="rounded-xl border border-line bg-surface p-6">
                <div className="whitespace-pre-wrap break-words text-sm leading-7 text-ink-secondary">
                  {report.attributes.vulnerability_information ||
                    "No vulnerability information returned."}
                </div>
              </div>
            </section>

            {/* Scope */}
            <section className="mt-8">
              <SectionTitle title="Structured Scope" />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InfoCard
                  label="Asset Type"
                  value={String(scope?.asset_type ?? "—")}
                />

                <InfoCard
                  label="Asset"
                  value={String(scope?.asset_identifier ?? "—")}
                />

                <InfoCard
                  label="Max Severity"
                  value={String(scope?.max_severity ?? "—")}
                />

                <InfoCard
                  label="Bounty Eligible"
                  value={formatBoolean(scope?.eligible_for_bounty)}
                />

                <InfoCard
                  label="Submission Eligible"
                  value={formatBoolean(
                    scope?.eligible_for_submission
                  )}
                />
              </div>
            </section>

            {/* Timeline */}
            <section className="mt-8">
              <SectionTitle title="Report Timeline" />

              <div className="rounded-xl border border-line bg-surface">
                <TimelineItem
                  label="Created"
                  date={report.attributes.created_at}
                />

                <TimelineItem
                  label="Submitted"
                  date={report.attributes.submitted_at}
                />

                <TimelineItem
                  label="Triaged"
                  date={report.attributes.triaged_at}
                />

                <TimelineItem
                  label="First Program Activity"
                  date={report.attributes.first_program_activity_at}
                />

                <TimelineItem
                  label="Last Program Activity"
                  date={report.attributes.last_program_activity_at}
                />

                <TimelineItem
                  label="Bounty Awarded"
                  date={report.attributes.bounty_awarded_at}
                />

                <TimelineItem
                  label="Closed"
                  date={report.attributes.closed_at}
                />

                <TimelineItem
                  label="Disclosed"
                  date={report.attributes.disclosed_at}
                />

                <TimelineItem
                  label="Last Activity"
                  date={report.attributes.last_activity_at}
                  last
                />
              </div>
            </section>

            {/* Bounties */}
            {bounties.length > 0 && (
              <section className="mt-8">
                <SectionTitle title="Bounties" />

                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <div className="flex items-center justify-between border-b border-line bg-raised/50 px-5 py-3">
                    <span className="text-xs text-ink-secondary">
                      {bounties.length} award{bounties.length === 1 ? "" : "s"}
                    </span>

                    <span className="text-sm font-medium text-accent">
                      Total{" "}
                      {totalBounty.toLocaleString("en-US", {
                        style: "currency",
                        currency:
                          (
                            bounties[0]?.attributes?.awarded_currency ??
                            "USD"
                          ).toUpperCase(),
                      })}
                    </span>
                  </div>

                  <div className="divide-y divide-white/[0.06]">
                    {bounties.map((bounty) => (
                      <div
                        key={bounty.id}
                        className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {formatBountyAmount(bounty)}
                          </p>

                          <p className="mt-1 font-mono text-[10px] text-ink-faint">
                            bounty #{bounty.id}
                            {bounty.attributes?.bonus_amount &&
                              Number(bounty.attributes.bonus_amount) > 0 &&
                              ` · bonus ${bounty.attributes.bonus_amount}`}
                          </p>
                        </div>

                        <div className="sm:text-right">
                          <p className="text-xs text-ink-muted">
                            Awarded{" "}
                            {formatDate(bounty.attributes?.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Activities */}
            {activities.length > 0 && (
              <section className="mt-8">
                <SectionTitle
                  title={`Activities (${activities.length})`}
                />

                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <div className="divide-y divide-white/[0.06]">
                    {[...activities]
                      .sort((a, b) =>
                        (a.attributes?.created_at ?? "").localeCompare(
                          b.attributes?.created_at ?? ""
                        )
                      )
                      .map((activity) => (
                        <div key={activity.id} className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-ink-secondary">
                              {activityLabel(activity.type)}
                            </span>

                            <span
                              className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wide ${
                                activity.attributes?.internal
                                  ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                                  : "border-line bg-raised/70 text-ink-muted"
                              }`}
                            >
                              {activity.attributes?.internal
                                ? "Internal"
                                : "Public"}
                            </span>

                            <span className="ml-auto text-[10px] text-ink-faint">
                              {formatDate(activity.attributes?.created_at)}
                            </span>
                          </div>

                          {activity.attributes?.message && (
                            <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-ink-muted">
                              {activity.attributes.message}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            )}
          </div>
      </main>
    </AppShell>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-[10px] uppercase tracking-[0.15em] text-ink-faint">
        {label}
      </p>

      <p className="mt-2 break-words text-sm text-ink-secondary">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-ink-secondary">
        {title}
      </h2>
    </div>
  );
}

function TimelineItem({
  label,
  date,
  last = false,
}: {
  label: string;
  date: string | null | undefined;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-5 py-4 ${
        !last ? "border-b border-line/60" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`h-2 w-2 rounded-full ${
            date ? "bg-accent" : "bg-ink-faint"
          }`}
        />

        <span className="text-sm text-ink-secondary">{label}</span>
      </div>

      <span className="text-xs text-ink-faint">
        {formatDate(date)}
      </span>
    </div>
  );
}

function formatBoolean(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas text-ink-muted">
      Loading report...
    </div>
  );
}
