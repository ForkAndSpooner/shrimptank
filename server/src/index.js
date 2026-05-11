import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  createRoom, joinRoom, getRoom, setVotingMode, dealRound,
  selectCards, setPitch, submitVote, setShrimpVote,
  allVoted, tallyAndFinish, nextRound, removePlayer, renamePlayer, AI_PLAYER
} from "./game.js";
import { generatePitch, generateShrimpVerdict, generateAiOpponentPitch } from "./llm.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "..", "public")));

// Generate a pitch preview (for regenerate/hint flow — doesn't lock in)
app.post("/api/pitch-preview", async (req, res) => {
  const { card1, card2, buzzWord, pitchMode, hint } = req.body;
  if (!card1 || !card2 || !buzzWord || !pitchMode) return res.status(400).json({ error: "Missing fields" });
  try {
    const pitch = await generatePitch(null, card1, card2, "preview", buzzWord, pitchMode, hint);
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

  // Host sets voting mode and starts game
  socket.on("set-voting-mode", (mode) => {
    const room = getRoom(currentRoom);
    console.log(`set-voting-mode: player=${playerName} room=${currentRoom} mode=${mode}`);
    if (!room || playerName !== room.host) return;
    const updated = setVotingMode(currentRoom, mode);
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
    io.to(currentRoom).emit("round-dealt", updated);

    // If vs AI: start generating AI pitch immediately in background
    if (updated.vsAi) {
      const aiPlayer = updated.players.find(p => p.isAi);
      if (aiPlayer) {
        generateAiOpponentPitch(updated.market, updated.hands[aiPlayer.name], updated.buzzWord).then(({ pitch, selections, pitchMode: aiMode }) => {
          const r = getRoom(currentRoom);
          if (!r || r.round !== updated.round) return; // stale round
          selectCards(currentRoom, aiPlayer.name, [
            updated.hands[aiPlayer.name].indexOf(selections[0]),
            updated.hands[aiPlayer.name].indexOf(selections[1]),
          ], aiMode);
          setPitch(currentRoom, aiPlayer.name, pitch);
          console.log(`AI pitch ready for round ${updated.round}`);
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

    const humanSelections = Object.keys(updated.selections).filter(n => n !== AI_PLAYER).length;
    const humanPlayers = updated.players.filter(p => !p.isAi).length;
    io.to(currentRoom).emit("player-selected", { playerName, count: humanSelections, total: humanPlayers });

    // Store the human's pre-generated pitch immediately
    if (preGeneratedPitch) {
      setPitch(currentRoom, playerName, preGeneratedPitch);
    }

    // If vs AI: AI pitch was pre-generated at deal time, just check if ready
    if (updated.vsAi && humanSelections >= humanPlayers) {
      const final = getRoom(currentRoom);
      const allReady = final.players.every(p => final.pitches?.[p.name]);
      if (allReady) {
        final.state = "voting";
        io.to(currentRoom).emit("pitches-ready", final);
        if (final.votingMode !== "players") {
          generateShrimpVerdict(final.market, final.pitches, final.votingMode, final.buzzWord).then(verdict => {
            setShrimpVote(currentRoom, verdict.votedFor, verdict.reasoning, verdict.buzzBonus, verdict.buzzBonusReason);
            io.to(currentRoom).emit("results", tallyAndFinish(currentRoom));
          }).catch(() => {
            const players = Object.keys(final.pitches);
            setShrimpVote(currentRoom, players[0], "Technical difficulties.");
            io.to(currentRoom).emit("results", tallyAndFinish(currentRoom));
          });
        }
      } else {
        // AI still generating — wait for it
        io.to(currentRoom).emit("ai-thinking");
        const waitForAi = setInterval(() => {
          const r = getRoom(currentRoom);
          if (!r) { clearInterval(waitForAi); return; }
          if (r.players.every(p => r.pitches?.[p.name])) {
            clearInterval(waitForAi);
            r.state = "voting";
            io.to(currentRoom).emit("pitches-ready", r);
            if (r.votingMode !== "players") {
              generateShrimpVerdict(r.market, r.pitches, r.votingMode, r.buzzWord).then(verdict => {
                setShrimpVote(currentRoom, verdict.votedFor, verdict.reasoning, verdict.buzzBonus, verdict.buzzBonusReason);
                io.to(currentRoom).emit("results", tallyAndFinish(currentRoom));
              }).catch(() => {
                const players = Object.keys(r.pitches);
                setShrimpVote(currentRoom, players[0], "Technical difficulties.");
                io.to(currentRoom).emit("results", tallyAndFinish(currentRoom));
              });
            }
          }
        }, 500);
        // Safety timeout after 20s
        setTimeout(() => clearInterval(waitForAi), 20000);
      }
    } else if (!updated.vsAi && humanSelections >= humanPlayers) {
      // Multiplayer: generate any missing pitches
      io.to(currentRoom).emit("generating-pitches");
      const pitchPromises = updated.players.map(async p => {
        if (updated.pitches?.[p.name]) return { playerName: p.name, pitch: updated.pitches[p.name] };
        const [c1, c2] = updated.selections[p.name] || [];
        if (!c1) return null;
        const pitch = await generatePitch(updated.market, c1, c2, p.name, updated.buzzWord, updated.pitchModes?.[p.name] || "literal");
        return { playerName: p.name, pitch };
      });
      const results = (await Promise.all(pitchPromises)).filter(Boolean);
      for (const { playerName: pn, pitch } of results) setPitch(currentRoom, pn, pitch);
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
    io.to(currentRoom).emit("vote-cast", { count: Object.keys(room.votes).length, total: room.players.length });

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
      setShrimpVote(currentRoom, verdict.votedFor, verdict.reasoning, verdict.buzzBonus, verdict.buzzBonusReason);
      const final = tallyAndFinish(currentRoom);
      io.to(currentRoom).emit("results", final);
    } catch (e) {
      console.error("Verdict handler error:", e.message);
      // Fall back to random pick
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
