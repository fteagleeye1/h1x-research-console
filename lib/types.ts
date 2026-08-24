/**
 * Typed models for the HackerOne Hacker API (https://api.hackerone.com/hacker-reference).
 *
 * Field shapes below were verified against live API responses on 2026-08-24:
 * - GET /hackers/me/reports            -> ReportSummary (collection)
 * - GET /hackers/reports/{id}          -> ReportDetail
 * - GET /hackers/payments/balance      -> { balance: number }
 * - GET /hackers/payments/earnings     -> Earning[]
 * - GET /hackers/programs              -> Program[] (paginated)
 * - GET /hackers/programs/{handle}     -> Program
 */

export interface RelationshipRef {
  id: string;
  type: string;
}

export interface SeverityAttributes {
  rating?: string | null;
  author_type?: string | null;
  user_id?: number | null;
  created_at?: string | null;
  max_severity?: string | null;
  calculation_method?: string | null;
  score?: number | null;
}

export interface Severity extends RelationshipRef {
  type: "severity";
  attributes?: SeverityAttributes;
}

export interface ProgramSmallAttributes {
  handle?: string;
  name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Program object as embedded in report responses (limited attributes). */
export interface ProgramRef extends RelationshipRef {
  type: "program";
  attributes?: ProgramSmallAttributes;
}

/**
 * Full program object from /hackers/programs.
 * `state` is the API-evidenced visibility signal:
 * - "public_mode"    -> publicly listed program
 * - "soft_launched"  -> limited-visibility (invite-only) phase
 */
export interface ProgramAttributes {
  handle?: string;
  name?: string | null;
  currency?: string | null;
  policy?: string | null;
  submission_state?: string | null;
  triage_active?: boolean | null;
  state?: string | null;
  started_accepting_at?: string | null;
  number_of_reports_for_user?: number | null;
  number_of_valid_reports_for_user?: number | null;
  bounty_earned_for_user?: number | null;
  last_invitation_accepted_at_for_user?: string | null;
  bookmarked?: boolean | null;
  allows_bounty_splitting?: boolean | null;
  offers_bounties?: boolean | null;
  open_scope?: boolean | null;
  fast_payments?: boolean | null;
  gold_standard_safe_harbor?: boolean | null;
}

export interface Program extends RelationshipRef {
  type: "program";
  attributes?: ProgramAttributes;
}

export interface WeaknessAttributes {
  name?: string;
  description?: string | null;
  external_id?: string | null;
  created_at?: string | null;
}

export interface Weakness extends RelationshipRef {
  type: "weakness";
  attributes?: WeaknessAttributes;
}

export interface StructuredScopeAttributes {
  asset_identifier?: string;
  asset_type?: string;
  max_severity?: string | null;
  eligible_for_bounty?: boolean | null;
  eligible_for_submission?: boolean | null;
  instruction?: string | null;
  reference?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface StructuredScope extends RelationshipRef {
  type: "structured-scope";
  attributes?: StructuredScopeAttributes;
}

/**
 * Bounty object. Verified live on reports 2431195, 2600283, 3462410 and via
 * nested earnings relationships. Matches the official hacker-reference schema:
 * amounts are decimal strings, `awarded_currency` is e.g. "USD".
 */
export interface BountyAttributes {
  amount?: string | null;
  bonus_amount?: string | null;
  awarded_amount?: string | null;
  awarded_bonus_amount?: string | null;
  awarded_currency?: string | null;
  created_at?: string | null;
}

export interface Bounty extends RelationshipRef {
  type: "bounty";
  attributes?: BountyAttributes;
}

/** Report attributes shared between the collection and detail endpoints. */
export interface ReportAttributes {
  title?: string;
  state?: string;
  created_at?: string | null;
  submitted_at?: string | null;
  vulnerability_information?: string | null;
  triaged_at?: string | null;
  closed_at?: string | null;
  last_reporter_activity_at?: string | null;
  first_program_activity_at?: string | null;
  last_program_activity_at?: string | null;
  bounty_awarded_at?: string | null;
  swag_awarded_at?: string | null;
  disclosed_at?: string | null;
  reporter_agreed_on_going_public_at?: string | null;
  last_public_activity_at?: string | null;
  last_activity_at?: string | null;
  cve_ids?: string[];
}

export interface ActivityAttributes {
  message?: string | null;
  internal?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  report_id?: string | null;
}

/** Activities come in many subtypes (activity-comment, activity-bug-resolved, ...). */
export interface Activity extends RelationshipRef {
  attributes?: ActivityAttributes;
}

/** A loosely-typed relationship container; attribute shape depends on `type`. */
export interface Relationship<T extends RelationshipRef = RelationshipRef> {
  data?: T | T[];
}

/** Narrow a JSON:API relationship that may hold one object or a list. */
export function relationshipSingle<T extends RelationshipRef>(
  relationship?: { data?: T | T[] }
): T | null {
  const data = relationship?.data;

  if (!data) return null;

  return Array.isArray(data) ? (data[0] ?? null) : data;
}

export interface ReportRelationships {
  reporter?: Relationship;
  program?: Relationship<ProgramRef>;
  severity?: Relationship<Severity>;
  weakness?: Relationship<Weakness>;
  structured_scope?: Relationship<StructuredScope>;
  bounties?: Relationship<Bounty>;
  activities?: Relationship<Activity>;
  swag?: Relationship;
  attachments?: Relationship;
  summaries?: Relationship;
}

export interface HackerOneResource<A> extends RelationshipRef {
  type: string;
  attributes: A;
  relationships?: unknown;
}

/** Item returned by GET /hackers/me/reports. */
export interface ReportSummary
  extends Omit<HackerOneResource<ReportAttributes>, "relationships"> {
  relationships?: ReportRelationships;
}

/** Item returned by GET /hackers/reports/{id}. */
export type ReportDetail = ReportSummary;

export interface CollectionLinks {
  self?: string;
  next?: string;
  prev?: string;
}

export interface ReportsCollectionResponse {
  data: ReportSummary[];
  links?: CollectionLinks;
}

export interface ReportDetailResponse {
  data: ReportDetail;
}

// --- Payments ---

export interface BalanceResponse {
  data: {
    balance: number;
  };
}

/**
 * Nested bounty as embedded in earnings responses; includes a report
 * relationship with limited report attributes.
 */
export interface EarningsBounty extends Bounty {
  relationships?: {
    report?: {
      data?: {
        id: string;
        type: "report";
        attributes?: Pick<
          ReportAttributes,
          | "title"
          | "state"
          | "created_at"
          | "submitted_at"
          | "triaged_at"
          | "closed_at"
          | "bounty_awarded_at"
        > & { vulnerability_information?: string | null };
      };
    };
  };
}

/**
 * Earning object from GET /hackers/payments/earnings.
 * Live response verified: type "earning-bounty-earned", numeric `amount`
 * (USD), optional `awarded_by_name`, ISO `created_at`.
 */
export interface Earning extends RelationshipRef {
  type: string;
  attributes: {
    amount: number;
    created_at: string | null;
    awarded_by_name?: string | null;
  };
  relationships?: {
    program?: {
      data?: {
        id: string;
        type: "program";
        attributes?: ProgramAttributes;
      };
    };
    bounty?: {
      data?: EarningsBounty;
    };
  };
}

export interface EarningsCollectionResponse {
  data: Earning[];
  links?: CollectionLinks;
}

export interface ProgramsCollectionResponse {
  data: Program[];
  links?: CollectionLinks;
}

/**
 * Lightweight projection of a joined program returned to the client.
 * Heavy fields (policy, profile_picture) are stripped server-side: the full
 * /hackers/programs payload for ~800 programs measures multiple megabytes.
 *
 * `privateOpportunity` replicates the site-side opportunities filter
 * (bbp=true&private=true): soft_launched (private) + submissions open +
 * offers bounties. Verified against hackerone.com/opportunities/my_programs
 * on 2026-08-24: API count == "We found 171 opportunities for you".
 */
export interface JoinedProgram {
  id: string;
  handle: string;
  name: string | null;
  state: string | null;
  submissionState: string | null;
  offersBounties: boolean | null;
  triageActive: boolean | null;
  bookmarked: boolean | null;
  allowsBountySplitting: boolean | null;
  openScope: boolean | null;
  fastPayments: boolean | null;
  goldStandardSafeHarbor: boolean | null;
  startedAcceptingAt: string | null;
  reportsForUser: number;
  validReportsForUser: number;
  bountyEarnedForUser: number;
  lastInvitationAcceptedAtForUser: string | null;
  privateOpportunity: boolean;
  /** started_accepting_at within the last 30 days (computed server-side). */
  openedRecently: boolean;
}

export interface OpportunitiesSummary {
  totalJoined: number;
  publicMode: number;
  softLaunched: number;
  /** soft_launched + submission open + offers bounties (site: bbp+private). */
  privateOpportunities: number;
  openSubmissions: number;
  pausedSubmissions: number;
  bookmarked: number;
}

/**
 * GET /hackers/programs/{handle}: documented as { data: Program }, but live
 * responses return the program object unwrapped. Accept both.
 */
export type ProgramDetailResponse = { data: Program } | Program;
