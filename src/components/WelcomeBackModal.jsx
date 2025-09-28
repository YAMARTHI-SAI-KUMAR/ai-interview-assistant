// src/components/WelcomeBackModal.jsx
import React from "react";
import { Modal, Button, Space, Typography } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { resetInterview, selectInterview, resumeAfterWelcome } from "../store/interviewSlice";

/**
 * Opens in two cases:
 *  1) We paused due to refresh/close (resumePromptNeeded = true).
 *  2) Any unfinished session (collecting, in_progress, or ready with data/chat).
 *     On initial load, this helps users continue where they left off.
 */
export default function WelcomeBackModal() {
  const dispatch = useDispatch();
  const s = useSelector(selectInterview) || {};
  const status = s.status || "idle";
  const candidate = s.candidate || {};
  const chat = Array.isArray(s.chat) ? s.chat : [];
  const resumePromptNeeded = !!s.resumePromptNeeded;

  const unfinished =
    status === "in_progress" ||
    status === "collecting" ||
    (status === "ready" &&
      ((candidate.name || candidate.email || candidate.phone) || chat.length > 0));

  const [open, setOpen] = React.useState(false);
  const mountedOnce = React.useRef(false);

  React.useEffect(() => {
    // On first mount, open if we have a paused session OR any unfinished session.
    if (!mountedOnce.current) {
      mountedOnce.current = true;
      if (resumePromptNeeded || unfinished) setOpen(true);
      return;
    }
    // After mount, only reopen when we actually pause (avoid nagging)
    if (resumePromptNeeded) setOpen(true);
  }, [resumePromptNeeded, unfinished]);

  if (!open) return null;

  const onResume = () => {
    // Resumes timer if paused; otherwise simply clears the flag and closes.
    dispatch(resumeAfterWelcome());
    setOpen(false);
  };

  const onStartOver = () => {
    dispatch(resetInterview());
    setOpen(false);
  };

  const showPausedMessage = resumePromptNeeded || status === "in_progress";
  return (
    <Modal
      title="Welcome back"
      open={open}
      onCancel={onResume}
      footer={
        <Space>
          <Button onClick={onResume}>Resume</Button>
          <Button danger onClick={onStartOver}>Start Over</Button>
        </Space>
      }
    >
      <Typography.Paragraph>
        {showPausedMessage
          ? "We paused your interview timer when you left. You can resume where you stopped, or start over."
          : "You have an unfinished session. Continue where you left off, or start over."}
      </Typography.Paragraph>
    </Modal>
  );
}
