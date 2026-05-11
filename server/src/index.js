import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  createRoom, joinRoom, getRoom, setVotingMode, startGame, dealRound,
  selectCards, setPitch, submitVote, setShrimpVote, revealBuzzWord, publicRoom,
  allVoted, tallyAndFinish, nextRound, removePlayer, renamePlayer, AI_PLAYER
} from "./game.js";
import { generatePitch, generateShrimpVerdict, generateAiOpponentPitch } from "./llm.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Called after either the human or AI stores their pitch in a solo round.
// Idempotent: buzzWordRevealed acts as a "already fired" guard.
function soloGoToVoting(roomCode, round) {
  const r = getRoom(roomCode);
  if (!r || r.round !== round) return;
  if (r.buzzWordRevealed) return; // already fired
  if (!r.players.every(p => r.pitches?.[p.name])) return; // still waiting
  revealBuzzWord(roomCode);
  const room = getRoom(roomCode);
  room.state = "voting";
  io.to(roomCode).emit("pitches-ready", room);
  if (room.votingMode !== "players") {
    generateShrimpVerdict(room.market, room.pitches, room.votingMode, room.buzzWord)
      .then(verdict => {
        setShrimpVote(roomCode, verdict.votedFor, verdict.reasoning);
        io.to(roomCode).emit("results", tallyAndFinish(roomCode));
      })
      .catch(() => {
        const players = Object.keys(room.pitches);
        setShrimpVote(roomCode, players[0], "The Shrimp had technical difficulties. Picking at random.");
        io.to(roomCode).emit("results", tallyAndFinish(roomCode));
      });
  }
}
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "..", "public")));

// Generate a pitch preview (for regenerate/hint flow — doesn't lock in)
app.post("/api/pitch-preview", async (req, res) => {
  const { card1, card2, pitchMode, hint } = req.body;
  if (!card1 || !card2 || !pitchMode) return res.status(400).json({ error: "Missing fields" });
  try {
    // Buzz word is intentionally hidden from players during pitching — pass null.
    const pitch = await generatePitch(null, card1, card2, "preview", null, pitchMode, hint);
    res.json(pitch);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

io.on("connection", (socket) => {
  let currentRoom = null;
  let playerName = null;

  socket.on("create-room", (name, vsAi, sharedHand, cb) => {
    if (typeof vsAi === "function") { cb = vsAi; vsAi = false; sharedHand = false; }
    else if (typeof sharedHand === "function") { cb = sharedHand; sharedHand = false; }
    const room = createRoom(name, vsAi, sharedHand);
    currentRoom = room.code;
    playerName = name;
    socket.join(room.code);
    console.log(`create-room: ${name} -> room ${room.code}`);
    cb({ code: room.code, room });
  });

  socket.on("join-room", (code, name, cb) => {
    const result = joinRoom(code, name);
    if (result.error) return cb({ error: result.error });
    currentRoom = code.toUpperCase();
    playerName = name;
    socket.join(currentRoom);
    io.to(currentRoom).emit("room-updated", result.room);
    cb({ room: result.room });
  });

  // Host updates the judging mode (does not start the game)
  socket.on("set-voting-mode", (mode) => {
    const room = getRoom(currentRoom);
    if (!room || playerName !== room.host) return;
    const updated = setVotingMode(currentRoom, mode);
    if (updated) io.to(currentRoom).emit("room-updated", updated);
  });

  // Host starts the game (uses whatever mode is currently set; default is super-briney)
  socket.on("start-game", () => {
    const room = getRoom(currentRoom);
    if (!room || playerName !== room.host) return;
    const updated = startGame(currentRoom);
    if (updated) io.to(currentRoom).emit("game-started", updated);
  });

  // Host deals a new round
  socket.on("deal-round", (code) => {
    const roomId = currentRoom || (code && code.toUpperCase());
    const room = getRoom(roomId);
    console.log(`deal-round: player=${playerName} currentRoom=${currentRoom} code=${code} host=${room?.host} state=${room?.state}`);
    if (!room || playerName !== room.host) return;
    currentRoom = roomId; // re-anchor if needed
    const updated = dealRound(currentRoom);
    if (!updated) return;
    // Broadcast without the hidden buzz word — players write pitches unaware of it.
    io.to(currentRoom).emit("round-dealt", publicRoom(updated));

    // If vs AI: start generating AI pitch immediately in background. AI is also unaware of the buzz word.
    if (updated.vsAi) {
      const aiPlayer = updated.players.find(p => p.isAi);
      if (aiPlayer) {
        const aiRound = updated.round;
        const aiHand = updated.hands[aiPlayer.name];
        generateAiOpponentPitch(updated.market, aiHand, null).then(({ pitch, selections, pitchMode: aiMode }) => {
          const r = getRoom(currentRoom);
          if (!r || r.round !== aiRound) return; // stale round
          selectCards(currentRoom, aiPlayer.name, [
            aiHand.indexOf(selections[0]),
            aiHand.indexOf(selections[1]),
          ], aiMode);
          setPitch(currentRoom, aiPlayer.name, pitch);
          console.log(`AI pitch ready for round ${aiRound}`);
          soloGoToVoting(currentRoom, aiRound); // fire if human is already done
        }).catch(err => {
          console.error("AI pitch generation failed:", err.message);
          const r = getRoom(currentRoom);
          if (!r || r.round !== aiRound) return;
          const room2 = getRoom(currentRoom);
          if (room2 && room2.state === "pitching") {
            selectCards(currentRoom, aiPlayer.name, [0, 1], "literal");
          }
          setPitch(currentRoom, aiPlayer.name, {
            companyName: "AlgoVentures",
            tagline: "The Algorithm has spoken",
            pitch: `Our platform combines "${aiHand[0].text}" with "${aiHand[1].text}" into one seamless experience. "I didn't know I needed this until I did," says one early adopter. But WAIT — there's more! Just $99/month, or your data back.`,
          });
          console.log(`AI fallback pitch stored for round ${aiRound}`);
          soloGoToVoting(currentRoom, aiRound); // fire if human is already done
        });
      }
    }
  });

  // Player selects 2 cards from their hand
  socket.on("select-cards", async (cardIndices, pitchMode, preGeneratedPitch, cb) => {
    if (typeof pitchMode === "function") { cb = pitchMode; pitchMode = "literal"; preGeneratedPitch = null; }
    else if (typeof preGeneratedPitch === "function") { cb = preGeneratedPitch; preGeneratedPitch = null; }
    const room = getRoom(currentRoom);
    if (!room) return;
    const updated = selectCards(currentRoom, playerName, cardIndices, pitchMode);
    if (!updated) return;

    const lockedInPlayers = Object.keys(updated.selections).filter(n => n !== AI_PLAYER);
    const humanPlayers = updated.players.filter(p => !p.isAi).length;
    io.to(currentRoom).emit("player-selected", {
      playerName,
      lockedInPlayers,
      count: lockedInPlayers.length,
      total: humanPlayers
    });

    // Store the human's pre-generated pitch immediately
    if (preGeneratedPitch) {
      setPitch(currentRoom, playerName, preGeneratedPitch);
    }

    // Once all human players are locked in, transition to voting and reveal the buzz word.
    if (updated.vsAi && lockedInPlayers.length >= humanPlayers) {
      const humanRound = getRoom(currentRoom)?.round;
      // Try immediately (fires if AI is already done); AI will call soloGoToVoting when it finishes.
      soloGoToVoting(currentRoom, humanRound);
      // If AI hasn't finished yet, show the "thinking" indicator and set a hard timeout.
      const r2 = getRoom(currentRoom);
      if (r2 && !r2.buzzWordRevealed) {
        io.to(currentRoom).emit("ai-thinking");
        setTimeout(() => {
          const r3 = getRoom(currentRoom);
          if (!r3 || r3.buzzWordRevealed) return; // already resolved
          console.log("AI hard timeout — forcing soloGoToVoting");
          // Force AI pitch if still missing so soloGoToVoting can fire
          if (!r3.pitches?.[AI_PLAYER]) {
            const aiP = r3.players.find(p => p.isAi);
            if (aiP) {
              const hand = r3.hands[aiP.name] || [];
              setPitch(currentRoom, aiP.name, {
                companyName: "AlgoVentures",
                tagline: "The Algorithm has spoken",
                pitch: `Our platform combines "${hand[0]?.text || "ideas"}" with "${hand[1]?.text || "innovation"}". But WAIT — there's more! Just $99/month.`,
              });
            }
          }
          soloGoToVoting(currentRoom, humanRound);
        }, 20000);
      }
    } else if (!updated.vsAi && lockedInPlayers.length >= humanPlayers) {
      // Multiplayer: pitches are pre-generated client-side; just reveal buzz word and move on.
      revealBuzzWord(currentRoom);
      io.to(currentRoom).emit("pitches-ready", getRoom(currentRoom));
    }

    if (cb) cb({ ok: true });
  });

  // Player votes (player voting mode)
  socket.on("vote", (votedFor) => {
    const room = getRoom(currentRoom);
    if (!room || room.votingMode !== "players") return;
    if (votedFor === playerName) return; // can't vote for yourself
    submitVote(currentRoom, playerName, votedFor);
    io.to(currentRoom).emit("vote-cast", {
      voter: playerName,
      voters: Object.keys(room.votes),
      count: Object.keys(room.votes).length,
      total: room.players.length
    });

    if (allVoted(currentRoom)) {
      const final = tallyAndFinish(currentRoom);
      io.to(currentRoom).emit("results", final);
    }
  });

  // Host requests shrimp verdict
  socket.on("request-shrimp-verdict", async () => {
    const room = getRoom(currentRoom);
    if (!room || playerName !== room.host) return;
    if (!["friends-family", "venture-capital", "super-briney"].includes(room.votingMode)) return;
    io.to(currentRoom).emit("shrimp-thinking");
    try {
      const verdict = await generateShrimpVerdict(room.market, room.pitches, room.votingMode, room.buzzWord);
      setShrimpVote(currentRoom, verdict.votedFor, verdict.reasoning);
      const final = tallyAndFinish(currentRoom);
      io.to(currentRoom).emit("results", final);
    } catch (e) {
      console.error("Verdict handler error:", e.message);
      const players = Object.keys(room.pitches);
      const fallback = players[Math.floor(Math.random() * players.length)];
      setShrimpVote(currentRoom, fallback, "The Shrimp had technical difficulties. Picking at random.");
      const final = tallyAndFinish(currentRoom);
      io.to(currentRoom).emit("results", final);
    }
  });

  socket.on("rename-player", (newName, cb) => {
    if (!currentRoom || !playerName) return cb && cb({ error: "Not in a room" });
    const result = renamePlayer(currentRoom, playerName, newName.trim());
    if (result.error) return cb && cb({ error: result.error });
    playerName = newName.trim();
    io.to(currentRoom).emit("room-updated", result.room);
    if (cb) cb({ ok: true });
  });

  socket.on("next-round", () => {
    const room = getRoom(currentRoom);
    if (!room || playerName !== room.host) return;
    const updated = nextRound(currentRoom);
    if (updated) io.to(currentRoom).emit("room-updated", updated);
  });

  socket.on("disconnect", () => {
    if (currentRoom && playerName) {
      const room = removePlayer(currentRoom, playerName);
      if (room) io.to(currentRoom).emit("room-updated", room);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Shrimp Tank server running on port ${PORT}`));
