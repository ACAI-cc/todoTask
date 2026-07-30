"use client";

import { useEffect, useState, useRef } from "react";
import { useTaskStore } from "@/store/useTaskStore";
import { electronGetDataPath, electronListWorkspaces } from "@/lib/electronStorage";

export default function OnboardingScreen() {
  const createWorkspace = useTaskStore((s) => s.createWorkspace);
  const openWorkspace = useTaskStore((s) => s.openWorkspace);
  const openSpecificWorkspace = useTaskStore((s) => s.openSpecificWorkspace);
  const openWorkspaceFromFolder = useTaskStore((s) => s.openWorkspaceFromFolder);
  const enterWorkspace = useTaskStore((s) => s.enterWorkspace);
  const fileSupported = useTaskStore((s) => s.fileSupported);
  const isElectron = useTaskStore((s) => s.isElectron);
  const taskDataPath = useTaskStore((s) => s.taskDataPath);
  const codeRepoPath = useTaskStore((s) => s.codeRepoPath);
  const setCodeRepoPath = useTaskStore((s) => s.setCodeRepoPath);
  const workspaces = useTaskStore((s) => s.workspaces);
  const activeWorkspaceId = useTaskStore((s) => s.activeWorkspaceId);
  const syncStatus = useTaskStore((s) => s.syncStatus);

  const [dataPath, setDataPath] = useState<string | null>(taskDataPath);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);
  const [showSyncConfig, setShowSyncConfig] = useState(false);
  const repoPathRef = useRef<HTMLInputElement>(null);
  const gitPathRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  /** 刷新工作区文件列表 */
  const refreshFileList = async () => {
    if (isElectron) {
      try {
        const p = await electronGetDataPath();
        setDataPath(p);
        const files = await electronListWorkspaces();
        setWorkspaceFiles(files);
      } catch {
        // 忽略
      }
    }
  };

  // 组件加载时获取文件列表；codeRepoPath 变化时重新获取
  useEffect(() => {
    if (isElectron) {
      refreshFileList();
    }
  }, [isElectron, codeRepoPath]);

  /** 保存代码仓库路径配置 */
  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const repoPath = repoPathRef.current?.value || "";
      const gitPath = gitPathRef.current?.value || "";
      await setCodeRepoPath(repoPath.trim(), gitPath.trim());
      setShowSyncConfig(false);
      await refreshFileList();
    } finally {
      setSaving(false);
    }
  };

  const gitAvailable = syncStatus?.gitAvailable ?? false;
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 relative">
      {/* 右上角齿轮图标 - 同步设置 */}
      {isElectron && (
        <button
          onClick={() => setShowSyncConfig(!showSyncConfig)}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="同步设置"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}

      {/* 同步设置弹窗 */}
      {isElectron && showSyncConfig && (
        <div className="absolute top-14 right-4 w-80 bg-white rounded-xl border border-gray-200 shadow-xl p-4 z-50 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">同步设置</h3>
            <button
              onClick={() => setShowSyncConfig(false)}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 当前状态 */}
          <div className={`p-2 rounded-md text-xs ${gitAvailable ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
            {gitAvailable ? "✅ Git 同步可用" : "⚠️ Git 同步不可用"}
            {syncStatus?.message && (
              <p className="text-gray-500 mt-0.5">{syncStatus.message}</p>
            )}
          </div>

          {/* 路径信息 */}
          {codeRepoPath && (
            <div className="text-xs text-gray-500 space-y-0.5">
              <p>代码仓库: <span className="font-mono text-gray-600 break-all">{codeRepoPath}</span></p>
              {dataPath && (
                <p>工作区目录: <span className="font-mono text-gray-600 break-all">{dataPath}</span></p>
              )}
            </div>
          )}

          {/* 手动配置 */}
          <div className="space-y-2 pt-1 border-t border-gray-100">
            <div>
              <label className="text-xs text-gray-500 font-medium">代码仓库根目录</label>
              <input
                ref={repoPathRef}
                type="text"
                defaultValue={codeRepoPath || ""}
                placeholder="例如: D:\WorkBuddy\workspace\todo"
                className="w-full mt-1 px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:border-blue-400 bg-white text-gray-700"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">git.exe 路径（可选）</label>
              <input
                ref={gitPathRef}
                type="text"
                defaultValue=""
                placeholder="留空则自动检测"
                className="w-full mt-1 px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:border-blue-400 bg-white text-gray-700"
              />
            </div>
            <button
              onClick={handleSaveConfig}
              disabled={saving}
              className="w-full px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存并应用"}
            </button>
          </div>
        </div>
      )}

      <div className="text-center max-w-md mx-auto px-8">
        {/* Logo */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-900 text-white text-2xl font-bold mb-4">
            T
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">任务管理</h1>
          <p className="text-gray-500 text-sm">
            模块化 · 可追溯 · 四象限优先级 · 多工作区
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          {/* 代码仓库路径未配置时显示警告 */}
          {isElectron && !codeRepoPath && (
            <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-sm text-amber-700 font-medium mb-1">
                请配置代码仓库路径
              </p>
              <p className="text-xs text-amber-600">
                工作区文件和 Git 同步需要指定代码仓库根目录。点击"打开现有工作区"选择文件夹，或点击右上角⚙️手动配置。
              </p>
            </div>
          )}

          {/* 代码仓库路径已配置时显示路径信息 */}
          {isElectron && codeRepoPath && (
            <div className="mb-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-400 mb-1">代码仓库路径：</p>
              <p className="text-xs text-gray-600 font-mono break-all text-left">
                {codeRepoPath}
              </p>
              {dataPath && (
                <>
                  <p className="text-xs text-gray-400 mt-1.5 mb-1">
                    工作区数据目录：
                  </p>
                  <p className="text-xs text-gray-600 font-mono break-all text-left">
                    {dataPath}
                  </p>
                </>
              )}
            </div>
          )}

          {/* 当前活跃工作区信息（从任务界面返回时显示） */}
          {isElectron && activeWorkspace && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-600 mb-1">当前工作区：</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-700">
                  {activeWorkspace.filename?.replace(/\.json$/i, "") || activeWorkspace.name}
                </span>
                <button
                  onClick={enterWorkspace}
                  className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  进入工作区 →
                </button>
              </div>
            </div>
          )}

          {/* 已有工作区文件列表 */}
          {isElectron && workspaceFiles.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2 font-medium">
                已有工作区（点击打开）：
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {workspaceFiles.map((filename) => {
                  const isActive = activeWorkspace?.filename === filename;
                  return (
                    <button
                      key={filename}
                      onClick={() => {
                        if (isActive) {
                          enterWorkspace();
                        } else {
                          openSpecificWorkspace(filename);
                        }
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors border ${
                        isActive
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "text-gray-700 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border-gray-100"
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-gray-400">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                      <span className="flex-1 text-left truncate">
                        {filename.replace(/\.json$/i, "")}
                      </span>
                      {isActive && (
                        <span className="text-xs text-blue-500 shrink-0">当前</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 按钮区域 */}
          <div className="flex flex-col gap-3">
            <button
              onClick={createWorkspace}
              className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              新建工作区
            </button>
            {isElectron ? (
              <button
                onClick={openWorkspaceFromFolder}
                className="w-full px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                打开现有工作区
              </button>
            ) : (
              <button
                onClick={openWorkspace}
                className="w-full px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                打开已有工作区
              </button>
            )}
            {isElectron && (
              <button
                onClick={async () => {
                  await openWorkspace();
                  refreshFileList();
                }}
                className="w-full px-4 py-2.5 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors"
              >
                刷新工作区列表
              </button>
            )}
          </div>

          {/* 说明文字 */}
          {isElectron ? (
            <p className="mt-4 text-xs text-gray-400">
              工作区数据保存在代码仓库的 taskData/ 目录下，所有改动将自动提交并推送到 Git 远程仓库。
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
