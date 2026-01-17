const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

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

// Game State (In-Memory) - Round-based system
const gameState = {
  player: null, // Single player
  bot: null, // Single AI bot
  elevators: [
    { 
      id: 0, 
      currentFloor: 1, 
      targetFloor: null, 
      state: 'idle', 
      currentBid: null, // {userId, bid, floor, destination, premiumActions: []}
      locked: false, 
      lockedBy: null,
      activePremiumActions: []
    }
  ],
  floors: 5, // Changed from 10 to 5
  currentRound: 1,
  maxRounds: 10, // Maximum number of rounds
  roundPhase: 'waiting', // 'waiting', 'bidding', 'actions', 'processing', 'roundEnd'
  playerBid: null, // Player's bid for current round {bid, floor, direction}
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
  playerFloor: null, // Player's starting floor (2-5)
  maxBidReached: 0,
  roundResults: [] // History of round results
};

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

// Action costs
const ACTION_COSTS = {
  deferredSummon: 2,        // Deferred Summon ($2)
  liquidityLock: 2,         // Liquidity Lock ($2)
  marketSpoof: 2,           // Market Spoof ($2)
  shortTheFloor: 3,         // Short the Floor ($3)
  earlyCommit: 1,           // Early Commit ($1)
  lateHijack: 2,            // Late Hijack ($2)
  insuranceProtocol: 2,     // Insurance Protocol ($2)
  auditShield: 1,           // Audit Shield ($1)
  hostileTakeover: 4,       // Hostile Takeover ($4)
  collapseTrigger: 3        // Collapse Trigger ($3)
};

// Initialize single AI Bot
function initializeBot(playerFloor) {
  const botFloor = playerFloor === 2 ? 3 : (playerFloor === 5 ? 4 : 2); // Place bot on different floor
  const initialCredits = 20;
  
  gameState.bot = {
    id: 'bot_0',
    nickname: 'AI Bot',
    credits: initialCredits,
    floor: botFloor,
    destination: 1,
    inElevator: false,
    elevatorId: null,
    lastActionTime: Date.now(),
    actionCooldown: 3000
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
    const requestData = prepareDataForAIAgent();
    
    // TODO: Uncomment and configure when Moe/Jason's AI agent API is ready
    // The AI agent should receive the JSON data and return a decision
    // Expected response format: { bid: number | null, action: string | null }
    
    // const response = await fetch(AI_AGENT_API_URL, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify(requestData)
    // });
    // 
    // if (!response.ok) {
    //   throw new Error(`AI Agent API error: ${response.status}`);
    // }
    // 
    // const aiDecision = await response.json();
    // 
    // // Validate response format
    // if (aiDecision.bid !== undefined && aiDecision.action !== undefined) {
    //   return { bid: aiDecision.bid, action: aiDecision.action };
    // } else {
    //   throw new Error('Invalid AI agent response format');
    // }
    
    // Temporary: Use simple bot logic until AI agent is ready
    console.log('Calling AI Agent (temporary: using simple bot logic)');
    console.log('Request data:', JSON.stringify(requestData, null, 2));
    return makeSimpleBotDecision();
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
  if (!bot || bot.credits <= 0) {
    return { bid: null, action: null };
  }
  
  // Random strategy: bid 1-10 credits randomly, use action 70% of the time
  const canBid = bot.credits > 0;
  const minActionCost = Math.min(...Object.values(ACTION_COSTS));
  const canUseAction = bot.credits >= minActionCost;
  
  // Bid: 1-10 credits randomly (but not more than bot has)
  const bidAmount = Math.min(bot.credits, Math.floor(Math.random() * 10) + 1);
  const bid = canBid ? bidAmount : null;
  
  // Action: 70% chance to use action if can afford
  let action = null;
  if (canUseAction && Math.random() < 0.7) {
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
  
  // Emit processing state
  io.emit('roundProcessing', {
    round: gameState.currentRound,
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
  
  // Execute bids (higher bid wins)
  if (gameState.playerBid) {
    executeBid('player', gameState.playerBid);
  }
  if (gameState.botBid) {
    executeBid('bot', gameState.botBid);
  }
  
  // Execute actions with conflict resolution
  resolveAndExecuteActions();
  
  // Emit state after execution
  io.emit('gameState', getPublicGameState());
  
  // Small delay before movement
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Process elevator movement (move to floor, board, move to destination)
  // Simulate elevator movement over multiple steps
  await processElevatorMovement();
  
  // Check for win conditions
  const gameEnded = checkWinConditions();
  
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
  const analysis = {
    playerBid: null,
    botBid: null,
    playerAction: null,
    botAction: null,
    bidWinner: null,
    elevatorDestination: null,
    actionEffects: [],
    summary: ''
  };
  
  // Analyze player bid
  if (gameState.playerBid) {
    analysis.playerBid = {
      amount: gameState.playerBid.bid,
      floor: gameState.playerBid.floor,
      direction: gameState.playerBid.direction
    };
  }
  
  // Analyze bot bid
  if (gameState.botBid) {
    analysis.botBid = {
      amount: gameState.botBid.bid,
      floor: gameState.botBid.floor,
      direction: gameState.botBid.direction
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
    analysis.elevatorDestination = {
      floor: gameState.playerBid.floor,
      reason: `Your bid ($${playerBidAmount}) is higher than AI Bot's bid ($${botBidAmount})`
    };
  } else if (botBidAmount > playerBidAmount) {
    analysis.bidWinner = 'bot';
    analysis.elevatorDestination = {
      floor: gameState.botBid.floor,
      reason: `AI Bot's bid ($${botBidAmount}) is higher than your bid ($${playerBidAmount})`
    };
  } else if (playerBidAmount === botBidAmount && playerBidAmount > 0) {
    analysis.bidWinner = 'player';
    analysis.elevatorDestination = {
      floor: gameState.playerBid.floor,
      reason: `Tie bid ($${playerBidAmount}). Your bid was submitted first.`
    };
  } else {
    analysis.bidWinner = null;
    analysis.elevatorDestination = null;
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
  
  if (analysis.bidWinner === 'player') {
    summary += `🎯 ELEVATOR: Goes to Floor ${analysis.elevatorDestination.floor} (YOUR floor)\n`;
    summary += `💰 ${analysis.elevatorDestination.reason}\n`;
  } else if (analysis.bidWinner === 'bot') {
    summary += `🎯 ELEVATOR: Goes to Floor ${analysis.elevatorDestination.floor} (AI Bot's floor)\n`;
    summary += `💰 ${analysis.elevatorDestination.reason}\n`;
  } else {
    summary += `🎯 ELEVATOR: No valid bids this round\n`;
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
  const user = userId === 'bot_0' ? gameState.bot : gameState.player;
  
  // Store action state for conflict resolution tracking
  if (!gameState.actionStates) {
    gameState.actionStates = {};
  }
  if (!gameState.actionStates[userId]) {
    gameState.actionStates[userId] = {};
  }
  
  switch (actionType) {
    case 'deferredSummon':
      // Schedule elevator summon for next round
      if (!gameState.deferredSummons) {
        gameState.deferredSummons = [];
      }
      gameState.deferredSummons.push({
        userId: userId,
        floor: user ? user.floor : 1,
        round: gameState.currentRound + 1
      });
      break;
    
    case 'liquidityLock':
      // Target player's next action costs +$1
      // This will be applied when they submit next action
      if (!gameState.liquidityLocks) {
        gameState.liquidityLocks = new Map();
      }
      // Apply to the other player
      const targetUserId = userId === 'bot_0' ? (gameState.player ? gameState.player.id : null) : 'bot_0';
      if (targetUserId) {
        gameState.liquidityLocks.set(targetUserId, (gameState.liquidityLocks.get(targetUserId) || 0) + 1);
      }
      break;
    
    case 'marketSpoof':
      // Fake high-value bid that influences AI (handled in conflict resolution)
      if (!gameState.marketSpoofs) {
        gameState.marketSpoofs = [];
      }
      const bidAmount = gameState.playerBid ? (userId === 'bot_0' ? gameState.botBid?.bid : gameState.playerBid.bid) : 0;
      gameState.marketSpoofs.push({
        userId: userId,
        fakeBid: bidAmount,
        round: gameState.currentRound
      });
      break;
    
    case 'shortTheFloor':
      // All bids targeting chosen floor have -50% effectiveness
      // Implementation would require floor selection UI
      break;
    
    case 'earlyCommit':
      // Action resolves first (handled in conflict resolution order)
      gameState.actionStates[userId].earlyCommit = true;
      break;
    
    case 'lateHijack':
      // Cancel one target player's action at end of round
      if (!gameState.pendingLateHijacks) {
        gameState.pendingLateHijacks = [];
      }
      const targetId = userId === 'bot_0' ? (gameState.player ? gameState.player.id : null) : 'bot_0';
      if (targetId) {
        gameState.pendingLateHijacks.push({
          hijackerId: userId,
          targetId: targetId,
          round: gameState.currentRound
        });
      }
      break;
    
    case 'insuranceProtocol':
      // If next elevator action fails, refund cost and allow retry
      if (!gameState.insuranceProtocols) {
        gameState.insuranceProtocols = new Map();
      }
      gameState.insuranceProtocols.set(userId, gameState.currentRound);
      break;
    
    case 'auditShield':
      // Negates first hostile action targeting player (handled in conflict resolution)
      if (!gameState.auditShields) {
        gameState.auditShields = new Map();
      }
      gameState.auditShields.set(userId, gameState.currentRound);
      break;
    
    case 'hostileTakeover':
      // Override elevator AI decision logic for this round
      gameState.actionStates[userId].hostileTakeover = true;
      break;
    
    case 'collapseTrigger':
      // Increase system stress by +25%
      gameState.disruptionScore += Math.floor(gameState.disruptionScore * 0.25) + 5;
      break;
    
    // Legacy actions (kept for compatibility)
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
function checkWinConditions() {
  // Check if player reached floor 1
  if (gameState.player && gameState.player.floor === 1) {
    gameState.systemCollapsed = true;
    io.emit('gameEnd', {
      winner: gameState.player.nickname,
      reason: '🎉 YOU REACHED FLOOR 1! YOU WIN! 🎉',
      round: gameState.currentRound,
      disruptionScore: gameState.disruptionScore
    });
    return true;
  }
  
  // Check if bot reached floor 1
  if (gameState.bot && gameState.bot.floor === 1) {
    gameState.systemCollapsed = true;
    io.emit('gameEnd', {
      winner: gameState.bot.nickname,
      reason: 'AI Bot reached Floor 1! You lost!',
      round: gameState.currentRound,
      disruptionScore: gameState.disruptionScore
    });
    return true;
  }
  
  // Check if max rounds reached
  if (gameState.currentRound >= gameState.maxRounds) {
    gameState.systemCollapsed = true;
    const playerDistance = gameState.player ? gameState.player.floor - 1 : 999;
    const botDistance = gameState.bot ? gameState.bot.floor - 1 : 999;
    const winner = playerDistance < botDistance ? 
      gameState.player.nickname : 
      (botDistance < playerDistance ? gameState.bot.nickname : 'Tie');
    io.emit('gameEnd', {
      winner: winner,
      reason: 'Maximum rounds reached!',
      round: gameState.currentRound,
      disruptionScore: gameState.disruptionScore
    });
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
  return {
    player: gameState.player ? {
      id: gameState.player.id,
      nickname: gameState.player.nickname,
      credits: gameState.player.credits,
      floor: gameState.player.floor,
      destination: gameState.player.destination,
      inElevator: gameState.player.inElevator,
      elevatorId: gameState.player.elevatorId
    } : null,
    bot: gameState.bot ? {
      id: gameState.bot.id,
      nickname: gameState.bot.nickname,
      credits: gameState.bot.credits,
      floor: gameState.bot.floor,
      destination: gameState.bot.destination,
      inElevator: gameState.bot.inElevator,
      elevatorId: gameState.bot.elevatorId
    } : null,
    elevators: gameState.elevators.map(e => ({
      id: e.id,
      currentFloor: e.currentFloor,
      targetFloor: e.targetFloor,
      state: e.state,
      locked: e.locked,
      lockedBy: e.lockedBy,
      currentBid: e.currentBid ? {
        userId: e.currentBid.userId,
        bid: e.currentBid.bid,
        floor: e.currentBid.floor,
        destination: e.currentBid.destination,
        premiumActions: e.currentBid.premiumActions
      } : null,
      activePremiumActions: e.activePremiumActions
    })),
    disruptionScore: gameState.disruptionScore,
    systemCollapsed: gameState.systemCollapsed,
    floors: gameState.floors,
    currentRound: gameState.currentRound,
    maxRounds: gameState.maxRounds,
    roundPhase: gameState.roundPhase,
    playerBid: gameState.playerBid,
    playerAction: gameState.playerAction,
    announcements: gameState.announcements.slice(0, 3),
    maxBidReached: gameState.maxBidReached
  };
}

function getActionDisplayName(actionType) {
  const names = {
    goldenSummon: 'Golden Summon',
    royalAscent: 'Royal Ascent',
    floor1Priority: 'Floor 1 Priority',
    skipFloors: 'Skip Floors',
    forceCloseDoor: 'Force Close Door',
    bribeAI: 'Bribe the AI',
    capitalistBlitz: 'Capitalist Blitz',
    disableAction: 'Disable Action',
    emergencyCall: 'Emergency Call',
    priorityBoost: 'Priority Boost'
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
        e.currentFloor = 1;
        e.targetFloor = null;
        e.state = 'idle';
        e.currentBid = null;
        e.locked = false;
        e.lockedBy = null;
        e.activePremiumActions = [];
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
      if (gameState.autoProcessTimeout) {
        clearTimeout(gameState.autoProcessTimeout);
        gameState.autoProcessTimeout = null;
      }
    }
    
    // Assign player to a random floor (2-5)
    const playerFloor = Math.floor(Math.random() * 4) + 2;
    gameState.playerFloor = playerFloor;
    
    // Initialize bot
    initializeBot(playerFloor);
    
    const initialCredits = 20;
    gameState.player = {
      id: socket.id,
      nickname: nickname.trim(),
      credits: initialCredits,
      floor: playerFloor,
      destination: 1,
      inElevator: false,
      elevatorId: null
    };
    
    socket.emit('joined', {
      userId: socket.id,
      credits: initialCredits,
      floor: playerFloor,
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
    
    const { bid, floor, direction } = data;
    if (!bid || bid < 1 || bid > gameState.player.credits) {
      socket.emit('error', { message: 'Invalid bid amount' });
      return;
    }
    
    // Calculate bid limit based on max bid reached
    const currentMaxBid = gameState.maxBidReached;
    let bidLimit = 5; // Initial limit
    if (currentMaxBid >= 5) bidLimit = 10;
    if (currentMaxBid >= 10) bidLimit = 15;
    if (currentMaxBid >= 15) bidLimit = 20;
    if (currentMaxBid >= 20) bidLimit = 25;
    if (currentMaxBid >= 25) bidLimit = 30;
    if (currentMaxBid >= 30) bidLimit = 35;
    if (currentMaxBid >= 35) bidLimit = 40;
    if (currentMaxBid >= 40) bidLimit = 45;
    if (currentMaxBid >= 45) bidLimit = 50;
    
    if (bid > bidLimit) {
      socket.emit('error', { message: `Bid limit is $${bidLimit}. Reach higher bid to unlock more.` });
      return;
    }
    
    gameState.playerBid = { bid, floor, direction };
    
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