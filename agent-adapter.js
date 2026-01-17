/**
 * Agent Adapter - Bridge between Express server and Next.js game API
 * Calls the Next.js API at /api/game for AI decisions and reports
 */

require('dotenv').config();

// Next.js API URL (runs on port 3001)
const NEXT_API_URL = process.env.NEXT_API_URL || 'http://localhost:3001/api/game';

/**
 * Call the Next.js game API
 */
async function callGameAPI(action, data = {}) {
  try {
    const response = await fetch(NEXT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...data })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error calling game API (${action}):`, error.message);
    throw error;
  }
}

// Store game state for Next.js API
let nextJsGameState = null;

/**
 * Initialize/start a new game via Next.js API
 */
async function initGame() {
  try {
    const result = await callGameAPI('start');
    nextJsGameState = result.state;
    console.log('✅ Game initialized via Next.js API');
    return result.state;
  } catch (error) {
    console.error('❌ Failed to initialize game:', error.message);
    return null;
  }
}

/**
 * Convert Express gameState to Next.js API format
 */
function convertToNextJsState(gameState) {
  // Get maintenance info from gameState
  const maintenanceFee = gameState.maintenanceFee || 0;
  const maintenanceHistory = gameState.maintenanceHistory || [];
  
  return {
    starting_money: 100,
    current_round: gameState.currentRound || 1,
    maintenance_fee_current: maintenanceFee,
    player: {
      name: 'PLAYER',
      money: gameState.player?.credits || 100,
      score: gameState.player?.passengers || 0
    },
    ai: {
      name: 'AI',
      money: gameState.bot?.credits || 100,
      score: gameState.bot?.passengers || 0
    },
    history: (gameState.roundHistory || []).map((r, idx) => ({
      round: r.round,
      player_bid: r.playerBid || 0,
      ai_bid: r.botBid || 0,
      winner: r.winner === 'player' ? 'PLAYER' : r.winner === 'bot' ? 'AI' : null,
      maintenance_fee_of_round: maintenanceHistory[idx]?.fee || 0,
      p_score: r.playerPassengers || 0,
      p_money_before_m: r.playerCreditsBefore || 100,
      p_money_before_b: r.playerCreditsAfterMaintenance || r.playerCreditsBefore || 100,
      p_money_after_b: r.playerCreditsAfter || 0,
      a_score: r.botPassengers || 0,
      a_money_before_m: r.botCreditsBefore || 100,
      a_money_before_b: r.botCreditsAfterMaintenance || r.botCreditsBefore || 100,
      a_money_after_b: r.botCreditsAfter || 0
    }))
  };
}

/**
 * AI Personality types - affects bidding behavior
 * - 'neutral': balanced approach
 * - 'aggressive': higher bids, risk-taking
 * - 'conservative': lower bids, resource preservation
 * - 'chaotic': unpredictable, high variance
 */
const AI_PERSONALITIES = ['neutral', 'aggressive', 'conservative', 'chaotic'];

/**
 * Select AI personality based on game state
 * - Early game: more conservative
 * - Mid game: neutral or aggressive
 * - Late game (low credits): conservative
 * - Winning: can be more chaotic/aggressive
 */
function selectAIPersonality(gameState) {
  const round = gameState.currentRound || 1;
  const botCredits = gameState.bot?.credits || 100;
  const playerPassengers = gameState.player?.passengers || 0;
  const botPassengers = gameState.bot?.passengers || 0;
  
  // Late game with low credits - be conservative
  if (botCredits < 20) {
    return 'conservative';
  }
  
  // Bot is winning significantly - can be chaotic/aggressive
  if (botPassengers > playerPassengers + 5) {
    return Math.random() < 0.5 ? 'aggressive' : 'chaotic';
  }
  
  // Bot is losing - be aggressive to catch up
  if (playerPassengers > botPassengers + 5) {
    return 'aggressive';
  }
  
  // Early game (rounds 1-5) - slightly conservative
  if (round <= 5) {
    return Math.random() < 0.6 ? 'neutral' : 'conservative';
  }
  
  // Mid game - balanced random selection
  const rand = Math.random();
  if (rand < 0.4) return 'neutral';
  if (rand < 0.7) return 'aggressive';
  if (rand < 0.9) return 'conservative';
  return 'chaotic';
}

/**
 * Get AI bid decision using Next.js API
 * Falls back to simple logic if API is not available
 * 
 * @param {Object} gameState - Current game state
 * @param {number|null} playerBid - Player's bid for this round (if known)
 * @param {string|null} personality - AI personality override (null = auto-select)
 */
async function getAIBid(gameState, playerBid = null, personality = null) {
  // Auto-select personality based on game state if not provided
  const selectedPersonality = personality || selectAIPersonality(gameState);
  console.log(`AI Personality selected: ${selectedPersonality}`);
  
  try {
    // Convert gameState to Next.js format
    const state = convertToNextJsState(gameState);
    
    // Send actual player bid to API for better AI decision making
    const actualPlayerBid = playerBid ?? gameState.playerBid?.bid ?? 0;
    
    const result = await callGameAPI('play', {
      bid: actualPlayerBid,
      state: state,
      personality: selectedPersonality // Pass personality to API
    });
    
    // Extract game_over info from API response
    const gameOver = result.result?.game_over || false;
    const gameOverReason = result.result?.game_over_reason || null;
    
    if (gameOver) {
      console.log('API detected game over:', gameOverReason);
    }
    
    // Use updated state from API for maintenance sync
    const updatedState = result.state || null;
    
    const aiDecision = {
      bid: result.result?.ai_bid || Math.floor(Math.random() * 15) + 1,
      reasons: result.result?.ai_reasons || ['AI decision from Next.js API'],
      action: selectRandomAction(gameState.bot?.credits || 100),
      personality: selectedPersonality,
      gameOver: gameOver,
      gameOverReason: gameOverReason,
      apiState: updatedState // Include API's updated state for sync
    };
    
    console.log('AI decision from Next.js API:', {
      bid: aiDecision.bid,
      action: aiDecision.action,
      personality: aiDecision.personality,
      gameOver: aiDecision.gameOver
    });
    
    return aiDecision;
    
  } catch (error) {
    console.error('Failed to get AI bid from Next.js API:', error.message);
    console.log('Falling back to simple bot logic...');
    
    // Fallback to simple random logic with personality-based adjustments
    let baseBid = Math.floor(Math.random() * 15) + 1;
    
    // Apply personality to fallback logic
    switch (selectedPersonality) {
      case 'aggressive':
        baseBid = Math.floor(baseBid * 1.3);
        break;
      case 'conservative':
        baseBid = Math.floor(baseBid * 0.7);
        break;
      case 'chaotic':
        baseBid = Math.random() < 0.5 ? Math.floor(baseBid * 0.5) : Math.floor(baseBid * 1.5);
        break;
    }
    
    return {
      bid: Math.min(gameState.bot?.credits || 10, baseBid),
      reasons: [`Fallback (${selectedPersonality}): Next.js API not available - ${error.message}`],
      action: selectRandomAction(gameState.bot?.credits || 100),
      personality: selectedPersonality,
      gameOver: false,
      gameOverReason: null,
      apiState: null
    };
  }
}

/**
 * Select a random affordable action for the bot
 */
function selectRandomAction(botCredits) {
  const ACTION_COSTS = {
    passengerBonus: 2,
    crowdControl: 2,
    vipCall: 3,
    rushHour: 1,
    diversion: 2,
    safetyNet: 2,
    priorityPass: 1,
    fullCapacity: 4,
    sabotage: 3,
    luckyDraw: 2
  };
  
  const affordableActions = Object.entries(ACTION_COSTS)
    .filter(([_, cost]) => cost <= botCredits)
    .map(([action, _]) => action);
  
  return affordableActions.length > 0 
    ? affordableActions[Math.floor(Math.random() * affordableActions.length)]
    : null;
}

/**
 * Generate per-round analysis (local analysis)
 */
function generateRoundAnalysis(gameState, roundData) {
  const history = gameState.roundHistory || [];
  const totalRounds = history.length;
  
  if (totalRounds === 0) {
    return {
      riskLevel: 'neutral',
      bidAggressiveness: 0,
      trend: 'starting',
      insight: 'First round - no data yet. Make your first move!'
    };
  }
  
  // Calculate average bid percentage
  const playerBids = history.map(r => r.playerBid || 0);
  const botBids = history.map(r => r.botBid || 0);
  const playerCreditsHistory = history.map(r => r.playerCreditsBefore || 100);
  
  const avgBidPercentage = playerBids.reduce((sum, bid, i) => {
    const credits = playerCreditsHistory[i] || 100;
    return sum + (credits > 0 ? (bid / credits) * 100 : 0);
  }, 0) / totalRounds;
  
  // Calculate bot's average bid for comparison
  const avgBotBid = botBids.reduce((sum, bid) => sum + bid, 0) / totalRounds;
  const avgPlayerBid = playerBids.reduce((sum, bid) => sum + bid, 0) / totalRounds;
  
  // Determine risk level
  let riskLevel = 'neutral';
  if (avgBidPercentage > 30) riskLevel = 'aggressive';
  else if (avgBidPercentage < 10) riskLevel = 'conservative';
  
  // Calculate win rate
  const wins = history.filter(r => r.winner === 'player').length;
  const winRate = (wins / totalRounds) * 100;
  
  // Calculate consecutive wins/losses
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].winner === 'player') {
      if (consecutiveLosses === 0) consecutiveWins++;
      else break;
    } else {
      if (consecutiveWins === 0) consecutiveLosses++;
      else break;
    }
  }
  
  // Trend analysis
  const recentBids = playerBids.slice(-3);
  let trend = 'stable';
  if (recentBids.length >= 2) {
    const recent = recentBids[recentBids.length - 1];
    const older = recentBids[0];
    if (recent > older * 1.2) trend = 'increasing';
    else if (recent < older * 0.8) trend = 'decreasing';
  }
  
  // Latest round data
  const latestRound = history[history.length - 1];
  const bidDiff = (latestRound?.playerBid || 0) - (latestRound?.botBid || 0);
  
  // Generate detailed insight
  let insight = '';
  
  // Base strategy insight
  if (riskLevel === 'aggressive') {
    insight = 'High-risk, high-reward strategy detected. You\'re committing significant resources to each round. ';
  } else if (riskLevel === 'conservative') {
    insight = 'Conservative play style. You\'re preserving resources but may miss winning opportunities. ';
  } else {
    insight = 'Balanced approach. You\'re adapting to game conditions without extreme commitments. ';
  }
  
  // Win/Loss streak insight
  if (consecutiveWins >= 2) {
    insight += `🔥 ${consecutiveWins}-round winning streak! Momentum is on your side. `;
  } else if (consecutiveLosses >= 2) {
    insight += `⚠️ ${consecutiveLosses}-round losing streak. Consider adjusting your bid strategy. `;
  }
  
  // Bid comparison insight
  if (avgPlayerBid < avgBotBid * 0.7) {
    insight += 'Your average bids are significantly lower than AI. Try bidding higher to compete!';
  } else if (avgPlayerBid > avgBotBid * 1.3) {
    insight += 'You\'re consistently outbidding AI. Watch your credits carefully!';
  } else {
    insight += 'Bids are competitive with AI. Focus on action timing for advantage.';
  }
  
  return {
    riskLevel,
    bidAggressiveness: Math.round(avgBidPercentage),
    winRate: Math.round(winRate),
    trend,
    insight,
    roundsPlayed: totalRounds,
    consecutiveWins,
    consecutiveLosses,
    avgPlayerBid: Math.round(avgPlayerBid),
    avgBotBid: Math.round(avgBotBid),
    lastRoundBidDiff: bidDiff
  };
}

/**
 * Generate final game report using Next.js API
 */
async function generateFinalReport(gameState) {
  try {
    const state = convertToNextJsState(gameState);
    const result = await callGameAPI('report', { state });
    
    if (result.report) {
      // Format the report nicely
      return formatReport(result.report, gameState);
    }
    
    return generateLocalReport(gameState);
  } catch (error) {
    console.error('Failed to generate report via API:', error.message);
    return generateLocalReport(gameState);
  }
}

/**
 * Format the API report into a nice display format
 */
function formatReport(reportContext, gameState) {
  const ctx = reportContext;
  
  // Calculate additional stats
  const avgBidPercent = ctx.bids.player_total / (100 * Math.max(1, ctx.rounds)) * 100;
  let riskPosture = 'Balanced';
  if (avgBidPercent > 25) riskPosture = 'Aggressive';
  else if (avgBidPercent < 10) riskPosture = 'Conservative';
  
  const costPerPoint = ctx.scores.player > 0 
    ? Math.round(ctx.bids.player_total / ctx.scores.player) 
    : 0;
  
  const winRate = ctx.rounds > 0 ? Math.round((ctx.wins.player / ctx.rounds) * 100) : 0;
  
  let archetype = 'The Balanced Bidder';
  if (riskPosture === 'Aggressive' && winRate > 50) {
    archetype = 'The Risk Taker';
  } else if (riskPosture === 'Conservative' && winRate > 50) {
    archetype = 'The Strategic Saver';
  } else if (winRate < 40) {
    archetype = 'The Learner';
  }
  
  // Calculate maintenance stats
  const maintenanceTotalPaid = ctx.maintenance_total_paid || 0;
  const maintenancePerRound = ctx.rounds > 0 ? (maintenanceTotalPaid / ctx.rounds).toFixed(1) : 0;
  const maintenanceVsBids = ctx.bids.player_total > 0 
    ? Math.round((maintenanceTotalPaid / ctx.bids.player_total) * 100) 
    : 0;
  
  // Liquidity assessment based on maintenance impact
  let liquidityRating = 'Excellent';
  if (ctx.money_final.player < 20) liquidityRating = 'Critical';
  else if (ctx.money_final.player < 40) liquidityRating = 'Low';
  else if (ctx.money_final.player < 60) liquidityRating = 'Moderate';
  else if (ctx.money_final.player < 80) liquidityRating = 'Good';
  
  return `
═══════════════════════════════════════
        YOUR CAPITAL PROFILE
═══════════════════════════════════════

Risk Posture: ${riskPosture}
  (Average bid: ${Math.round(avgBidPercent)}% of capital)

Capital Efficiency: $${costPerPoint}/point
  (Total spent: $${ctx.bids.player_total} for ${ctx.scores.player} passengers)

Win Rate: ${winRate}%
  (${ctx.wins.player} wins / ${ctx.rounds} rounds)

Liquidity Management: ${liquidityRating}
  (Final credits: $${ctx.money_final.player})

Final Credits: $${ctx.money_final.player}
Final Passengers: ${ctx.scores.player}

───────────────────────────────────────
        MAINTENANCE COSTS
───────────────────────────────────────

💰 Total Maintenance Paid: $${maintenanceTotalPaid}
📊 Avg per Round: $${maintenancePerRound}
📈 Maintenance vs Bids: ${maintenanceVsBids}%
  (How much of your spending went to maintenance)

───────────────────────────────────────
        GAME STATISTICS
───────────────────────────────────────

Total Rounds: ${ctx.rounds}
Your Wins: ${ctx.wins.player} | AI Wins: ${ctx.wins.ai} | Ties: ${ctx.wins.ties}

Avg Bid: You $${ctx.bids.player_avg.toFixed(1)} | AI $${ctx.bids.ai_avg.toFixed(1)}
Max Bid: You $${ctx.bids.player_max} | AI $${ctx.bids.ai_max}

───────────────────────────────────────
        OVERALL ARCHETYPE
───────────────────────────────────────

★ ${archetype} ★

───────────────────────────────────────
        KEY TAKEAWAY
───────────────────────────────────────

${getKeyTakeaway(riskPosture, winRate, ctx.scores.player, ctx.scores.ai)}

───────────────────────────────────────
        SUGGESTIONS
───────────────────────────────────────

${getSuggestions(riskPosture, winRate, costPerPoint)}
═══════════════════════════════════════
`;
}

/**
 * Generate a simple local report without API
 */
function generateLocalReport(gameState) {
  const history = gameState.roundHistory || [];
  const rounds = history.length;
  
  const playerBids = history.map(r => r.playerBid || 0);
  const botBids = history.map(r => r.botBid || 0);
  
  const playerWins = history.filter(r => r.winner === 'player').length;
  const botWins = history.filter(r => r.winner === 'bot').length;
  const ties = rounds - playerWins - botWins;
  
  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  
  // Calculate total maintenance paid from history
  const maintenanceHistory = gameState.maintenanceHistory || [];
  const maintenanceTotalPaid = maintenanceHistory.reduce((sum, m) => sum + (m.fee || 0), 0);
  
  const context = {
    rounds,
    scores: {
      player: gameState.player?.passengers || 0,
      ai: gameState.bot?.passengers || 0
    },
    money_final: {
      player: gameState.player?.credits || 0,
      ai: gameState.bot?.credits || 0
    },
    wins: { player: playerWins, ai: botWins, ties },
    bids: {
      player_avg: avg(playerBids),
      ai_avg: avg(botBids),
      player_max: playerBids.length > 0 ? Math.max(...playerBids) : 0,
      ai_max: botBids.length > 0 ? Math.max(...botBids) : 0,
      player_total: playerBids.reduce((a, b) => a + b, 0),
      ai_total: botBids.reduce((a, b) => a + b, 0)
    },
    maintenance_total_paid: maintenanceTotalPaid
  };
  
  return formatReport(context, gameState);
}

function getKeyTakeaway(riskPosture, winRate, playerScore, aiScore) {
  if (playerScore >= 20) {
    return '🏆 Victory! Your strategy paid off. You collected 20 passengers first!';
  } else if (aiScore >= 20) {
    return '😢 Defeated. The AI outmaneuvered you this time. Analyze your bidding patterns and try again!';
  } else if (winRate > 60) {
    return '📈 Strong performance! Your bidding strategy is working well.';
  } else if (winRate < 40) {
    return '📉 Room for improvement. Consider varying your bid amounts more.';
  }
  return '⚖️ Evenly matched game. Small adjustments could tip the balance.';
}

function getSuggestions(riskPosture, winRate, costPerPoint) {
  const suggestions = [];
  
  if (riskPosture === 'Aggressive') {
    suggestions.push('• Consider saving credits for later rounds when stakes are higher');
  } else if (riskPosture === 'Conservative') {
    suggestions.push('• Try bidding more aggressively on high-passenger elevators');
  }
  
  if (winRate < 50) {
    suggestions.push('• Vary your bid amounts to be less predictable');
  }
  
  if (costPerPoint > 15) {
    suggestions.push('• Focus on efficiency - win rounds with lower bids when possible');
  }
  
  suggestions.push('• Use special actions strategically to gain advantages');
  
  return suggestions.slice(0, 3).join('\n');
}

module.exports = {
  initGame,
  getAIBid,
  generateRoundAnalysis,
  generateFinalReport,
  convertToNextJsState,
  callGameAPI
};
