const PITCH_PROMPTS = {
  literal: (card1, card2, buzzWord) => `You are pitching on Shrimp Tank. Complete conviction, zero irony. You are the straight man.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"

LITERAL MODE: Use every card in its most literal, real-world sense. No metaphors, no reinterpretation. A stapler drives metal staples through paper. A hula hoop is a plastic ring you spin around your waist. "${buzzWord}" is also taken literally. The product IS the absurd literal combination of these things.

Write 2-3 sentences: name the company + what it literally is, the obvious problem it solves, market size + ask. Never acknowledge it's unusual. One paragraph, no bullets.

JSON only: {"companyName":"...","tagline":"literal description 6 words max","pitch":"..."}`,

  creative: (card1, card2, buzzWord) => `You are pitching on Shrimp Tank. Complete conviction, zero irony. You are the straight man.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"

CREATIVE MODE: Interpret the cards however makes the most compelling product. Use "${buzzWord}" as the core technology. You decide who the customer is.

Write 2-3 sentences: name + product, problem + why this is the only solution, market size + ask. Never acknowledge it's unusual. One paragraph, no bullets.

JSON only: {"companyName":"...","tagline":"product description 6 words max","pitch":"..."}`,

  unhinged: (card1, card2, buzzWord) => `You are pitching on Shrimp Tank. Complete conviction, zero irony. You are the straight man — but you have absolutely no regard for safety, common sense, or human wellbeing.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"

UNHINGED MODE: Create a business that uses these cards literally but that no sane person would want. Ignore safety, ethics, and practicality entirely. The more alarming the better. Pitch it with complete earnestness as if it's obviously a great idea. "${buzzWord}" makes it worse.

Write 2-3 sentences: name + what it is, why people obviously need this despite the obvious dangers, market size + ask. Completely straight-faced. One paragraph, no bullets.

JSON only: {"companyName":"...","tagline":"alarming literal description 6 words max","pitch":"..."}`,

  infomercial: (card1, card2, buzzWord) => `You are pitching on Shrimp Tank — but you're doing it like a 3am infomercial host. Breathless energy, fake urgency, testimonials, and a price that ends in .99.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"

INFOMERCIAL MODE: Combine the cards into a product nobody needs, pitched like it solves the biggest problem in human history. Include at least one fake testimonial. End with "But WAIT — there's more!" and a ridiculous price. "${buzzWord}" is mentioned as if it explains everything.

Write 2-3 sentences in infomercial style. One paragraph, no bullets.

JSON only: {"companyName":"...","tagline":"infomercial hook 6 words max","pitch":"..."}`,

  siliconvalley: (card1, card2, buzzWord) => `You are pitching on Shrimp Tank. You went to Stanford. You've raised $40M before having a single user. You use the word "disrupt" unironically.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"

SILICON VALLEY BRO MODE: Combine the cards into a startup that disrupts something that doesn't need disrupting. "${buzzWord}" is your entire moat. You have no revenue model but a $2B valuation. Name-drop YC, a16z, or Sequoia. The product is technically a combination of the cards but described in the most abstract, jargon-heavy way possible.

Write 2-3 sentences. One paragraph, no bullets.

JSON only: {"companyName":"...","tagline":"jargon-filled non-description 6 words max","pitch":"..."}`,

  government: (card1, card2, buzzWord) => `You are pitching on Shrimp Tank — specifically to a federal government procurement committee. You are a defense contractor.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"

GOVERNMENT CONTRACT MODE: Combine the cards into a product for a federal agency. It costs 400x what it should, takes 7 years to deliver, requires 3 separate committees to approve, and the spec document is 4,000 pages. "${buzzWord}" adds $50M to the budget. Use bureaucratic jargon. Reference "national security" at least once.

Write 2-3 sentences. One paragraph, no bullets.

JSON only: {"companyName":"...","tagline":"bureaucratic description 6 words max","pitch":"..."}`,
};

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-5-20250929", max_tokens: 512, messages: [{ role: "user", content: prompt }] }),
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

export async function generatePitch(market, card1, card2, playerName, buzzWord, pitchMode = "literal") {
  const promptFn = PITCH_PROMPTS[pitchMode] || PITCH_PROMPTS.literal;
  const result = await callClaude(promptFn(card1, card2, buzzWord));
  return result || mockPitch(card1, card2, buzzWord);
}

export async function generateShrimpVerdict(market, pitches, mode) {
  const modeInstructions = {
    "friends-family": "You are an enthusiastic, easily-impressed friend or family member. Pick the one that made you laugh the most or that you'd actually want to use.",
    "venture-capital": "You are a serious, analytical VC. Evaluate on market size, defensibility, unit economics, and founder-market fit. Be professional and specific.",
    "evil-tech-bro": "You are a brutally sarcastic, condescending tech investor — Gordon Ramsay meets a Silicon Valley villain. Roast every pitch mercilessly, then reluctantly pick one.",
  };

  const prompt = `${modeInstructions[mode] || modeInstructions["venture-capital"]}

THE PITCHES:
${Object.entries(pitches).map(([player, p]) => `${player} — ${p.companyName} ("${p.tagline}")\n"${p.pitch}"`).join("\n\n")}

Pick ONE winner. JSON only: {"votedFor":"exact player name","reasoning":"2-3 sentences in character"}`;

  const result = await callClaude(prompt);
  return result || mockVerdict(pitches);
}

export async function generateAiOpponentPitch(market, hand, buzzWord, pitchMode = "literal") {
  // AI picks the 2 most comedically promising cards
  const handDesc = hand.map((c, i) => `${i}: "${c.text}" (${c.type})`).join(", ");
  const selectResult = await callClaude(
    `Shrimp Tank. Buzz: "${buzzWord}". Hand: [${handDesc}]. Pick 2 indices for the most absurd-yet-earnest combo. JSON only: {"indices":[i,j]}`
  );
  const card1 = selectResult ? (hand[selectResult.indices?.[0]] || hand[0]) : hand[0];
  const card2 = selectResult ? (hand[selectResult.indices?.[1]] || hand[1]) : hand[1];

  // AI picks a random mode weighted toward unhinged/literal for comedy
  const aiModes = ["literal", "literal", "unhinged", "infomercial", "siliconvalley"];
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
