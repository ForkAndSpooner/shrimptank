// Idea generation modes (what the product IS)
const IDEA_PROMPTS = {
  literal: (card1, card2, buzzWord, hint) => `You are pitching on Shrimp Tank. Complete conviction, zero irony.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"
${hint ? `FOUNDER'S NOTE: "${hint}"` : ""}

LITERAL: Both cards in their most literal real-world sense. A stapler drives metal staples through paper. "${buzzWord}" taken literally. The product IS this exact combination.

2-3 sentences: name + what it literally is, problem it solves, market size + ask. Never acknowledge it's unusual. One paragraph.

JSON only: {"companyName":"...","tagline":"literal description 6 words max","pitch":"..."}`,

  creative: (card1, card2, buzzWord, hint) => `You are pitching on Shrimp Tank. Complete conviction, zero irony.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"
${hint ? `FOUNDER'S NOTE: "${hint}"` : ""}

CREATIVE: Interpret the cards to make the most compelling product possible. "${buzzWord}" is the core technology. You decide the customer.

2-3 sentences: name + product, problem + why this is the only solution, market size + ask. Never acknowledge it's unusual. One paragraph.

JSON only: {"companyName":"...","tagline":"product description 6 words max","pitch":"..."}`,

  unhinged: (card1, card2, buzzWord, hint) => `You are pitching on Shrimp Tank. Complete conviction, zero irony. You have no regard for safety or human wellbeing.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"
${hint ? `FOUNDER'S NOTE: "${hint}"` : ""}

UNHINGED: Create the most dangerous, reckless, or legally questionable business possible using these cards literally. Think extreme physical risk, massive liability, regulatory nightmares, or products that could cause genuine harm at scale. "${buzzWord}" amplifies the danger. Pitch it with complete earnestness — you genuinely believe this is a great idea.

2-3 sentences: name + what it dangerously is, why people obviously need this despite the obvious risks, market size + ask. Straight-faced. One paragraph.

JSON only: {"companyName":"...","tagline":"dangerously literal description 6 words max","pitch":"..."}`,
};

// Delivery style modes (HOW it's pitched)
const DELIVERY_PROMPTS = {
  infomercial: (card1, card2, buzzWord, hint) => `You are pitching on Shrimp Tank like a 3am infomercial host. Breathless energy, fake urgency, testimonials, price ending in .99.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"
${hint ? `FOUNDER'S NOTE: "${hint}"` : ""}

Combine the cards into a product nobody needs, pitched like it solves humanity's greatest crisis. One fake testimonial. End with "But WAIT — there's more!" and a ridiculous price. "${buzzWord}" explains everything.

2-3 sentences, infomercial style. One paragraph.

JSON only: {"companyName":"...","tagline":"infomercial hook 6 words max","pitch":"..."}`,

  siliconvalley: (card1, card2, buzzWord, hint) => `You are pitching on Shrimp Tank. Stanford dropout. $40M raised, zero users. "Disrupt" is your favorite word.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"
${hint ? `FOUNDER'S NOTE: "${hint}"` : ""}

Disrupt something that doesn't need disrupting. "${buzzWord}" is your entire moat. $2B valuation, no revenue model. Name-drop YC, a16z, or Sequoia. Describe the product in maximum jargon while technically referencing both cards.

2-3 sentences. One paragraph.

JSON only: {"companyName":"...","tagline":"jargon-filled non-description 6 words max","pitch":"..."}`,

  government: (card1, card2, buzzWord, hint) => `You are pitching on Shrimp Tank to a federal procurement committee. You are a defense contractor.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"
${hint ? `FOUNDER'S NOTE: "${hint}"` : ""}

Product for a federal agency. 400x the reasonable cost, 7 years to deliver, 3 committees to approve, 4,000-page spec. "${buzzWord}" adds $50M to the budget. Maximum bureaucratic jargon. Reference "national security."

2-3 sentences. One paragraph.

JSON only: {"companyName":"...","tagline":"bureaucratic description 6 words max","pitch":"..."}`,
};

const ALL_PROMPTS = { ...IDEA_PROMPTS, ...DELIVERY_PROMPTS };

async function callClaude(prompt, maxTokens = 512) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-5-20250929", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
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

  const result = await callClaude(prompt);
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

  const aiModes = ["literal", "literal", "unhinged", "infomercial", "government", "siliconvalley"];
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
