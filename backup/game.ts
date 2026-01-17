import { buildPipeline, chooseBid, generateReport, type GraphLike } from "./agent_pipeline.ts"
import readlineSync from "readline-sync";


console.log("test")

// Constants
export const STARTING_AMT: number = 100;
const MAINTENANCE_ROUND_INTERVAL: number = 2
const MAINTENANCE_COST_INCREMENT: number = 5



// Defining classes 
export class PlayerState {
  name: string;
  money: number;
  score: number;

  constructor(name: string, money: number, score: number = 0) {
    this.name = name;
    this.money = money;
    this.score = score;
  }
}

export class RoundRecord {
  round: number;
  player_bid: number;
  ai_bid: number;
  winner: string | null;
  maintenance_fee_of_round: number;

  p_score: number;
  p_money_before_m: number;
  p_money_before_b: number;
  p_money_after_b: number;

  a_score: number;
  a_money_before_m: number;
  a_money_before_b: number;
  a_money_after_b: number;

  constructor(
    round: number,
    player_bid: number,
    ai_bid: number,
    winner: string | null = null,
    maintenance_fee_of_round: number,

    p_score: number,
    p_money_before_m: number,
    p_money_before_b: number,
    p_money_after_b: number,

    a_score: number,
    a_money_before_m: number,
    a_money_before_b: number,
    a_money_after_b: number
  ) {
    this.round = round;
    this.player_bid = player_bid;
    this.ai_bid = ai_bid;
    this.winner = winner;
    this.maintenance_fee_of_round = maintenance_fee_of_round;

    this.p_score = p_score;
    this.p_money_before_m = p_money_before_m;
    this.p_money_before_b = p_money_before_b;
    this.p_money_after_b = p_money_after_b;

    this.a_score = a_score;
    this.a_money_before_m = a_money_before_m;
    this.a_money_before_b = a_money_before_b;
    this.a_money_after_b = a_money_after_b;
  }
}


export class GameState {
  starting_money: number;
  current_round: number;
  maintenance_fee_current: number;
  player: PlayerState;
  ai: PlayerState;
  history: RoundRecord[];

  constructor(
    starting_money: number,
    current_round: number,
    maintenance_fee_current: number,
    player: PlayerState,
    ai: PlayerState,
    history: RoundRecord[] = []
  ) {
    this.starting_money = starting_money;
    this.current_round = current_round;
    this.maintenance_fee_current = maintenance_fee_current;
    this.player = player;
    this.ai = ai;
    this.history = history;
  }
}



// function to get calculate maintenance fees
function calculate_maintenance_fee(roundNum: number): number {
    const multiplier = Math.max(
        0,
        Math.floor((roundNum - 1) / MAINTENANCE_ROUND_INTERVAL)
    );

    return multiplier * MAINTENANCE_COST_INCREMENT;
}



// function to apply maintenance fees
function apply_maintenance_fee(state: GameState, player: PlayerState, ai: PlayerState): boolean {
    const fee = state.maintenance_fee_current

    if (player.money < fee || ai.money < fee)
        return false

    player.money -= fee
    ai.money -= fee
    return true
}



// function to print round status
function print_round_status(state: GameState) {
    console.log(`
=======================================
               ROUND: ${state.current_round}
=======================================
MAINTENANCE_FEE: ${state.maintenance_fee_current}
PLAYER money:    ${state.player.money}
PLAYER score:    ${state.player.score}
AI money:        ${state.ai.money}
AI score:        ${state.ai.score}
    `)
}



// function to determine winner
function round_winner(player_bid: number, ai_bid: number): string|null {
    if (player_bid > ai_bid) {
        console.log("\nPLAYER won this round\n")
        return "PLAYER"
    }
    if (ai_bid > player_bid) {
        return "AI"
    }
    else{
        return null
    }
}



// function to apply payment for bids (check later!!!!!!!!!!!!!!!!)
function apply_payment(player: PlayerState, ai: PlayerState, player_bid: number, ai_bid: number){
    player.money = Math.max(0, player.money - player_bid);
    ai.money = Math.max(0, ai.money - ai_bid);
}



// function to award points
function award_point(player: PlayerState, ai: PlayerState, winner: string|null) {
    if (winner == "PLAYER") {
        player.score += 1
    } 
    else if (winner == "AI") {
        ai.score += 1
    }
}



// function to print round reveal
function print_reveal(rec: RoundRecord) {
    console.log(`
***************************************
              ROUND REVEAL
---------------------------------------
PLAYER bid:      ${rec.player_bid}
AI bid:          ${rec.ai_bid}

PLAYER money:    ${rec.p_money_after_b}
PLAYER score:    ${rec.p_score}
AI money:        ${rec.a_money_after_b}
AI score:        ${rec.a_score}
    `)
}



// function for walkover
function walkover(bankrupt: string, state: GameState, start_from_next_round: boolean = false) {
    
    let round_num: number;
    let winner = null;

    if (start_from_next_round) {
        round_num = state.current_round + 1;
    }
    else {
        round_num = state.current_round;
    }

    while (true) {

        if (bankrupt === "TIE") {
            return;
        }

        const p_money_before_m = state.player.money;
        const a_money_before_m = state.ai.money;

        state.maintenance_fee_current = calculate_maintenance_fee(round_num);

        if (bankrupt == "PLAYER") {
            if(state.maintenance_fee_current <= state.ai.money) {
                winner = "AI"
                state.ai.score += 1
                state.ai.money -= state.maintenance_fee_current
            }
            else {
                return
            }
        }
        else if (bankrupt == "AI") {
            if(state.maintenance_fee_current <= state.player.money) {
                winner = "PLAYER"
                state.player.score += 1
                state.player.money -= state.maintenance_fee_current
            }
            else {
                return
            }
        }

        // store money before bid

        const p_bid = 0
        const a_bid = 0



        // Record round data
        const rec = new RoundRecord(
            state.current_round,
            p_bid,
            a_bid,
            winner,
            state.maintenance_fee_current,

            state.player.score,
            p_money_before_m,
            state.player.money,
            state.player.money,

            state.ai.score,
            a_money_before_m,
            state.ai.money,
            state.ai.money,
        );

        // add round record to gamestate history
        state.history.push(rec);

        // print walkover
        console.log(`
***************************************
                WALKOVER
---------------------------------------
ROUND:           ${round_num}
MAINTENANCE FEE: ${state.maintenance_fee_current}

PLAYER money:    ${rec.p_money_after_b}
PLAYER score:    ${rec.p_score}
AI money:        ${rec.a_money_after_b}
AI score:        ${rec.a_score}
    `)

        // add round
        state.current_round = round_num
        round_num += 1
    }

}



// function to generate report context
function avg(nums: number[]): number {
  return nums.length > 0
    ? nums.reduce((a, b) => a + b, 0) / nums.length
    : 0;
}

export function build_report_context(state: GameState) {
  const history = state.history;
  // Use completed rounds (history length) instead of current_round (which is 1-based and pre-incremented)
  const rounds = history.length;

  const player_wins = history.filter(r => r.winner === "PLAYER").length;
  const ai_wins = history.filter(r => r.winner === "AI").length;
  const ties = rounds - player_wins - ai_wins;

  const player_bids: number[] = [];
  const ai_bids: number[] = [];

  let maintenance_total = 0;

  for (const rec of history) {
    player_bids.push(rec.player_bid);
    ai_bids.push(rec.ai_bid);
    maintenance_total += rec.maintenance_fee_of_round;
  }

  const player_total = player_bids.reduce((a, b) => a + b, 0);
  const ai_total = ai_bids.reduce((a, b) => a + b, 0);

  const player_max = player_bids.length > 0 ? Math.max(...player_bids) : 0;
  const ai_max = ai_bids.length > 0 ? Math.max(...ai_bids) : 0;

  return {
    rounds: rounds,
    scores: { player: state.player.score, ai: state.ai.score },
    money_final: { player: state.player.money, ai: state.ai.money },
    wins: { player: player_wins, ai: ai_wins, ties: ties },
    bids: {
      player_avg: avg(player_bids),
      ai_avg: avg(ai_bids),
      player_max: player_max,
      ai_max: ai_max,
      player_total: player_total,
      ai_total: ai_total,
    },
    maintenance_total_paid: maintenance_total,
    history: history.map(r => ({
      round: r.round,
      player_bid: r.player_bid,
      ai_bid: r.ai_bid,
      winner: r.winner,
      maintenance_fee: r.maintenance_fee_of_round,
      p_money_after: r.p_money_after_b, 
      a_money_after: r.a_money_after_b
    })),
  };
}


export function create_initial_state(): GameState {
    return new GameState(
        STARTING_AMT,
        1,
        0,
        new PlayerState("PLAYER", STARTING_AMT),
        new PlayerState("AI", STARTING_AMT),
        []
    );
}

export function hydrate_state(raw: any): GameState {
    const player = new PlayerState(
        raw.player?.name ?? "PLAYER",
        Number(raw.player?.money ?? STARTING_AMT),
        Number(raw.player?.score ?? 0),
    );
    const ai = new PlayerState(
        raw.ai?.name ?? "AI",
        Number(raw.ai?.money ?? STARTING_AMT),
        Number(raw.ai?.score ?? 0),
    );
    const history = Array.isArray(raw.history) ? raw.history.map((r: any) => new RoundRecord(
        Number(r.round ?? 0),
        Number(r.player_bid ?? 0),
        Number(r.ai_bid ?? 0),
        r.winner ?? null,
        Number(r.maintenance_fee_of_round ?? 0),
        Number(r.p_score ?? 0),
        Number(r.p_money_before_m ?? 0),
        Number(r.p_money_before_b ?? 0),
        Number(r.p_money_after_b ?? 0),
        Number(r.a_score ?? 0),
        Number(r.a_money_before_m ?? 0),
        Number(r.a_money_before_b ?? 0),
        Number(r.a_money_after_b ?? 0),
    )) : [];

    return new GameState(
        Number(raw.starting_money ?? STARTING_AMT),
        Number(raw.current_round ?? 1),
        Number(raw.maintenance_fee_current ?? 0),
        player,
        ai,
        history,
    );
}

// Lazy singleton pipeline so we don't rebuild the graph every round/request
let cachedGraph: GraphLike | null = null;
export function getGraph(): GraphLike {
    if (!cachedGraph) {
        cachedGraph = buildPipeline();
    }
    return cachedGraph;
}

export type RoundOutcome = {
    status: "ok" | "ended";
    message?: string;
    round?: RoundRecord;
    aiReasons?: string[];
};

export async function play_round(state: GameState, player_bid: number, graph: GraphLike = getGraph()): Promise<RoundOutcome> {
    // Storing player's money at the start of the game (before maintenance costs)
    const p_money_before_m = state.player.money;
    const a_money_before_m = state.ai.money;

    // Calculating maintenance fee
    const m_fee = calculate_maintenance_fee(state.current_round);

    // Store maintenance fee of current round in state
    state.maintenance_fee_current = m_fee;

    // Apply maintenance fees and check that everyone can pay
    const ok = apply_maintenance_fee(state, state.player, state.ai);

    // Storing player's money after paying maintenance fees and before bid
    const p_money_before_b = state.player.money;
    const a_money_before_b = state.ai.money;

    if (!ok) {
        if (p_money_before_m < m_fee && a_money_before_m < m_fee) {
            console.log("Both players could not afford maintenance fees.");
            console.log("Game Ended!");
            return { status: "ended", message: "Both players could not afford maintenance fees." };
        }
        else if (p_money_before_m < m_fee) {
            console.log("PLAYER could not afford maintenance fees.");
            walkover("PLAYER", state);
            return { status: "ended", message: "PLAYER could not afford maintenance fees." };
        }
        else {
            console.log("AI could not afford maintenance fees.");
            walkover("AI", state);
            return { status: "ended", message: "AI could not afford maintenance fees." };
        }
    }

    // Clamp player bid to available money
    const p_bid = Math.max(0, Math.min(player_bid, p_money_before_b));

    // Get bid from AI
    const [a_bid, desc] = await chooseBid(graph as any, state as any, "AI");

    // determine winner
    const winner = round_winner(p_bid, a_bid);
    apply_payment(state.player, state.ai, p_bid, a_bid);
    award_point(state.player, state.ai, winner);

    // Record round data
    const rec = new RoundRecord(
        state.current_round,
        p_bid,
        a_bid,
        winner,
        state.maintenance_fee_current,

        state.player.score,
        p_money_before_m,
        p_money_before_b,
        state.player.money,

        state.ai.score,
        a_money_before_m,
        a_money_before_b,
        state.ai.money,
    );

    // add round record to gamestate history
    state.history.push(rec);

    // immediate elimination due to bidding
    if (state.player.money == 0 && state.ai.money == 0) {
        console.log("\nBoth players hit $0. Game ends");
        state.current_round += 1;
        return { status: "ended", message: "Both players hit $0.", round: rec, aiReasons: desc };
    }
    else if (state.player.money == 0) {
        console.log("\nPLAYER hit $0. Game ends");
        walkover("PLAYER", state, true);
        state.current_round += 1;
        return { status: "ended", message: "PLAYER hit $0.", round: rec, aiReasons: desc };
    }
    else if (state.ai.money == 0) {
        console.log("\nAI hit $0. Game ends");
        walkover("AI", state, true);
        state.current_round += 1;
        return { status: "ended", message: "AI hit $0.", round: rec, aiReasons: desc };
    }

    state.current_round += 1;
    return { status: "ok", round: rec, aiReasons: desc };
}

// Console-driven CLI removed; drive the game via frontend/API using play_round and report helpers.

async function game_loop() {

    // Declaring new GameState to store game data
    const state = new GameState(
        STARTING_AMT,
        1,
        0,
        new PlayerState("PLAYER", STARTING_AMT),
        new PlayerState("AI", STARTING_AMT),
        []
    );

    const graph = buildPipeline()


    // Starting game loop
    while (true) {

        // Storing player's money at the start of the game (before maintenance costs)
        const p_money_before_m = state.player.money;
        const a_money_before_m = state.ai.money;

        // Calculating maintenance fee
        const m_fee = calculate_maintenance_fee(state.current_round);

        // Store maintenance fee of current round in state
        state.maintenance_fee_current = m_fee

        // Apply maintenance fees and check that everyone can pay
        const ok = apply_maintenance_fee(state, state.player, state.ai)

        // Storing player's money after paying maintenance fees and before bid
        const p_money_before_b = state.player.money
        const a_money_before_b = state.ai.money

        if (!ok) {
            if (p_money_before_m < m_fee && a_money_before_m < m_fee) {
                console.log("Both players could not afford maintenance fees.")
                console.log("Game Ended!")
                return state
            }
            else if (p_money_before_m < m_fee) {
                console.log("PLAYER could not afford maintenance fees.")
                walkover("PLAYER", state)
                return state
            }
            else {
                console.log("AI could not afford maintenance fees.")
                walkover("AI", state)
                return state
            }
        }

        // Print round status
        print_round_status(state)
        
        // Get bid from player
        let p_bid = 0;
        while (true) {
            const bidInput = readlineSync.questionInt(
                `Enter your bid (0-${state.player.money}): `,
            );
            if (!Number.isInteger(bidInput) || bidInput < 0 || bidInput > state.player.money) {
                console.log(`Bid must be an integer between 0 and ${state.player.money}. Try again.`);
                continue;
            }
            p_bid = bidInput;
            break;
        }

        // Get bid from AI
        const [a_bid, desc] = await chooseBid(graph as any, state as any, "AI");

        // determine winner
        const winner = round_winner(p_bid, a_bid)
        apply_payment(state.player, state.ai, p_bid, a_bid)
        award_point(state.player, state.ai, winner)

        // Record round data
        const rec = new RoundRecord(
            state.current_round,
            p_bid,
            a_bid,
            winner,
            state.maintenance_fee_current,

            state.player.score,
            p_money_before_m,
            p_money_before_b,
            state.player.money,

            state.ai.score,
            a_money_before_m,
            a_money_before_b,
            state.ai.money,
        );

        // add round record to gamestate history
        state.history.push(rec);

        // reveal bids, scores, and balance
        print_reveal(rec)

        // Print AI reasoning??

        console.log("\nAI reasons:");
        desc.forEach((r, i) => console.log(`${i + 1}. ${r}`));

        // Print winner msg
        if (winner == null) {
            console.log(`\nResult: TIE!\n`)
        }
        else {
            console.log(`\nResult: ${winner} won this round!\n`)
        }

        // immediate elimination due to bidding
        if (state.player.money == 0 && state.ai.money == 0) {
            console.log("\nBoth players hit $0. Game ends")
        }
        else if (state.player.money == 0) {
            console.log("\nPLAYER hit $0. Game ends")
            walkover("PLAYER", state, true)
        }
        else if (state.ai.money == 0) {
            console.log("\nAI hit $0. Game ends")
            walkover("AI", state, true)
        }
        state.current_round += 1
    }
}



(async () => {

    const state = await game_loop();
    console.log("\n===============GAME ENDED===============");
    const report = await generateReport(build_report_context(state))
    console.log(report)
})();
