# agent_pipeline.py
from __future__ import annotations

from typing import Any, Dict, List, Literal, TypedDict
from dotenv import load_dotenv
import os
import random

from pydantic import BaseModel, Field, conint, confloat
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

Side = Literal["PLAYER", "AI"]
Personality = Literal["neutral", "aggressive", "conservative", "chaotic"]

# Keep these aligned with your game defaults.
# If you change them in the game, update here too (or pass overrides in choose_bid()).
MAINTENANCE_ROUND_INTERVAL = 2
MAINTENANCE_COST_INCREMENT = 5


# -----------------------------
# LangGraph State
# -----------------------------
class AgentState(TypedDict, total=False):
    me: Side
    round: int
    maintenance_fee: int  # already paid before bidding in your main loop
    maintenance_outlook: Dict[str, int]  # next fees so LLM can plan liquidity
    my_money: int
    opp_money: int
    my_score: int
    opp_score: int
    last_rounds: List[Dict[str, Any]]
    personality: Personality

    plan: Dict[str, Any]
    final_bid: int
    reasons: List[str]


# -----------------------------
# Structured Output Models
# -----------------------------
class OpponentRead(BaseModel):
    style_label: Literal["conservative", "neutral", "aggressive"] = Field(...)
    aggression: confloat(ge=0.0, le=1.0) = Field(...)
    tilt: confloat(ge=0.0, le=1.0) = Field(...)
    volatility: confloat(ge=0.0, le=1.0) = Field(...)


class OpponentBidForecast(BaseModel):
    q10: conint(ge=0) = Field(...)
    q25: conint(ge=0) = Field(...)
    q50: conint(ge=0) = Field(...)
    q75: conint(ge=0) = Field(...)
    q90: conint(ge=0) = Field(...)


class BidPlan(BaseModel):
    intent: Literal["save", "bait", "spike", "balanced"] = Field(...)
    opponent: OpponentRead = Field(...)
    forecast: OpponentBidForecast = Field(...)
    bid_min: conint(ge=0) = Field(...)
    bid_max: conint(ge=0) = Field(...)
    notes: List[str] = Field(...)


# -----------------------------
# Helpers (guardrails only)
# -----------------------------
def clamp_int(x: Any, lo: int, hi: int) -> int:
    try:
        v = int(x)
    except Exception:
        v = lo
    return max(lo, min(v, hi))


def maintenance_fee_for_round(
    round_num: int,
    interval: int = MAINTENANCE_ROUND_INTERVAL,
    inc: int = MAINTENANCE_COST_INCREMENT,
) -> int:
    # Matches your game: multiplier = (round_num - 1) // interval
    multiplier = max(0, (round_num - 1) // interval)
    return multiplier * inc


# -----------------------------
# Node: LLM Thinking (all strategy)
# -----------------------------
def think_node(llm: ChatOpenAI):
    llm_struct = llm.with_structured_output(BidPlan)

    def node(s: AgentState) -> AgentState:
        reasons = s.get("reasons", [])
        outlook = s.get("maintenance_outlook", {})

        prompt = f"""
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
round={s['round']}
maintenance_fee_paid_this_round={s['maintenance_fee']}
maintenance_outlook_next={outlook}
my_money={s['my_money']} opp_money={s['opp_money']}
my_score={s['my_score']} opp_score={s['opp_score']}
personality={s['personality']}

Recent rounds (most recent last):
{s.get('last_rounds', [])}

Output requirements:
- forecast quantiles must be monotonic: q10<=q25<=q50<=q75<=q90
- forecast quantiles are integers in [0, opp_money]
- bid_min/bid_max are integers in [0, my_money] with bid_min<=bid_max
- Do NOT output [0, my_money] unless personality is chaotic.
- Early-game guidance: unless intentionally "spike", keep bid_max <= 40% of my_money.
- If next_round maintenance is unaffordable regardless, choose intent="spike" and spend to maximize points now.
- notes: 3–6 short bullets, actionable.
""".strip()

        plan: BidPlan = llm_struct.invoke(prompt)
        s["plan"] = plan.model_dump()

        # Reasons
        reasons.append(f"Intent: {plan.intent} | Personality: {s.get('personality','neutral')}")
        reasons.append(
            f"Opponent read: {plan.opponent.style_label} "
            f"(aggr={plan.opponent.aggression:.2f}, tilt={plan.opponent.tilt:.2f}, vol={plan.opponent.volatility:.2f})"
        )
        reasons.append(
            f"Forecast q25/q50/q75: {plan.forecast.q25}/{plan.forecast.q50}/{plan.forecast.q75} "
            f"(opp money={s['opp_money']})"
        )
        reasons.extend(plan.notes[:6])
        s["reasons"] = reasons
        return s

    return node


# -----------------------------
# Node: Finalize (guardrails only)
# - reserve next-round maintenance if affordable
# - if doomed next round, spike (spend now)
# - clamp LLM range to spendable and sample within it
# -----------------------------
def finalize_node(s: AgentState) -> AgentState:
    reasons = s.get("reasons", [])
    my_money = int(s["my_money"])
    opp_money = int(s["opp_money"])

    plan = s.get("plan") or {}
    intent = str(plan.get("intent", "balanced"))

    next_fee = int((s.get("maintenance_outlook") or {}).get("next_round", 0))
    doomed_next = next_fee > my_money

    if doomed_next:
        reserve = 0
        spendable = my_money
        reasons.append(f"Guardrail: next maintenance ${next_fee} is unaffordable -> SPIKE mode (spend now).")
    else:
        reserve = next_fee
        spendable = max(0, my_money - reserve)
        reasons.append(f"Guardrail: reserved next maintenance ${next_fee}, spendable=${spendable}.")

    bid_min_llm = plan.get("bid_min", 0)
    bid_max_llm = plan.get("bid_max", 0)

    bid_min = clamp_int(bid_min_llm, 0, spendable)
    bid_max = clamp_int(bid_max_llm, 0, spendable)
    if bid_max < bid_min:
        bid_max = bid_min

    # Make behavior less exploitable (and avoids midpoint dumbness)
    final_bid = random.randint(bid_min, bid_max) if bid_max > bid_min else bid_min
    final_bid = clamp_int(final_bid, 0, my_money)

    # Extra sanity: clamp forecast to opponent bankroll (doesn't change LLM thinking, just prevents garbage)
    forecast = (plan.get("forecast") or {})
    for k in ("q10", "q25", "q50", "q75", "q90"):
        if k in forecast:
            forecast[k] = clamp_int(forecast[k], 0, opp_money)

    s["final_bid"] = final_bid
    reasons.append(f"LLM range [{bid_min},{bid_max}] -> final bid ${final_bid} (intent={intent})")
    s["reasons"] = reasons
    return s


# -----------------------------
# Build Graph
# -----------------------------
def build_pipeline(model: str = "gpt-4o-mini"):
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set; check your environment or .env file.")

    llm = ChatOpenAI(
        model=model,
        api_key=OPENAI_API_KEY,
        temperature=0.2,
    )

    g = StateGraph(AgentState)
    g.add_node("think", think_node(llm))
    g.add_node("finalize", finalize_node)

    g.set_entry_point("think")
    g.add_edge("think", "finalize")
    g.add_edge("finalize", END)

    return g.compile()


# -----------------------------
# Adapter: GameState -> AgentState
# -----------------------------
def choose_bid(
    graph,
    state,
    me: Side,
    personality: Personality = "neutral",
    lookback: int = 6,
    maintenance_interval: int = MAINTENANCE_ROUND_INTERVAL,
    maintenance_increment: int = MAINTENANCE_COST_INCREMENT,
) -> tuple[int, List[str]]:
    my = state.player if me == "PLAYER" else state.ai
    opp = state.ai if me == "PLAYER" else state.player

    history = [
        {
            "round": r.round,
            "player_bid": r.player_bid,
            "ai_bid": r.ai_bid,
            "winner": r.winner,
            "fee": r.maintenance_fee,
            "p_after": r.p_money_after,
            "a_after": r.a_money_after,
        }
        for r in state.history[-lookback:]
    ]

    # Give the LLM a future-fee outlook (this is what it was missing)
    r = int(state.current_round)
    outlook = {
        "next_round": maintenance_fee_for_round(r + 1, maintenance_interval, maintenance_increment),
        "in_2_rounds": maintenance_fee_for_round(r + 2, maintenance_interval, maintenance_increment),
        "in_3_rounds": maintenance_fee_for_round(r + 3, maintenance_interval, maintenance_increment),
    }

    agent_state: AgentState = {
        "me": me,
        "round": r,
        "maintenance_fee": int(state.maintenance_fee),
        "maintenance_outlook": outlook,
        "my_money": int(my.money),
        "opp_money": int(opp.money),
        "my_score": int(my.score),
        "opp_score": int(opp.score),
        "last_rounds": history,
        "personality": personality,
        "reasons": [],
    }

    result = graph.invoke(agent_state)
    return int(result["final_bid"]), result.get("reasons", [])


# -----------------------------
# Reporter Agent (unchanged)
# -----------------------------
def generate_report(context: Dict[str, Any], model: str = "gpt-4o-mini") -> str:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set; check your environment or .env file.")

    llm = ChatOpenAI(model=model, api_key=OPENAI_API_KEY, temperature=0.2)

    prompt = f"""
You are a concise game analyst. Review the structured game summary and produce a formatted capital profile block (text-only).
Use finance analogies (maintenance = inflation/carry; bids = position sizing; cash = liquidity; score = returns).
Use ASCII only.

Include exactly these sections/labels:

Your Capital Profile
Risk Posture: <descriptor> (what this captures)
Capital Efficiency: <descriptor> ($X / point) (how cost per point reflects efficiency)
Emotional Discipline: <descriptor> (tilt/impulse control)
Liquidity Management: <descriptor> (cash preservation vs depletion)
Adaptability: <descriptor> (response to opponent shifts)

Overall Archetype:
<archetype name>

Key Takeaway:
<one or two sentences>

Player Suggestions:
- <bullet 1>
- <bullet 2>
- <bullet 3>

Game context:
{context}
""".strip()

    resp = llm.invoke(prompt)
    return resp.content
