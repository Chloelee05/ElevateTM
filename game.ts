import { start } from "node:repl";
import { callbackify } from "node:util";
import readlineSync from "readline-sync";
import { buildPipeline, chooseBid, generateReport } from "./agent_pipeline.ts"


console.log("test")

// Constants
const STARTING_AMT: number = 100;
const MAINTENANCE_ROUND_INTERVAL: number = 2
const MAINTENANCE_COST_INCREMENT: number = 5



// Defining classes 
class PlayerState {
  name: string;
  money: number;
  score: number;

  constructor(name: string, money: number, score: number = 0) {
    this.name = name;
    this.money = money;
    this.score = score;
  }
}

class RoundRecord {
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

class GameState {
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



function game_loop() {

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
        const p_bid = readlineSync.questionInt(
            "Enter your bid: ",
            {
                min: 0,
                max: state.player.money
            }
        )

        // Get bid from AI
        let a_bid, desc = chooseBid(graph, state, "AI")

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



game_loop()
console.log("\n===============GAME ENDED===============")