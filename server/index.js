/* server/index.js */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const OpenAI = require("openai");

const app = express();

/* -------------------- trust proxy (FIX) --------------------
   CRA dev server (and many reverse proxies) add X-Forwarded-For.
   express-rate-limit v7 validates this and needs Express trust proxy set.
   Use TRUST_PROXY=1 for CRA (one hop). In prod, set to your proxy hops or 'true'.
---------------------------------------------------------------- */
const tp = (process.env.TRUST_PROXY ?? "1").toString().toLowerCase();
app.set(
  "trust proxy",
  tp === "true" ? true : tp === "false" ? false : Number.isFinite(Number(tp)) ? Number(tp) : 1
);

/* -------------------- security / basics -------------------- */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const allowed = (process.env.APP_URL || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowed.length ? allowed : true }));

app.use(express.json({ limit: "1mb" }));

// Light rate limit for API routes
app.use(
  "/api/",
  rateLimit({
    windowMs: 60_000,
    max: 90,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* -------------------- provider wiring -------------------- */
const PROVIDER = (process.env.LLM_PROVIDER || "groq").toLowerCase();
const MODEL =
  process.env.LLM_MODEL ||
  (PROVIDER === "groq"
    ? "llama-3.1-8b-instant"
    : PROVIDER === "ollama"
    ? "llama3.1:8b"
    : "gpt-4o-mini");

const BASE_URLS = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1", // OpenAI-compatible
  openrouter: "https://openrouter.ai/api/v1", // OpenAI-compatible
  ollama: "http://localhost:11434/v1", // OpenAI-compatible shim
};

const API_KEYS = {
  openai: process.env.OPENAI_API_KEY || "",
  groq: process.env.GROQ_API_KEY || "",
  openrouter: process.env.OPENROUTER_API_KEY || "",
  ollama: process.env.OLLAMA_API_KEY || "ollama",
};

const defaultHeaders =
  PROVIDER === "openrouter"
    ? {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "AI Mock Assistant",
      }
    : undefined;

const client = new OpenAI({
  apiKey: API_KEYS[PROVIDER],
  baseURL: BASE_URLS[PROVIDER],
  defaultHeaders,
  timeout: 20_000, // safety timeout
});

const SUPPORTS_JSON_OBJECT = PROVIDER === "openai" || PROVIDER === "groq";

/* -------------------- helpers -------------------- */
const PORT = Number(process.env.PORT) || 8787;
const MAX_TIME = { Easy: 20, Medium: 60, Hard: 120 };

function jsonSafeParse(s) {
  try {
    return JSON.parse(s);
  } catch {}
  const m = s && s.match(/\{[\s\S]*\}/m);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  return null;
}

const FALLBACK_BANK = {
  Easy: [
    { id: "react-usestate", prompt: "What does React’s useState do and when is state updated?", keywords: ["state","rerender","hook","async","functional"] },
    { id: "express-endpoint", prompt: "How do you create a REST endpoint with Express?", keywords: ["express","route","get","post","middleware"] },
    { id: "http-methods", prompt: "When would you use GET vs POST vs PUT vs DELETE in REST APIs?", keywords: ["idempotent","safe","create","update","delete"] }
  ],
  Medium: [
    { id: "react-list-perf", prompt: "How would you optimize a large React list for performance?", keywords: ["virtualize","windowing","memo","key","useCallback"] },
    { id: "node-mvc", prompt: "Describe how to structure a Node.js project with MVC and environment config.", keywords: ["controller","service","router","dotenv"] },
    { id: "auth-middleware", prompt: "How do you add authentication middleware to Express routes?", keywords: ["jwt","verify","protect","middleware","header"] }
  ],
  Hard: [
    { id: "ssr-hydration", prompt: "How would you implement SSR or hydration for a React app and why?", keywords: ["SSR","hydrate","Next.js","SEO","bundle"] },
    { id: "rate-limits", prompt: "Design a rate‑limiting strategy for a Node/Express API. Discuss algorithms and trade‑offs.", keywords: ["token bucket","leaky bucket","redis","window"] },
    { id: "scale-node-react", prompt: "Scale a Node/React app to a million+ users: what changes at app, infra, and data layers?", keywords: ["cache","queue","shard","replica","load balancer"] }
  ]
};

function pickFallback(difficulty, avoidPrompts = []) {
  const pool = (FALLBACK_BANK[difficulty] || []).filter(q => !avoidPrompts.includes(q.prompt));
  const q = pool[0] || (FALLBACK_BANK[difficulty] || [])[0];
  if (!q) return null;
  return { id: q.id, prompt: q.prompt, keywords: q.keywords, difficulty, maxTime: MAX_TIME[difficulty] };
}

function scoreByKeywords(prompt, answer, keywords = []) {
  const a = String(answer || "").toLowerCase();
  if (!a.trim()) return { score: 0, feedback: "No answer given." };
  const hits = (keywords || []).reduce((n, k) => n + (a.includes(String(k).toLowerCase()) ? 1 : 0), 0);
  const lenBonus = Math.min(2, Math.floor(a.split(/\s+/).length / 40));
  const score = Math.min(10, hits * 2 + lenBonus);
  return { score, feedback: hits ? "Covered some expected points." : "Missed key ideas." };
}

/* -------------------- routes -------------------- */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    provider: PROVIDER,
    model: MODEL,
    baseURL: BASE_URLS[PROVIDER],
    hasKey: !!API_KEYS[PROVIDER],
  });
});

/** Generate ONE interview question (React/Node only) */
app.post("/api/question", async (req, res) => {
  const { difficulty = "Easy", avoidPrompts = [] } = req.body || {};
  try {
    const sys = `
You are a senior interviewer for a FULL‑STACK role focused STRICTLY on React (frontend) and Node.js/Express (backend).
Generate ONE question for the given difficulty.
Rules:
- Topic must be React or Node/Express only (e.g., React hooks/state/effects/context/rendering/performance/SSR; Node HTTP/Express middleware/REST/auth/JWT/streams/perf/scaling/caching).
- Do NOT use or reference any candidate resume or career details.
- Avoid repeating any prompt in the Avoid list.
- Return STRICT JSON ONLY:
  {"id":"...","prompt":"...","keywords":["k1","k2","k3","k4","k5"],"difficulty":"Easy|Medium|Hard"}
- The prompt must be self‑contained and not mention the Avoid list or any user profile.
    `.trim();

    const user = `
Difficulty: ${difficulty}
Avoid (do not repeat):
${avoidPrompts.slice(0, 12).join("\n") || "(none)"}
    `.trim();

    const resp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.6,
      ...(SUPPORTS_JSON_OBJECT ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });

    const text = resp.choices?.[0]?.message?.content || "{}";
    const obj = jsonSafeParse(text) || {};
    const prompt = String(obj.prompt || "").trim();
    if (!prompt) throw new Error("Invalid JSON from provider");

    const diff = ["Easy", "Medium", "Hard"].includes(obj.difficulty) ? obj.difficulty : difficulty;
    return res.json({
      id: (obj.id || prompt.toLowerCase().slice(0, 40).replace(/[^a-z0-9]+/g, "-")).replace(/^-+|-+$/g, ""),
      prompt,
      keywords: Array.isArray(obj.keywords) ? obj.keywords.slice(0, 6).map(String) : [],
      difficulty: diff,
      maxTime: MAX_TIME[diff],
    });
  } catch (err) {
    console.error("AI /question error → using fallback:", err?.message || err);
    const fb = pickFallback(difficulty, avoidPrompts);
    if (fb) return res.json(fb);
    return res.status(500).json({ error: "Question generation failed" });
  }
});

/** Score answer (0–10). Falls back to keyword scoring on provider failure. */
app.post("/api/score", async (req, res) => {
  const { prompt = "", answer = "", difficulty = "Easy", keywords = [] } = req.body || {};
  try {
    const sys = `
You are a strict but fair interviewer. Score 0-10 and give a one-sentence feedback.
Return STRICT JSON: {"score": <number>, "feedback": "<short one sentence>"}.
    `.trim();

    const user = `
Question (difficulty: ${difficulty}): ${prompt}
Expected keywords: ${JSON.stringify(keywords || [])}
Answer: ${answer}
    `.trim();

    const resp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      ...(SUPPORTS_JSON_OBJECT ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });

    const text = resp.choices?.[0]?.message?.content || "{}";
    const obj = jsonSafeParse(text) || {};
    let score = parseInt(obj.score, 10);
    if (!Number.isFinite(score)) score = 0;
    return res.json({ score, feedback: String(obj.feedback || "") });
  } catch (err) {
    console.error("AI /score error → keyword fallback:", err?.message || err);
    const { score, feedback } = scoreByKeywords(prompt, answer, keywords);
    return res.json({ score, feedback });
  }
});

app.listen(PORT, () => {
  console.log(`AI server listening on http://localhost:${PORT}`);
});
