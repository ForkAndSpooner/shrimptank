import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  createRoom, joinRoom, getRoom, setVotingMode, dealRound,
  selectCards, setPitch, submitVote, setShrimpVote,
  allVoted, tallyAndFinish, nextRound, removePlayer
} from "./game.js";
import { generatePitch, generateShrimpVerdict } from "./llm.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "..", "public")));

io.on("connection", (socket) => {
  let currentRoom = null;
  let playerName = null;

  socket.on("create-room", (name, cb) => {
    const room = createRoom(name);
    currentRoom = room.code;
    playerName = name;
    socket.join(room.code);
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
    if (!room || playerName !== room.host) return;
    const updated = setVotingMode(currentRoom, mode);
    if (updated) io.to(currentRoom).emit("game-started", updated);
  });

  // Host deals a new round
  socket.on("deal-round", () => {
    const room = getRoom(currentRoom);
    if (!room || playerName !== room.host) return;
    const updated = dealRound(currentRoom);
    if (!updated) return;
    // Send each player only their own hand
    for (const p of updated.players) {
      const playerSocket = [...io.sockets.sockets.values()].find(s => {
        // We need to track socket->player mapping; emit to room and let client filter
      });
    }
    // Emit full room state but clients will only show their own hand
    io.to(currentRoom).emit("round-dealt", updated);
  });

  // Player selects 2 cards from their hand
  socket.on("select-cards", (cardIndices, cb) => {
    const room = getRoom(currentRoom);
    if (!room) return;
    const updated = selectCards(currentRoom, playerName, cardIndices);
    if (!updated) return;
    io.to(currentRoom).emit("player-selected", { playerName, count: Object.keys(updated.selections).length, total: updated.players.length });

    // When all players have selected, generate pitches
    if (Object.keys(updated.selections).length >= updated.players.length) {
      io.to(currentRoom).emit("generating-pitches");
      const pitchPromises = updated.players.map(p => {
        const [c1, c2] = updated.selections[p.name];
        return generatePitch(updated.market, c1, c2, p.name).then(pitch => ({ playerName: p.name, pitch }));
      });
      Promise.all(pitchPromises).then(results => {
        for (const { playerName: pn, pitch } of results) {
          setPitch(currentRoom, pn, pitch);
        }
        const final = getRoom(currentRoom);
        io.to(currentRoom).emit("pitches-ready", final);
      });
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
  socket.on("request-shrimp-verdict", () => {
    const room = getRoom(currentRoom);
    if (!room || playerName !== room.host) return;
    if (!["serious-shrimp", "silly-shrimp", "mean-shrimp"].includes(room.votingMode)) return;
    io.to(currentRoom).emit("shrimp-thinking");
    generateShrimpVerdict(room.market, room.pitches, room.votingMode).then(verdict => {
      setShrimpVote(currentRoom, verdict.votedFor, verdict.reasoning);
      const final = tallyAndFinish(currentRoom);
      io.to(currentRoom).emit("results", final);
    });
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
