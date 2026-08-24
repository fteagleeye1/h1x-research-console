import { NextRequest, NextResponse } from "next/server";
import { hackeroneFetch } from "@/lib/hackerone";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!id || !/^\d+$/.test(id)) {
      return NextResponse.json(
        { error: "Invalid report ID" },
        { status: 400 }
      );
    }

const data = await hackeroneFetch(`/hackers/reports/${id}`);

    return NextResponse.json(data);
  } catch (error) {
    console.error("HackerOne report detail error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch report",
      },
      { status: 500 }
    );
  }
}
