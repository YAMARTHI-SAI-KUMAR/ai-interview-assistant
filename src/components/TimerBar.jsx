// src/components/TimerBar.jsx
import React from "react";

export default function TimerBar({ endsAt, maxSec = 60, paused = false }) {
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    if (paused) return; // freeze when paused
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [paused]);

  const total = Math.max(1, Number(maxSec) || 60);
  const remainingMs = Math.max(0, (endsAt || Date.now()) - now);
  const remaining = Math.ceil(remainingMs / 1000);
  const used = Math.min(total, Math.max(0, total - remaining));
  const pct = Math.min(100, Math.max(0, (used / total) * 100));

  return (
    <div style={{ width: "100%", height: 8, background: "#f0f0f0", borderRadius: 6, overflow: "hidden", marginBottom: 6 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: "#1677ff", transition: "width 200ms linear" }} />
    </div>
  );
}
