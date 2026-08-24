import { NextResponse } from "next/server";
import { cached, mapLimit } from "@/lib/cache";
import { HackerOneError, hackeroneFetch } from "@/lib/hackerone";
import { loadAllReports } from "@/lib/data";
import type {
  EarningsCollectionResponse,
  Program,
  ProgramDetailResponse,
} from "@/lib/types";
import { relationshipSingle } from "@/lib/types";

const PROGRAM_TTL_MS = 30 * 60 * 1000;
const MERGED_TTL_MS = 10 * 60 * 1000;
const DETAIL_CONCURRENCY = 5;

export type DerivedProgram = {
  id: string | null;
  handle: string;
  name: string | null;
  /** Raw API state, e.g. "public_mode" | "soft_launched". */
  state: string | null;
  submissionState: string | null;
  offersBounties: boolean | null;
  triageActive: boolean | null;
  bookmarked: boolean | null;
  /** Report count computed from the user's own report collection. */
  reportCount: number;
  validReportCount: number | null;
  /** Total bounty earned for this user per the program detail endpoint. */
  bountyEarnedForUser: number | null;
  /** Total earnings recorded via /hackers/payments/earnings (USD). */
  earningsTotal: number;
  earningsCount: number;
};

async function loadProgramDetail(handle: string): Promise<Program | null> {
  return cached(`program:v2:${handle}`, PROGRAM_TTL_MS, async () => {
    try {
      const payload = await hackeroneFetch<ProgramDetailResponse>(
        `/hackers/programs/${encodeURIComponent(handle)}`
      );

      // Live API may return the program unwrapped or inside { data }.
      const program =
        "data" in payload && payload.data ? payload.data : (payload as Program);

      return program?.type === "program" ? program : null;
    } catch (error) {
      // A program that no longer resolves should not break the whole list.
      console.error(
        `Program detail fetch failed for handle ${handle}:`,
        error instanceof HackerOneError ? `status ${error.status}` : error
      );
      return null;
    }
  });
}

async function loadDerivedPrograms(): Promise<{ programs: DerivedProgram[] }> {
  const [reports, earningsPage] = await Promise.all([
    loadAllReports(),
    hackeroneFetch<EarningsCollectionResponse>(
      "/hackers/payments/earnings?page[number]=1&page[size]=100"
    ),
  ]);

  // Distinct programs + local report counts derived from the user's reports.
  const counts = new Map<string, number>();

  for (const report of reports) {
    const handle =
      relationshipSingle(report.relationships?.program)?.attributes?.handle ??
      "unknown";

    counts.set(handle, (counts.get(handle) ?? 0) + 1);
  }

  // Earnings totals per program handle from the payments/earnings endpoint.
  const earningTotals = new Map<string, { total: number; count: number }>();

  for (const earning of earningsPage.data ?? []) {
    const handle = earning.relationships?.program?.data?.attributes?.handle;

    if (!handle) continue;

    const entry = earningTotals.get(handle) ?? { total: 0, count: 0 };
    entry.total += Number(earning.attributes.amount ?? 0);
    entry.count += 1;
    earningTotals.set(handle, entry);
  }

  const handles = [...counts.keys()].sort();
  const details = await mapLimit(handles, DETAIL_CONCURRENCY, loadProgramDetail);

  const programs: DerivedProgram[] = handles.map((handle, index) => {
    const detail = details[index];
    const attributes = detail?.attributes;
    const earnings = earningTotals.get(handle);

    return {
      id: detail?.id ?? null,
      handle,
      name: attributes?.name ?? null,
      state: attributes?.state ?? null,
      submissionState: attributes?.submission_state ?? null,
      offersBounties: attributes?.offers_bounties ?? null,
      triageActive: attributes?.triage_active ?? null,
      bookmarked: attributes?.bookmarked ?? null,
      reportCount: counts.get(handle) ?? 0,
      validReportCount: attributes?.number_of_valid_reports_for_user ?? null,
      bountyEarnedForUser: attributes?.bounty_earned_for_user ?? null,
      earningsTotal: Math.round((earnings?.total ?? 0) * 100) / 100,
      earningsCount: earnings?.count ?? 0,
    };
  });

  programs.sort((a, b) => b.reportCount - a.reportCount || a.handle.localeCompare(b.handle));

  return { programs };
}

export async function GET() {
  try {
    const payload = await cached("programs:v3", MERGED_TTL_MS, loadDerivedPrograms);

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof HackerOneError) {
      console.error(`HackerOne programs error (status ${error.status})`);
      return NextResponse.json(
        { error: "Failed to fetch HackerOne programs." },
        { status: 500 }
      );
    }

    console.error("HackerOne programs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch HackerOne programs." },
      { status: 500 }
    );
  }
}
