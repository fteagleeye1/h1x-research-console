import { readFile } from "node:fs/promises";
import path from "node:path";
import { cached } from "@/lib/cache";

/**
 * Curated "TOP reports" corpus (reddelexc.github.io/hackerone-reports).
 *
 * Files are static markdown snapshots downloaded by scripts/sync-disclosed.mjs
 * into data/disclosed/tops/ — runtime reads are local-disk only, so this view
 * is instant and can never be rate-limited.
 */

const TOPS_DATA_DIR = path.join(process.cwd(), "data", "disclosed");
const TOPS_DIR = path.join(TOPS_DATA_DIR, "tops");
/** Manifest re-read rarely; file contents effectively immutable per snapshot. */
const MANIFEST_TTL_MS = 5 * 60 * 1000;
const FILE_TTL_MS = 60 * 60 * 1000;

export interface CuratedCategory {
  group: string;
  name: string;
  /** Manifest-relative path, e.g. tops_by_bug_type/TOPXSS.md */
  file: string;
}

export interface CuratedReport {
  reportId: string | null;
  title: string;
  url: string;
  program: string | null;
  votes: number | null;
  bountyAmount: number | null;
}

type TopsManifest = Record<string, { name: string; file: string }[]>;

export async function loadCuratedManifest(): Promise<Record<string, CuratedCategory[]> | null> {
  return cached("curated-tops:manifest", MANIFEST_TTL_MS, async () => {
    try {
      const raw = await readFile(path.join(TOPS_DATA_DIR, "tops-manifest.json"), "utf8");
      const manifest = JSON.parse(raw) as TopsManifest;

      const result: Record<string, CuratedCategory[]> = {};

      for (const [group, categories] of Object.entries(manifest)) {
        result[group] = categories.map((entry) => ({
          group,
          name: entry.name,
          file: entry.file,
        }));
      }

      return result;
    } catch {
      return null;
    }
  });
}

/**
 * Parse the corpus line shape:
 *   1. [Title](https://hackerone.com/reports/510152) to PayPal - 2682 upvotes, $20000
 * Bounty tail is optional; unparsable lines are skipped rather than guessed.
 */
export function parseTopMarkdown(markdown: string): CuratedReport[] {
  const reports: CuratedReport[] = [];

  const linePattern =
    /^\s*\d+\.\s+\[([^\]]+)\]\((https:\/\/hackerone\.com\/reports\/(\d+)\/?)\)(?:\s+to\s+(.+?))?\s+-\s+(\d[\d,_]*)\s+upvotes(?:,\s*\$([\d,]+))?/i;

  for (const line of markdown.split(/\r?\n/)) {
    const match = linePattern.exec(line);

    if (!match) continue;

    const [, title, url, reportId, program, votes, bounty] = match;

    reports.push({
      reportId: reportId ?? null,
      title: title.trim(),
      url,
      program: program?.trim() ?? null,
      votes: Number.parseInt(votes.replace(/[, _]/g, ""), 10),
      bountyAmount: bounty ? Number.parseInt(bounty.replace(/,/g, ""), 10) : null,
    });
  }

  return reports;
}

export async function loadCuratedCategory(
  file: string
): Promise<{ name: string; reports: CuratedReport[] } | null> {
  // Only files present in the manifest may be read — no arbitrary paths.
  const manifest = await loadCuratedManifest();

  if (!manifest) return null;

  const entry = Object.values(manifest)
    .flat()
    .find((category) => category.file === file);

  if (!entry || !/^tops(_\d+|_by_bug_type)[/\\][A-Za-z0-9_-]+\.md$/.test(file)) {
    return null;
  }

  return cached(`curated-tops:file:${file}`, FILE_TTL_MS, async () => {
    try {
      const raw = await readFile(path.join(TOPS_DIR, path.basename(file)), "utf8");

      return { name: entry.name, reports: parseTopMarkdown(raw) };
    } catch {
      return null;
    }
  });
}
