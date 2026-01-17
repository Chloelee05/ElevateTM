const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// AI Agent Adapter - LangChain integration
const agentAdapter = require('./agent-adapter');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// AI Agent API endpoint - for future integration with Moe/Jason's AI agent
// Flow: YJ (Game Logic) -> Moe/Jason (AI agent) -> Chloe (Frontend)
// This will receive JSON data from YJ and return JSON data from AI agent
// 
// To enable AI agent:
// 1. Set AI_AGENT_API_URL environment variable to your AI agent endpoint
// 2. Uncomment the fetch code in callAIAgent() function below
// 3. Ensure AI agent returns: { bid: number | null, action: string | null }
// 4. For Node.js < 18, install node-fetch: npm install node-fetch
const AI_AGENT_API_URL = process.env.AI_AGENT_API_URL || 'http://localhost:3001/api/ai-agent'; // TODO: Update with actual API URL

// Game State (In-Memory) - Round-based passenger collection system
const gameState = {
  player: null, // Single player
  bot: null, // Single AI bot
  elevators: [
    { 
      id: 0, 
      currentFloor: 1, 
      targetFloor: null, 
      state: 'arriving', 
      currentBid: null,
      locked: false, 
      lockedBy: null,
      activePremiumActions: [],
      passengers: 0 // Number of passengers in this elevator (1-5)
    }
  ],
  lobbyFloor: 1, // Both players are at lobby (center)
  goalPassengers: 20, // First to 20 passengers wins
  currentRound: 1,
  maxRounds: 20, // Maximum number of rounds
  roundPhase: 'waiting', // 'waiting', 'bidding', 'actions', 'processing', 'roundEnd'
  playerBid: null, // Player's bid for current round
  playerAction: null, // Player's action for current round
  botBid: null, // Bot's bid for current round
  botAction: null, // Bot's action for current round
  disruptionScore: 0,
  systemCollapsed: false,
  premiumActionsDisabled: false,
  premiumActionsDisabledUntil: null,
  gameStartTime: Date.now(),
  totalVIPUsage: 0,
  totalActions: 0,
  announcements: [],
  maxBidReached: 0,
  roundResults: [], // History of round results
  roundHistory: [], // Detailed history for AI analysis and reporting
  aiReasons: [], // AI decision reasoning for display
  maintenanceFee: 0, // Current round's maintenance fee
  maintenanceHistory: [] // Track maintenance fees paid each round
};

// Maintenance Fee Constants
const MAINTENANCE_ROUND_INTERVAL = 2; // Fee increases every 2 rounds
const MAINTENANCE_COST_INCREMENT = 5; // Fee increases by $5 each interval

// Calculate maintenance fee for a given round
function calculateMaintenanceFee(roundNum) {
  const multiplier = Math.max(0, Math.floor((roundNum - 1) / MAINTENANCE_ROUND_INTERVAL));
  return multiplier * MAINTENANCE_COST_INCREMENT;
}

// Calculate maintenance outlook for upcoming rounds
function getMaintenanceOutlook(currentRound) {
  return {
    current: calculateMaintenanceFee(currentRound),
    next_round: calculateMaintenanceFee(currentRound + 1),
    in_2_rounds: calculateMaintenanceFee(currentRound + 2),
    in_3_rounds: calculateMaintenanceFee(currentRound + 3)
  };
}

// Apply maintenance fee to both players at round start
// Returns: { success: boolean, playerBankrupt: boolean, botBankrupt: boolean }
function applyMaintenanceFee() {
  const fee = gameState.maintenanceFee;
  const playerCredits = gameState.player?.credits || 0;
  const botCredits = gameState.bot?.credits || 0;
  
  const playerCanPay = playerCredits >= fee;
  const botCanPay = botCredits >= fee;
  
  if (playerCanPay && botCanPay) {
    // Both can pay - deduct fee
    gameState.player.credits -= fee;
    gameState.bot.credits -= fee;
    
    // Track maintenance history
    gameState.maintenanceHistory.push({
      round: gameState.currentRound,
      fee: fee,
      playerPaid: fee,
      botPaid: fee
    });
    
    return { success: true, playerBankrupt: false, botBankrupt: false };
  }
  
  return { 
    success: false, 
    playerBankrupt: !playerCanPay, 
    botBankrupt: !botCanPay 
  };
}

// Penalty tracking
const penalties = {
  lockoutUntil: new Map(),
  skipChance: new Map(),
  greedScore: new Map(),
  blacklisted: new Set(),
  costMultiplier: new Map(),
  insuranceUntil: new Map(),
  capitalistBlitzUntil: new Map()
};

// Action costs - adjusted for passenger collection game
const ACTION_COSTS = {
  passengerBonus: 2,        // Passenger Bonus ($2) - If you win, get +1 extra passenger
  crowdControl: 2,          // Crowd Control ($2) - Target's next bid has -50% effectiveness
  vipCall: 3,               // VIP Call ($3) - Next elevator has guaranteed 4-5 passengers
  rushHour: 1,              // Rush Hour ($1) - Your bid resolves first this round
  diversion: 2,             // Diversion ($2) - Cancel opponent's action this round
  safetyNet: 2,             // Safety Net ($2) - If you lose, get half the passengers (rounded down)
  priorityPass: 1,          // Priority Pass ($1) - Negates first hostile action against you
  fullCapacity: 4,          // Full Capacity ($4) - Double the passengers on current elevator
  sabotage: 3,              // Sabotage ($3) - If opponent wins, they get -2 passengers (min 0)
  luckyDraw: 2              // Lucky Draw ($2) - Random chance (50%) to steal 1 passenger from opponent
};

// Initialize single AI Bot
function initializeBot() {
  const initialCredits = 100;
  
  gameState.bot = {
    id: 'bot_0',
    nickname: 'AI Bot',
    credits: initialCredits,
    passengers: 0, // Collected passengers count
    floor: gameState.lobbyFloor, // Same floor as player (lobby)
    lastActionTime: Date.now(),
    actionCooldown: 3000
  };
}

// Generate random passengers for elevator (1-5)
function generateElevatorPassengers() {
  const passengers = Math.floor(Math.random() * 5) + 1; // 1-5 passengers
  gameState.elevators[0].passengers = passengers;
  gameState.elevators[0].state = 'arriving';
  return passengers;
}

// Process passenger collection - determine winner and award passengers
function processPassengerCollection() {
  const elevator = gameState.elevators[0];
  let passengersToAward = elevator.passengers || 0;
  
  // Track action effects for display
  const actionEffects = [];
  
  // Initialize action states if not exists
  if (!gameState.actionStates) {
    gameState.actionStates = { player: {}, bot: {} };
  }
  
  const playerStates = gameState.actionStates.player || {};
  const botStates = gameState.actionStates.bot || {};
  
  // Get base bid amounts
  let playerBidAmount = gameState.playerBid?.bid || 0;
  let botBidAmount = gameState.botBid?.bid || 0;
  
  // Apply CROWD CONTROL - reduce opponent's bid by 50%
  if (playerStates.crowdControlTarget && botBidAmount > 0) {
    const originalBotBid = botBidAmount;
    botBidAmount = Math.floor(botBidAmount * 0.5);
    actionEffects.push({
      type: 'crowdControl',
      target: 'bot',
      message: `🚫 Crowd Control: AI Bot's bid reduced $${originalBotBid} → $${botBidAmount}!`
    });
    console.log(`Crowd Control: Bot's bid reduced from $${originalBotBid} to $${botBidAmount}`);
  }
  if (botStates.crowdControlTarget && playerBidAmount > 0) {
    const originalPlayerBid = playerBidAmount;
    playerBidAmount = Math.floor(playerBidAmount * 0.5);
    actionEffects.push({
      type: 'crowdControl',
      target: 'player',
      message: `🚫 Crowd Control: Your bid reduced $${originalPlayerBid} → $${playerBidAmount}!`
    });
    console.log(`Crowd Control: Player's bid reduced from $${originalPlayerBid} to $${playerBidAmount}`);
  }
  
  // Apply FULL CAPACITY - double passengers (whoever used it)
  if (playerStates.fullCapacity || botStates.fullCapacity) {
    const originalPassengers = passengersToAward;
    passengersToAward = passengersToAward * 2;
    const who = playerStates.fullCapacity ? 'You' : 'AI Bot';
    actionEffects.push({
      type: 'fullCapacity',
      message: `👥 Full Capacity: ${who} doubled passengers ${originalPassengers} → ${passengersToAward}!`
    });
    console.log(`Full Capacity: Passengers doubled from ${originalPassengers} to ${passengersToAward}`);
  }
  
  let winner = null;
  let winReason = '';
  
  // Determine winner based on bid (with RUSH HOUR consideration for ties)
  if (playerBidAmount > botBidAmount) {
    winner = 'player';
    winReason = `Your bid ($${playerBidAmount}) beat AI Bot's bid ($${botBidAmount})`;
  } else if (botBidAmount > playerBidAmount) {
    winner = 'bot';
    winReason = `AI Bot's bid ($${botBidAmount}) beat your bid ($${playerBidAmount})`;
  } else if (playerBidAmount === botBidAmount && playerBidAmount > 0) {
    // Tie - check RUSH HOUR
    if (playerStates.rushHour && !botStates.rushHour) {
      winner = 'player';
      winReason = `Tie at $${playerBidAmount}! You won with Rush Hour priority!`;
      actionEffects.push({
        type: 'rushHour',
        message: `⚡ Rush Hour: You won the tie with priority!`
      });
    } else if (botStates.rushHour && !playerStates.rushHour) {
      winner = 'bot';
      winReason = `Tie at $${playerBidAmount}! AI Bot won with Rush Hour priority!`;
      actionEffects.push({
        type: 'rushHour',
        message: `⚡ Rush Hour: AI Bot won the tie with priority!`
      });
    } else {
      // Both have or both don't have Rush Hour - random
      winner = Math.random() < 0.5 ? 'player' : 'bot';
      winReason = `Tie at $${playerBidAmount}! ${winner === 'player' ? 'You' : 'AI Bot'} won by random selection`;
    }
  } else {
    // No valid bids
    winReason = 'No valid bids submitted';
  }
  
  let actualPassengersAwarded = passengersToAward;
  const loser = winner === 'player' ? 'bot' : 'player';
  
  // Award passengers to winner
  if (winner === 'player' && gameState.player) {
    // Apply PASSENGER BONUS - +1 extra passenger if player wins
    if (playerStates.passengerBonus) {
      actualPassengersAwarded += 1;
      actionEffects.push({
        type: 'passengerBonus',
        message: `🎁 Passenger Bonus: You got +1 extra passenger!`
      });
      console.log(`Passenger Bonus: Player gets +1 extra passenger`);
    }
    
    // Apply SABOTAGE from bot - if player wins, player gets -2 passengers
    if (botStates.sabotage) {
      const before = actualPassengersAwarded;
      actualPassengersAwarded = Math.max(0, actualPassengersAwarded - 2);
      actionEffects.push({
        type: 'sabotage',
        message: `💣 Sabotage: AI Bot's sabotage reduced your passengers ${before} → ${actualPassengersAwarded}!`
      });
      console.log(`Sabotage: Player loses 2 passengers from winning (now ${actualPassengersAwarded})`);
    }
    
    gameState.player.passengers = (gameState.player.passengers || 0) + actualPassengersAwarded;
    gameState.player.credits = Math.max(0, gameState.player.credits - (gameState.playerBid?.bid || 0));
    console.log(`Player wins! Awarded ${actualPassengersAwarded} passengers. Total: ${gameState.player.passengers}`);
    
    // Apply SAFETY NET for bot - if bot loses, get half passengers
    if (botStates.safetyNet && gameState.bot) {
      const safetyPassengers = Math.floor(passengersToAward / 2);
      if (safetyPassengers > 0) {
        gameState.bot.passengers = (gameState.bot.passengers || 0) + safetyPassengers;
        actionEffects.push({
          type: 'safetyNet',
          message: `🛡 Safety Net: AI Bot got ${safetyPassengers} passengers despite losing!`
        });
        console.log(`Safety Net: Bot gets ${safetyPassengers} passengers despite losing`);
      }
    }
    
  } else if (winner === 'bot' && gameState.bot) {
    // Apply PASSENGER BONUS - +1 extra passenger if bot wins
    if (botStates.passengerBonus) {
      actualPassengersAwarded += 1;
      actionEffects.push({
        type: 'passengerBonus',
        message: `🎁 Passenger Bonus: AI Bot got +1 extra passenger!`
      });
      console.log(`Passenger Bonus: Bot gets +1 extra passenger`);
    }
    
    // Apply SABOTAGE from player - if bot wins, bot gets -2 passengers
    if (playerStates.sabotage) {
      const before = actualPassengersAwarded;
      actualPassengersAwarded = Math.max(0, actualPassengersAwarded - 2);
      actionEffects.push({
        type: 'sabotage',
        message: `💣 Sabotage: Your sabotage reduced AI Bot's passengers ${before} → ${actualPassengersAwarded}!`
      });
      console.log(`Sabotage: Bot loses 2 passengers from winning (now ${actualPassengersAwarded})`);
    }
    
    gameState.bot.passengers = (gameState.bot.passengers || 0) + actualPassengersAwarded;
    gameState.bot.credits = Math.max(0, gameState.bot.credits - (gameState.botBid?.bid || 0));
    console.log(`Bot wins! Awarded ${actualPassengersAwarded} passengers. Total: ${gameState.bot.passengers}`);
    
    // Apply SAFETY NET for player - if player loses, get half passengers
    if (playerStates.safetyNet && gameState.player) {
      const safetyPassengers = Math.floor(passengersToAward / 2);
      if (safetyPassengers > 0) {
        gameState.player.passengers = (gameState.player.passengers || 0) + safetyPassengers;
        actionEffects.push({
          type: 'safetyNet',
          message: `🛡 Safety Net: You got ${safetyPassengers} passengers despite losing!`
        });
        console.log(`Safety Net: Player gets ${safetyPassengers} passengers despite losing`);
      }
    }
  }
  
  // Deduct bid from loser
  if (winner === 'player' && gameState.bot && (gameState.botBid?.bid || 0) > 0) {
    gameState.bot.credits = Math.max(0, gameState.bot.credits - (gameState.botBid?.bid || 0));
  } else if (winner === 'bot' && gameState.player && (gameState.playerBid?.bid || 0) > 0) {
    gameState.player.credits = Math.max(0, gameState.player.credits - (gameState.playerBid?.bid || 0));
  }
  
  // Apply LUCKY DRAW - 50% chance to steal 1 passenger from opponent
  if (playerStates.luckyDraw) {
    if (Math.random() < 0.5 && gameState.bot && gameState.bot.passengers > 0) {
      gameState.bot.passengers -= 1;
      gameState.player.passengers = (gameState.player.passengers || 0) + 1;
      actionEffects.push({
        type: 'luckyDraw',
        message: `🎲 Lucky Draw SUCCESS: You stole 1 passenger from AI Bot!`
      });
      console.log(`Lucky Draw: Player stole 1 passenger from Bot!`);
    } else {
      actionEffects.push({
        type: 'luckyDraw',
        message: `🎲 Lucky Draw FAILED: Bad luck, no steal this time!`
      });
    }
  }
  if (botStates.luckyDraw) {
    if (Math.random() < 0.5 && gameState.player && gameState.player.passengers > 0) {
      gameState.player.passengers -= 1;
      gameState.bot.passengers = (gameState.bot.passengers || 0) + 1;
      actionEffects.push({
        type: 'luckyDraw',
        message: `🎲 Lucky Draw: AI Bot stole 1 passenger from you!`
      });
      console.log(`Lucky Draw: Bot stole 1 passenger from Player!`);
    } else {
      actionEffects.push({
        type: 'luckyDraw',
        message: `🎲 Lucky Draw FAILED: AI Bot's steal attempt failed!`
      });
    }
  }
  
  // Combine pending action effects (from handleAction) with local action effects
  const allActionEffects = [...(gameState.pendingActionEffects || []), ...actionEffects];
  
  // Clear elevator passengers and action states for next round
  elevator.passengers = 0;
  elevator.currentBid = null;
  gameState.actionStates = { player: {}, bot: {} };
  gameState.pendingActionEffects = [];
  
  return {
    winner,
    passengersAwarded: actualPassengersAwarded,
    winReason,
    actionEffects: allActionEffects
  };
}

// Prepare JSON data for AI Agent API
// This function creates the data structure that will be sent to Moe/Jason's AI agent
function prepareDataForAIAgent() {
  return {
    round: gameState.currentRound,
    gameState: {
      bot: {
        credits: gameState.bot.credits,
        floor: gameState.bot.floor,
        destination: gameState.bot.destination,
        inElevator: gameState.bot.inElevator,
        elevatorId: gameState.bot.elevatorId
      },
      player: gameState.player ? {
        credits: gameState.player.credits,
        floor: gameState.player.floor,
        destination: gameState.player.destination,
        inElevator: gameState.player.inElevator,
        elevatorId: gameState.player.elevatorId
      } : null,
      elevator: gameState.elevators[0] ? {
        currentFloor: gameState.elevators[0].currentFloor,
        targetFloor: gameState.elevators[0].targetFloor,
        state: gameState.elevators[0].state,
        currentBid: gameState.elevators[0].currentBid
      } : null,
      floors: gameState.floors,
      maxBidReached: gameState.maxBidReached,
      disruptionScore: gameState.disruptionScore
    },
    playerBid: gameState.playerBid, // What player bid this round
    playerAction: gameState.playerAction, // What action player used this round
    availableActions: Object.keys(ACTION_COSTS),
    actionCosts: ACTION_COSTS
  };
}

// Call AI Agent API to get bot decision
// Flow: YJ (Game Logic) -> Moe/Jason (AI agent) -> Chloe (Frontend)
// This function prepares JSON data and sends to AI agent API
async function callAIAgent() {
  try {
    console.log('Calling AI Agent via LangChain pipeline...');
    
    // Pass player's bid to help AI make better decisions
    const playerBid = gameState.playerBid?.bid || 0;
    
    // Use the agent adapter to get AI decision (now with player bid and auto personality)
    const result = await agentAdapter.getAIBid(gameState, playerBid, null);
    
    console.log('AI Agent decision:', { 
      bid: result.bid, 
      action: result.action,
      personality: result.personality 
    });
    console.log('AI Reasoning:', result.reasons);
    
    // Store AI reasons and personality for display
    gameState.aiReasons = result.reasons || [];
    gameState.aiPersonality = result.personality || 'neutral';
    
    // Check for API-detected game over (bankruptcy from maintenance)
    if (result.gameOver && result.gameOverReason) {
      console.log('API detected game over condition:', result.gameOverReason);
      gameState.apiGameOver = {
        detected: true,
        reason: result.gameOverReason
      };
    }
    
    // Sync state from API if available (for maintenance consistency)
    if (result.apiState) {
      // Only sync specific fields to avoid overwriting special actions logic
      if (result.apiState.maintenance_fee_current !== undefined) {
        gameState.maintenanceFee = result.apiState.maintenance_fee_current;
      }
    }
    
    return { 
      bid: result.bid, 
      action: result.action,
      personality: result.personality
    };
  } catch (error) {
    console.error('Error calling AI agent:', error);
    // Fallback to simple bot logic
    return makeSimpleBotDecision();
  }
}

// Simple bot decision logic (temporary until AI agent is ready)
// This will be replaced by calling Moe/Jason's AI agent API
function makeSimpleBotDecision() {
  const bot = gameState.bot;
  if (!bot) {
    return { bid: null, action: null };
  }
  
  // Bid: 1-15 credits randomly (but not more than bot has)
  const canBid = bot.credits > 0;
  const bidAmount = canBid ? Math.min(bot.credits, Math.floor(Math.random() * 15) + 1) : 0;
  const bid = canBid ? bidAmount : null;
  
  // Action: ALWAYS select an action if can afford any
  const minActionCost = Math.min(...Object.values(ACTION_COSTS));
  const canUseAction = bot.credits >= minActionCost;
  
  let action = null;
  if (canUseAction) {
    // Randomly select from available actions that bot can afford
    const affordableActions = Object.keys(ACTION_COSTS).filter(
      actionType => ACTION_COSTS[actionType] <= bot.credits
    );
    if (affordableActions.length > 0) {
      action = affordableActions[Math.floor(Math.random() * affordableActions.length)];
    }
  }
  
  return { bid, action };
}

// API endpoint that Moe/Jason's AI agent can call to receive game state
// POST /api/game-state returns JSON data for AI agent
// The AI agent should POST to AI_AGENT_API_URL with the decision and we'll poll it
// OR we can POST to the AI agent API and it returns the decision

// Process round - execute bids and actions, then move elevator
async function processRound() {
  if (gameState.roundPhase !== 'processing') return;
  
  console.log(`Processing Round ${gameState.currentRound}...`);
  
  // Calculate and apply maintenance fee at round start
  gameState.maintenanceFee = calculateMaintenanceFee(gameState.currentRound);
  const maintenanceOutlook = getMaintenanceOutlook(gameState.currentRound);
  
  console.log(`Round ${gameState.currentRound} - Maintenance Fee: $${gameState.maintenanceFee}`);
  
  // Store credits before maintenance for tracking
  const playerCreditsBeforeMaintenance = gameState.player?.credits || 0;
  const botCreditsBeforeMaintenance = gameState.bot?.credits || 0;
  
  // Apply maintenance fee
  const maintenanceResult = applyMaintenanceFee();
  
  // Check for bankruptcy (walkover)
  if (!maintenanceResult.success) {
    console.log('Maintenance fee bankruptcy detected!');
    
    let winner, loser, reason;
    
    if (maintenanceResult.playerBankrupt && maintenanceResult.botBankrupt) {
      // Both bankrupt - tie based on passengers
      const playerPassengers = gameState.player?.passengers || 0;
      const botPassengers = gameState.bot?.passengers || 0;
      
      if (playerPassengers > botPassengers) {
        winner = gameState.player.nickname;
        reason = `Both players bankrupt! ${winner} wins with more passengers (${playerPassengers} vs ${botPassengers})`;
      } else if (botPassengers > playerPassengers) {
        winner = gameState.bot.nickname;
        reason = `Both players bankrupt! ${winner} wins with more passengers (${botPassengers} vs ${playerPassengers})`;
      } else {
        winner = 'TIE';
        reason = `Both players bankrupt with equal passengers (${playerPassengers})! It's a tie!`;
      }
    } else if (maintenanceResult.playerBankrupt) {
      winner = gameState.bot.nickname;
      loser = gameState.player.nickname;
      reason = `💸 ${loser} couldn't afford maintenance fee ($${gameState.maintenanceFee})! ${winner} wins by walkover!`;
    } else {
      winner = gameState.player.nickname;
      loser = gameState.bot.nickname;
      reason = `💸 ${loser} couldn't afford maintenance fee ($${gameState.maintenanceFee})! ${winner} wins by walkover!`;
    }
    
    gameState.systemCollapsed = true;
    io.emit('gameEnd', {
      winner: winner,
      reason: reason,
      round: gameState.currentRound,
      maintenanceBankruptcy: true,
      playerPassengers: gameState.player?.passengers || 0,
      botPassengers: gameState.bot?.passengers || 0
    });
    return;
  }
  
  console.log(`Maintenance paid: Player $${playerCreditsBeforeMaintenance} -> $${gameState.player.credits}, Bot $${botCreditsBeforeMaintenance} -> $${gameState.bot.credits}`);
  
  // Emit maintenance fee info to clients
  io.emit('maintenancePaid', {
    round: gameState.currentRound,
    fee: gameState.maintenanceFee,
    playerCreditsBefore: playerCreditsBeforeMaintenance,
    playerCreditsAfter: gameState.player.credits,
    botCreditsBefore: botCreditsBeforeMaintenance,
    botCreditsAfter: gameState.bot.credits,
    outlook: maintenanceOutlook
  });
  
  // Initialize action states for this round
  gameState.actionStates = { player: {}, bot: {} };
  
  // Emit processing state
  io.emit('roundProcessing', {
    round: gameState.currentRound,
    maintenanceFee: gameState.maintenanceFee,
    maintenanceOutlook: maintenanceOutlook,
    gameState: getPublicGameState()
  });
  
  // Get AI agent decision (Moe/Jason's AI agent)
  console.log('Calling AI agent for bot decision...');
  const aiDecision = await callAIAgent();
  console.log('AI agent decision:', aiDecision);
  
  gameState.botBid = aiDecision.bid ? {
    bid: aiDecision.bid,
    floor: gameState.bot.floor,
    direction: gameState.bot.floor > 1 ? 'down' : 'up'
  } : null;
  gameState.botAction = aiDecision.action || null;
  
  // Emit updated state with bot decisions
  io.emit('gameState', getPublicGameState());
  
  // Small delay to show bot decisions
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Generate and show round analysis BEFORE executing
  const roundAnalysis = generateRoundAnalysis();
  
  // Emit round analysis to all clients
  io.emit('roundAnalysis', {
    round: gameState.currentRound,
    analysis: roundAnalysis,
    gameState: getPublicGameState()
  });
  
  // Wait for user confirmation or max 90 seconds
  await new Promise(resolve => {
    const maxWaitTime = 90000; // 90 seconds
    let resolved = false;
    
    // Set timeout for max wait time
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    }, maxWaitTime);
    
    // Listen for user confirmation
    const confirmHandler = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve();
      }
    };
    
    // Find player socket and listen for confirmation
    if (gameState.player) {
      const playerSocket = io.sockets.sockets.get(gameState.player.id);
      if (playerSocket) {
        playerSocket.once('analysisConfirmed', confirmHandler);
      }
    }
  });
  
  // Execute actions with conflict resolution (before bid processing)
  resolveAndExecuteActions();
  
  // Determine bid winner and award passengers
  const roundResult = processPassengerCollection();
  
  // Emit state after execution
  io.emit('gameState', getPublicGameState());
  
  // Track round history for AI analysis and reporting
  const lastMaintenance = gameState.maintenanceHistory[gameState.maintenanceHistory.length - 1];
  const roundHistoryEntry = {
    round: gameState.currentRound,
    playerBid: gameState.playerBid?.bid || 0,
    botBid: gameState.botBid?.bid || 0,
    playerAction: gameState.playerAction,
    botAction: gameState.botAction,
    winner: roundResult.winner,
    passengersAwarded: roundResult.passengersAwarded,
    maintenanceFee: gameState.maintenanceFee,
    playerCreditsBefore: (gameState.player?.credits || 0) + (gameState.playerBid?.bid || 0) + (lastMaintenance?.fee || 0),
    playerCreditsAfterMaintenance: (gameState.player?.credits || 0) + (gameState.playerBid?.bid || 0),
    playerCreditsAfter: gameState.player?.credits || 0,
    botCreditsBefore: (gameState.bot?.credits || 0) + (gameState.botBid?.bid || 0) + (lastMaintenance?.fee || 0),
    botCreditsAfterMaintenance: (gameState.bot?.credits || 0) + (gameState.botBid?.bid || 0),
    botCreditsAfter: gameState.bot?.credits || 0,
    playerPassengers: gameState.player?.passengers || 0,
    botPassengers: gameState.bot?.passengers || 0,
    aiReasons: gameState.aiReasons || []
  };
  gameState.roundHistory.push(roundHistoryEntry);
  
  // Generate round analysis
  const roundAnalysisData = agentAdapter.generateRoundAnalysis(gameState, roundHistoryEntry);
  
  // Emit round result with action effects and analysis
  io.emit('roundResult', {
    round: gameState.currentRound,
    winner: roundResult.winner,
    passengersAwarded: roundResult.passengersAwarded,
    playerTotal: gameState.player?.passengers || 0,
    botTotal: gameState.bot?.passengers || 0,
    actionEffects: roundResult.actionEffects || [],
    roundAnalysis: roundAnalysisData,
    aiReasons: gameState.aiReasons || [],
    gameState: getPublicGameState()
  });
  
  // Wait for animation to complete (9 seconds - animation is 8s max + fade)
  await new Promise(resolve => setTimeout(resolve, 9000));
  
  // Generate new elevator with random passengers for next round
  generateElevatorPassengers();
  
  // Check for win conditions
  const gameEnded = await checkWinConditions();
  
  if (!gameEnded) {
    // End round only if game hasn't ended
    endRound();
  }
}

// Execute bid for player or bot
function executeBid(userType, bidData) {
  const user = userType === 'player' ? gameState.player : gameState.bot;
  if (!user || !bidData) return;
  
  const elevator = gameState.elevators[0];
  const currentBid = elevator.currentBid ? elevator.currentBid.bid : 0;
  
  // Higher bid wins
  if (bidData.bid > currentBid && user.credits >= bidData.bid) {
    // Refund previous bidder
    if (elevator.currentBid) {
      const prevUserId = elevator.currentBid.userId;
      if (prevUserId === 'bot_0' && gameState.bot) {
        gameState.bot.credits += elevator.currentBid.bid;
      } else if (gameState.player && prevUserId === gameState.player.id) {
        gameState.player.credits += elevator.currentBid.bid;
      }
    }
    
    // Place new bid
    user.credits -= bidData.bid;
    if (bidData.bid > gameState.maxBidReached) {
      gameState.maxBidReached = bidData.bid;
    }
    
    elevator.currentBid = {
      userId: user.id,
      bid: bidData.bid,
      floor: bidData.floor,
      destination: user.destination,
      premiumActions: []
    };
    elevator.targetFloor = bidData.floor;
    elevator.state = 'moving';
    elevator.lockedBy = user.id;
    
    gameState.announcements.unshift({
      time: Date.now(),
      bot: user.nickname,
      action: `Bid $${bidData.bid}`,
      message: `${user.nickname} bid $${bidData.bid}!`
    });
    if (gameState.announcements.length > 5) {
      gameState.announcements.pop();
    }
  }
}

// Generate round analysis for transparency
function generateRoundAnalysis() {
  const elevator = gameState.elevators[0];
  const passengers = elevator.passengers || 0;
  
  const analysis = {
    playerBid: null,
    botBid: null,
    playerAction: null,
    botAction: null,
    bidWinner: null,
    passengersAtStake: passengers,
    actionEffects: [],
    summary: ''
  };
  
  // Analyze player bid
  if (gameState.playerBid) {
    analysis.playerBid = {
      amount: gameState.playerBid.bid
    };
  }
  
  // Analyze bot bid
  if (gameState.botBid) {
    analysis.botBid = {
      amount: gameState.botBid.bid
    };
  }
  
  // Analyze player action
  if (gameState.playerAction) {
    analysis.playerAction = {
      type: gameState.playerAction,
      name: getActionDisplayName(gameState.playerAction),
      cost: ACTION_COSTS[gameState.playerAction] || 0
    };
  }
  
  // Analyze bot action
  if (gameState.botAction) {
    analysis.botAction = {
      type: gameState.botAction,
      name: getActionDisplayName(gameState.botAction),
      cost: ACTION_COSTS[gameState.botAction] || 0
    };
  }
  
  // Determine bid winner
  const playerBidAmount = gameState.playerBid?.bid || 0;
  const botBidAmount = gameState.botBid?.bid || 0;
  
  if (playerBidAmount > botBidAmount) {
    analysis.bidWinner = 'player';
    analysis.winReason = `Your bid ($${playerBidAmount}) beats AI Bot's bid ($${botBidAmount})`;
  } else if (botBidAmount > playerBidAmount) {
    analysis.bidWinner = 'bot';
    analysis.winReason = `AI Bot's bid ($${botBidAmount}) beats your bid ($${playerBidAmount})`;
  } else if (playerBidAmount === botBidAmount && playerBidAmount > 0) {
    analysis.bidWinner = 'player';
    analysis.winReason = `Tie bid ($${playerBidAmount}). Your bid was submitted first.`;
  } else {
    analysis.bidWinner = null;
    analysis.winReason = 'No bids this round';
  }
  
  // Analyze action effects
  if (gameState.playerAction && gameState.botAction && gameState.playerAction === gameState.botAction) {
    analysis.actionEffects.push({
      type: 'conflict',
      message: `Both players used ${getActionDisplayName(gameState.playerAction)}! Conflict resolution applies.`
    });
  }
  
  if (gameState.playerAction) {
    analysis.actionEffects.push({
      type: 'player',
      message: `You will use ${getActionDisplayName(gameState.playerAction)} ($${ACTION_COSTS[gameState.playerAction] || 0})`
    });
  }
  
  if (gameState.botAction) {
    analysis.actionEffects.push({
      type: 'bot',
      message: `AI Bot will use ${getActionDisplayName(gameState.botAction)} ($${ACTION_COSTS[gameState.botAction] || 0})`
    });
  }
  
  // Generate summary
  let summary = '📊 ROUND ANALYSIS\n\n';
  
  summary += `🚶 PASSENGERS AT STAKE: ${analysis.passengersAtStake}\n\n`;
  
  if (analysis.bidWinner === 'player') {
    summary += `🎉 YOU WIN THIS ROUND!\n`;
    summary += `💰 ${analysis.winReason}\n`;
  } else if (analysis.bidWinner === 'bot') {
    summary += `😢 AI BOT WINS THIS ROUND!\n`;
    summary += `💰 ${analysis.winReason}\n`;
  } else {
    summary += `🚫 NO WINNER - No valid bids this round\n`;
  }
  
  if (analysis.actionEffects.length > 0) {
    summary += '\n⚡ ACTIONS:\n';
    analysis.actionEffects.forEach(effect => {
      summary += `• ${effect.message}\n`;
    });
  }
  
  analysis.summary = summary;
  
  return analysis;
}

// Action Conflict Resolution System
function resolveAndExecuteActions() {
  // Collect all actions with metadata
  const actions = [];
  
  if (gameState.playerAction) {
    const player = gameState.player;
    if (player) {
      actions.push({
        userType: 'player',
        userId: player.id,
        user: player,
        actionType: gameState.playerAction,
        bidPower: gameState.playerBid ? gameState.playerBid.bid : 0,
        cost: ACTION_COSTS[gameState.playerAction] || 0,
        timestamp: Date.now()
      });
    }
  }
  
  if (gameState.botAction) {
    const bot = gameState.bot;
    if (bot) {
      actions.push({
        userType: 'bot',
        userId: bot.id,
        user: bot,
        actionType: gameState.botAction,
        bidPower: gameState.botBid ? gameState.botBid.bid : 0,
        cost: ACTION_COSTS[gameState.botAction] || 0,
        timestamp: Date.now() + 1
      });
    }
  }
  
  if (actions.length === 0) return;
  
  // Separate defensive and offensive actions
  const defensiveActions = actions.filter(a => a.actionType === 'auditShield');
  const offensiveActions = actions.filter(a => a.actionType !== 'auditShield');
  
  // Process defensive actions first
  defensiveActions.forEach(action => {
    executeAction(action.userType, action.actionType, true);
  });
  
  // Group actions by type for conflict resolution
  const actionsByType = {};
  offensiveActions.forEach(action => {
    if (!actionsByType[action.actionType]) {
      actionsByType[action.actionType] = [];
    }
    actionsByType[action.actionType].push(action);
  });
  
  // Resolve conflicts for each action type
  Object.keys(actionsByType).forEach(actionType => {
    const conflictingActions = actionsByType[actionType];
    
    if (conflictingActions.length === 1) {
      const action = conflictingActions[0];
      executeAction(action.userType, action.actionType, false);
    } else {
      resolveActionConflict(actionType, conflictingActions);
    }
  });
}

// Resolve conflicts for same action type
function resolveActionConflict(actionType, conflictingActions) {
  if (actionType === 'hostileTakeover') {
    resolveHostileTakeoverConflict(conflictingActions);
    return;
  }
  
  if (actionType === 'marketSpoof') {
    resolveMarketSpoofConflict(conflictingActions);
    return;
  }
  
  // Sort by priority: bidPower (desc), cost (desc), timestamp (asc)
  conflictingActions.sort((a, b) => {
    if (b.bidPower !== a.bidPower) return b.bidPower - a.bidPower;
    if (b.cost !== a.cost) return b.cost - a.cost;
    return a.timestamp - b.timestamp;
  });
  
  const winner = conflictingActions[0];
  
  // Execute winner's action
  executeAction(winner.userType, winner.actionType, false);
  
  // Early Commit allows multiple
  if (actionType === 'earlyCommit') {
    conflictingActions.slice(1).forEach(action => {
      executeAction(action.userType, action.actionType, false);
    });
  }
}

// Special handling for Hostile Takeover
function resolveHostileTakeoverConflict(conflictingActions) {
  conflictingActions.sort((a, b) => b.bidPower - a.bidPower);
  const winner = conflictingActions[0];
  
  executeAction(winner.userType, winner.actionType, false);
  
  // Others fail and get 50% refund
  conflictingActions.slice(1).forEach(failedAction => {
    const refund = Math.floor(failedAction.cost * 0.5);
    failedAction.user.credits += refund;
    
    gameState.announcements.unshift({
      time: Date.now(),
      bot: failedAction.user.nickname,
      action: 'Action Failed',
      message: `${failedAction.user.nickname}'s Hostile Takeover failed. Refunded $${refund}`
    });
  });
}

// Special handling for Market Spoof
function resolveMarketSpoofConflict(conflictingActions) {
  conflictingActions.sort((a, b) => b.bidPower - a.bidPower);
  const winner = conflictingActions[0];
  
  executeAction(winner.userType, winner.actionType, false);
}

// Execute action for player or bot
function executeAction(userType, actionType, isDefensive = false) {
  const user = userType === 'player' ? gameState.player : gameState.bot;
  if (!user || !actionType) return;
  
  const cost = ACTION_COSTS[actionType];
  if (!cost) return;
  
  // Deduct cost
  if (user.credits >= cost) {
    user.credits -= cost;
  } else {
    return; // Cannot afford
  }
  
  gameState.totalActions++;
  gameState.disruptionScore += 2;
  
  // Handle action effects
  handleAction(user.id, actionType, isDefensive);
  
  gameState.announcements.unshift({
    time: Date.now(),
    bot: user.nickname,
    action: getActionDisplayName(actionType),
    message: `${user.nickname} used ${getActionDisplayName(actionType)}!`
  });
  if (gameState.announcements.length > 5) {
    gameState.announcements.pop();
  }
}

// Handle action effects (simplified for round-based system)
function handleAction(userId, actionType, isDefensive = false) {
  const elevator = gameState.elevators[0];
  // Determine if this is bot or player based on userId
  const isBot = userId === 'bot_0' || userId === gameState.bot?.id;
  const user = isBot ? gameState.bot : gameState.player;
  const userKey = isBot ? 'bot' : 'player';
  
  // Store action state for conflict resolution tracking
  if (!gameState.actionStates) {
    gameState.actionStates = {};
  }
  if (!gameState.actionStates[userKey]) {
    gameState.actionStates[userKey] = {};
  }
  
  // Initialize pending action effects array
  if (!gameState.pendingActionEffects) {
    gameState.pendingActionEffects = [];
  }
  
  const isPlayer = userKey === 'player';
  const userName = isPlayer ? 'You' : 'AI Bot';
  const opponentName = isPlayer ? 'AI Bot' : 'You';
  
  switch (actionType) {
    case 'passengerBonus':
      // If you win, get +1 extra passenger
      gameState.actionStates[userKey].passengerBonus = true;
      break;
    
    case 'crowdControl':
      // Target player's next bid has -50% effectiveness
      const targetKey = userKey === 'bot' ? 'player' : 'bot';
      gameState.actionStates[targetKey].crowdControlTarget = true;
      break;
    
    case 'vipCall':
      // Next elevator has guaranteed 4-5 passengers
      if (!gameState.vipCallActive) {
        gameState.vipCallActive = userId;
        const oldPassengers = elevator.passengers;
        elevator.passengers = Math.floor(Math.random() * 2) + 4; // 4-5 passengers
        gameState.pendingActionEffects.push({
          type: 'vipCall',
          message: `⭐ VIP Call: ${userName} upgraded elevator to ${elevator.passengers} passengers!`
        });
      }
      break;
    
    case 'rushHour':
      // Your bid resolves first (priority in tie)
      gameState.actionStates[userKey].rushHour = true;
      break;
    
    case 'diversion':
      // Cancel opponent's action this round
      const opponentKey = userKey === 'bot' ? 'player' : 'bot';
      const opponentAction = userKey === 'bot' ? gameState.playerAction : gameState.botAction;
      const opponentActionName = opponentAction ? getActionDisplayName(opponentAction) : null;
      
      // Check if opponent has priorityPass
      if (gameState.actionStates[opponentKey]?.priorityPass) {
        gameState.actionStates[opponentKey].priorityPass = false; // Used up
        gameState.pendingActionEffects.push({
          type: 'priorityPassBlock',
          message: `🎫 Priority Pass: ${opponentName}'s action was protected from ${userName}'s Diversion!`
        });
      } else if (opponentAction) {
        // Cancel opponent's action
        if (userKey === 'bot') {
          gameState.playerAction = null;
          gameState.pendingActionEffects.push({
            type: 'diversion',
            message: `🔄 Diversion: AI Bot cancelled your ${opponentActionName}!`
          });
        } else {
          gameState.botAction = null;
          gameState.pendingActionEffects.push({
            type: 'diversion',
            message: `🔄 Diversion: You cancelled AI Bot's ${opponentActionName}!`
          });
        }
      } else {
        gameState.pendingActionEffects.push({
          type: 'diversionMiss',
          message: `🔄 Diversion: ${userName}'s diversion had no target (${opponentName} had no action)!`
        });
      }
      break;
    
    case 'safetyNet':
      // If you lose, get half the passengers (rounded down)
      gameState.actionStates[userKey].safetyNet = true;
      break;
    
    case 'priorityPass':
      // Negates first hostile action against you
      gameState.actionStates[userKey].priorityPass = true;
      break;
    
    case 'fullCapacity':
      // Double the passengers on current elevator
      gameState.actionStates[userKey].fullCapacity = true;
      break;
    
    case 'sabotage':
      // If opponent wins, they get -2 passengers (min 0)
      gameState.actionStates[userKey].sabotage = true;
      break;
    
    case 'luckyDraw':
      // Random chance (50%) to steal 1 passenger from opponent
      gameState.actionStates[userKey].luckyDraw = true;
      break;
    
    default:
      break;
  }
}

// Process elevator movement - simplified for round-based system
// Moves elevator step by step to show progress
async function processElevatorMovement() {
  const elevator = gameState.elevators[0];
  
  if (!elevator.currentBid) {
    io.emit('gameState', getPublicGameState());
    return;
  }
  
  const userId = elevator.currentBid.userId;
  const user = userId === 'bot_0' ? gameState.bot : gameState.player;
  if (!user) {
    io.emit('gameState', getPublicGameState());
    return;
  }
  
  // Step 1: Move elevator to pick up passenger
  while (elevator.currentFloor !== elevator.currentBid.floor) {
    if (elevator.currentFloor < elevator.currentBid.floor) {
      elevator.currentFloor++;
    } else {
      elevator.currentFloor--;
    }
    elevator.state = 'moving';
    io.emit('gameState', getPublicGameState());
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for animation
  }
  
  // Step 2: Board passenger
  if (elevator.currentFloor === elevator.currentBid.floor && !user.inElevator) {
    user.inElevator = true;
    user.elevatorId = elevator.id;
    elevator.targetFloor = elevator.currentBid.destination;
    elevator.state = 'moving';
    
    io.emit('userBoarded', {
      elevatorId: elevator.id,
      userId: userId,
      nickname: user.nickname,
      floor: elevator.currentFloor,
      destination: elevator.currentBid.destination
    });
    
    io.emit('gameState', getPublicGameState());
    await new Promise(resolve => setTimeout(resolve, 1000)); // Boarding delay
  }
  
  // Step 3: Move elevator to destination
  if (user.inElevator && elevator.targetFloor === elevator.currentBid.destination) {
    while (elevator.currentFloor !== elevator.targetFloor) {
      if (elevator.currentFloor < elevator.targetFloor) {
        elevator.currentFloor++;
      } else if (elevator.currentFloor > elevator.targetFloor) {
        elevator.currentFloor--;
      }
      io.emit('gameState', getPublicGameState());
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for animation
    }
    
    // Reached destination
    if (elevator.currentFloor === elevator.currentBid.destination) {
      user.floor = elevator.currentBid.destination;
      user.inElevator = false;
      user.elevatorId = null;
      
      // If reached Floor 1, all players exit
      if (elevator.currentBid.destination === 1) {
        // Both player and bot exit if in elevator
        if (gameState.player && gameState.player.inElevator && gameState.player.elevatorId === elevator.id) {
          gameState.player.floor = 1;
          gameState.player.inElevator = false;
          gameState.player.elevatorId = null;
        }
        if (gameState.bot && gameState.bot.inElevator && gameState.bot.elevatorId === elevator.id) {
          gameState.bot.floor = 1;
          gameState.bot.inElevator = false;
          gameState.bot.elevatorId = null;
        }
      }
      
      // Reset elevator
      elevator.currentBid = null;
      elevator.targetFloor = null;
      elevator.state = 'idle';
      elevator.locked = false;
      elevator.lockedBy = null;
      elevator.activePremiumActions = [];
      
      if (userId !== 'bot_0') {
        io.emit('reachedDestination', {
          floor: elevator.currentFloor
        });
      }
    }
  }
  
  // Final game state update
  io.emit('gameState', getPublicGameState());
}

// Check win conditions
async function checkWinConditions() {
  const playerPassengers = gameState.player?.passengers || 0;
  const botPassengers = gameState.bot?.passengers || 0;
  const goal = gameState.goalPassengers;
  
  // Helper function to emit game end with report
  const emitGameEnd = async (winnerNickname, reason) => {
    gameState.systemCollapsed = true;
    
    // Generate final report
    let finalReport = null;
    try {
      finalReport = await agentAdapter.generateFinalReport(gameState);
      console.log('Final report generated successfully');
    } catch (error) {
      console.error('Failed to generate final report:', error);
      finalReport = 'Report generation failed. Please try again.';
    }
    
    io.emit('gameEnd', {
      winner: winnerNickname,
      reason: reason,
      round: gameState.currentRound,
      playerPassengers: playerPassengers,
      botPassengers: botPassengers,
      finalReport: finalReport,
      roundHistory: gameState.roundHistory
    });
  };
  
  // Check if player reached goal
  if (playerPassengers >= goal) {
    await emitGameEnd(
      gameState.player.nickname,
      `🎉 YOU COLLECTED ${playerPassengers} PASSENGERS! YOU WIN! 🎉`
    );
    return true;
  }
  
  // Check if bot reached goal
  if (botPassengers >= goal) {
    await emitGameEnd(
      gameState.bot.nickname,
      `AI Bot collected ${botPassengers} passengers! You lost!`
    );
    return true;
  }
  
  // Check for bankruptcy (credits = 0)
  const playerCredits = gameState.player?.credits || 0;
  const botCredits = gameState.bot?.credits || 0;
  
  if (playerCredits === 0 && botCredits === 0) {
    // Both bankrupt - decide by passengers
    const winner = playerPassengers > botPassengers ? 
      gameState.player.nickname : 
      (botPassengers > playerPassengers ? gameState.bot.nickname : 'Tie');
    const reason = playerPassengers > botPassengers ?
      `💸 Both players bankrupt! You win with ${playerPassengers} vs ${botPassengers} passengers!` :
      (botPassengers > playerPassengers ? 
        `💸 Both players bankrupt! AI Bot wins with ${botPassengers} vs ${playerPassengers} passengers!` :
        `💸 Both players bankrupt! It's a tie with ${playerPassengers} passengers each!`);
    await emitGameEnd(winner, reason);
    return true;
  }
  
  if (playerCredits === 0) {
    await emitGameEnd(
      gameState.bot.nickname,
      `💸 You went bankrupt ($0)! AI Bot wins by walkover!`
    );
    return true;
  }
  
  if (botCredits === 0) {
    await emitGameEnd(
      gameState.player.nickname,
      `💸 AI Bot went bankrupt ($0)! You win by walkover!`
    );
    return true;
  }
  
  // Check if max rounds reached
  if (gameState.currentRound >= gameState.maxRounds) {
    const winner = playerPassengers > botPassengers ? 
      gameState.player.nickname : 
      (botPassengers > playerPassengers ? gameState.bot.nickname : 'Tie');
    const reason = playerPassengers > botPassengers ?
      `🎉 YOU WIN! ${playerPassengers} vs ${botPassengers} passengers!` :
      (botPassengers > playerPassengers ? 
        `AI Bot wins! ${botPassengers} vs ${playerPassengers} passengers!` :
        `It's a tie! Both have ${playerPassengers} passengers!`);
    await emitGameEnd(winner, reason);
    return true;
  }
  
  return false;
}

// End current round and start next round
function endRound() {
  // Clear any pending auto-process timeout
  if (gameState.autoProcessTimeout) {
    clearTimeout(gameState.autoProcessTimeout);
    gameState.autoProcessTimeout = null;
  }
  
  const roundResult = {
    round: gameState.currentRound,
    playerBid: gameState.playerBid,
    playerAction: gameState.playerAction,
    botBid: gameState.botBid,
    botAction: gameState.botAction,
    playerFloor: gameState.player ? gameState.player.floor : null,
    botFloor: gameState.bot ? gameState.bot.floor : null
  };
  gameState.roundResults.push(roundResult);
  
  // Reset round data
  gameState.playerBid = null;
  gameState.playerAction = null;
  gameState.botBid = null;
  gameState.botAction = null;
  
  // Move to next round if game not ended
  if (!gameState.systemCollapsed) {
    // Immediately prepare for next round
    gameState.currentRound++;
    gameState.roundPhase = 'waiting';
    
    // Emit round end with updated game state (next round ready)
    io.emit('roundEnd', {
      roundResult: roundResult,
      currentRound: gameState.currentRound,
      gameState: getPublicGameState()
    });
    
    // Also emit gameState update to ensure clients get the waiting state
    io.emit('gameState', getPublicGameState());
  }
}

function getPublicGameState() {
  const elevator = gameState.elevators[0];
  const maintenanceOutlook = getMaintenanceOutlook(gameState.currentRound);
  
  return {
    player: gameState.player ? {
      id: gameState.player.id,
      nickname: gameState.player.nickname,
      credits: gameState.player.credits,
      passengers: gameState.player.passengers,
      floor: gameState.player.floor
    } : null,
    bot: gameState.bot ? {
      id: gameState.bot.id,
      nickname: gameState.bot.nickname,
      credits: gameState.bot.credits,
      passengers: gameState.bot.passengers,
      floor: gameState.bot.floor
    } : null,
    elevator: {
      id: elevator.id,
      currentFloor: elevator.currentFloor,
      state: elevator.state,
      passengers: elevator.passengers,
      currentBid: elevator.currentBid
    },
    lobbyFloor: gameState.lobbyFloor,
    goalPassengers: gameState.goalPassengers,
    disruptionScore: gameState.disruptionScore,
    systemCollapsed: gameState.systemCollapsed,
    currentRound: gameState.currentRound,
    maxRounds: gameState.maxRounds,
    roundPhase: gameState.roundPhase,
    playerBid: gameState.playerBid,
    playerAction: gameState.playerAction,
    announcements: gameState.announcements.slice(0, 3),
    maxBidReached: gameState.maxBidReached,
    // Maintenance fee info
    maintenanceFee: gameState.maintenanceFee,
    maintenanceOutlook: maintenanceOutlook
  };
}

function getActionDisplayName(actionType) {
  const names = {
    passengerBonus: 'Passenger Bonus',
    crowdControl: 'Crowd Control',
    vipCall: 'VIP Call',
    rushHour: 'Rush Hour',
    diversion: 'Diversion',
    safetyNet: 'Safety Net',
    priorityPass: 'Priority Pass',
    fullCapacity: 'Full Capacity',
    sabotage: 'Sabotage',
    luckyDraw: 'Lucky Draw'
  };
  return names[actionType] || actionType;
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('joinGame', (data) => {
    const { nickname } = data;
    if (!nickname || nickname.trim() === '') {
      socket.emit('error', { message: 'Nickname is required' });
      return;
    }
    
    // Reset game state if starting new game
    if (gameState.systemCollapsed || gameState.player) {
      gameState.player = null;
      gameState.bot = null;
      gameState.elevators.forEach(e => {
        e.currentFloor = gameState.lobbyFloor;
        e.targetFloor = null;
        e.state = 'arriving';
        e.currentBid = null;
        e.locked = false;
        e.lockedBy = null;
        e.activePremiumActions = [];
        e.passengers = 0;
      });
      gameState.disruptionScore = 0;
      gameState.systemCollapsed = false;
      gameState.currentRound = 1;
      gameState.roundPhase = 'waiting';
      gameState.playerBid = null;
      gameState.playerAction = null;
      gameState.botBid = null;
      gameState.botAction = null;
      gameState.announcements = [];
      gameState.maxBidReached = 0;
      gameState.roundResults = [];
      gameState.roundHistory = [];
      gameState.aiReasons = [];
      gameState.actionStates = {};
      gameState.maintenanceFee = 0;
      gameState.maintenanceHistory = [];
      if (gameState.autoProcessTimeout) {
        clearTimeout(gameState.autoProcessTimeout);
        gameState.autoProcessTimeout = null;
      }
    }
    
    // Initialize bot
    initializeBot();
    
    // Generate first elevator with passengers
    generateElevatorPassengers();
    
    const initialCredits = 100;
    gameState.player = {
      id: socket.id,
      nickname: nickname.trim(),
      credits: initialCredits,
      passengers: 0, // Collected passengers count
      floor: gameState.lobbyFloor // Same floor as bot (lobby)
    };
    
    socket.emit('joined', {
      userId: socket.id,
      credits: initialCredits,
      passengers: 0,
      floor: gameState.lobbyFloor,
      gameState: getPublicGameState()
    });
    
    io.emit('gameState', getPublicGameState());
  });
  
  // Player submits bid for current round
  socket.on('submitBid', (data) => {
    if (!gameState.player || gameState.player.id !== socket.id) {
      socket.emit('error', { message: 'Not in game' });
      return;
    }
    
    if (gameState.roundPhase !== 'bidding' && gameState.roundPhase !== 'waiting') {
      socket.emit('error', { message: 'Cannot bid at this time' });
      return;
    }
    
    // Check if bid already submitted
    if (gameState.playerBid) {
      socket.emit('error', { message: 'Bid already submitted for this round' });
      return;
    }
    
    const { bid } = data;
    if (!bid || bid < 1 || bid > gameState.player.credits) {
      socket.emit('error', { message: 'Invalid bid amount' });
      return;
    }
    
    gameState.playerBid = { bid };
    
    // Move to actions phase when bid is submitted (don't auto-start round)
    // Player can now select action and then click "START ROUND" button
    gameState.roundPhase = 'actions';
    
    // Clear any existing auto-process timeout (no longer needed)
    if (gameState.autoProcessTimeout) {
      clearTimeout(gameState.autoProcessTimeout);
      gameState.autoProcessTimeout = null;
    }
    
    socket.emit('bidSubmitted', { bid: bid });
    io.emit('gameState', getPublicGameState());
  });
  
  // Player submits action for current round
  socket.on('submitAction', (data) => {
    if (!gameState.player || gameState.player.id !== socket.id) {
      socket.emit('error', { message: 'Not in game' });
      return;
    }
    
    if (gameState.roundPhase !== 'actions' && gameState.roundPhase !== 'waiting' && gameState.roundPhase !== 'bidding') {
      socket.emit('error', { message: 'Cannot use action at this time' });
      return;
    }
    
    // Check if action already submitted (allow resubmission if changing action during bidding/actions phase)
    if (gameState.playerAction !== null && gameState.playerAction !== undefined && gameState.roundPhase === 'processing') {
      socket.emit('error', { message: 'Action already submitted for this round' });
      return;
    }
    
    const { actionType } = data;
    
    // If actionType is null, player is skipping action
    if (actionType === null) {
      gameState.playerAction = null; // Explicitly set to null to skip action
    } else {
      if (!actionType) {
        socket.emit('error', { message: 'Action type required' });
        return;
      }
      
      const cost = ACTION_COSTS[actionType];
      if (!cost) {
        socket.emit('error', { message: 'Invalid action type' });
        return;
      }
      
      if (gameState.player.credits < cost) {
        socket.emit('error', { message: 'Insufficient credits' });
        return;
      }
      
      gameState.playerAction = actionType;
    }
    
    // Clear any existing auto-process timeout (no longer needed)
    if (gameState.autoProcessTimeout) {
      clearTimeout(gameState.autoProcessTimeout);
      gameState.autoProcessTimeout = null;
    }
    
    // Stay in actions phase (don't auto-start round)
    // Player needs to click "START ROUND" button to confirm and start round
    if (!gameState.playerBid) {
      gameState.roundPhase = 'actions';
    }
    // If bid is already submitted, stay in actions phase (waiting for START ROUND button)
    
    socket.emit('actionSubmitted', { 
      actionType: actionType,
      gameState: getPublicGameState() // Send full game state for immediate update
    });
    io.emit('gameState', getPublicGameState());
  });
  
  // Start new round or confirm round submission
  socket.on('startRound', () => {
    if (!gameState.player || gameState.player.id !== socket.id) {
      socket.emit('error', { message: 'Not in game' });
      return;
    }
    
    // If in waiting phase, start the bidding phase
    if (gameState.roundPhase === 'waiting') {
      // Reset round data
      gameState.playerBid = null;
      gameState.playerAction = null;
      gameState.botBid = null;
      gameState.botAction = null;
      
      // Start bidding phase
      gameState.roundPhase = 'bidding';
      
      io.emit('roundStart', {
        round: gameState.currentRound,
        gameState: getPublicGameState()
      });
      return;
    }
    
    // If in bidding or actions phase, check if ready to process
    if (gameState.roundPhase === 'bidding' || gameState.roundPhase === 'actions') {
      // Check if bid is submitted (required)
      if (!gameState.playerBid) {
        socket.emit('error', { message: 'Please submit a bid first' });
        return;
      }
      
      // Action can be null (skipped), but both bid and action decision should be made
      // If action is not set yet, set it to null (skip action)
      if (gameState.playerAction === undefined) {
        gameState.playerAction = null;
      }
      
      // Both bid and action (or skip) are confirmed, start processing
      gameState.roundPhase = 'processing';
      io.emit('gameState', getPublicGameState());
      processRound();
      return;
    }
    
    // If already processing or other phase
    if (gameState.roundPhase === 'processing') {
      socket.emit('error', { message: 'Round is already processing' });
      return;
    }
    
    socket.emit('error', { message: 'Cannot start round at this time' });
  });
  
  socket.on('disconnect', () => {
    if (gameState.player && gameState.player.id === socket.id) {
      gameState.player = null;
    }
    console.log('User disconnected:', socket.id);
  });
});

// API endpoint for AI Agent integration
// YJ (Game Logic) can call this to get JSON data to send to Moe/Jason's AI agent
// POST /api/game-state returns the current game state in format for AI agent
app.post('/api/game-state', (req, res) => {
  const gameStateData = prepareDataForAIAgent();
  res.json(gameStateData);
});

// API endpoint to receive AI agent decision (alternative approach)
// If Moe/Jason's AI agent wants to POST the decision back instead of us polling
// POST /api/ai-decision receives { bid: number | null, action: string | null }
app.post('/api/ai-decision', (req, res) => {
  const { bid, action } = req.body;
  
  // Validate and store AI decision (can be used if polling approach is not preferred)
  // For now, we use the callAIAgent() function which calls the AI agent API directly
  
  res.json({ success: true, message: 'AI decision received' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Elevate™ server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
  console.log(`AI Agent API URL: ${AI_AGENT_API_URL} (configure when ready)`);
});