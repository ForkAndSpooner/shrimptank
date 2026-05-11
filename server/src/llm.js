export async function generatePitch(market, card1, card2, playerName, buzzWord = null) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return mockPitch(card1, card2, buzzWord);

  const prompt = `You are pitching on Shrimp Tank. Deliver with complete conviction, zero irony. You are the straight man.

CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})
BUZZ WORD: "${buzzWord}"

Your product literally combines both cards, and "${buzzWord}" is the core technology or angle that makes it work. You decide who the customer is — pick whoever makes the most logical (or delightfully absurd) sense given the combination.

Write 2-3 sentences:
- Sentence 1: Name the company, state exactly what the product is, and who it's for
- Sentence 2: The obvious problem it solves and why "${buzzWord}" is the only logical solution
- Sentence 3: One confident market size claim + your ask (dollar amount + equity %)

Rules:
- Never acknowledge the idea is unusual. This is completely normal.
- The tagline should literally describe what the product is in 6 words or fewer.
- No bullet points. One tight paragraph.

Respond in JSON only:
{
  "companyName": "clever startup name",
  "tagline": "literal product description, 6 words max",
  "pitch": "2-3 sentence paragraph"
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-5-20250929", max_tokens: 512, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (!text) { console.error("Pitch API error:", data); return mockPitch(market, card1, card2, buzzWord); }
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    console.error("Claude pitch error:", e.message);
  }
  return mockPitch(market, card1, card2, buzzWord);
}

export async function generateShrimpVerdict(market, pitches, mode) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return mockVerdict(pitches);

  const modeInstructions = {
    "friends-family": "You are an enthusiastic, easily-impressed friend or family member who thinks every idea is amazing. You pick the one that made you laugh the most or that you'd actually want to use.",
    "venture-capital": "You are a serious, analytical VC. Evaluate each pitch on market size, defensibility, unit economics, and founder-market fit. Be professional and specific.",
    "evil-tech-bro": "You are a brutally sarcastic, condescending tech investor — think Gordon Ramsay meets a Silicon Valley villain. Roast every pitch mercilessly with specific jabs, then reluctantly pick one and explain why it's the least terrible.",
  };

  const prompt = `${modeInstructions[mode]}

THE PITCHES:
${Object.entries(pitches).map(([player, p]) => `${player} — ${p.companyName} ("${p.tagline}")\n"${p.pitch}"`).join("\n\n")}

Pick ONE winner. Respond in JSON only:
{
  "votedFor": "exact player name",
  "reasoning": "2-3 sentences in character"
}`;

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
    if (!text) { console.error("Verdict API error:", data); return mockVerdict(pitches); }
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    console.error("Claude verdict error:", e.message);
  }
  return mockVerdict(pitches);
}

export async function generateAiOpponentPitch(market, hand, buzzWord = null) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const handDesc = hand.map((c, i) => `${i}: "${c.text}" (${c.type})`).join(", ");

  let card1 = hand[0], card2 = hand[1];

  if (apiKey) {
    try {
      const selectPrompt = `You are playing Shrimp Tank. Market: ${market}. Your hand: [${handDesc}]. Pick the 2 card indices that would make the most absurd-yet-earnest business combination for this market. Respond with JSON only: {"indices": [i, j]}`;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5-20250929", max_tokens: 50, messages: [{ role: "user", content: selectPrompt }] }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text;
      const m = text?.match(/\{[\s\S]*\}/);
      if (m) {
        const { indices } = JSON.parse(m[0]);
        card1 = hand[indices[0]] || hand[0];
        card2 = hand[indices[1]] || hand[1];
      }
    } catch (e) { /* use fallback */ }
  }

  const pitch = await generatePitch(market, card1, card2, "🤖 The Algorithm", buzzWord);
  return { pitch, selections: [card1, card2] };
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
    reasoning: "This pitch showed the most promise. I'm in.",
  };
}
