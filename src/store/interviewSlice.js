// src/store/interviewSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { aiGenerateQuestion, aiScoreAnswer } from "../utils/aiApiClient";
import { generateInterview } from "../utils/aiEngine";

const PLAN = ["Easy", "Easy", "Medium", "Medium", "Hard", "Hard"];
const MAX_TIME = { Easy: 20, Medium: 60, Hard: 120 };

const initialState = {
  status: "idle", // idle | collecting | ready | in_progress | finished
  candidate: { name: "", email: "", phone: "", rawText: "" },
  missing: [],
  chat: [],
  plan: PLAN,
  questions: [],
  currentIndex: -1,
  fetchingQuestion: false,
  usedPrompts: [],

  answers: [],             // { qId, text, score, timeTakenSec, autoSubmitted, feedback? }
  drafts: {},              // { [questionIndex]: text } — saved across refresh
  qStartedAt: null,
  qEndsAt: null,
  createdAt: null,
  finishedAt: null,

  paused: false,
  qRemainingSec: null,     // remaining seconds when paused
  resumePromptNeeded: false,
};

/* ---------- helpers ---------- */

function pickFallbackQuestion(state, idx) {
  const difficulty = state.plan[idx];
  const avoid = new Set(state.usedPrompts || []);
  const g = generateInterview(state.candidate, { perDiff: 6, historyLimit: 0 });
  let q =
    g.questions.find((x) => x.difficulty === difficulty && !avoid.has(x.prompt)) ||
    g.questions.find((x) => x.difficulty === difficulty) ||
    g.questions.find((x) => !avoid.has(x.prompt)) ||
    g.questions[0];
  return q;
}

/* ---------- thunks ---------- */

// Always returns a question (fallback if API fails)
export const fetchAiQuestion = createAsyncThunk(
  "interview/fetchAiQuestion",
  async (_, thunkAPI) => {
    const s = thunkAPI.getState().interview;
    const idx = s.currentIndex;

    try {
      const q = await aiGenerateQuestion({
        difficulty: s.plan[idx],
        avoidPrompts: s.usedPrompts || [],
      });
      return { q, idx };
    } catch {
      const q = pickFallbackQuestion(s, idx);
      return { q, idx };
    }
  }
);

export const scoreLastAnswerAi = createAsyncThunk(
  "interview/scoreLastAnswerAi",
  async (_, thunkAPI) => {
    const s = thunkAPI.getState().interview;
    const i = s.answers.length - 1;
    if (i < 0) return { i, score: 0, feedback: "" };
    const q = s.questions[i];
    const a = s.answers[i];
    if (!q || !a) return { i, score: 0, feedback: "" }; // allow empty auto-submit
    const { score, feedback } = await aiScoreAnswer({
      prompt: q.prompt,
      answer: a.text || "",
      difficulty: q.difficulty,
      keywords: q.keywords || [],
    });
    return { i, score, feedback: feedback || "" };
  }
);

/* ---------- slice ---------- */

const slice = createSlice({
  name: "interview",
  initialState,
  reducers: {
    resetInterview: () => ({ ...initialState }),

    /** Called by LifecyclePause on refresh/close while in_progress */
    pauseForUnload: (state) => {
      if (state.status !== "in_progress") return;

      state.resumePromptNeeded = true;

      const idx = state.currentIndex;
      const q = state.questions[idx];
      const max = q?.maxTime || MAX_TIME[state.plan[idx]] || 60;
      const now = Date.now();

      let remain = max;
      if (state.qEndsAt) {
        remain = Math.ceil((state.qEndsAt - now) / 1000);
      } else if (state.qStartedAt) {
        const elapsed = Math.round((now - state.qStartedAt) / 1000);
        remain = max - elapsed;
      }
      remain = Math.max(1, Math.min(max, remain || max));

      state.qRemainingSec = remain;
      state.paused = true;
      state.qStartedAt = null;
      state.qEndsAt = null;
    },

    /** Resumes timer if we were paused; otherwise just clears the prompt flag */
    resumeAfterWelcome: (state) => {
      state.resumePromptNeeded = false;
      if (!state.paused) return;

      if (state.status !== "in_progress") {
        state.paused = false;
        state.qRemainingSec = null;
        return;
      }

      const idx = state.currentIndex;
      const q = state.questions[idx];
      const max = q?.maxTime || MAX_TIME[state.plan[idx]] || 60;

      let remain = state.qRemainingSec ?? max;
      remain = Math.max(1, Math.min(max, Math.round(remain)));

      state.qStartedAt = Date.now();
      state.qEndsAt = state.qStartedAt + remain * 1000;
      state.paused = false;
      state.qRemainingSec = null;
    },

    setCandidateFromParse: (state, action) => {
      const { name = "", email = "", phone = "", rawText = "", missing = [] } = action.payload || {};
      state.candidate = { name, email, phone, rawText };
      state.missing = [...missing];
      state.status = missing.length ? "collecting" : "ready";

      if (state.chat.length === 0) {
        state.chat.push({
          role: "assistant",
          content: "Hi! I’m your AI interviewer. I’ll need your Name, Email, and Phone before we begin.",
          ts: Date.now(),
        });
      }
      if (state.missing.length) {
        state.chat.push({
          role: "assistant",
          content: `I couldn't find your ${state.missing[0]}. Please provide your ${state.missing[0]}.`,
          ts: Date.now(),
        });
      } else {
        state.chat.push({
          role: "assistant",
          content: 'Great, I have all your details. When you’re ready, say “start” or click "Start Interview".',
          ts: Date.now(),
        });
      }
    },

    applyCandidateEdits: (state, action) => {
      const { name = "", email = "", phone = "" } = action.payload || {};
      state.candidate = { ...state.candidate, name, email, phone };

      const missing = [];
      if (!/^[A-Z][a-zA-Z'’-]*(\s+[A-Z][a-zA-Z'’-]*){1,4}$/.test((name || "").trim())) missing.push("name");
      if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test((email || "").trim())) missing.push("email");
      const digits = (String(phone || "").replace(/[^\d]/g, "") || "");
      if (digits.length < 10 || digits.length > 15) missing.push("phone");

      state.missing = missing;
      if (state.status !== "in_progress" && state.status !== "finished") {
        state.status = missing.length ? "collecting" : "ready";
      }
    },

    submitCollectedField: (state, action) => {
      const { field, value, valid } = action.payload;
      state.chat.push({ role: "user", content: value, ts: Date.now() });

      if (!valid) {
        state.chat.push({
          role: "assistant",
          content: `Hmm, that ${field} doesn’t look valid. Please re-enter a valid ${field}.`,
          ts: Date.now(),
        });
        return;
      }
      state.candidate[field] = value;
      state.missing = state.missing.filter((f) => f !== field);
      if (state.missing.length) {
        state.chat.push({
          role: "assistant",
          content: `Thanks! Now please share your ${state.missing[0]}.`,
          ts: Date.now(),
        });
      } else {
        state.status = "ready";
        state.chat.push({
          role: "assistant",
          content: 'All set. Type “start” or click "Start Interview" to begin.',
          ts: Date.now(),
        });
      }
    },

    handleUserFreeText: (state, action) => {
      const text = (action.payload || "").trim();
      if (!text) return;
      state.chat.push({ role: "user", content: text, ts: Date.now() });

      if (state.status === "ready" && /^start\b/i.test(text)) return;
      if (state.status === "collecting") {
        state.chat.push({
          role: "assistant",
          content: `Please provide your ${state.missing[0] ?? "missing detail"} to continue.`,
          ts: Date.now(),
        });
        return;
      }
      if (state.status !== "in_progress") {
        state.chat.push({
          role: "assistant",
          content: 'Say "start" or click "Start Interview" when you’re ready.',
          ts: Date.now(),
        });
      }
    },

    startInterview: (state) => {
      if (state.status !== "ready") return;
      if (!state.candidate.name || !state.candidate.email || !state.candidate.phone) return;

      state.status = "in_progress";
      state.currentIndex = 0;
      state.questions = [];
      state.answers = [];
      state.drafts = {};
      state.usedPrompts = [];
      state.qStartedAt = null;
      state.qEndsAt = null;
      state.createdAt = Date.now();
      state.paused = false;
      state.qRemainingSec = null;
      state.resumePromptNeeded = false;

      state.chat.push({
        role: "assistant",
        content:
          "Interview started.\n\n" +
          "Pattern: 6 questions → 2 Easy (20s each) → 2 Medium (60s each) → 2 Hard (120s each).\n" +
          "I’ll auto‑submit when time runs out.",
        ts: Date.now(),
      });
    },

    tickIfNeeded: (state) => {
      if (state.status !== "in_progress") return;
      if (!state.qEndsAt) return;

      const now = Date.now();
      if (now < state.qEndsAt) return;

      const q = state.questions[state.currentIndex];
      state.answers.push({
        qId: q?.id || `q-${state.currentIndex}`,
        text: "",
        score: 0,
        timeTakenSec: q?.maxTime || MAX_TIME[state.plan[state.currentIndex]],
        autoSubmitted: true,
      });
      state.chat.push({ role: "assistant", content: "⏰ Time’s up. Moving to the next question.", ts: now });

      if (state.currentIndex < state.plan.length - 1) {
        state.currentIndex += 1;
        state.qStartedAt = null;
        state.qEndsAt = null;
      } else {
        state.status = "finished";
        state.qStartedAt = null;
        state.qEndsAt = null;
        state.finishedAt = Date.now();
        state.chat.push({ role: "assistant", content: "All questions complete.", ts: Date.now() });
      }
    },

    setDraftForIndex: (state, action) => {
      const { index, text } = action.payload || {};
      if (!Number.isFinite(index)) return;
      state.drafts[index] = text ?? "";
    },

    submitAnswer: (state, action) => {
      if (state.status !== "in_progress") return;
      const text = (action.payload || "").trim();
      if (!text) return;

      const now = Date.now();
      const q = state.questions[state.currentIndex];
      const elapsed =
        q && state.qStartedAt
          ? Math.max(0, Math.min(q.maxTime, Math.round((now - state.qStartedAt) / 1000)))
          : 0;

      state.chat.push({ role: "user", content: text, ts: now });
      state.answers.push({
        qId: q?.id || `q-${state.currentIndex}`,
        text,
        score: 0,
        timeTakenSec: elapsed,
        autoSubmitted: false,
      });

      delete state.drafts[state.currentIndex];

      if (state.currentIndex < state.plan.length - 1) {
        state.currentIndex += 1;
        state.qStartedAt = null;
        state.qEndsAt = null;
      } else {
        state.status = "finished";
        state.qStartedAt = null;
        state.qEndsAt = null;
        state.finishedAt = Date.now();
        state.chat.push({ role: "assistant", content: "All questions complete.", ts: Date.now() });
      }
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchAiQuestion.pending, (state) => {
        state.fetchingQuestion = true;
      })
      .addCase(fetchAiQuestion.fulfilled, (state, action) => {
        state.fetchingQuestion = false;
        const { q, idx } = action.payload;

        state.questions[idx] = q;
        state.usedPrompts.push(q.prompt);

        // Always start timer for a fetched question (unless we're already paused for a modal)
        if (!state.paused) {
          state.qStartedAt = Date.now();
          state.qEndsAt = state.qStartedAt + q.maxTime * 1000;
        }

        state.chat.push({
          role: "assistant",
          content: `Q${idx + 1} (${q.difficulty}): ${q.prompt}`,
          ts: Date.now(),
        });
      })
      .addCase(fetchAiQuestion.rejected, (state) => {
        state.fetchingQuestion = false;
        state.chat.push({
          role: "assistant",
          content: "I had trouble generating the next question. Retrying…",
          ts: Date.now(),
        });
      })
      .addCase(scoreLastAnswerAi.fulfilled, (state, action) => {
        const { i, score, feedback } = action.payload || {};
        if (i >= 0 && i < state.answers.length) {
          state.answers[i].score = Number.isFinite(score) ? score : 0;
          if (feedback) state.answers[i].feedback = feedback;
        }
      });
  },
});

export const {
  resetInterview,
  setCandidateFromParse,
  applyCandidateEdits,
  submitCollectedField,
  handleUserFreeText,
  startInterview,
  tickIfNeeded,
  submitAnswer,
  pauseForUnload,
  resumeAfterWelcome,
  setDraftForIndex,
} = slice.actions;

export const selectInterview = (s) => s.interview;
export const selectInterviewStatus = (s) => s.interview.status;

export default slice.reducer;
