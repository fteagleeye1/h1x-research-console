import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { HackerOneError } from "@/lib/hackerone";
import { loadAllJoinedPrograms } from "@/lib/data";
import type {
  JoinedProgram,
  OpportunitiesSummary,
} from "@/lib/types";

const OPPORTUNITIES_TTL_MS = 30 * 60 * 1000;

export type OpportunitiesPayload = {
  summary: OpportunitiesSummary;
  programs: JoinedProgram[];
};

function buildSummary(programs: JoinedProgram[]): OpportunitiesSummary {
  let publicMode = 0;
  let softLaunched = 0;
  let privateOpportunities = 0;
  let openSubmissions = 0;
  let pausedSubmissions = 0;
  let bookmarked = 0;

  for (const program of programs) {
    if (program.state === "public_mode") publicMode += 1;
    if (program.state === "soft_launched") softLaunched += 1;
    if (program.privateOpportunity) privateOpportunities += 1;
    if (program.submissionState === "open") openSubmissions += 1;
    if (program.submissionState === "paused") pausedSubmissions += 1;
    if (program.bookmarked) bookmarked += 1;
  }

  return {
    totalJoined: programs.length,
    publicMode,
    softLaunched,
    privateOpportunities,
    openSubmissions,
    pausedSubmissions,
    bookmarked,
  };
}

export async function GET() {
  try {
    const payload = await cached(
      "opportunities:v1",
      OPPORTUNITIES_TTL_MS,
      async (): Promise<OpportunitiesPayload> => {
        const programs = await loadAllJoinedPrograms();

        // Newest first using when submissions opened; fallback to handle.
        programs.sort((a, b) => {
          const at = a.startedAcceptingAt ? Date.parse(a.startedAcceptingAt) : 0;
          const bt = b.startedAcceptingAt ? Date.parse(b.startedAcceptingAt) : 0;

          return bt - at || a.handle.localeCompare(b.handle);
        });

        return { summary: buildSummary(programs), programs };
      }
    );

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof HackerOneError) {
      console.error(`HackerOne opportunities error (status ${error.status})`);
      return NextResponse.json(
        { error: "Failed to fetch joined HackerOne programs." },
        { status: 500 }
      );
    }

    console.error("HackerOne opportunities error:", error);
    return NextResponse.json(
      { error: "Failed to fetch joined HackerOne programs." },
      { status: 500 }
    );
  }
}
