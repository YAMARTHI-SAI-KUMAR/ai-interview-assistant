import { App as AntdApp, ConfigProvider } from "antd";
import "antd/dist/reset.css";

export default function AppShell({ children }) {
  return (
    <ConfigProvider>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
