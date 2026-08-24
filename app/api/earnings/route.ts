import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { HackerOneError, hackeroneFetch } from "@/lib/hackerone";
import {
  normalizeEarning,
  summarizeEarnings,
  type EarningsSummary,
  type NormalizedEarning,
} from "@/lib/earnings";
import type { Earning, EarningsCollectionResponse } from "@/lib/types";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PAGES = 50;

type EarningsPayload = {
  earnings: NormalizedEarning[];
  summary: EarningsSummary;
};

async function loadAllEarnings(): Promise<EarningsPayload> {
  // Fully paginate GET /hackers/payments/earnings server-side so the client
  // needs a single request for complete totals (spec sections 14 + 27).
  const all: Earning[] = [];
  let pageNumber = 1;

  while (pageNumber <= MAX_PAGES) {
    const page: EarningsCollectionResponse = await hackeroneFetch(
      `/hackers/payments/earnings?page[number]=${pageNumber}&page[size]=100`
    );

    all.push(...(page.data ?? []));

    if (!page.links?.next) break;
    pageNumber += 1;
  }

  const earnings = all.map(normalizeEarning);

  return { earnings, summary: summarizeEarnings(earnings) };
}

export async function GET() {
  try {
    const payload = await cached("earnings", CACHE_TTL_MS, loadAllEarnings);

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof HackerOneError) {
      console.error(`HackerOne earnings error (status ${error.status})`);
      return NextResponse.json(
        {
          error:
            error.status === 401
              ? "HackerOne authentication failed."
              : error.status === 429
                ? "HackerOne rate limit reached. Try again shortly."
                : "Failed to fetch HackerOne earnings.",
        },
        { status: 500 }
      );
    }

    console.error("HackerOne earnings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch HackerOne earnings." },
      { status: 500 }
    );
  }
}
