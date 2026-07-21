import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "任务管理",
  description: "个人任务管理 - 模块化、可追溯、四象限优先级",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
