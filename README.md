# AI Interview Assistant (React + Node/Express)

A timed mock-interview app focused on **React** and **Node/Express**:

- Upload a resume → the app extracts **Name / Email / Phone**.
- Timed Q&A: **6 questions** (2 Easy, 2 Medium, 2 Hard) with auto-submit on timeout.
- Questions are generated dynamically by an LLM, with a local **fallback bank**.
- Answers are scored (LLM scorer with a keyword fallback) and shown in an **Interviewer Dashboard**.
- **Welcome Back**: if you refresh/close during an interview, the timer pauses and you can resume.

---

## Features

- **Resume parsing** (PDF/DOCX): extracts contact details and normalizes tricky formats.
- **Timed interview**: 6 questions → 2×Easy (20s), 2×Medium (60s), 2×Hard (120s).
- **Dynamic questions** from your configured LLM provider (OpenAI, Groq, OpenRouter, Ollama).
- **Local fallback** bank ensures interviews continue even if API calls fail.
- **Auto-submit on timeout**; answers are scored and summarized.
- **Interviewer Dashboard** to review candidates, answers, scores, and completion time.
- **Welcome Back modal** resumes unfinished sessions after refresh/close.
- **Persisted state** via `redux-persist`.


ai-interview-assistant/
├─ public/
├─ server/
│ ├─ index.js # Express API: /api/question, /api/score
│ ├─ .env # local secrets (ignored)
│ └─ .env.example # placeholder for other devs
├─ src/
│ ├─ components/ # Chat, Timer, Uploader, Dashboard, WelcomeBack modal
│ ├─ store/ # Redux slices (interview, candidates)
│ └─ utils/ # resume parser, validators, AI client, fallback engine
└─ package.json


- CRA **dev server** proxies API calls to `http://localhost:8787`.
- Express server exposes `POST /api/question` and `POST /api/score` plus `GET /api/health`.

---

## Quick Start

> **Prereqs:** Node 18+, npm.  
> **Never commit secrets.** Use `server/.env` locally and keep it out of Git.

```bash
# 1) Install deps
npm install

# 2) Configure server/.env (see below)

# 3) Start the API server in one terminal:
npm run server
# → API on http://localhost:8787

# 4) Start the React app in another terminal:
npm start
# → App on http://localhost:3000



Configuration
Server .env

Create server/.env (ignored by git):


LLM_PROVIDER=groq           # openai | groq | openrouter | ollama
LLM_MODEL=llama-3.1-8b-instant

PORT=8787
APP_URL=http://localhost:3000
TRUST_PROXY=1               # 1 hop for CRA proxy

# One of the following keys depending on provider:
GROQ_API_KEY=sk-...
# OPENAI_API_KEY=sk-...
# OPENROUTER_API_KEY=...
# OLLAMA_API_KEY=ollama     # placeholder for Ollama


Keep a committed server/.env.example with placeholders for teammates.

Client env (optional)

CRA proxy handles API calls by default.
If you need to override:

# .env.local (not committed)
REACT_APP_AI_BASE=http://localhost:8787

Available Scripts

Client (CRA):

npm start – runs the React app at http://localhost:3000

npm run build – production build into /build

npm test – CRA test runner

Server:

npm run server – runs Express API at http://localhost:8787


API (server)
GET /api/health

Returns provider, model, and whether a key is present.

POST /api/question

Generate one interview question.

{
  "difficulty": "Easy|Medium|Hard",
  "avoidPrompts": ["...","..."]
}


{
  "id": "q-id",
  "prompt": "How would you ...?",
  "keywords": ["k1","k2","k3"],
  "difficulty": "Medium",
  "maxTime": 60
}

POST /api/score

Score an answer (0–10). Falls back to keyword scoring if API fails.

{
  "prompt": "How would you ...?",
  "answer": "User response",
  "difficulty": "Medium",
  "keywords": ["k1","k2","k3"]
}
{ "score": 7, "feedback": "Covered key ideas concisely." }

Troubleshooting

express-rate-limit warning
→ Add TRUST_PROXY=1 in server/.env.

GitHub push blocked (GH013)
→ You committed .env. Remove it and rotate the leaked key.
Ensure .gitignore has:

.env
.env.*
server/.env
server/.env.*

git config core.autocrlf true
echo * text=auto > .gitattributes


Timer / Welcome Back not showing
Ensure LifecyclePause and WelcomeBackModal components are mounted (they are by default).
State is persisted via redux-persist.


Security Notes

Never commit secrets (.env, API keys).

Rotate any leaked key immediately.

The server sets trust proxy correctly for CRA dev proxy.

Contributing / Git Flow

Branch from main:
git checkout -b feature/<name>

Commit in small chunks with meaningful messages.

Push and open a PR into main.

After merge:
git branch -d feature/<name>

License

This project is for educational/demo purposes.
Add a LICENSE file (e.g. MIT) if you plan to open-source it.


---

Would you like me to also add **badges** (npm, Node version, license, build) and a **demo screenshot** section at the top so it looks polished for recruiters/GitHub?



