import React from "react";
import { useSelector } from "react-redux";
import { Drawer, Descriptions, List, Tag, Typography } from "antd";

export default function CandidateDetailDrawer({ openId, onClose }) {
  const candidate = useSelector((s) => (openId ? s.candidates.byId[openId] : null));

  return (
    <Drawer
      title="Candidate Details"
      open={!!openId}
      onClose={onClose}
      width={720}
      destroyOnClose={false}
    >
      {!candidate ? (
        <Typography.Text type="secondary">No candidate selected.</Typography.Text>
      ) : (
        <>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Name">{candidate.name}</Descriptions.Item>
            <Descriptions.Item label="Email">{candidate.email}</Descriptions.Item>
            <Descriptions.Item label="Phone">{candidate.phone}</Descriptions.Item>
            <Descriptions.Item label="Final Score">
              {candidate.finalScore != null ? <Tag color="blue">{candidate.finalScore}</Tag> : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Summary">{candidate.summary || "—"}</Descriptions.Item>
            <Descriptions.Item label="Completed At">
              {candidate.finishedAt ? new Date(candidate.finishedAt).toLocaleString() : "—"}
            </Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 16 }}>
            Q & A
          </Typography.Title>

          <List
            size="small"
            bordered
            dataSource={(candidate.qa || []).map((x, idx) => ({ ...x, idx }))}
            renderItem={(item) => (
              <List.Item>
                <div style={{ width: "100%" }}>
                  <Typography.Text strong>
                    Q{item.idx + 1} ({item.difficulty}) — score {item.score}/10
                  </Typography.Text>
                  <div style={{ marginTop: 6 }}>
                    <Typography.Text>{item.prompt}</Typography.Text>
                  </div>
                  <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                    <Typography.Text type="secondary">
                      Answer: {item.answer || "—"}
                    </Typography.Text>
                  </div>
                </div>
              </List.Item>
            )}
          />
        </>
      )}
    </Drawer>
  );
}
