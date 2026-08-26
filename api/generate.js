// POST /api/generate
// Body: { fileUrl, contentType, channel, context }
// Fetches the clip from its public URL, transcribes it with Gemini, then writes TBMC social copy
// with Claude. Returns { x, linkedin, pull_quotes, approval, notes, transcript }.
//
// FAST-PATH NOTE (deferred edge cases): does the whole thing in one request and passes the clip to
// Gemini inline. Simple, works for reasonably short clips. Very long videos can exceed the function's
// time/size limits — a known deferred limitation (see README).

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { HOUSE } from "../lib/houseRules.js";

export const config = { runtime: "nodejs", maxDuration: 300 };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

// only allow reading back from our known demo bucket, so this can't be pointed at arbitrary URLs
const BUCKET_BASE = "https://storage.googleapis.com/tbmc-hackathon-082026-anna/";

const TRANSCRIBE_PROMPT = `Transcribe this clip for a social team. Return exactly three labeled sections:
TRANSCRIPT:
<verbatim transcript>
SPEAKERS:
<who is speaking if identifiable, else "unclear">
VISUAL_NOTES:
<for video, a couple of short notes on anything on screen a post might reference; for audio, "none">`;

function parseSections(text) {
  const grab = (label, next) => {
    const re = new RegExp(label + ":\\s*([\\s\\S]*?)(?=" + next + ":|$)", "i");
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };
  return {
    transcript: grab("TRANSCRIPT", "SPEAKERS") || text.trim(),
    speakers: grab("SPEAKERS", "VISUAL_NOTES"),
    visualNotes: grab("VISUAL_NOTES", "\\$end")
  };
}

function cleanJson(t) {
  return t.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const { fileUrl, contentType, channel = "both", context = "" } = req.body || {};
    if (!fileUrl) { res.status(400).json({ error: "Missing fileUrl." }); return; }
    if (!fileUrl.startsWith(BUCKET_BASE)) {
      res.status(400).json({ error: "fileUrl must be in the demo bucket." });
      return;
    }

    // 1) fetch the clip bytes from the public URL
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) { res.status(422).json({ error: "Could not read the uploaded clip." }); return; }
    const buf = Buffer.from(await fileRes.arrayBuffer());
    const base64 = buf.toString("base64");

    // 2) transcribe with Gemini (inline data)
    const gem = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: contentType || "video/mp4", data: base64 } },
          { text: TRANSCRIBE_PROMPT }
        ]
      }]
    });
    const { transcript, speakers, visualNotes } = parseSections(gem.text || "");
    if (!transcript) { res.status(422).json({ error: "Could not transcribe the clip." }); return; }

    // 3) write copy with Claude
    const wantX = channel === "x" || channel === "both";
    const wantLI = channel === "linkedin" || channel === "both";
    const system = HOUSE + `

You are TBMC's social editor. Draft social copy from the clip transcript below.
Use only what is actually said or shown. Do not invent facts or partner claims.
${wantX ? "" : "Do NOT produce X copy."} ${wantLI ? "" : "Do NOT produce LinkedIn copy."}
Offer a few distinct options per requested channel. Respond ONLY with JSON, no fences:
{ "x": [${wantX ? '"post"' : ""}], "linkedin": [${wantLI ? '"post"' : ""}],
  "pull_quotes": ["short quotable line from the clip"],
  "approval": "empty, or one sentence if this needs sign-off",
  "notes": "one short line on the angle or anything to verify" }`;
    const user = `CONTEXT: ${context || "(none)"}
SPEAKERS: ${speakers || "(unclear)"}
VISUAL NOTES: ${visualNotes || "(none)"}
TRANSCRIPT:
${transcript}`;

    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL, max_tokens: 3500, system,
      messages: [{ role: "user", content: user }]
    });
    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const copy = JSON.parse(cleanJson(text));

    res.status(200).json({ ...copy, transcript });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Something went wrong." });
  }
}
