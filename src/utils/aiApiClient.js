// src/utils/aiApiClient.js
const API_BASE = process.env.REACT_APP_AI_BASE || ""; // CRA proxy -> "" is fine

export async function aiGenerateQuestion({ difficulty, avoidPrompts }) {
  const res = await fetch(`${API_BASE}/api/question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty, avoidPrompts }),
  });
  if (!res.ok) throw new Error(`AI /question failed (${res.status})`);
  return await res.json();
}

export async function aiScoreAnswer({ prompt, answer, difficulty, keywords = [] }) {
  const res = await fetch(`${API_BASE}/api/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, answer, difficulty, keywords }),
  });
  if (!res.ok) throw new Error(`AI /score failed (${res.status})`);
  return await res.json();
}
