# Elevate™ - Pay-to-Win Elevator Simulation

A round-based web-based game where you compete against an AI bot in a pay-to-win elevator system. Use your limited credits strategically to reach Floor 1 first!

## 🎮 Game Overview

- **Goal**: Be the first to reach Floor 1!
- **Starting Credits**: $50 (no refills)
- **Players**: You + 1 AI bot
- **Floors**: 5 floors total (1-5, Floor 1 is the goal)
- **Starting Floors**: Random floors 2-5
- **Game System**: Round-based (submit 1 bid + 1 action per round)
- **Game End**: Reach Floor 1, or after maximum rounds (10 rounds)

## 🚀 Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Start the server:**
```bash
npm start
```

3. **Open your browser:**
```
http://localhost:3000
```

## 🎯 How to Play

1. Enter your nickname and join the game
2. You'll start on a random floor (2-5), AI bot on a different floor
3. **Round System**: Each round you can submit 1 bid and 1 action
4. **Start Round**: Click "START ROUND" to begin
5. **Submit Bid**: Select direction (↑/↓) and place a bid
   - **Bid Limit System**: Progressive unlocking (start: $5, then $10, $15, etc.)
6. **Submit Action**: Choose one special action per round
7. **Round Processing**: Both players' bids and actions are processed
8. **Win**: First to reach Floor 1 wins, or closest to Floor 1 after 10 rounds!

## ⚡ Special Actions (Choose 1 per round)

- **Golden Summon** ($3) - Summon elevator to your floor
- **Bribe the AI** ($2) - Increase bid priority
- **Capitalist Blitz** ($3) - All actions 50% off for 60s
- **Emergency Call** ($2) - Force nearest elevator to your floor
- **Priority Boost** ($1) - Double your bid effectiveness
- **Force Close Door** ($1) - Cancel all other bids
- **Royal Ascent** ($2) - Non-stop express ride
- **Floor 1 Priority** ($2) - Guaranteed stop at Floor 1
- **Skip Floors** ($3) - Skip all floors, go directly to Floor 1
- **Disable Action** ($2) - Disable target player actions for 6s

**Note**: Each round you can submit 1 bid and 1 action. Both are processed together when you submit both.

## 🤖 AI Bot Integration

The AI bot decision-making is designed to integrate with Moe/Jason's AI agent API.

**Flow**: 
1. YJ (Game Logic) prepares JSON data via `prepareDataForAIAgent()`
2. Calls Moe/Jason's AI agent API (currently commented out, using simple bot logic)
3. AI agent returns JSON decision: `{ bid: number | null, action: string | null }`
4. Game processes bot's decision along with player's decision

**API Integration**: 
- Server endpoint: `/api/game-state` - Returns current game state for AI agent
- AI Agent URL: Set via `AI_AGENT_API_URL` environment variable (default: `http://localhost:3001/api/ai-agent`)
- Currently using simple bot logic until AI agent is ready

## 🎨 Features

- **8bit Pixel Art Style** - Retro gaming aesthetic
- **Round-Based System** - Strategic turn-based gameplay (1 bid + 1 action per round)
- **Single AI Bot** - Compete against 1 AI bot
- **5 Floors** - Simplified building with 5 floors
- **Live Announcement Board** - See all player actions in real-time
- **Bid Limit System** - Progressive unlocking as max bid increases
- **AI Agent Ready** - Designed for integration with Moe/Jason's AI agent API

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML, CSS (8bit style), JavaScript
- **Storage**: In-memory game state
- **AI**: Rule-based bot system

## 📁 Project Structure

```
elevatetm/
├── server.js          # Game server & logic
├── public/
│   ├── index.html     # Main game UI
│   ├── client.js      # Client-side logic
│   └── style.css      # 8bit pixel art styling
├── package.json       # Dependencies
└── README.md          # This file
```

## 🎮 Game Mechanics

- **Round System**: Each round allows 1 bid and 1 action submission
- **Bid System**: Auction-based elevator calling with progressive limits ($5 → $10 → $15...)
- **Action System**: Choose 1 action per round from available actions
- **Round Processing**: Both players' decisions are processed together
- **Elevator Movement**: Step-by-step movement with boarding animations
- **Floor 1 Rule**: First to reach Floor 1 wins
- **Max Rounds**: Game ends after 10 rounds if no winner (closest to Floor 1 wins)

## 🔧 AI Agent Integration

The game is designed to work with an external AI agent API (Moe/Jason's AI agent).

**To enable AI agent**:
1. Set `AI_AGENT_API_URL` environment variable to your AI agent endpoint
2. Uncomment the fetch code in `server.js` `callAIAgent()` function (around line 149)
3. Ensure AI agent returns: `{ bid: number | null, action: string | null }`

**Current status**: Using simple bot logic until AI agent is ready

## 📝 License

MIT