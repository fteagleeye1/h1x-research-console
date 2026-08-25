import { readFile } from "node:fs/promises";
import path from "node:path";
import { HackerOneError, hackeroneFetch } from "@/lib/hackerone";
import { classifyVulnerability } from "@/lib/vuln-classes";
import { cached, peekCached } from "@/lib/cache";

/**
 * Disclosed-reports research library data layer.
 *
 * PRIMARY SOURCE — local snapshot produced offline by
 * `npm run sync-disclosed` (scripts/sync-disclosed.mjs):
 *
 *   data/disclosed/snapshot.json = { syncedAt, feedItems, details }
 *
 * The script performs exactly the crawl described below ONCE, politely,
 * outside the request path. Browsing then reads local JSON instantly and
 * never touches HackerOne — no more 429 storms or slow cold starts.
 *
 * FALLBACK — when no snapshot exists yet, this layer crawls live exactly
 * like the original implementation:
 *
 * 1. GET https://api.hackerone.com/v1/hackers/hacktivity (documented,
 *    authenticated, reused existing abstraction) with `sort=-disclosed_at`.
 *    NOTE: vulnerability_information is always empty/redacted here.
 *
 * 2. GET https://hackerone.com/reports/{id}.json — public disclosure payload,
 *    strictly rate-limited; enrichment runs paced and stops early under
 *    sustained 429s. Read WITHOUT credentials, server-side only, numeric IDs
 *    only — never arbitrary user-supplied URLs.
 */

const SITE_JSON_BASE = "https://hackerone.com/reports";
const SITE_USER_AGENT = "H1X-Research-Console/0.1 (personal security research dashboard)";

/** How many newest disclosures we track metadata-only (cheap feed pages). */
export const LIBRARY_META_LIMIT = 400;
/** How many of those get full-body enrichment (site JSON fetch each).
 *  Kept modest: hackerone.com/reports/<id>.json is strictly rate-limited,
 *  so enrichment runs paced and stops early under sustained 429s. */
export const LIBRARY_ENRICH_LIMIT = 100;
const MAX_FEED_PAGES = Math.ceil(LIBRARY_META_LIMIT / 100);
const ENRICH_CONCURRENCY = 2;
/** Polite spacing between disclosure-payload requests per worker. */
const ENRICH_DELAY_MS = 500;
/** Cooldown after a 429 before further attempts in this batch. */
const RATE_LIMIT_COOLDOWN_MS = 20_000;
const MAX_429_PER_BATCH = 12;

const LIBRARY_TTL_MS = 6 * 60 * 60 * 1000;
const DETAIL_TTL_MS = 48 * 60 * 60 * 1000;
const NEGATIVE_DETAIL_TTL_MS = 30 * 60 * 1000;

interface DisclosedSnapshot {
  syncedAt: string;
  metaLimit?: number;
  enrichLimit?: number;
  stoppedEarly?: boolean;
  feedItems: HacktivityItem[];
  details: Record<string, SiteReportJson | null>;
}

const SNAPSHOT_PATH = path.join(process.cwd(), "data", "disclosed", "snapshot.json");
/** Re-stat the snapshot briefly; a fresh `npm run sync-disclosed` shows up fast. */
const SNAPSHOT_TTL_MS = 30_000;

async function loadSnapshot(): Promise<DisclosedSnapshot | null> {
  return cached("disclosed-snapshot:v1", SNAPSHOT_TTL_MS, async () => {
    try {
      const parsed = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8")) as DisclosedSnapshot;

      if (!Array.isArray(parsed.feedItems)) return null;

      return parsed;
    } catch {
      return null; // No snapshot yet — callers fall back to live crawling.
    }
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SeverityRating =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "none"
  | null;

export interface DisclosedReport {
  id: string;
  title: string | null;
  url: string | null;
  /** Original HackerOne weakness string from the hacktivity feed, e.g. "Path Traversal". */
  originalWeakness: string | null;
  /** Canonical research category derived from the weakness/CWE string. */
  vulnClass: string;
  severity: SeverityRating;
  submittedAt: string | null;
  disclosedAt: string | null;
  closedAt: string | null;
  triagedAt: string | null;
  bountyAmount: number | null;
  votes: number;
  cveIds: string[];
  programHandle: string | null;
  programName: string | null;
  reporterUsername: string | null;
  state: string | null;
  substate: string | null;
  /** Full markdown body from the public disclosure payload (enriched reports only). */
  vulnerabilityInformation: string | null;
  structuredScope: {
    assetIdentifier: string | null;
    assetType: string | null;
    eligibleForBounty: boolean | null;
    instruction: string | null;
  } | null;
  /**
   * Result of the deterministic research-usefulness heuristic.
   * Low-information disclosures stay resolvable by direct ID (so the user
   * gets an honest explanation instead of a 404) but are hidden from lists.
   */
  useful: boolean;
  uselessReason?: string;
}

interface HacktivityItemAttributes {
  title?: string | null;
  substate?: string | null;
  url?: string | null;
  disclosed?: boolean;
  disclosed_at?: string | null;
  submitted_at?: string | null;
  vulnerability_information?: string | null;
  cve_ids?: string[] | null;
  cwe?: string | null;
  severity_rating?: string | null;
  votes?: number | null;
  total_awarded_amount?: number | null;
}

interface HacktivityItem {
  id: string;
  type: string;
  attributes?: HacktivityItemAttributes;
  relationships?: {
    program?: { data?: { attributes?: { handle?: string; name?: string | null } } };
  };
}

interface SiteReportJson {
  id?: number | string;
  title?: string | null;
  state?: string | null;
  substate?: string | null;
  severity_rating?: string | null;
  cve_ids?: string[] | null;
  disclosed_at?: string | null;
  submitted_at?: string | null;
  closed_at?: string | null;
  triaged_at?: string | null;
  created_at?: string | null;
  vote_count?: number | null;
  vulnerability_information?: string | null;
  structured_scope?: {
    asset_identifier?: string | null;
    asset_type?: string | null;
    eligible_for_bounty?: boolean | null;
    instruction?: string | null;
  } | null;
  team?: { handle?: string; name?: string | null } | null;
  reporter?: { username?: string | null } | null;
}

function normalizeSeverity(raw: string | null | undefined): SeverityRating {
  switch ((raw ?? "").trim().toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return null;
  }
}

/**
 * Deterministic research-usefulness heuristic.
 *
 * Goal: exclude effectively-empty/administrative disclosures (e.g. report
 * 3696266, whose entire public body is empty) while keeping anything that
 * genuinely documents a vulnerability. Signals are additive; a report is
 * marked not-useful only when the core technical narrative is missing AND
 * nothing else compensates. Never rejects merely because one optional
 * field (scope, CVE, bounty...) is absent.
 */
export function evaluateUsefulness(
  report: Omit<DisclosedReport, "useful" | "uselessReason">
): { useful: boolean; uselessReason?: string } {
  const body = (report.vulnerabilityInformation ?? "").trim();
  const title = (report.title ?? "").trim();

  // The narrative is the single most important signal.
  if (!body || body.length < 80) {
    return { useful: false, uselessReason: "No meaningful vulnerability description was disclosed." };
  }

  let score = 0;
  if (body.length >= 400) score += 2;
  else score += 1;

  if (title.length >= 15 && !/^(report|disclosure|bug|\d+)$/i.test(title)) score += 1;
  if (report.originalWeakness) score += 1;
  if (report.severity) score += 1;
  if (report.programHandle) score += 1;
  if (report.cveIds.length > 0) score += 1;

  // Body present but thin, and almost every other signal also missing.
  if (score < 2) {
    return { useful: false, uselessReason: "Disclosure contains too little information to study." };
  }

  return { useful: true };
}

async function loadFeedPage(page: number): Promise<HacktivityItem[]> {
  const payload = await hackeroneFetch<{ data?: HacktivityItem[] }>(
    `/hackers/hacktivity?page[number]=${page}&page[size]=100&sort=-disclosed_at`
  );

  return (payload.data ?? []).filter(
    (item) => item.type === "hacktivity_item" && item.attributes?.disclosed === true
  );
}

async function fetchSiteJson(
  reportId: string,
  opts: { paced?: boolean } = {}
): Promise<SiteReportJson | null> {
  if (opts.paced) await sleep(ENRICH_DELAY_MS);

  const response = await fetch(`${SITE_JSON_BASE}/${reportId}.json`, {
    headers: { Accept: "application/json", "User-Agent": SITE_USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 404 || response.status === 410) return null;

  if (!response.ok) {
    throw new HackerOneError(
      response.status,
      `Disclosure payload fetch failed for report ${reportId}`
    );
  }

  return (await response.json()) as SiteReportJson;
}

function mergeReport(
  feed: HacktivityItem,
  detail: SiteReportJson | null
): DisclosedReport {
  const fa = feed.attributes ?? {};
  const programRel = feed.relationships?.program?.data?.attributes;
  const team = detail?.team ?? undefined;

  const partial: Omit<DisclosedReport, "useful" | "uselessReason"> = {
    id: String(feed.id),
    title: fa.title ?? detail?.title ?? null,
    url:
      fa.url ??
      (detail?.id ? `https://hackerone.com/reports/${detail.id}` : null),
    originalWeakness: fa.cwe ?? null,
    vulnClass: classifyVulnerability({
      weakness: fa.cwe ?? null,
      title: fa.title ?? detail?.title ?? null,
      body: detail?.vulnerability_information ?? null,
    }),
    severity:
      normalizeSeverity(fa.severity_rating) ??
      normalizeSeverity(detail?.severity_rating),
    submittedAt: fa.submitted_at ?? detail?.submitted_at ?? null,
    disclosedAt: fa.disclosed_at ?? detail?.disclosed_at ?? null,
    closedAt: detail?.closed_at ?? null,
    triagedAt: detail?.triaged_at ?? null,
    bountyAmount:
      typeof fa.total_awarded_amount === "number" && fa.total_awarded_amount > 0
        ? fa.total_awarded_amount
        : null,
    votes: fa.votes ?? detail?.vote_count ?? 0,
    cveIds: Array.isArray(detail?.cve_ids)
      ? detail!.cve_ids!
      : Array.isArray(fa.cve_ids)
        ? fa.cve_ids!
        : [],
    programHandle: team?.handle ?? programRel?.handle ?? null,
    programName: team?.name ?? programRel?.name ?? null,
    reporterUsername: detail?.reporter?.username ?? null,
    state: detail?.state ?? null,
    substate: detail?.substate ?? fa.substate ?? null,
    vulnerabilityInformation: detail?.vulnerability_information ?? null,
    structuredScope: detail?.structured_scope
      ? {
          assetIdentifier: detail.structured_scope.asset_identifier ?? null,
          assetType: detail.structured_scope.asset_type ?? null,
          eligibleForBounty:
            detail.structured_scope.eligible_for_bounty ?? null,
          instruction: detail.structured_scope.instruction ?? null,
        }
      : null,
  };

  const verdict = evaluateUsefulness(partial);

  return { ...partial, ...verdict };
}

/**
 * Newest-first disclosed library. Reads the offline snapshot when present
 * (instant, zero network); otherwise falls back to the paced live crawl.
 * Filters/search/pagination run over this snapshot in the API route.
 */
export async function loadDisclosedLibrary(): Promise<DisclosedReport[]> {
  const snapshot = await loadSnapshot();

  if (snapshot) {
    return cached("disclosed-library:v2", LIBRARY_TTL_MS, async () => {
      const seen = new Set<string>();
      const feedItems = snapshot.feedItems.filter((item) =>
        seen.has(String(item.id)) ? false : (seen.add(String(item.id)), true)
      );

      return feedItems
        .slice(0, LIBRARY_META_LIMIT)
        .map((item) => mergeReport(item, snapshot.details[String(item.id)] ?? null));
    });
  }

  console.warn(
    "No disclosed-library snapshot found (run `npm run sync-disclosed`); crawling live with pacing."
  );

  return cached("disclosed-library:v2", LIBRARY_TTL_MS, async () => {
    let feedItems: HacktivityItem[] = [];

    for (let page = 1; page <= MAX_FEED_PAGES; page += 1) {
      try {
        const items = await loadFeedPage(page);

        feedItems.push(...items);

        if (feedItems.length >= LIBRARY_ENRICH_LIMIT) break;
      } catch (error) {
        console.error(
          `Disclosed feed page ${page} failed:`,
          error instanceof HackerOneError ? `status ${error.status}` : error
        );
        break;
      }
    }

    // Deduplicate by ID (defensive against API hiccups).
    const seen = new Set<string>();
    feedItems = feedItems.filter((item) =>
      seen.has(String(item.id)) ? false : (seen.add(String(item.id)), true)
    );

    const metaSlice = feedItems.slice(0, LIBRARY_META_LIMIT);
    const enrichSlice = feedItems.slice(0, LIBRARY_ENRICH_LIMIT);

    console.log(
      `Disclosed library warming: enriching ${enrichSlice.length} reports (paced)...`
    );

    const details = new Map<string, SiteReportJson | null>();
    let cursor = 0;
    let rateLimitedHits = 0;

    async function enrichWorker() {
      while (cursor < enrichSlice.length && rateLimitedHits < MAX_429_PER_BATCH) {
        const index = cursor++;
        const item = enrichSlice[index];

        try {
          const detail = await fetchSiteJson(String(item.id), { paced: true });
          details.set(String(item.id), detail);
        } catch (error) {
          if (
            error instanceof HackerOneError &&
            (error.status === 429 || error.status === 403)
          ) {
            rateLimitedHits += 1;
            console.warn(
              `Disclosure payload rate-limited for ${item.id}; cooling down ${RATE_LIMIT_COOLDOWN_MS / 1000}s (${rateLimitedHits}/${MAX_429_PER_BATCH})`
            );
            await sleep(RATE_LIMIT_COOLDOWN_MS);
          } else {
            console.error(
              `Disclosure payload failed for ${item.id}:`,
              error instanceof HackerOneError ? `status ${error.status}` : error
            );
          }
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(ENRICH_CONCURRENCY, enrichSlice.length) }, enrichWorker)
    );

    if (rateLimitedHits >= MAX_429_PER_BATCH) {
      console.warn(
        "Disclosed library enrichment stopped early due to rate limiting; partial library cached."
      );
    }

    return metaSlice.map((item) => mergeReport(item, details.get(String(item.id)) ?? null));
  });
}

/** Single disclosed report by numeric ID; misses cached briefly. */
export async function loadDisclosedReport(
  reportId: string
): Promise<DisclosedReport | null> {
  // Misses resolve to null quickly; the shared in-process cache keeps them
  // for the standard detail TTL, which is acceptable for immutable disclosures.
  return cached(
    `disclosed-report:v1:${reportId}`,
    reportId in detailMisses ? NEGATIVE_DETAIL_TTL_MS : DETAIL_TTL_MS,
    async () => {
      // Only consult the feed when a warmed library snapshot is already
      // available — direct-ID opens must never trigger feed pagination.
      const library = peekCached<DisclosedReport[]>("disclosed-library:v2");
      const inLibrary =
        library?.find((report) => report.id === reportId) ?? null;

      let detail: SiteReportJson | null = null;

      try {
        detail = await fetchSiteJson(reportId);
      } catch (error) {
        console.error(
          `Disclosure payload failed for ${reportId}:`,
          error instanceof HackerOneError ? `status ${error.status}` : error
        );
      }

      if (!detail && !inLibrary) {
        detailMisses.add(reportId);
        return null;
      }

      if (inLibrary && inLibrary.vulnerabilityInformation) {
        // Fully enriched copy already in memory.
        return inLibrary;
      }

      // Rebuild a feed-shaped item so mergeReport can do its job. Weakness,
      // bounty and votes are only known when the library snapshot has them.
      const feedShaped: HacktivityItem = {
        id: reportId,
        type: "hacktivity_item",
        attributes: {
          disclosed: true,
          title: detail?.title ?? inLibrary?.title ?? null,
          substate: detail?.substate ?? null,
          url: `${SITE_JSON_BASE}/${reportId}`,
          disclosed_at: detail?.disclosed_at ?? null,
          submitted_at: detail?.submitted_at ?? null,
          cve_ids: detail?.cve_ids ?? null,
          severity_rating:
            detail?.severity_rating ?? inLibrary?.severity ?? null,
          votes: detail?.vote_count ?? inLibrary?.votes ?? null,
          cwe: inLibrary?.originalWeakness ?? null,
          total_awarded_amount: inLibrary?.bountyAmount ?? null,
        } as HacktivityItemAttributes,
        relationships: inLibrary
          ? {
              program: {
                data: {
                  attributes: {
                    handle: inLibrary.programHandle ?? undefined,
                    name: inLibrary.programName,
                  },
                },
              },
            }
          : undefined,
      };

      const merged = mergeReport(feedShaped, detail);

      if (!merged.useful) detailMisses.add(reportId);

      return merged;
    }
  );
}

/** Report IDs known to be missing/low-information (shorter cache TTL applies). */
const detailMisses = new Set<string>();
