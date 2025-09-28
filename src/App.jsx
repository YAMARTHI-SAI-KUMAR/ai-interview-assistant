// src/App.jsx
import React from "react";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { store, persistor } from "./store/store";
import AppShell from "./AppShell";
import { Tabs, Typography, Space } from "antd";
import FileUploader from "./components/FileUploader";
import InterviewChat from "./components/InterviewChat";
import InterviewerDashboard from "./components/InterviewerDashboard";
import WelcomeBackModal from "./components/WelcomeBackModal";
import LifecyclePause from "./components/LifecyclePause";

export default function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <AppShell>
          <div className="container">
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Typography.Title level={2} style={{ marginBottom: 0 }}>
                AI Mock Assistant
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
                Upload a resume, verify details, then take a timed interview. Results appear in the interviewer dashboard.
              </Typography.Paragraph>

              <Tabs
                defaultActiveKey="candidate"
                items={[
                  {
                    key: "candidate",
                    label: "Interviewee",
                    children: (
                      <Space direction="vertical" size={16} style={{ width: "100%" }}>
                        <FileUploader />
                        <InterviewChat />
                      </Space>
                    ),
                  },
                  { key: "interviewer", label: "Interviewer", children: <InterviewerDashboard /> },
                ]}
              />
            </Space>

            {/* Always mounted: pause on close + Welcome Back for unfinished sessions */}
            <WelcomeBackModal />
            <LifecyclePause />
          </div>
        </AppShell>
      </PersistGate>
    </Provider>
  );
}
