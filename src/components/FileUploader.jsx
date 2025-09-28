import React from "react";
import {
  Card,
  Upload,
  App as AntdApp,
  Form,
  Input,
  Button,
  Space,
  Spin,
  Tag,
  Tooltip,
} from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import { extractTextFromFile, parseResumeFields } from "../utils/resumeParser";
import { validateEmail, validatePhone, validateName } from "../utils/validators";
import {
  setCandidateFromParse,
  startInterview,          // <-- use startInterview (not startInterviewAI)
  selectInterview,
  applyCandidateEdits,
} from "../store/interviewSlice";

export default function FileUploader() {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const dispatch = useDispatch();
  const interview = useSelector(selectInterview);

  const [loading, setLoading] = React.useState(false);
  const [debugText, setDebugText] = React.useState("");

  const handleFile = async (file) => {
    setLoading(true);
    try {
      const text = await extractTextFromFile(file);
      const { name, email, phone, debug } = parseResumeFields(text, file.name);

      form.setFieldsValue({ name, email, phone });
      setDebugText(debug.headerPreview.concat(debug.firstLinesPreview).join("\n"));

      const missing = [];
      if (!validateName(name)) missing.push("name");
      if (!validateEmail(email)) missing.push("email");
      if (!validatePhone(phone)) missing.push("phone");

      dispatch(setCandidateFromParse({ name, email, phone, rawText: text, missing }));

      if (missing.length === 0) message.success("Resume parsed. All contact details look good.");
      else message.warning("Some fields are missing/invalid. I’ll collect them in chat.");
    } catch (err) {
      console.error(err);
      message.error(err.message || "Failed to parse the file.");
    } finally {
      setLoading(false);
    }
    return false;
  };

  const status = interview.status; // idle | collecting | ready | in_progress | finished
  const missing = interview.missing || [];

  const canStart = status === "ready";
  const startDisabled = !canStart;
  const startReason =
    status === "collecting"
      ? `Provide your ${missing[0]} in chat to continue`
      : status === "in_progress"
      ? "Interview is already in progress"
      : status === "finished"
      ? "Interview is complete"
      : "Upload a resume or fill details to enable";

  const onStart = () => {
    // ensure latest edits are applied
    const values = form.getFieldsValue(true);
    dispatch(applyCandidateEdits({
      name: (values.name || "").trim(),
      email: (values.email || "").trim(),
      phone: (values.phone || "").trim(),
    }));
    // start AI interview; InterviewChat effect will fetch Q1
    dispatch(startInterview());

    // focus chat
    setTimeout(() => {
      document.getElementById("interview-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("interview-input")?.focus();
    }, 0);
  };

  return (
    <Card title="Upload Resume">
      <Upload.Dragger
        accept=".pdf,.docx"
        beforeUpload={handleFile}
        showUploadList={false}
        multiple={false}
        disabled={loading || status === "in_progress"}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">Click or drag PDF/DOCX to this area to upload</p>
      </Upload.Dragger>

      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 16 }}
        onValuesChange={(_, allValues) => {
          // save edits silently as the user types
          dispatch(applyCandidateEdits({
            name: (allValues.name || "").trim(),
            email: (allValues.email || "").trim(),
            phone: (allValues.phone || "").trim(),
          }));
        }}
      >
        <Form.Item
          name="name"
          label="Full Name"
          rules={[
            { validator: (_, v) => (!v || validateName(v) ? Promise.resolve() : Promise.reject(new Error("Please enter a valid full name"))) },
          ]}
        >
          <Input placeholder="Full Name (you can correct it here)" />
        </Form.Item>

        <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Enter a valid email" }]}>
          <Input placeholder="Email (you can correct it here)" />
        </Form.Item>

        <Form.Item
          name="phone"
          label="Phone"
          rules={[
            { validator: (_, v) => (!v || validatePhone(v) ? Promise.resolve() : Promise.reject(new Error("Enter a valid phone number"))) },
          ]}
        >
          <Input placeholder="Phone (you can correct it here)" />
        </Form.Item>

        {loading ? (
          <Spin />
        ) : (
          <Space align="center">
            <Tooltip title={startDisabled ? startReason : "Begin the timed interview"}>
              <Button type="primary" onClick={onStart} disabled={startDisabled}>
                Start Interview
              </Button>
            </Tooltip>
            {missing.length > 0 && (
              <Space size={4}>
                {missing.map((m) => (
                  <Tag color="orange" key={m}>missing {m}</Tag>
                ))}
              </Space>
            )}
          </Space>
        )}
      </Form>

      {!!debugText && (
        <details style={{ marginTop: 16 }}>
          <summary>Parser debug preview</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{debugText}</pre>
        </details>
      )}
    </Card>
  );
}
