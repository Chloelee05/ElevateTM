import { NextRequest, NextResponse } from "next/server";
import {
  create_initial_state,
  hydrate_state,
  play_round,
  build_report_context,
  GameState,
} from "../../../game";

// Simple API bridge to drive the game from the frontend.
// POST /api/game with { action: "start" } -> returns fresh state
// POST /api/game with { action: "play", bid, state } -> plays one round, returns updated state + round result
// POST /api/game with { action: "report", state } -> returns final report for the provided state

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body?.action ?? "play";

  if (action === "start") {
    const state = create_initial_state();
    return NextResponse.json({ state });
  }

  if (action === "play") {
    if (typeof body?.bid !== "number") {
      return NextResponse.json({ error: "Missing or invalid bid (number required)" }, { status: 400 });
    }
    if (!body?.state) {
      return NextResponse.json({ error: "Missing state" }, { status: 400 });
    }

    const state: GameState = hydrate_state(body.state);
    const result = await play_round(state, Number(body.bid));

    return NextResponse.json({
      state,
      result,
    });
  }

  if (action === "report") {
    if (!body?.state) {
      return NextResponse.json({ error: "Missing state" }, { status: 400 });
    }
    const state: GameState = hydrate_state(body.state);
    const report = build_report_context(state);
    return NextResponse.json({
      report,
      state,
    });
  }

  return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400 });
}
