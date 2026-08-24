import { NextRequest, NextResponse } from "next/server";
import { loadDisclosedReport } from "@/lib/disclosed";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Full disclosed-report payload for the research detail view.
 * Only strictly numeric IDs are accepted; users may also paste a
 * hackerone.com/reports/<id> URL — the UI extracts the ID, this route
 * never fetches arbitrary URLs.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!id || !/^\d{1,12}$/.test(id)) {
      return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
    }

    const report = await loadDisclosedReport(id);

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("Disclosed report detail error:", error);

    return NextResponse.json(
      { error: "Unable to load this disclosed report." },
      { status: 500 }
    );
  }
}
