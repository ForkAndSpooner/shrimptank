export async function generatePitch(market, card1, card2, playerName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const businessDesc = `${card1.text} + ${card2.text}`;

  if (!apiKey) return mockPitch(market, card1, card2);

  const prompt = `You are a startup founder who has just drawn two random cards and must pitch a business idea to investors. You GENUINELY BELIEVE this is a billion-dollar idea.

MARKET: ${market}
YOUR TWO CARDS: "${card1.text}" (${card1.type}) and "${card2.text}" (${card2.type})

Your job: Combine these two cards into a business idea that fits the ${market} market. Then deliver a 30-second elevator pitch as if you're on Shark Tank (but it's called Shrimp Tank).

Rules:
- The business MUST incorporate both cards meaningfully
- You MUST name the company (make it a startup-y portmanteau or pun)
- Include a fake but specific valuation ("We're seeking $2.3M for 8% equity")
- Use at least 2 startup buzzwords (disrupt, pivot, synergy, frictionless, scalable, etc.)
- Be earnest — you truly believe in this terrible idea
- Keep it to 4-6 sentences max

Respond in JSON:
{
  "companyName": "the startup name",
  "tagline": "one-line tagline",
  "pitch": "the full elevator pitch"
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content[0].text;
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
