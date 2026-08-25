#!/usr/bin/env node
/**
 * Offline sync for the Disclosed Library.
 *
 * Replaces the old request-time crawling (which caused hackerone.com 429
 * storms during browsing) with a run-it-yourself script that produces local
 * static snapshots under data/disclosed/:
 *
 *   - snapshot.json       hacktivity feed metadata + paced full-body details
 *   - tops/*.md           reddelexc curated TOP-by-bug-type corpus
 *   - tops-manifest.json  category listing for the TOP corpus
 *
 * Run manually whenever you want fresh data (e.g. once a day):
 *
 *   npm run sync-disclosed
 *
 * The app reads these files instantly at runtime; browsing never touches
 * HackerOne. Live fetching remains only as a single-report fallback for IDs
 * outside the snapshot.
 *
 * Politeness rules mirror the previous in-app crawler:
 *   - feed: authenticated documented API, 4 pages x 100 items
 *   - enrichment: public /reports/<id>.json, 500ms spacing, concurrency 2,
 *     20s cooldown after a 429, early stop after 12 rate-limited responses
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DATA_DIR = path.join(ROOT, "data", "disclosed");
const TOPS_DIR = path.join(DATA_DIR, "tops");

const HACKERONE_API_BASE = "https://api.hackerone.com/v1";
const SITE_JSON_BASE = "https://hackerone.com/reports";
const USER_AGENT = "H1X-Research-Console-sync/0.1 (personal security research dashboard)";

const CURATED_BASE = "https://reddelexc.github.io/hackerone-reports/";
const CURATED_CATEGORIES_URL = `${CURATED_BASE}categories.json`;

const FEED_PAGES = 4;
const ENRICH_LIMIT_DEFAULT = 100;
const ENRICH_CONCURRENCY = 2;
const ENRICH_DELAY_MS = 500;
const RATE_LIMIT_COOLDOWN_MS = 20_000;
const MAX_429 = 12;
const REQUEST_TIMEOUT_MS = 20_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  console.error(`sync-disclosed: ${message}`);
  process.exit(1);
}

/** Minimal .env.local reader (KEY=VALUE lines; ignores quotes/comments). */
async function loadEnvLocal() {
  const env = {};

  try {
    const raw = await readFile(path.join(ROOT, ".env.local"), "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);

      if (!match || line.trim().startsWith("#")) continue;

      env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local — credentials check below will complain if needed.
  }

  return env;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...options.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw Object.assign(
      new Error(`HTTP ${response.status} for ${url} :: ${body.slice(0, 300)}`),
      { status: response.status }
    );
  }

  return response.json();
}

/** Authenticated documented-API feed page. authHeader arrives as "Basic <b64>". */
async function loadFeedPage(page, authHeader) {
  if (process.env.DEBUG_SYNC) {
    console.error(`[debug] feed page ${page}: user=${JSON.stringify(process.env.H1_USERNAME)} tokenLen=${(process.env.H1_TOKEN ?? "").length} authPrefix=${authHeader.slice(0, 10)}...`);
  }

  const payload = await fetchJson(
    `${HACKERONE_API_BASE}/hackers/hacktivity?page[number]=${page}&page[size]=100&sort=-disclosed_at`,
    { headers: { Authorization: authHeader } }
  );

  return (payload.data ?? []).filter(
    (item) => item.type === "hacktivity_item" && item.attributes?.disclosed === true
  );
}

/** Public disclosure payload; null on 404/410. */
async function fetchSiteJson(reportId, { paced = false } = {}) {
  if (paced) await sleep(ENRICH_DELAY_MS);

  const response = await fetch(`${SITE_JSON_BASE}/${reportId}.json`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 404 || response.status === 410) return null;

  if (!response.ok) {
    throw Object.assign(new Error(`HTTP ${response.status} for report ${reportId}`), {
      status: response.status,
    });
  }

  return response.json();
}

async function crawlDisclosed(enrichLimit) {
  const username = process.env.H1_USERNAME;
  const token = process.env.H1_TOKEN;

  if (!username || !token) {
    fail("H1_USERNAME / H1_TOKEN missing (set them in .env.local).");
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`;

  let feedItems = [];

  for (let page = 1; page <= FEED_PAGES; page += 1) {
    try {
      const items = await loadFeedPage(page, authHeader);
      feedItems.push(...items);
      if (feedItems.length >= enrichLimit) break;
    } catch (error) {
      console.error(`Feed page ${page} failed: ${error.message}`);
      break;
    }
  }

  const seen = new Set();
  feedItems = feedItems.filter((item) =>
    seen.has(String(item.id)) ? false : (seen.add(String(item.id)), true)
  );

  const enrichSlice = feedItems.slice(0, enrichLimit);
  const details = {};
  let cursor = 0;
  let limitedHits = 0;

  async function worker() {
    while (cursor < enrichSlice.length && limitedHits < MAX_429) {
      const item = enrichSlice[cursor++];
      const id = String(item.id);

      try {
        details[id] = await fetchSiteJson(id, { paced: true });
        process.stdout.write(`\r  enriched ${Object.keys(details).length}/${enrichSlice.length}`);
      } catch (error) {
        if (error.status === 429 || error.status === 403) {
          limitedHits += 1;
          console.warn(
            `\n  rate-limited on ${id}; cooling down ${RATE_LIMIT_COOLDOWN_MS / 1000}s (${limitedHits}/${MAX_429})`
          );
          await sleep(RATE_LIMIT_COOLDOWN_MS);
        } else {
          console.warn(`\n  detail failed for ${id}: ${error.message}`);
        }
      }
    }
  }

  console.log(`Crawling disclosed library: ${feedItems.length} meta items, enriching ${enrichSlice.length}...`);
  await Promise.all(Array.from({ length: Math.min(ENRICH_CONCURRENCY, enrichSlice.length) }, worker));
  console.log("");

  return {
    syncedAt: new Date().toISOString(),
    metaLimit: feedItems.length,
    enrichLimit: enrichSlice.length,
    stoppedEarly: limitedHits >= MAX_429,
    feedItems,
    details,
  };
}

/** Download the curated TOP corpus (static GitHub Pages files — no limits). */
async function syncCuratedTops() {
  console.log("Syncing curated TOP corpus...");

  const manifest = await fetchJson(CURATED_CATEGORIES_URL);
  const groups = Object.entries(manifest);
  let ok = 0;
  let failed = 0;

  await mkdir(TOPS_DIR, { recursive: true });

  for (const [group, categories] of groups) {
    for (const category of categories) {
      const fileName = path.basename(category.file);

      try {
        const response = await fetch(`${CURATED_BASE}${category.file}`, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        await writeFile(path.join(TOPS_DIR, fileName), await response.text(), "utf8");
        ok += 1;
      } catch (error) {
        failed += 1;
        console.warn(`  ${category.file}: ${error.message}`);
      }
    }

    void group;
  }

  await writeFile(
    path.join(DATA_DIR, "tops-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  console.log(`  saved ${ok} TOP files (${failed} failed)`);
}

async function main() {
  const args = process.argv.slice(2);
  const skipTops = args.includes("--skip-tops");
  const limitIndex = args.indexOf("--enrich-limit");
  const enrichLimit =
    limitIndex !== -1 && Number.parseInt(args[limitIndex + 1] ?? "", 10) > 0
      ? Number.parseInt(args[limitIndex + 1], 10)
      : ENRICH_LIMIT_DEFAULT;

  const env = await loadEnvLocal();

  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) process.env[key] = value;
  }

  await mkdir(DATA_DIR, { recursive: true });

  if (!skipTops) {
    await syncCuratedTops().catch((error) => {
      console.warn(`TOP corpus sync failed (continuing): ${error.message}`);
    });
  }

  const snapshot = await crawlDisclosed(enrichLimit);

  await writeFile(path.join(DATA_DIR, "snapshot.json"), JSON.stringify(snapshot), "utf8");

  console.log(
    `Done. snapshot.json written (${snapshot.feedItems.length} meta, ${Object.keys(snapshot.details).length} enriched${snapshot.stoppedEarly ? ", stopped early on rate limiting — rerun later to complete" : ""}).`
  );
  console.log("The app picks this up immediately; no restart needed.");
}

main().catch((error) => fail(error?.stack ?? String(error)));
