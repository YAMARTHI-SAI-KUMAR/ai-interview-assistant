// src/utils/aiApi.js
//
// How to configure (choose ONE):
//  A) Quick demo (NOT for production): put your key in .env.local
//       REACT_APP_OPENAI_API_KEY=sk-... (exposed to the browser)
//  B) Recommended: host a tiny serverless proxy and point to it
//       REACT_APP_AI_BACKEND=/api/ai   (proxy will call the model with a SECRET key)
//
// For OpenAI models, defaults to: gpt-4o-mini
// You can change with: REACT_APP_OPENAI_MODEL_Q and REACT_APP_OPENAI_MODEL_SCORE

const CFG = {
  provider: (process.env.REACT_APP_AI_PROVIDER || "openai").toLowerCase(),
  openai: {
    key: process.env.REACT_APP_OPENAI_API_KEY || "",
    baseUrl: process.env.REACT_APP_OPENAI_BASE_URL || "https://api.openai.com/v1",
    modelQ: process.env.REACT_APP_OPENAI_MODEL_Q || "gpt-4o-mini",
    modelScore: process.env.REACT_APP_OPENAI_MODEL_SCORE || "gpt-4o-mini",
  },
  backendEndpoint: process.env.REACT_APP_AI_BACKEND || "", // e.g. "/api/ai"
};

function truncate(str, max = 1400) {
  const s = String(str || "");
  return s.length > max ? s.slice(0, max) : s;
}

// --- Local per-browser history to reduce overlap across candidates ---
const HIST_KEY = "aimock_ai_hist_v1"; // {Easy: string[], Medium: string[], Hard: string[]}
function loadHist() {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === "object"
      ? { Easy: obj.Easy || [], Medium: obj.Medium || [], Hard: obj.Hard || [] }
      : { Easy: [], Medium: [], Hard: [] };
  } catch {
    return { Easy: [], Medium: [], Hard: [] };
  }
}
function saveHist(hist) {
  try { localStorage.setItem(HIST_KEY, JSON.stringify(hist)); } catch {}
}

// --- Core: ask the AI to generate 6 unique questions (2/2/2) ---
export async function aiGenerateInterviewQuestions({ candidate, historyLimit = 30 }) {
  const hist = loadHist();
  const exclude = {
    Easy: hist.Easy,
    Medium: hist.Medium,
    Hard: hist.Hard,
  };

  const sys = [
    "You are a senior interviewer for a FULL STACK (React + Node.js) role.",
    "Generate 6 UNIQUE questions: 2 Easy, 2 Medium, 2 Hard.",
    "Focus on React, JavaScript/TypeScript, Node/Express, REST, auth, testing, scaling.",
    "No duplicates. Avoid reusing any prompt text in the provided EXCLUDE lists.",
    "Return STRICT JSON with this shape:",
    `{
      "questions": [
        {"difficulty":"Easy|Medium|Hard","prompt":"...", "keywords":["k1","k2","k3","k4","k5"]},
        ...
      ]
    }`,
    "Rules: 5-8 keywords per question. No code fences. No explanations.",
  ].join("\n");

  const user = [
    "CANDIDATE CONTEXT (truncated):",
    truncate(candidate?.rawText || `${candidate?.name || ""} ${candidate?.email || ""}`),
    "",
    "EXCLUDE (recently used prompts in this browser):",
    JSON.stringify(exclude, null, 2),
  ].join("\n");

  let body;
  if (CFG.backendEndpoint) {
    // Call your proxy (it should accept {purpose, system, user, model})
    body = await fetch(CFG.backendEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "generate_questions",
        system: sys,
        user,
        model: CFG.openai.modelQ,
        response_format: { type: "json_object" },
      }),
    }).then(r => r.json());
  } else {
    // Direct (browser) call to OpenAI (for demo only)
    if (!CFG.openai.key) throw new Error("No AI configured. Set REACT_APP_AI_BACKEND or REACT_APP_OPENAI_API_KEY.");
    const resp = await fetch(`${CFG.openai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CFG.openai.key}`,
      },
      body: JSON.stringify({
        model: CFG.openai.modelQ,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.6,
        response_format: { type: "json_object" },
      }),
    }).then(r => r.json());
    body = resp;
  }

  // Extract JSON payload
  const content =
    body?.choices?.[0]?.message?.content ||
    body?.message?.content ||
    body?.content ||
    JSON.stringify(body);
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw new Error("AI returned malformed JSON for questions."); }
  const list = Array.isArray(parsed.questions) ? parsed.questions : [];

  // Sanity: coerce & clip shape, dedupe within the 6
  const seen = new Set();
  const normalized = list
    .map((q, i) => ({
      id: `ai-${i}-${Math.floor(Math.random()*1e9)}`,
      difficulty: (q.difficulty || "").match(/hard|medium|easy/i)?.[0]?.replace(/^\w/, c => c.toUpperCase()) || "Easy",
      prompt: String(q.prompt || "").trim(),
      keywords: Array.isArray(q.keywords) ? q.keywords.map(k => String(k).toLowerCase()) : [],
      maxTime: { Easy: 20, Medium: 60, Hard: 120 }[(q.difficulty || "Easy").match(/hard|medium|easy/i)?.[0]?.replace(/^\w/, c => c.toUpperCase()) || "Easy"],
    }))
    .filter(q => q.prompt && !seen.has(q.prompt) && seen.add(q.prompt));

  // Enforce 2/2/2; if the model misbalanced, rebalance by slicing
  const buckets = { Easy: [], Medium: [], Hard: [] };
  for (const q of normalized) buckets[q.difficulty in buckets ? q.difficulty : "Easy"].push(q);

  function take(arr, n) { return arr.slice(0, n); }
  const out = [
    ...take(buckets.Easy, 2),
    ...take(buckets.Medium, 2),
    ...take(buckets.Hard, 2),
  ];
  // If shortage in any bucket, fill from other buckets to keep 6 total
  const flat = [...buckets.Easy.slice(2), ...buckets.Medium.slice(2), ...buckets.Hard.slice(2)];
  while (out.length < 6 && flat.length) out.push(flat.shift());

  // Update local history (reduce overlap across candidates in this browser)
  const newHist = loadHist();
  for (const q of out) {
    const d = q.difficulty;
    newHist[d] = [q.prompt, ...(newHist[d] || [])];
    newHist[d] = Array.from(new Set(newHist[d])).slice(0, historyLimit);
  }
  saveHist(newHist);

  return out;
}

// Optional: LLM scoring (kept separate; you can call this to override keyword scoring)
export async function aiScoreAnswer({ question, answer }) {
  const sys = [
    "You grade software interview answers on a strict 0–10 scale.",
    "Context: FULL STACK (React + Node.js). Be concise and consistent.",
    "Return STRICT JSON {\"score\": number, \"feedback\": \"one short sentence\"}.",
  ].join("\n");
  const user = [
    `Question (difficulty: ${question.difficulty}): ${question.prompt}`,
    `Expected keywords: ${JSON.stringify(question.keywords)}`,
    `Answer: ${String(answer || "").trim() || "(empty)"}`,
  ].join("\n");

  let body;
  if (CFG.backendEndpoint) {
    body = await fetch(CFG.backendEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "score_answer",
        system: sys,
        user,
        model: CFG.openai.modelScore,
        response_format: { type: "json_object" },
      }),
    }).then(r => r.json());
  } else {
    if (!CFG.openai.key) throw new Error("No AI configured. Set REACT_APP_AI_BACKEND or REACT_APP_OPENAI_API_KEY.");
    const resp = await fetch(`${CFG.openai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CFG.openai.key}`,
      },
      body: JSON.stringify({
        model: CFG.openai.modelScore,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    }).then(r => r.json());
    body = resp;
  }

  const content =
    body?.choices?.[0]?.message?.content ||
    body?.message?.content ||
    body?.content ||
    JSON.stringify(body);
  let parsed;
  try { parsed = JSON.parse(content); } catch { return { score: null, feedback: "" }; }
  const n = Number(parsed.score);
  return { score: Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : null, feedback: String(parsed.feedback || "") };
}
