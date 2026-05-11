# Shrimp Tank — Project Context

## What it is
Multiplayer party game (Cards Against Humanity + Jackbox style). Players pitch absurd business ideas using random cards; a "Shrimp Tank" judge (AI or players) picks a winner.

**Live URL:** https://shrimptank-production.up.railway.app  
**Repo:** ForkAndSpooner/shrimptank  
**Deploy:** Railway auto-deploys from GitHub main branch. If it doesn't trigger, use Railway API: `serviceInstanceRedeploy` mutation.

---

## Stack
- **Server:** Node.js + Express + Socket.io (ESM modules), `server/src/`
- **Client:** Single-file SPA, `server/public/index.html` (DaisyUI + Tailwind CDN + vanilla JS)
- **AI:** Anthropic API — Haiku for pitch generation, Sonnet for judging
- **State:** In-memory only (no database), rooms Map in `game.js`

---

## Key files
| File | Purpose |
|------|---------|
| `server/src/game.js` | Room state machine — createRoom, dealRound, selectCards, setPitch, etc. |
| `server/src/index.js` | Socket.io event handlers + Express routes |
| `server/src/llm.js` | Anthropic API calls — generatePitch, generateShrimpVerdict, generateAiOpponentPitch |
| `server/src/data/cards.js` | Card decks (objects, actions, services, buzzWords) |
| `server/public/index.html` | Entire frontend |

---

## Game flow
1. **Lobby** → host sets judging mode (default: Super Briney), starts game
2. **Dealing** → server draws 7 cards per player + hidden buzz word
3. **Pitching** → players pick 2 cards, pitch auto-generates via `/api/pitch-preview`, lock in
4. **Voting** → buzz word revealed; Shrimp/VC/Friends judge picks winner (75% pitch quality, 25% buzz fit)
5. **Results** → scores updated, next round or end

**Solo mode:** Human vs "🤖 The Algorithm" (AI player). Skips lobby entirely.

---

## Buzz word mechanic
- Each round has a hidden buzz word (drawn from `buzzWords` in cards.js)
- Players pitch WITHOUT knowing it
- Revealed at judging time
- Judge weights: 75% business idea quality, 25% how well pitch fits the buzz word
- Hidden during pitching via `publicRoom()` helper which strips buzzWord from broadcasts

---

## Judging modes
| Mode | Behavior |
|------|---------|
| `super-briney` | Salty shrimp investors roast pitches |
| `venture-capital` | Serious VC scores customer problem / feasibility / revenue |
| `friends-family` | Easily impressed friend, picks what made them laugh |
| `players` | Human players vote (can't vote for self) |

---

## Known bugs / active work (as of 2026-05-11)

### Solo play hang — PARTIALLY FIXED, needs verification
**Symptom:** Player locks in pitch in solo mode, game hangs on "Pitch locked in! Waiting for The Algorithm..." and never transitions to voting.

**Root causes found and fixed:**
1. `generateAiOpponentPitch` in `llm.js` referenced `buzzWord` (undefined variable — should be `null`) — always threw ReferenceError, AI pitch never stored. **[FIXED: pass `null`]**
2. `soloGoToVoting` helper had no error handling — unhandled exception crashed the Node.js server, Railway returned 502 Bad Gateway. **[FIXED: wrapped in try/catch]**
3. `selectCards` returns null if `room.state !== "pitching"` — if AI pitch was stored fast enough to transition state before human locked in, the human's lock-in was silently dropped. **[FIXED: handler now stores pitch + calls soloGoToVoting even when selectCards returns null]**
4. `getRoom(null)` would crash with TypeError — **[FIXED: null guard added]**

**How `soloGoToVoting` works:** Idempotent helper. Called from BOTH the AI pitch callback (deal-round handler) AND the human's select-cards handler. Fires `pitches-ready` once both pitches exist. Uses `buzzWordRevealed` as "already fired" guard to prevent double-emit.

**If still broken after these fixes:** Check Railway logs. The 502 observed in testing was likely a server crash due to unhandled exception — should be resolved by the try/catch fix.

---

## Recent changes (session 2026-05-11)
- Default pitch style changed from Creative → **Literal**
- `llm.js`: Fixed `buzzWord` → `null` in `generateAiOpponentPitch`
- `index.js`: Replaced polling `waitForAi` interval with idempotent `soloGoToVoting()` function
- `index.js`: `soloGoToVoting` wrapped in try/catch to prevent server crash
- `index.js`: `selectCards` null return now handled gracefully (pitch still stored, soloGoToVoting still called)
- `game.js`: `getRoom()` now guards against null input

---

## Deploy workflow
The GitHub webhook from Railway doesn't always fire on API commits. After pushing to GitHub, trigger a redeploy manually via Railway GraphQL API:

**Endpoint:** `https://backboard.railway.com/graphql/v2`  
**Auth:** `Authorization: Bearer <RAILWAY_TOKEN>`

```graphql
mutation {
  serviceInstanceRedeploy(
    environmentId: "bba6e1c0-8fc6-4aa6-9979-ea3930131f0c"
    serviceId: "4d7461f9-654f-43d0-a9f4-c1e99f970edf"
  )
}
```

Check deployment status:
```graphql
query {
  deployments(first: 1, input: {
    serviceId: "4d7461f9-654f-43d0-a9f4-c1e99f970edf"
    environmentId: "bba6e1c0-8fc6-4aa6-9979-ea3930131f0c"
  }) {
    edges { node { id status createdAt } }
  }
}
```
