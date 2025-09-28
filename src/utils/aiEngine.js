// src/utils/aiEngine.js
// Local fallback question generator (React + Node/Express) and summary helper.
// This is used when your AI endpoint is throttled or offline so interviews
// can proceed without “unavailable question”.

const MAX_TIME = { Easy: 20, Medium: 60, Hard: 120 };
const DIFFS = ["Easy", "Medium", "Hard"];

// ---- Question bank (React + Node focused) ----
const BANK = {
  Easy: [
    {
      id: "react-fc-vs-class",
      prompt: "What is the main difference between a functional component and a class component in React?",
      keywords: ["hooks", "state", "lifecycle", "this", "render"],
    },
    {
      id: "react-state-usestate",
      prompt: "What does React’s useState hook do and when does an update re-render?",
      keywords: ["useState", "state", "rerender", "async", "functional update"],
    },
    {
      id: "express-route-basics",
      prompt: "How do you create a simple GET and POST endpoint in Express?",
      keywords: ["express", "router", "get", "post", "middleware"],
    },
    {
      id: "http-methods",
      prompt: "When would you use GET vs POST vs PUT vs DELETE in a REST API?",
      keywords: ["idempotent", "safe", "create", "update", "delete"],
    },
    {
      id: "react-props-vs-state",
      prompt: "Explain the difference between props and state in React.",
      keywords: ["immutable", "parent", "internal state", "rerender"],
    },
    {
      id: "node-commonjs-esm",
      prompt: "What’s the difference between CommonJS (require) and ES Modules (import) in Node?",
      keywords: ["module", "interop", "type", "package.json"],
    },
  ],
  Medium: [
    {
      id: "react-list-performance",
      prompt: "How would you optimize a large list in React for performance?",
      keywords: ["virtualize", "windowing", "memo", "key", "useCallback"],
    },
    {
      id: "node-mvc-structure",
      prompt: "Describe a typical structure for a Node/Express project (controllers, services, routes, config).",
      keywords: ["controller", "service", "dotenv", "router", "config", "env"],
    },
    {
      id: "auth-middleware",
      prompt: "How do you add authentication middleware to protect Express routes?",
      keywords: ["jwt", "verify", "httpOnly", "header", "middleware"],
    },
    {
      id: "react-context-usecase",
      prompt: "When would you use React Context and how do you avoid unnecessary rerenders?",
      keywords: ["provider", "memo", "selector", "useContext"],
    },
    {
      id: "db-indexing",
      prompt: "When and why do you add indexes to a database table/collection?",
      keywords: ["index", "scan", "selectivity", "query plan"],
    },
    {
      id: "error-handling-express",
      prompt: "How do you centralize error handling in Express and surface useful messages to clients?",
      keywords: ["error middleware", "next", "status code", "logging"],
    },
  ],
  Hard: [
    {
      id: "jwt-refresh-rotation",
      prompt: "Design an authentication flow with JWT access tokens and refresh tokens. Discuss security and rotation.",
      keywords: ["jwt", "refresh", "expiry", "httpOnly", "rotate"],
    },
    {
      id: "react-ssr-hydration",
      prompt: "How would you implement SSR/hydration for a React app and what trade-offs are involved?",
      keywords: ["SSR", "hydrate", "Next.js", "bundle", "SEO"],
    },
    {
      id: "scale-node-react",
      prompt: "Scale a Node/React app to millions of users—what changes at app, infra, and data layers?",
      keywords: ["cache", "queue", "shard", "replica", "load balancer"],
    },
    {
      id: "rate-limiting",
      prompt: "Design a rate‑limiting strategy for your API. Compare token bucket vs windowed counters.",
      keywords: ["redis", "token bucket", "window", "limits", "burst"],
    },
    {
      id: "observability",
      prompt: "How would you add logs, metrics, and tracing to a full‑stack app?",
      keywords: ["trace", "span", "prometheus", "grafana", "ELK"],
    },
    {
      id: "file-uploads",
      prompt: "Design secure, resumable file uploads for large files.",
      keywords: ["multipart", "signed URL", "chunk", "S3", "md5"],
    },
  ],
};

// ---- seeded RNG so the fallback is deterministic per candidate/day ----
function seededRandom(seedStr) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sampleWithoutReplacement(arr, k, rnd) {
  if (k >= arr.length) return shuffle(arr, rnd);
  return shuffle(arr, rnd).slice(0, k);
}

/**
 * generateInterview(candidate, opts)
 * Returns: { questions: Array<{id,prompt,keywords,difficulty,maxTime}> }
 *
 * Options:
 *  - perDiff (default 2) how many per difficulty
 *  - historyLimit (ignored here; kept for API parity)
 *  - daySeed (default today) helps reduce overlap per day
 */
export function generateInterview(candidate, opts = {}) {
  const perDiff = opts.perDiff ?? 2;
  const daySeed = opts.daySeed ?? new Date().toISOString().slice(0, 10);
  const baseSeed = (candidate?.email || candidate?.name || "seed").toLowerCase();
  const rnd = seededRandom(`${baseSeed}|${daySeed}|fallback`);

  const questions = [];

  for (const diff of DIFFS) {
    const chosen = sampleWithoutReplacement(BANK[diff], perDiff, rnd);
    for (const item of chosen) {
      questions.push({
        id: `${item.id}-${Math.floor(rnd() * 1e9)}`,
        difficulty: diff,
        prompt: item.prompt,
        keywords: item.keywords,
        maxTime: MAX_TIME[diff],
      });
    }
  }

  return { questions };
}

/**
 * summarizeCandidate(candidate, answers, questions, plan?)
 * Produces a finalScore and a short text summary for the dashboard.
 */
export function summarizeCandidate(candidate, answers = [], questions = [], plan) {
  const total = answers.reduce((s, a) => s + (a?.score || 0), 0);
  const max = (questions?.length || (plan?.length ?? 0)) * 10 || 60;
  const pct = Math.round((total / max) * 100);

  const strengths = [];
  const areas = [];

  const avg = questions.length ? total / questions.length : 0;
  if (avg >= 8) strengths.push("strong foundational knowledge and practical reasoning");
  else if (avg >= 5) strengths.push("solid understanding of core full‑stack concepts");

  // Hard buckets average (if present)
  const hardScores = answers
    .map((a, i) => ({ a, q: questions[i] }))
    .filter(({ q }) => q && q.difficulty === "Hard")
    .map(({ a }) => a?.score || 0);

  const hardAvg = hardScores.length ? hardScores.reduce((s, x) => s + x, 0) / hardScores.length : 0;
  if (hardAvg < 6) areas.push("advanced systems/scale topics");
  if (answers.some((a) => a?.autoSubmitted)) areas.push("time management under pressure");

  return {
    finalScore: total,
    percentage: pct,
    summary:
      `Overall score: ${total}/${max} (${pct}%). ` +
      (strengths.length ? `Strengths: ${strengths.join(", ")}. ` : "") +
      (areas.length ? `Areas to improve: ${areas.join(", ")}.` : "Good balance across difficulties."),
  };
}
