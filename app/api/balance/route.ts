import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { HackerOneError, hackeroneFetch } from "@/lib/hackerone";
import type { BalanceResponse } from "@/lib/types";

const CACHE_TTL_MS = 60 * 1000;

export async function GET() {
  try {
    const balance = await cached("balance", CACHE_TTL_MS, async () => {
      const data = await hackeroneFetch<BalanceResponse>(
        "/hackers/payments/balance"
      );

      return data.data?.balance ?? 0;
    });

    return NextResponse.json({ balance });
  } catch (error) {
    if (error instanceof HackerOneError) {
      console.error(`HackerOne balance error (status ${error.status})`);
      return NextResponse.json(
        { error: "Failed to fetch HackerOne balance." },
        { status: 500 }
      );
    }

    console.error("HackerOne balance error:", error);
    return NextResponse.json(
      { error: "Failed to fetch HackerOne balance." },
      { status: 500 }
    );
  }
}
