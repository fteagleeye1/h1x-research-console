import { cached } from "@/lib/cache";
import { hackeroneFetch } from "@/lib/hackerone";
import type {
  JoinedProgram,
  ProgramsCollectionResponse,
  ReportsCollectionResponse,
} from "@/lib/types";

const MAX_PAGES = 100;

/**
 * Fully paginate GET /hackers/me/reports server-side (cached). Shared by the
 * programs derivation and overview statistics so we do not duplicate requests.
 */
export async function loadAllReports(): Promise<
  ReportsCollectionResponse["data"]
> {
  return cached("all-reports", 10 * 60 * 1000, async () => {
    const all: ReportsCollectionResponse["data"] = [];
    let pageNumber = 1;

    while (pageNumber <= MAX_PAGES) {
      const page = await hackeroneFetch<ReportsCollectionResponse>(
        `/hackers/me/reports?page[number]=${pageNumber}&page[size]=100`
      );

      all.push(...(page.data ?? []));

      if (!page.links?.next) break;
      pageNumber += 1;
    }

    return all;
  });
}

/**
 * Every program the authenticated user participates in, via fully paginated
 * GET /hackers/programs. Includes public and private (soft_launched) programs
 * regardless of whether the user ever submitted a report — unlike the
 * report-derived list, this surfaces joined-but-unexplored programs.
 *
 * Responses are projected to JoinedProgram before caching: raw payloads embed
 * full policy text (~KBs per program) that must not reach the client.
 */
export async function loadAllJoinedPrograms(): Promise<JoinedProgram[]> {
  return cached("joined-programs:v1", 30 * 60 * 1000, async () => {
    const all: ProgramsCollectionResponse["data"] = [];
    let pageNumber = 1;

    while (pageNumber <= MAX_PAGES) {
      const page = await hackeroneFetch<ProgramsCollectionResponse>(
        `/hackers/programs?page[number]=${pageNumber}&page[size]=100`
      );

      all.push(...(page.data ?? []));

      if (!page.links?.next) break;
      pageNumber += 1;
    }

    return all.map(projectJoinedProgram);
  });
}

function projectJoinedProgram(
  program: ProgramsCollectionResponse["data"][number]
): JoinedProgram {
  const a = program.attributes ?? {};
  const submissionState = a.submission_state ?? null;
  const offersBounties = a.offers_bounties ?? false;
  const state = a.state ?? null;

  return {
    id: program.id,
    handle: a.handle ?? "unknown",
    name: a.name ?? null,
    state,
    submissionState,
    offersBounties: a.offers_bounties ?? null,
    triageActive: a.triage_active ?? null,
    bookmarked: a.bookmarked ?? null,
    allowsBountySplitting: a.allows_bounty_splitting ?? null,
    openScope: a.open_scope ?? null,
    fastPayments: a.fast_payments ?? null,
    goldStandardSafeHarbor: a.gold_standard_safe_harbor ?? null,
    startedAcceptingAt: a.started_accepting_at ?? null,
    reportsForUser: a.number_of_reports_for_user ?? 0,
    validReportsForUser: a.number_of_valid_reports_for_user ?? 0,
    bountyEarnedForUser: a.bounty_earned_for_user ?? 0,
    lastInvitationAcceptedAtForUser:
      a.last_invitation_accepted_at_for_user ?? null,
    privateOpportunity:
      state === "soft_launched" && submissionState === "open" && offersBounties,
    openedRecently: (() => {
      if (!a.started_accepting_at) return false;

      const openedAt = Date.parse(a.started_accepting_at);

      return (
        Number.isFinite(openedAt) &&
        Date.now() - openedAt < 30 * 24 * 60 * 60 * 1000
      );
    })(),
  };
}
