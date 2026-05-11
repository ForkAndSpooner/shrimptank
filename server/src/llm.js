export async function generatePitch(market, card1, card2, playerName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const businessDesc = `${card1.text} + ${card2.text}`;

  if (!apiKey) return mockPitch(market, card1, card2);

  const prompt = `You are pitching on Shrimp Tank. Deliver with complete conviction, zero irony. You are the straight man.

MARKET: ${market}
CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})

Your product MUST literally combine both cards — they are not metaphors or inspiration, they are the actual product. The customer is specifically someone in the ${market} context.

Write 2-3 sentences:
- Sentence 1: Name the company and state exactly what the product is (combining both cards)
- Sentence 2: The obvious problem it solves for ${market} customers, and why your solution is the only logical answer
- Sentence 3: One confident market size claim + your ask (dollar amount + equity %)

Rules:
- Never acknowledge the idea is unusual. This is completely normal.
- The tagline should literally describe what the product is, not a marketing slogan.
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
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    console.log("Pitch API response:", JSON.stringify(data).slice(0, 200));
    const text = data.content?.[0]?.text;
    if (!text) { console.error("No text in response:", data); return mockPitch(market, card1, card2); }
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    console.error("No JSON in response:", text);
  } catch (e) {
    console.error("Claude pitch error:", e.message);
  }
  return mockPitch(market, card1, card2);
}

export async function generateShrimpVerdict(market, pitches, mode) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return mockVerdict(pitches);

  const modeInstructions = {
    "serious-shrimp": "You are a serious, analytical VC investor. Evaluate each pitch on market size, feasibility, competitive moat, and revenue potential. Be professional but honest.",
    "silly-shrimp": "You are a chaotic, easily-distracted investor who picks the most absurd and entertaining pitch. You love chaos. The weirder the better.",
    "mean-shrimp": "You are a brutally honest, sarcastic investor in the style of Gordon Ramsay meets Kevin O'Leary. Roast every pitch mercilessly, then reluctantly pick one.",
  };

  const prompt = `${modeInstructions[mode]}

MARKET: ${market}

THE PITCHES:
${Object.entries(pitches).map(([player, p]) => `
${player} — ${p.companyName} ("${p.tagline}")
"${p.pitch}"
`).join("\n")}

Pick ONE winner. Respond in JSON:
{
  "votedFor": "exact player name",
  "reasoning": "2-3 sentences explaining your decision in character"
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });
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

export async function generateAiOpponentPitch(market, hand) {
  // AI picks the 2 most comedically promising cards from its hand
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const handDesc = hand.map((c, i) => `${i}: "${c.text}" (${c.type})`).join(", ");

  let card1 = hand[0], card2 = hand[1]; // fallback

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

  const pitch = await generatePitch(market, card1, card2, "🤖 The Algorithm");
  return { pitch, selections: [card1, card2] };
}

(market, card1, card2) {
  return {
    companyName: `${card1.text.split(" ")[0]}${card2.text.split(" ")[0]}ly`.replace(/\s/g, ""),
    tagline: `Disrupting ${market} with ${card1.text} and ${card2.text}`,
    pitch: `We're seeking $1.5M for 10% equity. Our platform combines ${card1.text} and ${card2.text} to disrupt the ${market} space. The market is $50B and we're positioned to capture 0.1% in year one. We're pre-revenue but post-vision.`,
  };
}

function mockVerdict(pitches) {
  const players = Object.keys(pitches);
  return {
    votedFor: players[Math.floor(Math.random() * players.length)],
    reasoning: "This pitch showed the most promise. I'm in.",
  };
}
