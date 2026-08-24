/**
 * Earnings normalization + aggregation.
 *
 * AGGREGATION RULE (documented per project spec section 15):
 * - Each earning's timestamp is `earning.attributes.created_at`, the moment
 *   HackerOne recorded the award. This is the canonical award date used for
 *   all monthly and quarterly bucketing.
 * - Buckets are formed in UTC from that ISO timestamp.
 * - Quarters are standard calendar quarters:
 *   Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec.
 * - Amounts are USD numbers as returned by GET /hackers/payments/earnings.
 *   No currency conversion is performed; the API does not expose one.
 */

import type { Earning } from "./types";

export interface NormalizedEarning {
  id: string;
  /** USD amount as a number. */
  amount: number;
  createdAt: string | null;
  awardedBy: string | null;
  programHandle: string | null;
  programName: string | null;
  programId: string | null;
  reportId: string | null;
  reportTitle: string | null;
  reportState: string | null;
}

export interface MonthBucket {
  key: string; // "YYYY-MM"
  label: string; // "Jan 2024"
  total: number;
  count: number;
}

export interface QuarterBucket {
  key: string; // "YYYY-Q1"
  total: number;
  count: number;
}

export interface ProgramBucket {
  handle: string;
  total: number;
  count: number;
}

export interface EarningsStats {
  count: number;
  total: number;
  average: number;
  median: number;
  highest: number;
  highestReportId: string | null;
  highestProgramHandle: string | null;
  firstAwardAt: string | null;
  lastAwardAt: string | null;
}

export interface EarningsSummary {
  stats: EarningsStats;
  currentMonth: MonthBucket;
  currentQuarter: QuarterBucket;
  currentYearTotal: number;
  previousMonthTotal: number;
  byMonth: MonthBucket[];
  byQuarter: QuarterBucket[];
  byProgram: ProgramBucket[];
}

export function normalizeEarning(earning: Earning): NormalizedEarning {
  const bountyReport = earning.relationships?.bounty?.data?.relationships?.report?.data;

  return {
    id: String(earning.id),
    amount: Number(earning.attributes.amount ?? 0),
    createdAt: earning.attributes.created_at ?? null,
    awardedBy: earning.attributes.awarded_by_name ?? null,
    programHandle:
      earning.relationships?.program?.data?.attributes?.handle ?? null,
    programName: earning.relationships?.program?.data?.attributes?.name ?? null,
    programId: earning.relationships?.program?.data?.id ?? null,
    reportId: bountyReport ? String(bountyReport.id) : null,
    reportTitle: bountyReport?.attributes?.title ?? null,
    reportState: bountyReport?.attributes?.state ?? null,
  };
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function monthLabel(key: string): string {
  const [year, month] = key.split("-");

  return `${MONTH_LABELS[Number(month) - 1]} ${year}`;
}

export function quarterKey(date: Date): string {
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;

  return `${date.getUTCFullYear()}-Q${quarter}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeEarnings(
  earnings: NormalizedEarning[]
): EarningsSummary {
  const now = new Date();
  const currentMonthKey = monthKey(now);
  const currentQuarterKeyValue = quarterKey(now);
  const currentYear = now.getUTCFullYear();
  const previousMonthDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
  );
  const previousMonthKey = monthKey(previousMonthDate);

  const months = new Map<string, MonthBucket>();
  const quarters = new Map<string, QuarterBucket>();
  const programs = new Map<string, ProgramBucket>();

  let total = 0;
  let currentYearTotal = 0;
  let highest = 0;
  let highestReportId: string | null = null;
  let highestProgramHandle: string | null = null;

  for (const earning of earnings) {
    const amount = earning.amount;
    total += amount;

    if (!earning.createdAt) continue;

    const date = new Date(earning.createdAt);

    if (Number.isNaN(date.getTime())) continue;

    if (date.getUTCFullYear() === currentYear) {
      currentYearTotal += amount;
    }

    // Monthly buckets
    const mKey = monthKey(date);
    const month = months.get(mKey) ?? {
      key: mKey,
      label: monthLabel(mKey),
      total: 0,
      count: 0,
    };
    month.total += amount;
    month.count += 1;
    months.set(mKey, month);

    // Quarterly buckets
    const qKey = quarterKey(date);
    const quarter = quarters.get(qKey) ?? { key: qKey, total: 0, count: 0 };
    quarter.total += amount;
    quarter.count += 1;
    quarters.set(qKey, quarter);

    // Program buckets
    if (earning.programHandle) {
      const program = programs.get(earning.programHandle) ?? {
        handle: earning.programHandle,
        total: 0,
        count: 0,
      };
      program.total += amount;
      program.count += 1;
      programs.set(earning.programHandle, program);
    }

    if (amount > highest) {
      highest = amount;
      highestReportId = earning.reportId;
      highestProgramHandle = earning.programHandle;
    }
  }

  const sortedMonths = [...months.values()].sort((a, b) =>
    a.key.localeCompare(b.key)
  );

  const amounts = earnings.map((e) => e.amount);
  const dated = earnings
    .filter((e) => e.createdAt && !Number.isNaN(new Date(e.createdAt).getTime()))
    .sort((a, b) =>
      (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
    );

  const stats: EarningsStats = {
    count: earnings.length,
    total: round2(total),
    average: earnings.length ? round2(total / earnings.length) : 0,
    median: round2(median(amounts)),
    highest: round2(highest),
    highestReportId,
    highestProgramHandle,
    firstAwardAt: dated[0]?.createdAt ?? null,
    lastAwardAt: dated[dated.length - 1]?.createdAt ?? null,
  };

  return {
    stats,
    currentMonth:
      months.get(currentMonthKey) ??
      { key: currentMonthKey, label: monthLabel(currentMonthKey), total: 0, count: 0 },
    currentQuarter:
      quarters.get(currentQuarterKeyValue) ??
      { key: currentQuarterKeyValue, total: 0, count: 0 },
    currentYearTotal: round2(currentYearTotal),
    previousMonthTotal: round2(months.get(previousMonthKey)?.total ?? 0),
    byMonth: sortedMonths.map((m) => ({ ...m, total: round2(m.total) })),
    byQuarter: [...quarters.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((q) => ({ ...q, total: round2(q.total) })),
    byProgram: [...programs.values()]
      .sort((a, b) => b.total - a.total)
      .map((p) => ({ ...p, total: round2(p.total) })),
  };
}
