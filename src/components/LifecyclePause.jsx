// src/components/LifecyclePause.jsx
import React from "react";
import { useDispatch } from "react-redux";
import { pauseForUnload } from "../store/interviewSlice";
import { store } from "../store/store";

/**
 * Marks the session "paused" when the tab becomes hidden or is closing,
 * so we can show the Welcome Back modal and resume the timer precisely.
 * Only pauses when an interview is actually in progress.
 */
export default function LifecyclePause() {
  const dispatch = useDispatch();

  React.useEffect(() => {
    const doPause = () => {
      const s = store.getState().interview;
      if (s.status !== "in_progress") return; // only pause during active interview
      dispatch(pauseForUnload());
      // belt & suspenders snapshot in case persist hasn't flushed
      try {
        const snap = JSON.stringify(s);
        localStorage.setItem("aimock_interview_backup_v1", snap);
      } catch {}
    };

    const onBeforeUnload = doPause;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") doPause();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [dispatch]);

  return null;
}
