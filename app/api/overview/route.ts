import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { HackerOneError, hackeroneFetch } from "@/lib/hackerone";
import { loadAllReports } from "@/lib/data";
import {
  normalizeEarning,
  summarizeEarnings,
  type EarningsSummary,
} from "@/lib/earnings";
import type {
  BalanceResponse,
  EarningsCollectionResponse,
} from "@/lib/types";
import { relationshipSingle } from "@/lib/types";

const CACHE_TTL_MS = 5 * 60 * 1000;

export type OverviewPayload = {
  reports: {
    total: number;
    triaged: number;
    resolved: number;
    bountyAwarded: number;
    swagAwarded: number;
    byState: Record<string, number>;
  };
  programCount: number;
  balance: number;
  recentReports: {
    id: string;
    title: string;
    state: string;
    programHandle: string | null;
    severityRating: string | null;
    submittedAt: string | null;
    lastActivityAt: string | null;
  }[];
  recentAwards: {
    id: string;
    amount: number;
    createdAt: string | null;
    programHandle: string | null;
    reportId: string | null;
  }[];
  summary: Pick<
    EarningsSummary,
    | "stats"
    | "currentMonth"
    | "currentQuarter"
    | "currentYearTotal"
    | "previousMonthTotal"
    | "byProgram"
  >;
  analytics: {
    /** Reports per submission month ("YYYY-MM"), oldest first. */
    submissionsByMonth: { key: string; count: number }[];
    medianDaysToTriage: number | null;
    averageDaysToClose: number | null;
    triageRate: number;
    resolutionRate: number;
    bountyRate: number;
    topProgramsByReports: { handle: string; reports: number }[];
    topWeaknesses: { name: string; reports: number }[];
  };
};

async function loadOverview(): Promise<OverviewPayload> {
  const [reports, earningsPage, balanceData] = await Promise.all([
    loadAllReports(),
    hackeroneFetch<EarningsCollectionResponse>(
      "/hackers/payments/earnings?page[number]=1&page[size]=100"
    ),
    hackeroneFetch<BalanceResponse>("/hackers/payments/balance"),
  ]);

  const earnings = (earningsPage.data ?? []).map(normalizeEarning);
  const summary = summarizeEarnings(earnings);

  let triaged = 0;
  let resolved = 0;
  let bountyAwarded = 0;
  let swagAwarded = 0;
  const byState: Record<string, number> = {};
  const programs = new Set<string>();

  for (const report of reports) {
    const attributes = report.attributes;
    const state = attributes.state ?? "unknown";

    if (attributes.triaged_at) triaged += 1;

    if (
      state === "resolved" ||
      state === "closed" ||
      state === "informant_resolved"
    ) {
      resolved += 1;
    }

    if (attributes.bounty_awarded_at) bountyAwarded += 1;
    if (attributes.swag_awarded_at) swagAwarded += 1;

    byState[state] = (byState[state] ?? 0) + 1;
    programs.add(
      relationshipSingle(report.relationships?.program)?.attributes?.handle ??
        "unknown"
    );
  }

  const recentReports = [...reports]
    .sort((a, b) =>
      (b.attributes.last_activity_at ?? "").localeCompare(
        a.attributes.last_activity_at ?? ""
      )
    )
    .slice(0, 8)
    .map((report) => ({
      id: report.id,
      title: report.attributes.title ?? `Report #${report.id}`,
      state: report.attributes.state ?? "unknown",
      programHandle:
        relationshipSingle(report.relationships?.program)?.attributes?.handle ??
        null,
      severityRating:
        relationshipSingle(report.relationships?.severity)?.attributes?.rating ??
        null,
      submittedAt: report.attributes.submitted_at ?? null,
      lastActivityAt: report.attributes.last_activity_at ?? null,
    }));

  const recentAwards = [...earnings]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 5)
    .map((earning) => ({
      id: earning.id,
      amount: earning.amount,
      createdAt: earning.createdAt,
      programHandle: earning.programHandle,
      reportId: earning.reportId,
    }));

  // Analytics derived from the report collection attributes.
  const submissionsByMonth = new Map<string, number>();
  const programReportCounts = new Map<string, number>();
  const weaknessCounts = new Map<string, number>();
  const triageDays: number[] = [];
  const closeDays: number[] = [];

  for (const report of reports) {
    const attributes = report.attributes;

    if (attributes.submitted_at) {
      const date = new Date(attributes.submitted_at);

      if (!Number.isNaN(date.getTime())) {
        const key = `${date.getUTCFullYear()}-${String(
          date.getUTCMonth() + 1
        ).padStart(2, "0")}`;
        submissionsByMonth.set(key, (submissionsByMonth.get(key) ?? 0) + 1);
      }
    }

    const handle =
      relationshipSingle(report.relationships?.program)?.attributes?.handle ??
      "unknown";
    programReportCounts.set(handle, (programReportCounts.get(handle) ?? 0) + 1);

    const weaknessName = relationshipSingle(
      report.relationships?.weakness
    )?.attributes?.name;

    if (weaknessName) {
      weaknessCounts.set(weaknessName, (weaknessCounts.get(weaknessName) ?? 0) + 1);
    }

    if (attributes.triaged_at && attributes.submitted_at) {
      const days =
        (new Date(attributes.triaged_at).getTime() -
          new Date(attributes.submitted_at).getTime()) /
        86_400_000;

      if (!Number.isNaN(days) && days >= 0) triageDays.push(days);
    }

    if (attributes.closed_at && attributes.submitted_at) {
      const days =
        (new Date(attributes.closed_at).getTime() -
          new Date(attributes.submitted_at).getTime()) /
        86_400_000;

      if (!Number.isNaN(days) && days >= 0) closeDays.push(days);
    }
  }

  function median(values: number[]): number | null {
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return {
    reports: {
      total: reports.length,
      triaged,
      resolved,
      bountyAwarded,
      swagAwarded,
      byState,
    },
    programCount: Math.max(0, programs.size - (programs.has("unknown") ? 1 : 0)),
    balance: balanceData.data?.balance ?? 0,
    recentReports,
    recentAwards,
    summary: {
      stats: summary.stats,
      currentMonth: summary.currentMonth,
      currentQuarter: summary.currentQuarter,
      currentYearTotal: summary.currentYearTotal,
      previousMonthTotal: summary.previousMonthTotal,
      byProgram: summary.byProgram,
    },
    analytics: {
      submissionsByMonth: [...submissionsByMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, count]) => ({ key, count })),
      medianDaysToTriage: median(triageDays),
      averageDaysToClose:
        closeDays.length > 0
          ? closeDays.reduce((sum, days) => sum + days, 0) / closeDays.length
          : null,
      triageRate:
        reports.length > 0 ? Math.round((triaged / reports.length) * 100) : 0,
      resolutionRate:
        reports.length > 0 ? Math.round((resolved / reports.length) * 100) : 0,
      bountyRate:
        reports.length > 0
          ? Math.round((bountyAwarded / reports.length) * 100)
          : 0,
      topProgramsByReports: [...programReportCounts.entries()]
        .filter(([handle]) => handle !== "unknown")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([handle, count]) => ({ handle, reports: count })),
      topWeaknesses: [...weaknessCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, reports: count })),
    },
  };
}

export async function GET() {
  try {
    const payload = await cached("overview", CACHE_TTL_MS, loadOverview);

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof HackerOneError) {
      console.error(`HackerOne overview error (status ${error.status})`);
      return NextResponse.json(
        { error: "Failed to build HackerOne overview." },
        { status: 500 }
      );
    }

    console.error("HackerOne overview error:", error);
    return NextResponse.json(
      { error: "Failed to build HackerOne overview." },
      { status: 500 }
    );
  }
}
