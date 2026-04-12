import { NextRequest, NextResponse } from "next/server";
import { simulateIntent } from "../../lib/agent";
import { intentSchema, quoteSchema } from "../../lib/schema";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const intent = intentSchema.parse(body.intent);
    const quote = quoteSchema.parse(body.quote);
    return NextResponse.json(await simulateIntent(intent, quote));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to simulate intent" },
      { status: 400 }
    );
  }
}
