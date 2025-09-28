// src/components/InterviewerDashboard.jsx
import React from "react";
import { useSelector } from "react-redux";
import { Card, Input, Table, Tag, Button } from "antd";
import { selectCandidates } from "../store/candidateSlice";
import CandidateDetailDrawer from "./CandidateDetailDrawer";

export default function InterviewerDashboard() {
  const all = useSelector(selectCandidates);
  const [query, setQuery] = React.useState("");
  const [openId, setOpenId] = React.useState(null);

  const data = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? all
      : all.filter(
          (c) =>
            (c.name || "").toLowerCase().includes(q) ||
            (c.email || "").toLowerCase().includes(q) ||
            (c.phone || "").toLowerCase().includes(q)
        );
    return filtered.map((c) => ({ key: c.id, ...c }));
  }, [all, query]);

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      sorter: (a, b) => (a.name || "").localeCompare(b.name || ""),
      render: (v) => v || "—",
    },
    { title: "Email", dataIndex: "email", render: (v) => v || "—" },
    { title: "Phone", dataIndex: "phone", render: (v) => v || "—" },
    {
      title: "Score",
      dataIndex: "finalScore",
      sorter: (a, b) => (a.finalScore ?? -1) - (b.finalScore ?? -1),
      render: (v) => (v != null ? <Tag color="blue">{v}</Tag> : <Tag>—</Tag>),
    },
    {
      title: "Completed",
      dataIndex: "finishedAt",
      sorter: (a, b) => (a.finishedAt || 0) - (b.finishedAt || 0),
      render: (t) => (t ? new Date(t).toLocaleString() : "—"),
    },
    {
      title: "Action",
      render: (_, record) => (
        <Button
          type="link"
          onClick={() => setOpenId(record.id)}
          aria-label={`View details for ${record.name || "candidate"}`}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <Card
      title="Interviewer Dashboard"
      extra={
        <Input.Search
          placeholder="Search by name/email/phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      }
    >
      <Table columns={columns} dataSource={data} pagination={{ pageSize: 8 }} />
      <CandidateDetailDrawer openId={openId} onClose={() => setOpenId(null)} />
    </Card>
  );
}
