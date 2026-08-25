import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { HackerOneError, hackeroneFetch } from "@/lib/hackerone";
import type { Program, ProgramDetailResponse } from "@/lib/types";

type RouteContext = {
  params: Promise<{
    handle: string;
  }>;
};

const PROGRAM_TTL_MS = 30 * 60 * 1000;

/**
 * Full program profile for the in-app program detail view.
 * Uses the documented Hacker API program endpoint; read-only.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { handle } = await context.params;

  // Handles on HackerOne are [a-z0-9_-]; reject everything else early.
  if (!handle || !/^[a-z0-9_-]{1,64}$/.test(handle)) {
    return NextResponse.json({ error: "Invalid program handle." }, { status: 400 });
  }

  try {
    const payload = await cached(`program-detail:v1:${handle}`, PROGRAM_TTL_MS, async () => {
      const response = await hackeroneFetch<ProgramDetailResponse>(
        `/hackers/programs/${encodeURIComponent(handle)}`
      );

      // Live API may return the program unwrapped or inside { data }.
      const program =
        "data" in response && response.data
          ? response.data
          : (response as Program);

      if (!program || program.type !== "program") return null;

      const a = program.attributes ?? {};

      // Structured scope arrives as a relationship collection (loosely
      // typed upstream — HackerOneResource declares relationships unknown).
      const scopes =
        (
          (
            program as {
              relationships?: {
                structured_scopes?: {
                  data?: { attributes?: Record<string, unknown> }[];
                };
              };
            }
          ).relationships?.structured_scopes?.data ?? []
        ) ?? [];

      return {
        id: program.id ?? null,
        handle,
        name: a.name ?? null,
        state: a.state ?? null,
        submissionState: a.submission_state ?? null,
        offersBounties: a.offers_bounties ?? null,
        triageActive: a.triage_active ?? null,
        bookmarked: a.bookmarked ?? null,
        allowsBountySplitting: a.allows_bounty_splitting ?? null,
        openScope: a.open_scope ?? null,
        goldStandardSafeHarbor: a.gold_standard_safe_harbor ?? null,
        fastPayments: a.fast_payments ?? null,
        startedAcceptingAt: a.started_accepting_at ?? null,
        numberOfReportsForUser: a.number_of_reports_for_user ?? null,
        numberOfValidReportsForUser: a.number_of_valid_reports_for_user ?? null,
        bountyEarnedForUser: a.bounty_earned_for_user ?? null,
        /** Policy/scope markdown rendered by the client. */
        policy: a.policy ?? null,
        /** Parsed structured-scope table entries. */
        structuredScopes: scopes.map((scope) => {
          const sa = scope.attributes ?? {};

          return {
            assetIdentifier: (sa.asset_identifier as string) ?? null,
            assetType: (sa.asset_type as string) ?? null,
            eligibleForBounty:
              (sa.eligible_for_bounty as boolean | null) ?? null,
            eligibleForSubmission:
              (sa.eligible_for_submission as boolean | null) ?? null,
            maxSeverity: (sa.max_severity as string) ?? null,
            instruction: (sa.instruction as string) ?? null,
          };
        }),
      };
    });

    if (!payload) {
      return NextResponse.json(
        { error: "Program not found or not accessible with your account." },
        { status: 404 }
      );
    }

    return NextResponse.json({ program: payload });
  } catch (error) {
    if (error instanceof HackerOneError && error.status === 404) {
      return NextResponse.json({ error: "Program not found." }, { status: 404 });
    }

    console.error(
      `Program detail error (${handle}):`,
      error instanceof Error ? error.message.slice(0, 300) : error
    );

    return NextResponse.json(
      { error: "Failed to fetch this program." },
      { status: 500 }
    );
  }
}
