import 'dotenv/config';
import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai'
import { Annotation, StateGraph, END, START } from '@langchain/langgraph'

type Side = "PLAYER" | "AI";
type Personality = "neutral" | "aggressive" | "conservative" | "chaotic";

const MAINTENANCE_ROUND_INTERVAL = 2;
const MAINTENANCE_COST_INCREMENT = 5;

type AgentState = {
  me: Side;
  round: number;
  maintenance_fee: number;
  maintenance_outlook: Record<string, number>;
  my_money: number;
  opp_money: number;
  my_score: number;
  opp_score: number;
  last_rounds: Array<Record<string, any>>;
  personality: Personality;

  plan?: any;
  final_bid?: number;
  reasons?: string[];
};

const AgentStateAnnotation = Annotation.Root({
  me: Annotation<Side>(),
  round: Annotation<number>(),
  maintenance_fee: Annotation<number>(),
  maintenance_outlook: Annotation<Record<string, number>>(),
  my_money: Annotation<number>(),
  opp_money: Annotation<number>(),
  my_score: Annotation<number>(),
  opp_score: Annotation<number>(),
  last_rounds: Annotation<Array<Record<string, any>>>(),
  personality: Annotation<Personality>(),
  plan: Annotation<any>(),
  final_bid: Annotation<number>(),
  reasons: Annotation<string[]>(),
});

const OpponentRead = z.object({
  style_label: z.enum(["conservative", "neutral", "aggressive"]),
  aggression: z.number().min(0).max(1),
  tilt: z.number().min(0).max(1),
  volatility: z.number().min(0).max(1),
});

const OpponentBidForecast = z
  .object({
    q10: z.number().int().min(0),
    q25: z.number().int().min(0),
    q50: z.number().int().min(0),
    q75: z.number().int().min(0),
    q90: z.number().int().min(0),
  })
  .superRefine((v, ctx) => {
    if (!(v.q10 <= v.q25 && v.q25 <= v.q50 && v.q50 <= v.q75 && v.q75 <= v.q90)) {
      ctx.addIssue({ code: "custom", message: "Forecast quantiles must be monotonic." });
    }
  });

const BidPlan = z.object({
  intent: z.enum(["save", "bait", "spike", "balanced"]),
  opponent: OpponentRead,
  forecast: OpponentBidForecast,
  bid_min: z.number().int().min(0),
  bid_max: z.number().int().min(0),
  notes: z.array(z.string()).min(1),
});

function clampInt(x: any, lo: number, hi: number) {
  const v = Number.isFinite(Number(x)) ? Math.trunc(Number(x)) : lo;
  return Math.max(lo, Math.min(v, hi));
}

function maintenanceFeeForRound(
  roundNum: number,
  interval = MAINTENANCE_ROUND_INTERVAL,
  inc = MAINTENANCE_COST_INCREMENT
) {
  const multiplier = Math.max(0, Math.floor((roundNum - 1) / interval));
  return multiplier * inc;
}

function thinkNode(llm: ChatOpenAI) {
  const planner = llm.withStructuredOutput(BidPlan);

  return async (s: AgentState): Promise<AgentState> => {
    const reasons = s.reasons ?? [];
    const outlook = s.maintenance_outlook ?? {};

    const prompt = `
You are an adaptive bidding agent in a repeated sealed-bid all-pay auction with maintenance and walkover.

Key facts (do not forget):
- All-pay: BOTH pay bids; ONLY higher bid scores +1; tie scores 0.
- Money never increases; it only decreases.
- Maintenance is paid BEFORE bidding each round; if you cannot pay it, you are eliminated and walkover occurs.
- Therefore: preserving liquidity to keep paying maintenance can be worth more than winning a single round.

Objective:
Maximize FINAL score under rising maintenance + limited capital.

Cold-start prior (when data is sparse):
Assume opponent median bid is 10–20% of their bankroll, not 0.

This round:
round=${s.round}
maintenance_fee_paid_this_round=${s.maintenance_fee}
maintenance_outlook_next=${JSON.stringify(outlook)}
my_money=${s.my_money} opp_money=${s.opp_money}
my_score=${s.my_score} opp_score=${s.opp_score}
personality=${s.personality}

Recent rounds (most recent last):
${JSON.stringify(s.last_rounds ?? [])}

Output requirements:
- forecast quantiles must be monotonic: q10<=q25<=q50<=q75<=q90
- forecast quantiles are integers in [0, opp_money]
- bid_min/bid_max are integers in [0, my_money] with bid_min<=bid_max
- Do NOT output [0, my_money] unless personality is chaotic.
- Early-game guidance: unless intentionally "spike", keep bid_max <= 40% of my_money.
- If next_round maintenance is unaffordable regardless, choose intent="spike" and spend to maximize points now.
- notes: 3–6 short bullets, actionable.
`.trim();

    const plan = await planner.invoke(prompt);

    reasons.push(`Intent: ${plan.intent} | Personality: ${s.personality}`);
    reasons.push(
      `Opponent read: ${plan.opponent.style_label} (aggr=${plan.opponent.aggression.toFixed(
        2
      )}, tilt=${plan.opponent.tilt.toFixed(2)}, vol=${plan.opponent.volatility.toFixed(2)})`
    );
    reasons.push(
      `Forecast q25/q50/q75: ${plan.forecast.q25}/${plan.forecast.q50}/${plan.forecast.q75} (opp money=${s.opp_money})`
    );
    reasons.push(...plan.notes.slice(0, 6));

    return { ...s, plan, reasons };
  };
}

async function finalizeNode(s: AgentState): Promise<AgentState> {
  const reasons = s.reasons ?? [];
  const myMoney = s.my_money;
  const oppMoney = s.opp_money;

  const plan = s.plan ?? { intent: "balanced", bid_min: 0, bid_max: 0, forecast: {} };
  const intent = String(plan.intent ?? "balanced");

  const nextFee = Number(s.maintenance_outlook?.next_round ?? 0);
  const doomedNext = nextFee > myMoney;

  const spendable = doomedNext ? myMoney : Math.max(0, myMoney - nextFee);

  reasons.push(
    doomedNext
      ? `Guardrail: next maintenance $${nextFee} is unaffordable -> SPIKE mode (spend now).`
      : `Guardrail: reserved next maintenance $${nextFee}, spendable=${spendable}.`
  );

  let bidMin = clampInt(plan.bid_min, 0, spendable);
  let bidMax = clampInt(plan.bid_max, 0, spendable);
  if (bidMax < bidMin) bidMax = bidMin;

  // random int in [bidMin, bidMax]
  const finalBid =
    bidMax > bidMin ? bidMin + Math.floor(Math.random() * (bidMax - bidMin + 1)) : bidMin;

  // clamp forecast to opp bankroll (extra sanity)
  const forecast = { ...(plan.forecast ?? {}) };
  for (const k of ["q10", "q25", "q50", "q75", "q90"] as const) {
    if (forecast[k] !== undefined) forecast[k] = clampInt(forecast[k], 0, oppMoney);
  }

  reasons.push(`LLM range [${bidMin},${bidMax}] -> final bid $${finalBid} (intent=${intent})`);

  return { ...s, plan: { ...plan, forecast }, final_bid: clampInt(finalBid, 0, myMoney), reasons };
}

export function buildPipeline(model = "gpt-4o-mini") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set. Put it in your .env file.");

  const llm = new ChatOpenAI({ model, apiKey, temperature: 0.2 });

  const g = new StateGraph(AgentStateAnnotation)
    .addNode("think", thinkNode(llm))
    .addNode("finalize", finalizeNode)
    .addEdge(START, "think")
    .addEdge("think", "finalize")
    .addEdge("finalize", END);

  return g.compile();
}

// Adaptor : GameState -> AgentState

export type RoundWinner = "PLAYER" | "AI" | "TIE" | null;

export type RoundSummary = {
    round: number;
    player_bid: number;
    ai_bid: number;
    winner: RoundWinner;
    maintenance_fee_of_round: number;
    p_money_after_b: number;
    a_money_after_b: number;
};

export type Participant = {
    money: number;
    score: number;
};

export type GameState = {
    player: Participant;
    ai: Participant;
    current_round: number;
    maintenance_fee_current: number;
    history: RoundSummary[];
}

export interface GraphLike {
  invoke(state: AgentState): Promise<AgentState> | AgentState;
}

export async function chooseBid(
  graph: GraphLike,
  state: GameState,
  me: Side,
  personality: Personality = "neutral",
  lookback = 6,
  maintenanceInterval = MAINTENANCE_ROUND_INTERVAL,
  maintenanceIncrement = MAINTENANCE_COST_INCREMENT
): Promise<[number, string[]]> {
  const my = me === "PLAYER" ? state.player : state.ai;
  const opp = me === "PLAYER" ? state.ai : state.player;

  const history = state.history.slice(-lookback).map((r) => ({
    round: r.round,
    player_bid: r.player_bid,
    ai_bid: r.ai_bid,
    winner: r.winner,
    fee: r.maintenance_fee_of_round,
    p_after: r.p_money_after_b,
    a_after: r.a_money_after_b,
  }));

    const r = Number(state.current_round);
    const outlook = {
    next_round: maintenanceFeeForRound(r + 1, maintenanceInterval, maintenanceIncrement),
    in_2_rounds: maintenanceFeeForRound(r + 2, maintenanceInterval, maintenanceIncrement),
    in_3_rounds: maintenanceFeeForRound(r + 3, maintenanceInterval, maintenanceIncrement),
  };

    const agentState: AgentState = {
      me,
      round: r,
      maintenance_fee: Number(state.maintenance_fee_current),
      maintenance_outlook: outlook,
      my_money: Number(my.money),
      opp_money: Number(opp.money),
      my_score: Number(my.score),
      opp_score: Number(opp.score),
      last_rounds: history,
      personality,
      reasons: [],
    };
  
    const result = await graph.invoke(agentState);
    return [Number(result.final_bid ?? 0), result.reasons ?? []];
  }
  
  // Reporter Agent (unchanged)
  export async function generateReport(context: Record<string, any>, model = "gpt-4o-mini") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set; check your environment or .env file.");
    }
  
    const llm = new ChatOpenAI({ model, apiKey, temperature: 0.2 });
  
    const prompt = `
  You are a concise game analyst. Review the structured game summary and produce a formatted capital profile block (text-only).
  Use finance analogies (maintenance = inflation/carry; bids = position sizing; cash = liquidity; score = returns).
  Use ASCII only.
  
  Include exactly these sections/labels:
  
  Your Capital Profile:
  Risk Posture: <descriptor>
  Capital Efficiency: <descriptor>
  Emotional Discipline: <descriptor>
  Liquidity Management: <descriptor>
  Adaptability: <descriptor>

  description of each category includes:
    Risk Posture (How risky is this strategy)
      Levels
        Conservative Preserver
        Measured Allocator
        Aggressive Deployer
        All-In Opportunist
      Descriptions
        Conservative Preserver - Bids a small fraction of capital, prioritizing survival and optionality
        Measured Allocator - Risks capital proportionally, balancing control and flexibility
        Aggressive Deployer - Commits large portions of capital to secure wins
        All-In Opportunist - Frequently risks outsized amounts, accepting bankruptcy risk

    Capital Efficiency (how much is paid per successful outcome, take total amount bid / total points earned to get $/point)
      Levels
        Highly Efficient
        Fair Value Payer
        Overpayer
        Capital Burner
      Descriptions
        Highly Efficient - Consistently wins with minimal excess spending
        Fair Value Payer - Pays a reasonable premium for results
        Overpayer - Regularly spends more than necessary to win
        Capital Burner - Converts large capital outlays into limited results

    Emotional Discipline (reaction to losses and pressure, tilt/impulse control)
      Levels
        Unshakeable
        Composed
        Reactive
        Tilt-Prone
      Descriptions
        Unshakeable - Maintains stable behavior regardless of outcome
        Composed - Minor adjustments, but avoids emotional swings
        Reactive - Noticeable bid increases after losses
        Tilt-Prone - Strong post-loss escalation and revenge bidding

    Liquidity Management (liquidity should be used to gain points)
      Levels
        Liquidity Guardian
        Buffer Aware
        Thin Ice
        Bankruptcy Dancer
      Descriptions
        Liquidity Guardian - Maintains a strong capital buffer throughout
        Buffer Aware - Occasionally dips but avoids danger
        Thin Ice - Frequently operates near critical capital levels
        Bankruptcy Dancer - Regularly risks running out of money

    Adaptability (ability to change strategy over time according to opponent moves)
      Levels
        Rigid Executor
        Delayed Adapter
        Situational Adapter
        Highly Adaptive
      Descriptions
        Rigid Executor - Sticks to one strategy regardless of outcomes
        Delayed Adapter - Changes behavior only after sustained losses
        Situational Adapter - Adjusts strategy based on game context
        Highly Adaptive - Proactively shifts approach as conditions change

  Overall Archetype:
  <archetype name>
  
  Key Takeaway:
  <one or two sentences>
  
  Player Suggestions:
  - <bullet 1>
  - <bullet 2>
  - <bullet 3>
  
  Game context:
  ${JSON.stringify(context)}
  `.trim();
  
    const resp = await llm.invoke(prompt);
    return typeof resp.content === "string" ? resp.content : JSON.stringify(resp.content);
  }




  

