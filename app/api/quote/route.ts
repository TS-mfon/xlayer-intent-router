import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "../../lib/agent";
import { intentSchema } from "../../lib/schema";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const intent = intentSchema.parse(body.intent);
    return NextResponse.json(await getQuote(intent));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to quote intent" },
      { status: 400 }
    );
  }
}
