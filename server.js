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
  goldenSummon: 3,
  royalAscent: 2,
  forceCloseDoor: 1,
  capitalistBlitz: 3,
  bribeAI: 2,
  floor1Priority: 2,
  skipFloors: 3,
  emergencyCall: 2,
  priorityBoost: 1
};

// Initialize single AI Bot
function initializeBot(playerFloor) {
  const botFloor = playerFloor === 2 ? 3 : (playerFloor === 5 ? 4 : 2); // Place bot on different floor
  const initialCredits = 50;
  
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
  
  // Execute bids (higher bid wins)
  if (gameState.playerBid) {
    executeBid('player', gameState.playerBid);
  }
  if (gameState.botBid) {
    executeBid('bot', gameState.botBid);
  }
  
  // Execute actions
  if (gameState.playerAction) {
    executeAction('player', gameState.playerAction);
  }
  if (gameState.botAction) {
    executeAction('bot', gameState.botAction);
  }
  
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

// Execute action for player or bot
function executeAction(userType, actionType) {
  const user = userType === 'player' ? gameState.player : gameState.bot;
  if (!user || !actionType) return;
  
  const cost = ACTION_COSTS[actionType];
  if (!cost || user.credits < cost) return;
  
  user.credits -= cost;
  gameState.totalActions++;
  gameState.disruptionScore += 2;
  
  // Handle action effects
  handleAction(user.id, actionType);
  
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
function handleAction(userId, actionType) {
  const elevator = gameState.elevators[0];
  
  switch (actionType) {
    case 'goldenSummon':
      if (elevator.currentBid && elevator.currentBid.userId === userId) {
        elevator.activePremiumActions.push('goldenSummon');
      }
      break;
    case 'royalAscent':
      if (elevator.currentBid && elevator.currentBid.userId === userId) {
        elevator.activePremiumActions.push('royalAscent');
      }
      break;
    case 'forceCloseDoor':
      if (elevator.currentBid && elevator.currentBid.userId !== userId) {
        // Cancel other bid
        const prevUserId = elevator.currentBid.userId;
        if (prevUserId === 'bot_0' && gameState.bot) {
          gameState.bot.credits += elevator.currentBid.bid;
        } else if (gameState.player && prevUserId === gameState.player.id) {
          gameState.player.credits += elevator.currentBid.bid;
        }
        elevator.currentBid = null;
        elevator.targetFloor = null;
        elevator.state = 'idle';
      }
      break;
    case 'skipFloors':
      if (elevator.currentBid && elevator.currentBid.userId === userId) {
        elevator.currentBid.destination = 1;
        elevator.activePremiumActions.push('skipFloors');
      }
      break;
    case 'floor1Priority':
      if (elevator.currentBid && elevator.currentBid.userId === userId) {
        elevator.currentBid.destination = 1;
        elevator.activePremiumActions.push('floor1Priority');
      }
      break;
    // Other actions can be added here
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
    
    const initialCredits = 50;
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