export async function generatePitch(market, card1, card2, playerName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const businessDesc = `${card1.text} + ${card2.text}`;

  if (!apiKey) return mockPitch(market, card1, card2);

  const prompt = `You are pitching on Shrimp Tank. You have 30 seconds. Be the straight man — deliver this with complete conviction, zero irony.

MARKET: ${market}
YOUR CARDS: "${card1.text}" + "${card2.text}"

Write a SHORT elevator pitch (3 sentences max) covering:
1. The hook — one sentence that names the product and its core promise
2. The problem + your solution — treat it as blindingly obvious that people need this
3. The opportunity — one vague but confident market claim, then your ask

Rules:
- You live in a world where this product is completely sensible. Never acknowledge it's unusual.
- No bullet points. One tight paragraph.
- Specific ask at the end (dollar amount + equity %)
- Do NOT pad it. Shorter is better. If you can say it in 2 sentences, do that.

Respond in JSON only:
{
  "companyName": "clever startup name",
  "tagline": "5 words or fewer",
  "pitch": "the pitch paragraph"
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

function mockPitch(market, card1, card2) {
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
