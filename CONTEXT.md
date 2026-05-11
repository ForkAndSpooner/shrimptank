# Shrimp Tank — Project Context

## What It Is
A multiplayer party game (like Jackbox.tv) where players pitch absurd business ideas using randomly dealt cards, delivered in infomercial style. An AI judge evaluates the pitches and awards a winner plus a Buzz Card Bonus.

**Live URL:** https://shrimptank-production.up.railway.app  
**GitHub:** https://github.com/ForkAndSpooner/shrimptank  
**Railway Project ID:** ce9520b8-d749-4bd7-ad64-135f86ff976b  
**Railway Service ID (shrimptank):** 4d7461f9-654f-43d0-a9f4-c1e99f970edf  
**Railway Environment ID:** bba6e1c0-8fc6-4aa6-9979-ea3930131f0c  

---

## Tech Stack
- **Backend:** Node.js (ESM), Express, Socket.io, better-sqlite3
- **Frontend:** Single HTML file with DaisyUI (night theme) + Tailwind CDN + Bebas Neue font
- **AI:** Anthropic API — Haiku for pitch generation, Sonnet for judging
- **Hosting:** Railway (auto-deploys from GitHub main branch)
- **No build step** — pure Node.js, Dockerfile builds and runs directly

---

## How the Game Works

### Setup (Host)
1. Host goes to the URL, enters name, optionally checks **Shared Hand** (default on)
2. Host clicks **Start New Game** or **Play vs The Algorithm**
3. Host gets a 4-letter room code to share with friends
4. Host picks a **judging mode** (see below)
5. Host clicks **Deal Cards**

### Each Round
1. A **Buzz Card** is revealed — a tech/culture buzzword (e.g. "Blockchain-based", "Gamified")
   - Definition shown inline; using it earns a **⚡ Buzz Card Bonus point** (optional)
2. Each player sees their **7-card hand** (3 objects + 2 services + 2 actions)
3. Player picks **2 cards** → mode selector appears
4. Player optionally types a **hint** to guide the pitch
5. Player selects an **idea style** (optional) and clicks **⚡ Generate Pitch**
6. Player sees the generated pitch, can **regenerate** with same or different style, or **Lock In**
7. Locking in submits the pitch; in vs-AI mode, judging fires automatically

### Judging
- **Player Vote:** Everyone votes (can't vote for yourself)
- **Friends & Family:** AI picks the funniest/most appealing
- **Venture Capital:** AI scores on customer problem + feasibility + revenue potential (1-10 each)
- **Super Briney:** Impossibly salty AI panel roasts everyone, grudgingly picks one

### Results
- Winner announced + judge's reasoning shown
- **⚡ Buzz Card Bonus** awarded separately if someone integrated the buzz word meaningfully
- Scoreboard tracks wins (🏆) and buzz bonuses (⚡) separately
- Host can start next round or end game

---

## Card System

### Hand Composition (always 7 cards)
- 3 **Object** cards — physical things (rubber duck, trampoline, disco ball, etc.)
- 2 **Service** cards — things you do for people (exorcism, bounty hunting, revenge, etc.)
- 2 **Action** cards — modifiers (heated, inflatable, voice-activated, weaponized, etc.)

**Shared Hand mode (default):** All players get the same 7 cards — more competitive  
**Private Hand mode:** Each player gets their own random 7 cards

### Buzz Cards (28 total)
Each has a word + plain-English definition shown to players. Examples:
- "B-Corp certified" — Legally certified to meet high standards of social and environmental performance
- "Blockchain-based" — Built on a decentralized, tamper-proof digital ledger
- "Gamified" — Uses game mechanics (points, levels, rewards) to drive engagement

---

## Pitch Modes (Idea Style)

All pitches are delivered **infomercial-style** (breathless energy, fake testimonial, "But WAIT — there's more!", ridiculous price). The mode determines what the product IS:

| Mode | What it does |
|------|-------------|
| 🔩 **Literal** | Product IS the exact literal combination of both cards. A stapler + hula hoop = a device that staples paper while spinning around your waist. No reinterpretation. |
| ✨ **Creative** | Invents a new product category inspired by the cards. May reinterpret metaphorically. |
| 🤪 **Unhinged** | Most dangerous/reckless product using the cards literally. Testimonial from a survivor. |

**Important:** Prompts say "pitching a business idea" — NOT "Shrimp Tank" or any game name, because Claude was pattern-matching on "shrimp" and making everything about shrimp.

---

## AI Configuration

**Models:**
- Pitch generation: `claude-haiku-4-5-20251001` (fast, cheap)
- Judging/verdicts: `claude-sonnet-4-5-20250929` (better quality)
- AI card selection: `claude-haiku-4-5-20251001` (50 tokens)

**API Key:** Set as `ANTHROPIC_API_KEY` environment variable in Railway

**Pitch prompt structure:**
```
You are a 3am infomercial host pitching a business idea. Breathless energy, fake urgency.
CARD 1: [card] (type)
CARD 2: [card] (type)  
BUZZ WORD: [buzzword]
[FOUNDER'S NOTE: hint if provided]
[MODE INSTRUCTIONS]
One fake testimonial. End with "But WAIT — there's more!" and a ridiculous price.
STRICT LIMIT: 2 sentences MAX. Under 75 words total.
JSON only: {"companyName":"...","tagline":"...","pitch":"..."}
```

**Verdict prompt** asks judge to pick a winner AND separately award the Buzz Card Bonus to whoever best integrated the buzz word (can be null if nobody did).

---

## vs AI Mode
- AI opponent is called "🤖 The Algorithm"
- AI generates its pitch **at deal time** (background), so by the time the human locks in, the AI pitch is ready
- Locking in automatically triggers judging — no extra button press
- AI randomly picks from: literal, literal, unhinged, creative (weighted toward literal/unhinged for comedy)

---

## File Structure
```
shrimptank/
├── Dockerfile
├── CONTEXT.md (this file)
└── server/
    ├── package.json
    ├── public/
    │   └── index.html          # Entire frontend (DaisyUI + vanilla JS)
    └── src/
        ├── index.js            # Express + Socket.io server, all game event handlers
        ├── game.js             # In-memory room/game state management
        ├── llm.js              # All Claude API calls (pitches, verdicts, AI opponent)
        └── data/
            └── cards.js        # All card decks (objects, actions, services, buzzWords)
```

---

## Deployment
Railway auto-deploys when `main` branch on GitHub is updated. The Dockerfile builds the Node.js app and runs `node src/index.js`.

**To deploy a change:**
1. Edit files in the repo
2. Commit and push to `main`
3. Railway detects the push and rebuilds automatically (~60 seconds)

**Environment variables set in Railway:**
- `ANTHROPIC_API_KEY` — Anthropic API key
- `PORT` — 3001

---

## Known Issues / Design Decisions
- Room state is **in-memory only** — restarting the server kills all active games
- No user accounts or persistent history (planned for future)
- The game name "Shrimp Tank" does NOT appear in any AI prompts (causes shrimp-themed contamination)
- Buzz Card is **optional** — players get a bonus point for using it well, but can ignore it
- Super Briney judging mode tends to produce the funniest results
- Unhinged pitch mode tends to win most often (by design — it's the funniest)

---

## Related Game: Drinktionary
Also built in this project, deployed separately:
- **URL:** https://web-production-7264f.up.railway.app
- **GitHub:** https://github.com/ForkAndSpooner/drinktionary
- **Railway Service ID:** 4c21c610-c0c5-42f2-8e18-346dfb6937c1
- Players write fake Urban Dictionary definitions for real cocktail names
- Claude generates custom achievement awards (Cards Against Humanity / Dungeon Crawler Carl style)
