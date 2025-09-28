// src/components/ChatBubble.jsx
import React from "react";
import { Typography } from "antd";

export default function ChatBubble({ role, content }) {
  const isUser = role === "user";

  // Coerce any non-primitive to a string so React never sees a bare object
  let text;
  try {
    if (typeof content === "string" || typeof content === "number") {
      text = String(content);
    } else if (content == null) {
      text = "";
    } else {
      // If some reducer accidentally pushed an object, make it visible but safe
      text = JSON.stringify(content, null, 2);
    }
  } catch {
    text = "";
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          background: isUser ? "#1677ff" : "#f0f0f0",
          color: isUser ? "#fff" : "#000",
          padding: "8px 10px",
          borderRadius: 8,
          whiteSpace: "pre-wrap",
        }}
      >
        <Typography.Text style={{ color: isUser ? "#fff" : "inherit" }}>
          {text}
        </Typography.Text>
      </div>
    </div>
  );
}
