// POST /api/claude — proxy so the desk's AI features work on the deployed site.
// The API key lives in the ANTHROPIC_API_KEY environment variable, never in the browser.

import Anthropic from "@anthropic-ai/sdk";

export const config = { runtime: "nodejs", maxDuration: 60 };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const { system = "", user = "", maxTokens = 1500 } = req.body || {};
    if (!user) { res.status(400).json({ error: "Missing user prompt." }); return; }
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: Math.min(Number(maxTokens) || 1500, 4000),
      system,
      messages: [{ role: "user", content: user }]
    });
    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    res.status(200).json({ text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Claude call failed." });
  }
}
