import { NextRequest, NextResponse } from "next/server";
import {
  LIBRARY_META_LIMIT,
  loadDisclosedLibrary,
} from "@/lib/disclosed";
import { classLabel } from "@/lib/vuln-classes";

/**
 * Server-side boundary for the disclosed-reports research library.
 * Filtering, sorting, searching and pagination all run over the cached
 * library snapshot — no client-side bulk downloads.
 */
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type DisclosedListItem = {
  id: string;
  title: string | null;
  url: string | null;
  vulnClass: string;
  vulnClassLabel: string;
  originalWeakness: string | null;
  severity: string | null;
  submittedAt: string | null;
  disclosedAt: string | null;
  bountyAmount: number | null;
  votes: number;
  cveIds: string[];
  programHandle: string | null;
  programName: string | null;
  /** Short plain-text excerpt; full body only on the detail endpoint. */
  excerpt: string;
};

export type DisclosedListPayload = {
  items: DisclosedListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  metaLimit: number;
  classes: { key: string; label: string; count: number }[];
  severities: { key: string; count: number }[];
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function severityRank(severity: string | null): number {
  return severity ? (SEVERITY_RANK[severity] ?? 0) : -1;
}

function toListItem(report: Awaited<ReturnType<typeof loadDisclosedLibrary>>[number]): DisclosedListItem {
  const raw = (report.vulnerabilityInformation ?? "").replace(/[#*`>\[\]()!]/g, " ").replace(/\s+/g, " ").trim();

  return {
    id: report.id,
    title: report.title,
    url: report.url,
    vulnClass: report.vulnClass,
    vulnClassLabel: classLabel(report.vulnClass),
    originalWeakness: report.originalWeakness,
    severity: report.severity,
    submittedAt: report.submittedAt,
    disclosedAt: report.disclosedAt,
    bountyAmount: report.bountyAmount,
    votes: report.votes,
    cveIds: report.cveIds,
    programHandle: report.programHandle,
    programName: report.programName,
    excerpt: raw.slice(0, 280) + (raw.length > 280 ? "..." : ""),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const classFilter = searchParams.get("class") ?? "all";
    const severityFilter = (searchParams.get("severity") ?? "all").toLowerCase();
    const sort = searchParams.get("sort") ?? "newest-disclosed";
    const query = (searchParams.get("q") ?? "").trim().toLowerCase();

    const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.parseInt(searchParams.get("size") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
    );

    // Only useful reports are part of the browsable library.
    const library = await loadDisclosedLibrary();
    let reports = library.filter((report) => report.useful);

    if (classFilter !== "all") {
      reports = reports.filter((report) => report.vulnClass === classFilter);
    }

    if (severityFilter !== "all") {
      if (severityFilter === "none") {
        reports = reports.filter((report) => report.severity === null);
      } else {
        reports = reports.filter((report) => report.severity === severityFilter);
      }
    }

    if (query) {
      reports = reports.filter((report) =>
        [
          report.id,
          report.title ?? "",
          report.originalWeakness ?? "",
          report.programHandle ?? "",
          report.programName ?? "",
          report.vulnerabilityInformation ?? "",
        ]
          .join("\n")
          .toLowerCase()
          .includes(query)
      );
    }

    switch (sort) {
      case "severity-asc":
        reports.sort(
          (a, b) =>
            severityRank(a.severity) - severityRank(b.severity) ||
            (b.disclosedAt ?? "").localeCompare(a.disclosedAt ?? "")
        );
        break;
      case "severity-desc":
        reports.sort(
          (a, b) =>
            severityRank(b.severity) - severityRank(a.severity) ||
            (b.disclosedAt ?? "").localeCompare(a.disclosedAt ?? "")
        );
        break;
      case "oldest-disclosed":
        reports.sort((a, b) => (a.disclosedAt ?? "").localeCompare(b.disclosedAt ?? ""));
        break;
      case "newest-submitted":
        reports.sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
        break;
      case "oldest-submitted":
        reports.sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
        break;
      case "newest-disclosed":
      default:
        reports.sort((a, b) => (b.disclosedAt ?? "").localeCompare(a.disclosedAt ?? ""));
        break;
    }

    const total = reports.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pageCount);
    const items = reports.slice((safePage - 1) * pageSize, safePage * pageSize).map(toListItem);

    // Class + severity counts over the full useful set (ignores filters).
    const allUseful = library.filter((r) => r.useful);
    const classCounts = new Map<string, number>();

    for (const report of allUseful) {
      classCounts.set(report.vulnClass, (classCounts.get(report.vulnClass) ?? 0) + 1);
    }

    const severityCounts = new Map<string, number>();

    for (const report of allUseful) {
      const key = report.severity ?? "none";
      severityCounts.set(key, (severityCounts.get(key) ?? 0) + 1);
    }

    const payload: DisclosedListPayload = {
      items,
      total,
      page: safePage,
      pageSize,
      pageCount,
      metaLimit: LIBRARY_META_LIMIT,
      classes: [...classCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, label: classLabel(key), count })),
      severities: ["critical", "high", "medium", "low", "none"].map((key) => ({
        key,
        count: severityCounts.get(key) ?? 0,
      })),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Disclosed library error:", error);
    return NextResponse.json(
      { error: "Unable to load disclosed reports." },
      { status: 500 }
    );
  }
}
