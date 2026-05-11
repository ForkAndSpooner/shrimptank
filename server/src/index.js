import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  createRoom, joinRoom, getRoom, setVotingMode, dealRound,
  selectCards, setPitch, submitVote, setShrimpVote,
  allVoted, tallyAndFinish, nextRound, removePlayer, AI_PLAYER
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

  socket.on("create-room", (name, vsAi, cb) => {
    if (typeof vsAi === "function") { cb = vsAi; vsAi = false; }
    const room = createRoom(name, vsAi);
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

    // If all humans have selected, generate all pitches (including AI)
    if (humanSelections >= humanPlayers) {
      io.to(currentRoom).emit("generating-pitches");

      const pitchPromises = updated.players.map(async p => {
        if (p.isAi) {
          const { pitch, selections, pitchMode: aiMode } = await generateAiOpponentPitch(updated.market, updated.hands[p.name], updated.buzzWord);
          selectCards(currentRoom, p.name, [
            updated.hands[p.name].indexOf(selections[0]),
            updated.hands[p.name].indexOf(selections[1]),
          ], aiMode);
          return { playerName: p.name, pitch };
        }
        const [c1, c2] = updated.selections[p.name];
        const playerPitchMode = updated.pitchModes?.[p.name] || "literal";
        // Use pre-generated pitch if this is the submitting player and one was provided
        const pitch = (p.name === playerName && preGeneratedPitch)
          ? preGeneratedPitch
          : await generatePitch(updated.market, c1, c2, p.name, updated.buzzWord, playerPitchMode);
        return { playerName: p.name, pitch };
      });

      const results = await Promise.all(pitchPromises);
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
      const verdict = await generateShrimpVerdict(room.market, room.pitches, room.votingMode);
      setShrimpVote(currentRoom, verdict.votedFor, verdict.reasoning);
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
