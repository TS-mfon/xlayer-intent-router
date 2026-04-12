import { NextRequest, NextResponse } from "next/server";
import { parseIntent } from "../../../lib/agent";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json(parseIntent(String(body.prompt ?? "")));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to parse intent" },
      { status: 400 }
    );
  }
}
