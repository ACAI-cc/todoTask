"use client";

import { useEffect, useState, useRef } from "react";
import { useTaskStore } from "@/store/useTaskStore";
import type { SyncStatus, GitInfo } from "@/types/electron";

/**
 * SyncStatusBar - Git 同步状态栏
 *
 * 显示在应用底部，实时展示 Git 自动同步状态：
 * - 空闲：显示 "Git 同步" 或 "自动推送已关闭"
 * - 待同步：显示倒计时提示
 * - 同步中：显示 loading 动画
 * - 成功：显示 "✅ 已同步于 HH:MM"
 * - 失败：显示错误原因 + 重试按钮
 * - Git 不可用：显示 "Git 不可用" 提示
 *
 * 点击状态栏可展开详情面板，支持手动同步和切换自动推送。
 */
export default function SyncStatusBar() {
  const isElectron = useTaskStore((s) => s.isElectron);
  const syncStatus = useTaskStore((s) => s.syncStatus);
  const triggerManualSync = useTaskStore((s) => s.triggerManualSync);
  const setAutoPush = useTaskStore((s) => s.setAutoPush);
  const setCodeRepoPath = useTaskStore((s) => s.setCodeRepoPath);

  const [expanded, setExpanded] = useState(false);
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [repoPath, setRepoPath] = useState("");
  const [gitPath, setGitPath] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isElectron) return null;

  const status: SyncStatus | null = syncStatus;
  const gitAvailable = status?.gitAvailable ?? false;
  const state = status?.state ?? "idle";
  const message = status?.message;
  const autoPushEnabled = status?.autoPushEnabled ?? true;

  // 展开 Git 配置面板时获取诊断信息
  const handleExpand = async () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    if (newExpanded && !gitAvailable) {
      try {
        const info = await window.electronAPI!.getGitInfo();
        setGitInfo(info);
        if (!repoPath) setRepoPath(info.codeRepoPath || "");
        if (!gitPath) setGitPath(info.gitExecutable && info.gitExecutable !== "git" ? info.gitExecutable : "");
      } catch {
        // 忽略
      }
    }
  };

  // 保存 Git 仓库路径配置
  const handleSaveGitConfig = async () => {
    setSaving(true);
    try {
      await setCodeRepoPath(repoPath.trim(), gitPath.trim());
      // 重新获取诊断信息
      const info = await window.electronAPI!.getGitInfo();
      setGitInfo(info);
    } finally {
      setSaving(false);
    }
  };

  // 格式化上次同步时间
  const formatLastSync = (timestamp: number | null): string => {
    if (!timestamp) return "从未";
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  // 状态图标和颜色
  const getStatusDisplay = (): {
    icon: string;
    text: string;
    color: string;
    bgColor: string;
  } => {
    if (!gitAvailable) {
      return {
        icon: "⚠️",
        text: "Git 不可用",
        color: "text-gray-500",
        bgColor: "bg-gray-50",
      };
    }

    if (!autoPushEnabled) {
      return {
        icon: "⏸️",
        text: "自动推送已关闭",
        color: "text-gray-500",
        bgColor: "bg-gray-50",
      };
    }

    switch (state) {
      case "syncing":
        return {
          icon: "🔄",
          text: "正在同步...",
          color: "text-blue-600",
          bgColor: "bg-blue-50",
        };
      case "pending":
        return {
          icon: "⏳",
          text: message || "等待同步...",
          color: "text-amber-600",
          bgColor: "bg-amber-50",
        };
      case "success":
        return {
          icon: "✅",
          text: message || "已同步",
          color: "text-green-600",
          bgColor: "bg-green-50",
        };
      case "error":
        return {
          icon: "❌",
          text: "同步失败",
          color: "text-red-600",
          bgColor: "bg-red-50",
        };
      default:
        return {
          icon: "📋",
          text: `Git 同步 | 上次: ${formatLastSync(status?.lastSyncTime ?? null)}`,
          color: "text-gray-500",
          bgColor: "bg-gray-50",
        };
    }
  };

  const display = getStatusDisplay();

  return (
    <>
      {/* 状态栏主体 */}
      <div
        className={`shrink-0 ${display.bgColor} border-t border-gray-200 px-4 py-1.5 flex items-center justify-between cursor-pointer transition-colors hover:brightness-95`}
        onClick={handleExpand}
      >
        <div className={`flex items-center gap-2 text-xs ${display.color}`}>
          {/* 同步中时添加旋转动画 */}
          <span className={state === "syncing" ? "animate-spin inline-block" : ""}>
            {display.icon}
          </span>
          <span className="font-medium">{display.text}</span>
          {/* 错误状态下显示简要原因 */}
          {state === "error" && message && (
            <span className="text-gray-400 hidden sm:inline">
              ({message.length > 40 ? message.substring(0, 40) + "..." : message})
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* 上次同步时间 */}
          {gitAvailable && state !== "error" && (
            <span className="text-xs text-gray-400 hidden sm:inline">
              上次同步: {formatLastSync(status?.lastSyncTime ?? null)}
            </span>
          )}
          {/* 展开/收起箭头 */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      {/* 展开详情面板 */}
      {expanded && (
        <div className="shrink-0 bg-white border-t border-gray-100 px-4 py-3 space-y-3 shadow-sm">
          {/* Git 配置面板（Git 不可用时显示） */}
          {!gitAvailable && (
            <div className="space-y-3">
              {/* 错误提示 */}
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <span className="shrink-0">⚠️</span>
                <div>
                  <p className="font-medium text-gray-700">Git 仓库不可用</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {message || "请配置 Git 仓库路径以启用自动同步"}
                  </p>
                </div>
              </div>

              {/* 诊断信息 */}
              {gitInfo && (
                <div className="text-xs text-gray-400 bg-gray-50 rounded-md p-2 space-y-0.5 font-mono">
                  <p>安装目录: {gitInfo.installDir}</p>
                  <p>taskData: {gitInfo.taskDataDir}</p>
                  <p>git 命令: {gitInfo.gitExecutable || "未检测到"}</p>
                  <p>代码仓库: {gitInfo.codeRepoPath || "未设置"}</p>
                </div>
              )}

              {/* 配置输入 */}
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500 font-medium">
                    代码仓库根目录路径
                  </label>
                  <input
                    type="text"
                    value={repoPath}
                    onChange={(e) => setRepoPath(e.target.value)}
                    placeholder="例如: D:\WorkBuddy\workspace\todo"
                    className="w-full mt-1 px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:border-blue-400 bg-white text-gray-700"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">
                    包含 .git 目录的项目根目录的绝对路径
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">
                    git.exe 路径（可选）
                  </label>
                  <input
                    type="text"
                    value={gitPath}
                    onChange={(e) => setGitPath(e.target.value)}
                    placeholder="留空则自动检测系统 git"
                    className="w-full mt-1 px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:border-blue-400 bg-white text-gray-700"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">
                    如果系统 PATH 中没有 git，请指定完整路径
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveGitConfig();
                  }}
                  disabled={saving || !repoPath.trim()}
                  className="w-full px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "保存中..." : "保存并检测"}
                </button>
              </div>
            </div>
          )}

          {/* 当前状态详情 */}
          {gitAvailable && (
            <div className="flex items-start gap-2 text-sm">
              <span className="shrink-0">{display.icon}</span>
              <div className="flex-1">
                <p className={`font-medium ${display.color}`}>
                  {state === "idle" && "空闲"}
                  {state === "pending" && "等待同步"}
                  {state === "syncing" && "正在同步"}
                  {state === "success" && "同步成功"}
                  {state === "error" && "同步失败"}
                </p>
                {message && (
                  <p className="text-xs text-gray-500 mt-0.5">{message}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  上次同步: {formatLastSync(status?.lastSyncTime ?? null)}
                </p>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          {gitAvailable && (
            <div className="flex items-center gap-2 pt-1">
              {/* 自动推送开关 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAutoPush(!autoPushEnabled);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  autoPushEnabled
                    ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full ${
                    autoPushEnabled ? "bg-green-500" : "bg-gray-300"
                  }`}
                />
                自动推送 {autoPushEnabled ? "已开启" : "已关闭"}
              </button>

              {/* 立即同步按钮 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  triggerManualSync();
                }}
                disabled={state === "syncing"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-gray-200 text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={state === "syncing" ? "animate-spin" : ""}
                >
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
                立即同步
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
