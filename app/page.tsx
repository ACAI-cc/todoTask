"use client";

import { useEffect } from "react";
import { useTaskStore } from "@/store/useTaskStore";
import OnboardingScreen from "@/components/OnboardingScreen";
import Header from "@/components/Header";
import ModuleView from "@/components/ModuleView";
import QuadrantView from "@/components/QuadrantView";
import CalendarView from "@/components/CalendarView";
import SettingsPanel from "@/components/SettingsPanel";
import SearchOverlay from "@/components/SearchOverlay";
import ContextMenu from "@/components/ContextMenu";
import DeleteToastContainer from "@/components/DeleteToastContainer";
import UnsupportedWarning from "@/components/UnsupportedWarning";
import SyncStatusBar from "@/components/SyncStatusBar";
import PromptDialog from "@/components/PromptDialog";

export default function Home() {
  const isOnboarded = useTaskStore((s) => s.isOnboarded);
  const isInitializing = useTaskStore((s) => s.isInitializing);
  const needsRestoreClick = useTaskStore((s) => s.needsRestoreClick);
  const view = useTaskStore((s) => s.view);
  const initStore = useTaskStore((s) => s.initStore);
  const restoreWorkspacesWithPermission = useTaskStore(
    (s) => s.restoreWorkspacesWithPermission
  );

  useEffect(() => {
    initStore();
  }, [initStore]);

  // 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+N: 聚焦当前活跃模块的输入框
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        const activeModuleId = useTaskStore.getState().activeModuleId;
        if (activeModuleId) {
          const input = document.querySelector(
            `input[data-task-input="${activeModuleId}"]`
          ) as HTMLInputElement | null;
          input?.focus();
        }
      }

      // Ctrl+1/2/3/4: 为当前选中任务设置优先级
      if (e.ctrlKey && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        const selectedTaskId = useTaskStore.getState().selectedTaskId;
        if (!selectedTaskId) return;

        const quadrantMap: Record<string, any> = {
          "1": "important_urgent",
          "2": "important_not_urgent",
          "3": "not_important_urgent",
          "4": "not_important_not_urgent",
        };
        const targetQuadrant = quadrantMap[e.key];
        const task = useTaskStore
          .getState()
          .tasks.find((t) => t.id === selectedTaskId);
        if (task?.quadrant === targetQuadrant) {
          // 已有该标签则取消
          useTaskStore.getState().setQuadrant(selectedTaskId, null);
        } else {
          useTaskStore.getState().setQuadrant(selectedTaskId, targetQuadrant);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 初始化加载中
  if (isInitializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">正在恢复工作区...</p>
        </div>
      </div>
    );
  }

  // 需要用户点击授权恢复
  if (needsRestoreClick) {
    return (
      <>
        <div className="h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md mx-auto px-8">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-900 text-white text-2xl font-bold mb-4">
                T
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                恢复工作区
              </h1>
              <p className="text-gray-500 text-sm">
                检测到之前打开的工作区，点击下方按钮授权恢复。
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-3">
              <button
                onClick={restoreWorkspacesWithPermission}
                className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                恢复工作区
              </button>
              <button
                onClick={() => {
                  useTaskStore.setState({
                    needsRestoreClick: false,
                    isOnboarded: false,
                  });
                }}
                className="w-full px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                新建或打开其他文件
              </button>
            </div>
          </div>
        </div>
        <PromptDialog />
      </>
    );
  }

  if (!isOnboarded) {
    return (
      <>
        <OnboardingScreen />
        <PromptDialog />
      </>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Header />
      <UnsupportedWarning />
      <main className="flex-1 overflow-hidden">
        {view === "module" ? (
          <ModuleView />
        ) : view === "quadrant" ? (
          <QuadrantView />
        ) : (
          <CalendarView />
        )}
      </main>

      {/* Git 同步状态栏（仅 Electron 模式显示）*/}
      <SyncStatusBar />

      {/* 浮层组件 */}
      <SettingsPanel />
      <SearchOverlay />
      <ContextMenu />
      <DeleteToastContainer />
      <PromptDialog />
    </div>
  );
}
