from typing import List, Optional
from dataclasses import dataclass

from agent_pipline import build_pipeline, choose_bid, generate_report

STARTING_MONEY=100
MAINTENANCE_ROUND_INTERVAL= 2
MAINTENANCE_COST_INCREMENT= 5

@dataclass
class PlayerState:
    name: str
    money: int
    score: int = 0

@dataclass
class RoundRecord:
    round: int
    player_bid: int
    ai_bid: int
    winner: Optional[str]
    maintenance_fee: int
    p_before_m: int
    a_before_m: int
    p_before_b: int
    a_before_b: int
    p_money_after: int
    a_money_after: int

@dataclass
class GameState:
    starting_money: int
    current_round: int
    maintenance_fee: int
    player: PlayerState
    ai: PlayerState
    history: List[RoundRecord]



def print_status(state: GameState):
    print("\n" + "=" * 60)
    print(f"ROUND {state.current_round}")
    print(f"MAINTENANCE FEE: ${state.maintenance_fee}")
    print(f"PLAYER money: ${state.player.money:<4}")
    print(f"PLAYER score: {state.player.score}")
    print(f"AI     money: ${state.ai.money:<4}")
    print(f"AI     score: {state.ai.score}")
    print("\n" + "=" * 60)



def prompt_int(prompt: str, low: int, high: int) -> int:
    while True:
        raw = input(prompt).strip()

        try:
            x = int(raw)
        except ValueError:
            print("Error! Please enter an integer!")
            continue

        if x < low or x > high:
            print(f"Error! Please enter a value between {low} and {high}")
            continue

        return x
    


def round_winner(player_bid: int, ai_bid: int) -> Optional[str]:
    if player_bid > ai_bid:
        return "PLAYER"
    if ai_bid > player_bid:
        return "AI"
    else:
        return None
    


def apply_payment(player: PlayerState, ai: PlayerState, player_bid: int, ai_bid: int) -> None:
    player.money = max(0, player.money - player_bid)
    ai.money = max(0, ai.money - ai_bid)



def calculate_maintenance_fee(round_num: int) -> int:
    multiplier = max(0, (round_num - 1) // MAINTENANCE_ROUND_INTERVAL)
    return multiplier * MAINTENANCE_COST_INCREMENT



def apply_maintenance_fee(player: PlayerState, ai: PlayerState, state: GameState):
    fee = state.maintenance_fee

    if player.money < fee or ai.money < fee:
        return False


    player.money -= fee
    ai.money -= fee
    return True



def award_point(player: PlayerState, ai: PlayerState, winner: Optional[str]) -> None:
    if winner == "PLAYER":
        player.score += 1
    elif winner == "AI":
        ai.score += 1



def walkover(bankrupt: str, state: GameState, start_from_next_round: bool=False) -> None:

    if start_from_next_round:
        round_num = state.current_round + 1
    else:
        round_num = state.current_round

    while True:
        if bankrupt == "TIE":
            return

        p_before_m = state.player.money
        a_before_m = state.ai.money
        
        state.maintenance_fee = calculate_maintenance_fee(round_num)

        if bankrupt == "PLAYER":
            if state.maintenance_fee <= state.ai.money:
                winner = "AI"
                state.ai.score += 1
                state.ai.money -= state.maintenance_fee
            else:
                return
        
        elif bankrupt == "AI":
            if state.maintenance_fee <= state.player.money:
                winner = "PLAYER"
                state.player.score += 1
                state.player.money -= state.maintenance_fee
            else:
                return
        
        p_before_b = state.player.money
        a_before_b = state.ai.money
        
        rec = RoundRecord(
            round = round_num,
            player_bid = 0,
            ai_bid = 0,
            winner = winner,
            maintenance_fee = state.maintenance_fee,
            p_before_m = p_before_m,
            a_before_m = a_before_m,
            p_before_b = p_before_b,
            a_before_b = a_before_b,
            p_money_after = state.player.money,
            a_money_after = state.ai.money
        )
        state.history.append(rec)

        # Reveal
        print("\n********** WALKOVER **********")
        print(f"ROUND {round_num}")
        print(f"MAINTENANCE FEE: ${state.maintenance_fee}")
        print(f"PLAYER money: ${state.player.money:<4}")
        print(f"PLAYER score: {state.player.score}")
        print(f"AI     money: ${state.ai.money:<4}")
        print(f"AI     score: {state.ai.score}")
        print(f"")

        state.current_round = round_num
        round_num += 1


def build_report_context(state: GameState) -> dict:
    history = state.history
    rounds = len(history)
    player_wins = sum(1 for r in history if r.winner == "PLAYER")
    ai_wins = sum(1 for r in history if r.winner == "AI")
    ties = rounds - player_wins - ai_wins
    player_bids = [r.player_bid for r in history]
    ai_bids = [r.ai_bid for r in history]
    maintenance_total = sum(r.maintenance_fee for r in history)

    def avg(nums):
        return sum(nums) / len(nums) if nums else 0.0

    return {
        "rounds": rounds,
        "scores": {"player": state.player.score, "ai": state.ai.score},
        "money_final": {"player": state.player.money, "ai": state.ai.money},
        "wins": {"player": player_wins, "ai": ai_wins, "ties": ties},
        "bids": {
            "player_avg": avg(player_bids),
            "ai_avg": avg(ai_bids),
            "player_max": max(player_bids) if player_bids else 0,
            "ai_max": max(ai_bids) if ai_bids else 0,
            "player_total": sum(player_bids),
            "ai_total": sum(ai_bids),
        },
        "maintenance_total_paid": maintenance_total,
        "history": [
            {
                "round": r.round,
                "player_bid": r.player_bid,
                "ai_bid": r.ai_bid,
                "winner": r.winner,
                "maintenance_fee": r.maintenance_fee,
                "p_money_after": r.p_money_after,
                "a_money_after": r.a_money_after,
            }
            for r in history
        ],
    }



def game_loop() -> GameState:
    
    state = GameState(
        starting_money = STARTING_MONEY,
        current_round = 1,
        maintenance_fee = 0,
        player = PlayerState(name = "PLAYER", money = STARTING_MONEY),
        ai = PlayerState(name = "AI", money = STARTING_MONEY),
        history = []
    )

    graph = build_pipeline()

    while True:

        p_before_m = state.player.money
        a_before_m = state.ai.money

        state.maintenance_fee = calculate_maintenance_fee(state.current_round)
        ok = apply_maintenance_fee(state.player, state.ai, state)

        p_before_b = state.player.money
        a_before_b = state.ai.money

        if not ok:
            if p_before_m < state.maintenance_fee and a_before_m < state.maintenance_fee:
                print("\nBoth players could not afford maintenance. Game ends.")
                return state
            elif p_before_m < state.maintenance_fee:
                print("\nPLAYER could not afford maintenance. Game ends.")
                walkover("PLAYER", state)
                return state
            else:
                print("\nAI could not afford maintenance. Game ends.")
                walkover("AI", state)
                return state

        print_status(state)

        # get bid from player
        player_bid = prompt_int(f"Enter your sealed bid (0...{state.player.money}): ", 0, state.player.money)

        # get bid from ai (set as 10 for now)
        ai_bid, ai_reasons = choose_bid(
            graph=graph,
            state=state,
            me="AI",
            personality="neutral",  # or "aggressive", "conservative", "chaotic"
        )


        # determine winner / deduct money / score points
        winner = round_winner(player_bid, ai_bid)
        apply_payment(state.player, state.ai, player_bid, ai_bid)
        award_point(state.player, state.ai, winner)

        # keep record
        rec = RoundRecord(
            round = state.current_round,
            player_bid = player_bid,
            ai_bid = ai_bid,
            winner = winner,
            maintenance_fee = state.maintenance_fee,
            p_before_m = p_before_m,
            a_before_m = a_before_m,
            p_before_b = p_before_b,
            a_before_b = a_before_b,
            p_money_after = state.player.money,
            a_money_after = state.ai.money
        )
        state.history.append(rec)

        # Reveal
        print("\n********** REVEAL **********")
        print(f"You bid: ${player_bid}")
        print(f"AI bid:  ${ai_bid}")
        print(f"PLAYER money: ${state.player.money:<4}")
        print(f"PLAYER score: {state.player.score}")
        print(f"AI     money: ${state.ai.money:<4}")
        print(f"AI     score: {state.ai.score}")
        if ai_reasons:
            print("AI reasoning:")
            for r in ai_reasons:
                print(f"- {r}")
        print(f"")
        if winner is None:
            print("Result: TIE (no one scores)")
        else:
            print(f"Result: {winner} scores +1")

        # immediate elimination due to bidding
        if state.player.money == 0 and state.ai.money == 0:
            print("\nBoth players hit $0. Game ends.")
            return state
        elif state.player.money == 0:
            print("\nPLAYER hit $0. Game ends.")
            walkover("PLAYER", state, True)
            return state
        elif state.ai.money == 0:
            print("\nAI hit $0. Game ends.")
            walkover("AI", state, True)
            return state

        # increase current_round
        state.current_round += 1


if __name__ == "__main__":
    print("Starting DownBid (console edition)")
    state = game_loop()
    print("\n=== GAME OVER ===")

    try:
        report_ctx = build_report_context(state)
        report = generate_report(report_ctx)
        print("\n=== GAME REPORT ===")
        print(report)
    except Exception as exc:
        print(f"\n(Game report unavailable: {exc})")




