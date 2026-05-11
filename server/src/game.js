import { nanoid } from "nanoid";
import { markets, objects, actions, services, buzzWords } from "./data/cards.js";

const rooms = new Map();

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawCards(n) {
  const objDeck = shuffle(objects.map(c => ({ text: c, type: "object" })));
  const actDeck = shuffle(actions.map(c => ({ text: c, type: "action" })));
  const svcDeck = shuffle(services.map(c => ({ text: c, type: "service" })));
  // Always: 3 objects, 2 services, 2 actions
  return shuffle([
    ...objDeck.slice(0, 3),
    ...svcDeck.slice(0, 2),
    ...actDeck.slice(0, 2),
  ]);
}

export const AI_PLAYER = "🤖 The Algorithm";

export function createRoom(hostName, vsAi = false, sharedHand = true) {
  const code = generateRoomCode();
  const players = [{ name: hostName }];
  if (vsAi) players.push({ name: AI_PLAYER, isAi: true });
  const room = {
    id: nanoid(),
    code,
    state: "lobby",
    host: hostName,
    players,
    vsAi,
    sharedHand,
    votingMode: "super-briney",
    market: null,
    buzzWord: null,
    hands: {},
    selections: {},
    pitchModes: {},
    pitches: {},
    votes: {},
    shrimpVote: null,
    round: 0,
    scores: {},
  };
  rooms.set(code, room);
  return room;
}

export function joinRoom(code, playerName) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: "Room not found" };
  if (room.state !== "lobby") return { error: "Game already in progress" };
  if (room.players.length >= 8) return { error: "Room is full" };
  if (room.players.find(p => p.name === playerName)) return { error: "Name already taken" };
  room.players.push({ name: playerName });
  return { room };
}

export function getRoom(code) {
  return rooms.get(code.toUpperCase());
}

export function setVotingMode(code, mode) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  room.votingMode = mode;
  return room;
}

export function startGame(code) {
  const room = rooms.get(code.toUpperCase());
  if (!room || room.state !== "lobby") return null;
  room.state = "dealing";
  return room;
}

export function dealRound(code) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  room.round++;
  room.market = null;
  room.hands = {};
  room.selections = {};
  room.pitchModes = {};
  room.pitches = {};
  room.votes = {};
  room.shrimpVote = null;

  // Hidden buzz word for this round. Players don't see it while pitching;
  // it's revealed at judging time and contributes 25% to the judge's decision.
  const bw = buzzWords[Math.floor(Math.random() * buzzWords.length)];
  room.buzzWord = bw.word;
  room.buzzWordDef = bw.def;
  room.buzzWordRevealed = false;

  // Always 7 cards; shared hand means everyone gets the same draw
  const hand = drawCards(7);
  for (const p of room.players) {
    room.hands[p.name] = room.sharedHand ? hand : drawCards(7);
  }

  room.state = "pitching";
  return room;
}

// Returns a copy of the room safe to broadcast while the buzz word is still hidden.
export function publicRoom(room) {
  if (!room) return room;
  if (room.buzzWordRevealed) return room;
  return { ...room, buzzWord: null, buzzWordDef: null };
}

export function revealBuzzWord(code) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  room.buzzWordRevealed = true;
  return room;
}

export function selectCards(code, playerName, cardIndices, pitchMode = "literal") {
  const room = rooms.get(code.toUpperCase());
  if (!room || room.state !== "pitching") return null;
  const hand = room.hands[playerName];
  if (!hand) return null;
  room.selections[playerName] = cardIndices.map(i => hand[i]);
  room.pitchModes = room.pitchModes || {};
  room.pitchModes[playerName] = pitchMode;
  return room;
}

export function setPitch(code, playerName, pitch) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  room.pitches[playerName] = pitch;
  if (Object.keys(room.pitches).length >= room.players.length) {
    room.state = "voting";
  }
  return room;
}

export function submitVote(code, voterName, votedFor) {
  const room = rooms.get(code.toUpperCase());
  if (!room || room.state !== "voting") return null;
  room.votes[voterName] = votedFor;
  return room;
}

export function setShrimpVote(code, votedFor, reasoning) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  room.shrimpVote = { votedFor, reasoning };
  room.state = "results";
  return room;
}

export function allVoted(code) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return false;
  const voters = room.players.filter(p =>
    room.votingMode === "players" ? true : true
  );
  // In player voting mode, everyone votes (can't vote for self)
  // In shrimp mode, no player votes needed
  if (room.votingMode !== "players") return true;
  return room.players.every(p => room.votes[p.name]);
}

export function tallyAndFinish(code) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  // Tally votes
  const tally = {};
  for (const p of room.players) tally[p.name] = 0;
  if (room.votingMode === "players") {
    for (const v of Object.values(room.votes)) tally[v] = (tally[v] || 0) + 1;
  } else if (room.shrimpVote) {
    tally[room.shrimpVote.votedFor] = (tally[room.shrimpVote.votedFor] || 0) + 1;
  }
  const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (winner) room.scores[winner] = (room.scores[winner] || 0) + 1;
  room.tally = tally;
  room.winner = winner;
  room.state = "results";
  return room;
}

export function nextRound(code) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  room.state = "dealing";
  return room;
}

export function renamePlayer(code, oldName, newName) {
  const room = rooms.get(code.toUpperCase());
  if (!room || room.state !== "lobby") return { error: "Can only rename before the game starts" };
  if (room.players.find(p => p.name === newName)) return { error: "Name already taken" };
  const player = room.players.find(p => p.name === oldName);
  if (!player) return { error: "Player not found" };
  player.name = newName;
  if (room.host === oldName) room.host = newName;
  return { room };
}

export function removePlayer(code, playerName) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  room.players = room.players.filter(p => p.name !== playerName);
  if (room.players.length === 0) { rooms.delete(code.toUpperCase()); return null; }
  return room;
}
