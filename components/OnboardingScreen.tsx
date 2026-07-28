"use client";

import { useTaskStore } from "@/store/useTaskStore";

export default function OnboardingScreen() {
  const createWorkspace = useTaskStore((s) => s.createWorkspace);
  const openWorkspace = useTaskStore((s) => s.openWorkspace);
  const fileSupported = useTaskStore((s) => s.fileSupported);
  const isElectron = useTaskStore((s) => s.isElectron);

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md mx-auto px-8">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-900 text-white text-2xl font-bold mb-4">
            T
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            任务管理
          </h1>
          <p className="text-gray-500 text-sm">
            模块化 · 可追溯 · 四象限优先级 · 多工作区
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-sm text-gray-600 mb-5">
            {isElectron
              ? "请新建一个工作区来开始使用。工作区文件将保存在 taskData/ 目录下，并自动同步到 Git 远程仓库。"
              : fileSupported
              ? "请新建或打开一个工作区文件来开始使用。每个 JSON 文件就是一个独立工作区，数据完全隔离。"
              : "当前浏览器不支持本地文件存储，将使用浏览器内存存储。建议使用 Chrome 或 Edge 浏览器。"}
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={createWorkspace}
              className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              新建工作区
            </button>
            {!isElectron && (
              <button
                onClick={openWorkspace}
                className="w-full px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                打开已有工作区
              </button>
            )}
            {isElectron && (
              <button
                onClick={openWorkspace}
                className="w-full px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                刷新工作区列表
              </button>
            )}
          </div>

          {isElectron ? (
            <p className="mt-4 text-xs text-gray-400">
              工作区数据保存在 taskData/ 目录下的 .json 文件中，文件变更将自动提交并推送到 Git 远程仓库。
            </p>
          ) : fileSupported ? (
            <p className="mt-4 text-xs text-gray-400">
              工作区数据保存在你选择的 .json 文件中，刷新页面后自动恢复。
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
