"use client";

import { useState, useRef, useEffect } from "react";
import { useTaskStore } from "@/store/useTaskStore";
import { ViewMode } from "@/types";

export default function Header() {
  const view = useTaskStore((s) => s.view);
  const setView = useTaskStore((s) => s.setView);
  const fileSupported = useTaskStore((s) => s.fileSupported);
  const setSettingsOpen = useTaskStore((s) => s.setSettingsOpen);
  const setSearchOpen = useTaskStore((s) => s.setSearchOpen);

  return (
    <header className="flex items-center justify-between px-4 h-12 bg-white border-b border-gray-200 shrink-0">
      {/* 左侧：工作区切换器 + 视图切换 */}
      <div className="flex items-center gap-3">
        <WorkspaceSwitcher />
        <div className="w-px h-5 bg-gray-200" />
        <div className="flex items-center gap-1">
          <ViewTab
            label="模块视图"
            active={view === "module"}
            onClick={() => setView("module")}
          />
          <ViewTab
            label="优先级四象限"
            active={view === "quadrant"}
            onClick={() => setView("quadrant")}
          />
        </div>
      </div>

      {/* 右侧：搜索和设置 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <span>搜索</span>
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          title="设置"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function WorkspaceSwitcher() {
  const workspaces = useTaskStore((s) => s.workspaces);
  const activeWorkspaceId = useTaskStore((s) => s.activeWorkspaceId);
  const createWorkspace = useTaskStore((s) => s.createWorkspace);
  const openWorkspace = useTaskStore((s) => s.openWorkspace);
  const switchWorkspace = useTaskStore((s) => s.switchWorkspace);
  const closeWorkspace = useTaskStore((s) => s.closeWorkspace);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickAway);
      return () => document.removeEventListener("mousedown", handleClickAway);
    }
  }, [open]);

  const handleCreate = () => {
    setOpen(false);
    createWorkspace();
  };

  const handleOpen = () => {
    setOpen(false);
    openWorkspace();
  };

  const handleSwitch = (wsId: string) => {
    setOpen(false);
    switchWorkspace(wsId);
  };

  const handleClose = (wsId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    closeWorkspace(wsId);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span className="max-w-[180px] truncate">
          {activeWorkspace?.name || "未命名"}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
          {/* 工作区列表 */}
          <div className="max-h-64 overflow-y-auto">
            {workspaces.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">
                暂无打开的工作区
              </div>
            )}
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                onClick={() => handleSwitch(ws.id)}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                  ws.id === activeWorkspaceId
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  <span className="text-sm truncate">{ws.name}</span>
                </div>
                <button
                  onClick={(e) => handleClose(ws.id, e)}
                  className="shrink-0 p-0.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                  title="关闭工作区"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* 分隔线 */}
          <div className="border-t border-gray-100 my-1" />

          {/* 操作按钮 */}
          <div
            onClick={handleCreate}
            className="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M12 18v-6M9 15h6" />
            </svg>
            新建工作区
          </div>
          <div
            onClick={handleOpen}
            className="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            打开工作区
          </div>
        </div>
      )}
    </div>
  );
}

function ViewTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        active
          ? "bg-gray-100 text-gray-900"
          : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}
