// Pitch modes — Shark Tank energy with a slight hard-sell edge
const PITCH_PROMPTS = {
  literal: (card1, card2, buzzWord, hint) => `You are a founder pitching on a wacky business pitch show. Confident, direct, slightly over-the-top — like Shark Tank but the ideas are absurd.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
${hint ? `FOUNDER'S NOTE: "${hint}"` : ""}

LITERAL MODE: The product is LITERALLY "${card1.text}" combined with "${card2.text}" — do NOT invent a new product category. A stapler drives metal staples through paper. A hula hoop is a plastic ring you spin around your waist. The product IS this exact physical combination.

Pitch it like you genuinely believe in it. Lead with what the product IS and what it does. Then the problem it solves. End with a confident ask (equity + valuation). No fake testimonials, no "But WAIT".

STRICT LIMIT: 3 sentences MAX. Under 80 words total.

JSON only: {"companyName":"...","tagline":"6 words max","pitch":"..."}`,

  creative: (card1, card2, buzzWord, hint) => `You are a founder pitching on a wacky business pitch show. Confident, direct, slightly over-the-top — like Shark Tank but the ideas are absurd.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
${hint ? `FOUNDER'S NOTE: "${hint}"` : ""}

CREATIVE MODE: Invent a new product category inspired by the cards — reinterpret, combine metaphorically, find an unexpected angle. You decide the customer.

Pitch it like you genuinely believe in it. Lead with what the product IS and what it does. Then the problem it solves. End with a confident ask (equity + valuation). No fake testimonials, no "But WAIT".

STRICT LIMIT: 3 sentences MAX. Under 80 words total.

JSON only: {"companyName":"...","tagline":"6 words max","pitch":"..."}`,

  unhinged: (card1, card2, buzzWord, hint) => `You are a founder pitching on a wacky business pitch show. Confident, direct, completely unaware of the danger — like Shark Tank but the idea is reckless.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
${hint ? `FOUNDER'S NOTE: "${hint}"` : ""}

UNHINGED MODE: The most dangerous, reckless, or legally questionable product using these cards LITERALLY. Pitch it with complete earnestness — you see no problem here.

Lead with what the product IS and what it does. Then why people obviously need it despite the obvious risks. End with a confident ask. No fake testimonials, no "But WAIT".

STRICT LIMIT: 3 sentences MAX. Under 80 words total.

JSON only: {"companyName":"...","tagline":"6 words max","pitch":"..."}`,
};

const ALL_PROMPTS = PITCH_PROMPTS;

async function callClaude(prompt, maxTokens = 512, model = "claude-haiku-4-5-20251001") {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
    clearTimeout(timeout);
    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (!text) { console.error("Claude error:", JSON.stringify(data).slice(0, 200)); return null; }
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    console.error("Claude call error:", e.message);
    return null;
  }
}

export async function generatePitch(market, card1, card2, playerName, buzzWord, pitchMode = "literal", hint = null) {
  const promptFn = ALL_PROMPTS[pitchMode] || ALL_PROMPTS.literal;
  const result = await callClaude(promptFn(card1, card2, buzzWord, hint));
  return result || mockPitch(card1, card2, buzzWord);
}

export async function generateShrimpVerdict(market, pitches, mode, buzzWord) {
  const modeInstructions = {
    "friends-family": "You are an enthusiastic, easily-impressed friend or family member. Pick the one that made you laugh the most or that you'd actually want to use.",
    "venture-capital": `You are a serious VC. Score each pitch on the business idea (1-10 each):
- Customer problem: Does it solve a real, significant problem?
- Feasibility: Could this actually be built and delivered?
- Revenue potential: Is there a credible path to making money?`,
    "super-briney": "You are the Super Briney panel — impossibly salty shrimp investors. Interrupt mid-pitch, question their intelligence, make cutting personal remarks. Roast each pitch with specific cruelty.",
  };

  const prompt = `${modeInstructions[mode] || modeInstructions["venture-capital"]}

THE PITCHES:
${Object.entries(pitches).map(([player, p]) => `${player} — ${p.companyName} ("${p.tagline}")\n"${p.pitch}"`).join("\n\n")}

HIDDEN BUZZ: This round's buzz word was "${buzzWord}". The pitchers did NOT know it. You only just learned it.

JUDGING WEIGHTS:
- 75% — the strength of the business idea (per your persona above).
- 25% — buzz fit: how well the pitch authentically embodies "${buzzWord}", even if the word itself never appears. Penalize forced shoehorning.

In your reasoning (2-3 sentences, in character), you MUST briefly call out the buzz word reveal — name it explicitly and say which pitch fit it best, then close with why your overall pick won on the combined score.

JSON only: {"votedFor":"exact player name","reasoning":"..."}`;

  const result = await callClaude(prompt, 512, "claude-sonnet-4-5-20250929");
  return result || mockVerdict(pitches);
}

export async function generateAiOpponentPitch(market, hand, _buzzWord) {
  const handDesc = hand.map((c, i) => `${i}: "${c.text}" (${c.type})`).join(", ");
  const selectResult = await callClaude(
    `A business idea pitch game. Hand: [${handDesc}]. Pick 2 indices for the most absurd-yet-earnest combo. JSON only: {"indices":[i,j]}`,
    50
  );
  const card1 = selectResult ? (hand[selectResult.indices?.[0]] || hand[0]) : hand[0];
  const card2 = selectResult ? (hand[selectResult.indices?.[1]] || hand[1]) : hand[1];

  const aiModes = ["literal", "literal", "unhinged", "creative"];
  const aiMode = aiModes[Math.floor(Math.random() * aiModes.length)];

  const pitch = await generatePitch(market, card1, card2, "🤖 The Algorithm", null, aiMode);
  return { pitch, selections: [card1, card2], pitchMode: aiMode };
}

function mockPitch(card1, card2, buzzWord) {
  return {
    companyName: `${card1.text.split(" ")[0]}${card2.text.split(" ")[0]}ly`.replace(/\s/g, ""),
    tagline: `${card1.text} meets ${card2.text}`,
    pitch: `We're seeking $1.5M for 10% equity. Our ${buzzWord || "innovative"} platform combines ${card1.text} and ${card2.text} to solve a problem nobody knew they had. The market is $50B and we're positioned to capture 0.1% in year one.`,
  };
}

function mockVerdict(pitches) {
  const players = Object.keys(pitches);
  return {
    votedFor: players[Math.floor(Math.random() * players.length)],
    reasoning: "The Shrimp had technical difficulties. Picking at random.",
  };
}

