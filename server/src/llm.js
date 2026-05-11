// Pitch modes — idea style determines the product, all delivered infomercial-style
const PITCH_PROMPTS = {
  literal: (card1, card2, buzzWord, hint) => `You are a 3am infomercial host pitching on Shrimp Tank. Breathless energy, fake urgency, complete conviction.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"
${hint ? `FOUNDER'S NOTE: "${hint}"` : ""}

LITERAL: Both cards in their most literal real-world sense. A stapler drives metal staples through paper. "${buzzWord}" taken literally. The product IS this exact combination — pitched like it solves humanity's greatest crisis.

Include one fake testimonial. End with "But WAIT — there's more!" and a ridiculous price. Never acknowledge it's unusual.

2-3 sentences. One paragraph.

JSON only: {"companyName":"...","tagline":"literal infomercial hook 6 words max","pitch":"..."}`,

  creative: (card1, card2, buzzWord, hint) => `You are a 3am infomercial host pitching on Shrimp Tank. Breathless energy, fake urgency, complete conviction.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"
${hint ? `FOUNDER'S NOTE: "${hint}"` : ""}

CREATIVE: Interpret the cards to make the most compelling product possible. "${buzzWord}" is the core technology. You decide the customer — then pitch it like it's the most important invention since sliced bread.

Include one fake testimonial. End with "But WAIT — there's more!" and a ridiculous price. Never acknowledge it's unusual.

2-3 sentences. One paragraph.

JSON only: {"companyName":"...","tagline":"infomercial hook 6 words max","pitch":"..."}`,

  unhinged: (card1, card2, buzzWord, hint) => `You are a 3am infomercial host pitching on Shrimp Tank. You have no regard for safety or human wellbeing. Breathless energy, complete conviction.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"
${hint ? `FOUNDER'S NOTE: "${hint}"` : ""}

UNHINGED: The most dangerous, reckless, or legally questionable product using these cards literally. "${buzzWord}" amplifies the danger. Pitch it like it's obviously a great idea despite the obvious risks.

Include one fake testimonial from someone who survived using it. End with "But WAIT — there's more!" and a price that doesn't reflect the liability. Completely straight-faced.

2-3 sentences. One paragraph.

JSON only: {"companyName":"...","tagline":"alarming infomercial hook 6 words max","pitch":"..."}`,
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

export async function generateShrimpVerdict(market, pitches, mode) {
  const modeInstructions = {
    "friends-family": "You are an enthusiastic, easily-impressed friend or family member. Pick the one that made you laugh the most or that you'd actually want to use.",
    "venture-capital": `You are a serious VC. Score each pitch on three criteria (1-10 each):
- Customer problem: Does it solve a real, significant problem?
- Feasibility: Could this actually be built and delivered?
- Revenue potential: Is there a credible path to making money?
Show the scores, then pick the winner based on total score.`,
    "super-briney": "You are the Super Briney panel — impossibly salty shrimp investors. Interrupt mid-pitch, question their intelligence, make cutting personal remarks. Roast each pitch with specific cruelty, then grudgingly pick one and make them feel terrible about winning.",
  };

  const prompt = `${modeInstructions[mode] || modeInstructions["venture-capital"]}

THE PITCHES:
${Object.entries(pitches).map(([player, p]) => `${player} — ${p.companyName} ("${p.tagline}")\n"${p.pitch}"`).join("\n\n")}

Pick ONE winner. JSON only: {"votedFor":"exact player name","reasoning":"2-3 sentences in character"}`;

  const result = await callClaude(prompt, 512, "claude-sonnet-4-5-20250929");
  return result || mockVerdict(pitches);
}

export async function generateAiOpponentPitch(market, hand, buzzWord) {
  const handDesc = hand.map((c, i) => `${i}: "${c.text}" (${c.type})`).join(", ");
  const selectResult = await callClaude(
    `Shrimp Tank. Buzz: "${buzzWord}". Hand: [${handDesc}]. Pick 2 indices for the most absurd-yet-earnest combo. JSON only: {"indices":[i,j]}`,
    50
  );
  const card1 = selectResult ? (hand[selectResult.indices?.[0]] || hand[0]) : hand[0];
  const card2 = selectResult ? (hand[selectResult.indices?.[1]] || hand[1]) : hand[1];

  const aiModes = ["literal", "literal", "unhinged", "creative"];
  const aiMode = aiModes[Math.floor(Math.random() * aiModes.length)];

  const pitch = await generatePitch(market, card1, card2, "🤖 The Algorithm", buzzWord, aiMode);
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
