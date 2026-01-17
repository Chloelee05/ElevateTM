# Elevate™ - Strategic Passenger Collection Game

A round-based web game where you compete against an AI bot powered by GPT-4o-mini. Use your credits strategically to win elevator bids and collect passengers!

## 🎮 Game Overview

- **Goal**: Be the first to collect **20 passengers**!
- **Starting Credits**: $100 (no refills)
- **Players**: You vs 1 AI Bot (GPT-4o-mini powered)
- **Game System**: Round-based bidding + special actions
- **Maintenance Fee**: Recurring costs every 2 rounds (increases over time)
- **Game End**: First to 20 passengers, bankruptcy, or max rounds

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- OpenAI API Key

### Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment:**
```bash
# Create .env file
echo "OPENAI_API_KEY=your_openai_api_key_here" > .env
```

3. **Start both servers (Express + Next.js):**
```bash
npm run all
```

4. **Open your browser:**
```
http://localhost:3000
```

### Available Scripts
| Command | Description |
|---------|-------------|
| `npm run all` | Start both Express (3000) and Next.js (3001) servers |
| `npm run dev` | Start Express server only |
| `npm run next` | Start Next.js API server only |
| `npm start` | Production Express server |

## 🎯 How to Play

1. **Enter nickname** and join the game
2. **Each round:**
   - Submit a **bid** (how much you'll pay for the elevator)
   - Choose a **special action** (optional strategic ability)
   - Click **"CONFIRM & START"** to process the round
3. **Round Analysis**: See detailed breakdown of each round's outcome
4. **Collect Passengers**: Win bids to collect 1-5 passengers per round
5. **Win**: First to 20 passengers wins!

## ⚡ Special Actions

| Action | Cost | Effect |
|--------|------|--------|
| 🎁 **Passenger Bonus** | $2 | +1 extra passenger if you win |
| 🚫 **Crowd Control** | $2 | Opponent's bid effectiveness -50% |
| ⭐ **VIP Call** | $3 | Elevator has guaranteed 4-5 passengers |
| ⚡ **Rush Hour** | $1 | Your bid resolves first (wins ties) |
| 🔄 **Diversion** | $2 | Cancel opponent's action this round |
| 🛡 **Safety Net** | $2 | If you lose, get half the passengers |
| 🎫 **Priority Pass** | $1 | Negates first hostile action against you |
| 👥 **Full Capacity** | $4 | Double passengers on current elevator |
| 💣 **Sabotage** | $3 | If opponent wins, they get -2 passengers |
| 🎲 **Lucky Draw** | $2 | 50% chance to steal 1 passenger |

## 💰 Maintenance Fee System

- **Frequency**: Every 2 rounds
- **Base Cost**: $5 (increases by $5 each interval)
- **Bankruptcy**: Can't afford maintenance = game over
- **Strategy**: Plan your spending to survive maintenance!

| Round | Maintenance Fee |
|-------|-----------------|
| 1-2 | $0 |
| 3-4 | $5 |
| 5-6 | $10 |
| 7-8 | $15 |
| ... | +$5 each |

## 🤖 AI System

### AI Architecture
```
Express Server (3000) → Agent Adapter → Next.js API (3001) → LangChain → GPT-4o-mini
```

### AI Features
- **Bid Decision**: GPT-4o-mini analyzes game history and makes strategic bids
- **Dynamic Personality**: AI adapts based on game state
  - `conservative`: Low credits or early game
  - `aggressive`: Losing or has credit advantage
  - `chaotic`: Winning significantly
  - `neutral`: Default balanced approach
- **Action Selection**: Currently random (bid is AI-powered)

### AI Personality Logic
| Condition | Personality |
|-----------|-------------|
| Credits < $20 | Conservative |
| Losing by 5+ passengers | Aggressive |
| Winning by 5+ passengers | Aggressive/Chaotic |
| Rounds 1-5 | Neutral/Conservative |
| Default | Random selection |

## 📊 Round Analysis & Reports

### Per-Round Analysis
- Win/Loss streaks tracking
- Bid comparison and efficiency
- Action effect breakdown
- AI reasoning display

### Final Game Report
- **Risk Posture**: Aggressive/Balanced/Conservative
- **Capital Efficiency**: Cost per passenger
- **Win Rate**: Round wins percentage
- **Maintenance Costs**: Total fees paid
- **Overall Archetype**: Personality assessment
- **Suggestions**: Improvement tips

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Game Server** | Express.js, Socket.io |
| **AI API** | Next.js 16, TypeScript |
| **AI Engine** | LangChain, OpenAI GPT-4o-mini |
| **Validation** | Zod |
| **Frontend** | HTML, CSS (8bit pixel art), Vanilla JS |
| **State** | In-memory |

## 📁 Project Structure

```
elevatetm/
├── server.js              # Express game server & logic
├── agent-adapter.js       # Bridge between Express and Next.js API
├── game.ts                # Game state & rules (TypeScript)
├── agent_pipeline.ts      # LangChain AI pipeline (TypeScript)
├── app/
│   └── api/
│       └── game/
│           └── route.ts   # Next.js API endpoint
├── public/
│   ├── index.html         # Main game UI
│   ├── details.html       # Game rules detail page
│   ├── client.js          # Client-side game logic
│   └── style.css          # 8bit pixel art styling
├── package.json           # Dependencies & scripts
├── next.config.ts         # Next.js configuration
├── tsconfig.json          # TypeScript configuration
└── .env                   # Environment variables (OPENAI_API_KEY)
```

## 🎮 Game Mechanics

### Bidding System
- Higher bid wins the elevator
- Both players pay their bid regardless of outcome
- Ties resolved by Rush Hour action or random

### Passenger Collection
- Each round: 1-5 random passengers
- VIP Call guarantees 4-5 passengers
- Full Capacity doubles passengers
- Winner collects passengers

### Action Resolution Order
1. Defensive actions (Priority Pass, Safety Net)
2. Offensive actions (Sabotage, Crowd Control)
3. Bid modifications applied
4. Winner determined
5. Passengers awarded

## 🔧 Configuration

### Environment Variables
```env
OPENAI_API_KEY=sk-...     # Required for AI
```

### Server Ports
- Express (Game): `3000`
- Next.js (AI API): `3001`

## 🐛 Troubleshooting

### White Screen After Bid
- Check if Next.js server is running on port 3001
- Verify OPENAI_API_KEY is set in .env

### AI Not Responding
- Ensure both servers are running (`npm run all`)
- Check console for API errors
- Verify OpenAI API key is valid

### Port Already in Use
```bash
# Windows
taskkill /F /IM node.exe

# Mac/Linux
pkill -f node
```

## 📝 API Reference

### POST `/api/game`

| Action | Body | Response |
|--------|------|----------|
| `start` | `{ action: "start" }` | `{ state }` |
| `play` | `{ action: "play", bid: number, state }` | `{ state, result }` |
| `report` | `{ action: "report", state }` | `{ report, state }` |

### Result Object
```json
{
  "winner": "PLAYER" | "AI" | null,
  "player_bid": 10,
  "ai_bid": 8,
  "ai_reasons": ["Strategic bid based on..."],
  "round": 5,
  "game_over": false,
  "game_over_reason": null
}
```

## 📜 License

MIT

---

**Made with ❤️ for strategic elevator battles!** 🛗
