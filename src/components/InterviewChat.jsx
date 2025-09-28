/* src/components/InterviewChat.jsx */
/* eslint-disable global-require */
import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { Card, Input, Button, Space, Typography } from "antd";
import ChatBubble from "./ChatBubble";
import TimerBar from "./TimerBar";
import {
  selectInterview,
  submitCollectedField,
  handleUserFreeText,
  startInterview,
  submitAnswer,
  tickIfNeeded,
  fetchAiQuestion,
  scoreLastAnswerAi,
  setDraftForIndex,
} from "../store/interviewSlice";
import { validateEmail, validatePhone, validateName } from "../utils/validators";

const DEFAULT_PLAN = ["Easy", "Easy", "Medium", "Medium", "Hard", "Hard"];

function reconstructQuestionFromChat(index, chat) {
  const pattern = new RegExp(`^Q${index + 1} \\((Easy|Medium|Hard)\\):\\s*(.+)$`);
  for (const m of chat) {
    if (!m || m.role !== "assistant" || typeof m.content !== "string") continue;
    const line = m.content.trim();
    const match = line.match(pattern);
    if (match) return { difficulty: match[1], prompt: match[2] };
  }
  return null;
}

function buildQa(plan, questions, answers, chat, onlyAnswered) {
  const qArr = Array.isArray(questions) ? questions : [];
  const aArr = Array.isArray(answers) ? answers : [];
  const n = onlyAnswered ? aArr.filter(Boolean).length : Math.max(qArr.length, aArr.length, plan.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const q = qArr[i] ?? null;
    const a = aArr[i] ?? null;

    let difficulty = q?.difficulty ?? (plan?.[i] ?? "");
    let prompt = q?.prompt ?? "";

    if (!prompt) {
      const rec = reconstructQuestionFromChat(i, chat || []);
      if (rec) {
        difficulty = rec.difficulty || difficulty;
        prompt = rec.prompt || prompt;
      }
    }

    out.push({
      prompt: prompt || `Q${i + 1}`,
      difficulty,
      score: a?.score ?? 0,
      answer: a?.text ?? "",
    });
  }
  return out;
}

function asText(content) {
  try {
    if (content == null) return "";
    if (typeof content === "string" || typeof content === "number") return String(content);
    return JSON.stringify(content, null, 2);
  } catch {
    return "";
  }
}

export default function InterviewChat() {
  const dispatch = useDispatch();
  const s = useSelector(selectInterview) || {};

  const status = s.status ?? "idle";
  const plan = Array.isArray(s.plan) ? s.plan : DEFAULT_PLAN;
  const questions = Array.isArray(s.questions) ? s.questions : [];
  const answers = Array.isArray(s.answers) ? s.answers : [];
  const chat = Array.isArray(s.chat) ? s.chat : [];
  const fetchingQuestion = !!s.fetchingQuestion;
  const currentIndex = Number.isFinite(s.currentIndex) ? s.currentIndex : -1;
  const qEndsAt = s.qEndsAt ?? null;
  const missing = Array.isArray(s.missing) ? s.missing : [];
  const paused = !!s.paused;

  // per-question draft (persisted)
  const draft = status === "in_progress" && currentIndex >= 0 ? s.drafts?.[currentIndex] ?? "" : "";
  const [input, setInput] = React.useState(draft);
  React.useEffect(() => setInput(draft), [draft, currentIndex, status]);

  const onChangeInput = (e) => {
    const text = e.target.value;
    setInput(text);
    if (status === "in_progress" && currentIndex >= 0) {
      dispatch(setDraftForIndex({ index: currentIndex, text }));
    }
  };

  // Tick timer (auto submit)
  React.useEffect(() => {
    const id = setInterval(() => dispatch(tickIfNeeded()), 300);
    return () => clearInterval(id);
  }, [dispatch]);

  // Fetch next question when needed
  const lastFetchRef = React.useRef(0);
  React.useEffect(() => {
    if (status !== "in_progress") return;
    if (paused) return;

    const haveHere = currentIndex >= 0 && questions[currentIndex];
    const needQ = currentIndex >= 0 && !haveHere && !fetchingQuestion;

    const now = Date.now();
    const MIN_GAP = 800;
    if (needQ && now - lastFetchRef.current > MIN_GAP) {
      lastFetchRef.current = now;
      dispatch(fetchAiQuestion());
    }
  }, [status, paused, currentIndex, questions, fetchingQuestion, dispatch]);

  // Auto-scroll chat
  const scrollRef = React.useRef(null);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length]);

  const onSend = () => {
    const text = (input || "").trim();
    if (!text) return;

    if (status === "collecting" && missing.length) {
      const field = missing[0];
      const validators = { name: validateName, email: validateEmail, phone: validatePhone };
      const valid = validators[field]?.(text);
      dispatch(submitCollectedField({ field, value: text, valid }));
      setInput("");
      return;
    }

    if (status === "ready") {
      dispatch(handleUserFreeText(text));
      if (/^start\b/i.test(text)) dispatch(startInterview());
      setInput("");
      return;
    }

    if (status === "in_progress") {
      dispatch(submitAnswer(text));
      setInput("");
      return;
    }

    dispatch(handleUserFreeText(text));
    setInput("");
  };

  // Score the last answer whenever a new answer appears (manual or auto-submit)
  const lastScoredRef = React.useRef(-1);
  React.useEffect(() => {
    if (!Array.isArray(answers) || answers.length === 0) return;
    const i = answers.length - 1;
    if (lastScoredRef.current === i) return;
    dispatch(scoreLastAnswerAi());
    lastScoredRef.current = i;
  }, [answers.length, answers, dispatch]);

  // Persist to interviewer dashboard (live and final)
  const lastPersistSig = React.useRef("");
  React.useEffect(() => {
    if (status !== "in_progress" && status !== "finished") return;

    const onlyAnswered = status !== "finished";
    const qa = buildQa(plan, questions, answers, chat, onlyAnswered);

    const sig = JSON.stringify(qa.map((x) => [x.prompt, x.score, x.answer]));
    if (sig === lastPersistSig.current) return;

    const { summarizeCandidate } = require("../utils/aiEngine");
    const { upsertCandidate } = require("../store/candidateSlice");
    const { store } = require("../store/store");

    const summaryData = summarizeCandidate(s.candidate, answers, questions, plan);

    store.dispatch(
      upsertCandidate({
        ...s.candidate,
        qa,
        finalScore: summaryData.finalScore,
        summary:
          status === "finished" ? summaryData.summary : "Interview in progress… scores shown so far.",
        finishedAt: status === "finished" ? s.finishedAt : null,
      })
    );

    lastPersistSig.current = sig;
  }, [status, plan, s.candidate, answers, questions, chat, s.finishedAt]);

  const activeQ = status === "in_progress" && currentIndex >= 0 ? questions[currentIndex] : null;
  const totalQs = plan.length;
  const currentNum = status === "in_progress" && currentIndex >= 0 ? currentIndex + 1 : 0;

  const safeChat = (Array.isArray(chat) ? chat : [])
    .filter((m) => m && m.content !== undefined)
    .map((m) => ({ ...m, content: asText(m.content) }))
    .filter((m) => !/^Score for Q\d+:/i.test(m.content.trim()));

  return (
    <Card id="interview-chat" title="Interview Chat" className="chat-wrap">
      <div className="chat-scroll" ref={scrollRef}>
        {safeChat.map((m, i) => (
          <ChatBubble key={i} role={typeof m.role === "string" ? m.role : "assistant"} content={m.content} />
        ))}
      </div>

      {status === "in_progress" && activeQ && (
        <div style={{ margin: "8px 0 12px" }}>
          <TimerBar
            endsAt={qEndsAt ?? Date.now()}
            maxSec={activeQ.maxTime}
            paused={paused}
          />
          <Typography.Text type="secondary">
            Question {currentNum} / {totalQs} • {activeQ.difficulty}
            {paused ? " • PAUSED" : ""}
          </Typography.Text>
        </div>
      )}

      <Space.Compact className="chat-input" style={{ width: "100%" }}>
        <Input
          id="interview-input"
          placeholder={
            status === "collecting"
              ? `Please type your ${missing[0] ?? "detail"}`
              : status === "ready"
              ? 'Click "Start Interview" above (or type "start")'
              : status === "in_progress"
              ? "Type your answer and press Enter"
              : "Say hi or upload your resume to begin"
          }
          value={input}
          onChange={onChangeInput}
          onPressEnter={onSend}
        />
        <Button type="primary" onClick={onSend}>Send</Button>
      </Space.Compact>
    </Card>
  );
}
