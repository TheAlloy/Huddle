// Vercel serverless function — extracts structured project data from a proposal.
// It runs on the server so the AI key is never exposed to the browser.
// SETUP: in Vercel → Project → Settings → Environment Variables, add
//   ANTHROPIC_API_KEY = sk-ant-...   (from console.anthropic.com)
// then redeploy. You can change the model below if you like.

const MODEL = "claude-sonnet-4-6";

const INSTRUCTIONS = `You are extracting structured data from a creative-studio project proposal.
Return ONLY a JSON object — no prose, no markdown code fences — with exactly these keys:
{
  "client": string|null,        // the client/company the work is for; null if not stated
  "projectName": string|null,   // the project's title/name
  "code": string|null,          // any project/quote reference or code, else null
  "cost": number|null,          // total project value as a plain number, no currency symbol or commas
  "currency": string|null,      // e.g. "GBP", "USD", "EUR", else null
  "phases": [ { "name": string, "days": number } ],
  "confidence": string          // ONE short sentence: how confident you are and what you had to estimate
}
Rules for "phases": list them in delivery order. "days" = estimated WORKING days (Mon-Fri).
If the proposal expresses durations in weeks, multiply by 5. If only an overall timeline is
given, split it sensibly across the phases. If durations are not stated at all, estimate
conservatively based on the scope. "days" must be positive whole numbers.
Never invent a client name — use null if it is not present.`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in this project's Vercel environment variables." }); return; }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { text, pdfBase64 } = body;
    if (!text && !pdfBase64) { res.status(400).json({ error: "Provide a proposal: send 'text' or 'pdfBase64'." }); return; }

    const content = [];
    if (pdfBase64) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } });
    content.push({ type: "text", text: (text ? `Proposal text:\n\n${text}\n\n` : "") + INSTRUCTIONS });

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: "user", content }] }),
    });
    const data = await apiRes.json();
    if (!apiRes.ok) { res.status(502).json({ error: (data && data.error && data.error.message) || "AI service error" }); return; }

    const raw = (data.content || []).map((b) => b.text || "").join("").trim();
    const cleaned = raw.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    let parsed = null;
    try { parsed = JSON.parse(cleaned); }
    catch (_) { const m = cleaned.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch (__) {} } }
    if (!parsed) { res.status(422).json({ error: "The AI replied but the result couldn't be read as data. Try again, or paste the text instead of a PDF.", raw: raw.slice(0, 400) }); return; }

    // normalise
    parsed.phases = Array.isArray(parsed.phases) ? parsed.phases
      .filter((p) => p && p.name)
      .map((p) => ({ name: String(p.name), days: Math.max(1, Math.round(Number(p.days) || 1)) })) : [];
    if (parsed.cost != null) { const n = Number(String(parsed.cost).replace(/[^0-9.]/g, "")); parsed.cost = isFinite(n) ? n : null; }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
