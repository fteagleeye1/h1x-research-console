import { NextRequest, NextResponse } from "next/server";
import { hackeroneFetch } from "@/lib/hackerone";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(
      1,
      Number.parseInt(searchParams.get("page") || "1", 10) || 1
    );

    const size = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(searchParams.get("size") || "25", 10) || 25
      )
    );

    const data = await hackeroneFetch(
      `/hackers/me/reports?page[number]=${page}&page[size]=${size}`
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("HackerOne reports error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch HackerOne reports",
      },
      { status: 500 }
    );
  }
}
