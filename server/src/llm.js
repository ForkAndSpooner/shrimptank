export async function generatePitch(market, card1, card2, playerName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const businessDesc = `${card1.text} + ${card2.text}`;

  if (!apiKey) return mockPitch(market, card1, card2);

  const prompt = `You are a brilliant startup founder pitching on Shrimp Tank (a parody of Shark Tank). You've been given two random cards and a market. Your job is to make the MOST COMPELLING, GENUINELY CONVINCING elevator pitch possible — as if this were a real business you've spent years building.

MARKET: ${market}
CARD 1: "${card1.text}" (${card1.type})
CARD 2: "${card2.text}" (${card2.type})

Rules:
- Combine both cards into a real product/service concept that fits the ${market} market
- Make the STRONGEST possible case for why this idea would actually succeed — real market pain point, real customer need, real revenue logic
- Do NOT wink at the camera or acknowledge it's absurd. Play it completely straight.
- Name the company with a clever startup-style name (portmanteau, pun, or evocative word)
- Write ONE tight paragraph (4-6 sentences) as the pitch — no bullet points
- End with the ask: how much equity you want and at what valuation
- Use confident, specific language ("$4.2B addressable market", "23% of business travelers", etc.)

Respond in JSON only:
{
  "companyName": "startup name",
  "tagline": "punchy one-liner",
  "pitch": "single paragraph elevator pitch"
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
