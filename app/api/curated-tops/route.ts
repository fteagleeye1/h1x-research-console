import { NextRequest, NextResponse } from "next/server";
import { loadCuratedCategory, loadCuratedManifest } from "@/lib/curated-tops";

/**
 * Curated TOP-corpus boundary (reddelexc.github.io snapshots).
 * All reads are local-disk; nothing here can be rate-limited.
 */
export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get("file");

  if (!file) {
    const manifest = await loadCuratedManifest();

    if (!manifest) {
      return NextResponse.json(
        {
          error:
            "Curated TOP corpus not synced yet. Run `npm run sync-disclosed` once.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ groups: manifest });
  }

  const category = await loadCuratedCategory(file);

  if (!category) {
    return NextResponse.json(
      { error: "Unknown curated category." },
      { status: 404 }
    );
  }

  return NextResponse.json(category);
}
