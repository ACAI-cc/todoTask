"use client";

import { useState } from "react";
import { useTaskStore } from "@/store/useTaskStore";
import { MODULE_BG_COLORS } from "@/lib/constants";

export default function SettingsPanel() {
  const settingsOpen = useTaskStore((s) => s.settingsOpen);
  const setSettingsOpen = useTaskStore((s) => s.setSettingsOpen);
  const modules = useTaskStore((s) => s.modules);
  const addModule = useTaskStore((s) => s.addModule);
  const deleteModule = useTaskStore((s) => s.deleteModule);
  const renameModule = useTaskStore((s) => s.renameModule);
  const reorderModule = useTaskStore((s) => s.reorderModule);
  const toggleModuleVisible = useTaskStore((s) => s.toggleModuleVisible);
  const setModuleBgColor = useTaskStore((s) => s.setModuleBgColor);
  const exportData = useTaskStore((s) => s.exportData);
  const importData = useTaskStore((s) => s.importData);

  // 工作区相关
  const workspaces = useTaskStore((s) => s.workspaces);
  const activeWorkspaceId = useTaskStore((s) => s.activeWorkspaceId);
  const openWorkspace = useTaskStore((s) => s.openWorkspace);
  const closeWorkspace = useTaskStore((s) => s.closeWorkspace);
  const renameWorkspace = useTaskStore((s) => s.renameWorkspace);
  const switchWorkspace = useTaskStore((s) => s.switchWorkspace);
  const isElectron = useTaskStore((s) => s.isElectron);
  const syncStatus = useTaskStore((s) => s.syncStatus);
  const triggerManualSync = useTaskStore((s) => s.triggerManualSync);
  const setAutoPush = useTaskStore((s) => s.setAutoPush);

  const [newModuleName, setNewModuleName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [customColor, setCustomColor] = useState("");

  const sortedModules = [...modules].sort((a, b) => a.order - b.order);

  if (!settingsOpen) return null;

  const handleAdd = () => {
    if (newModuleName.trim()) {
      addModule(newModuleName);
      setNewModuleName("");
    }
  };

  const handleStartRename = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const handleSaveRename = () => {
    if (editingId && editName.trim()) {
      renameModule(editingId, editName);
    }
    setEditingId(null);
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/20 z-40 animate-fade-in"
        onClick={() => setSettingsOpen(false)}
      />

      {/* 面板 */}
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-xl z-50 flex flex-col animate-slide-up">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">设置</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* 工作区管理 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              工作区管理
            </h3>

            {/* 工作区列表 */}
            <div className="space-y-2 mb-3">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  onClick={() => {
                    if (ws.id !== activeWorkspaceId) {
                      switchWorkspace(ws.id);
                    }
                  }}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                    ws.id === activeWorkspaceId
                      ? "bg-blue-50 border-blue-200"
                      : "bg-gray-50 border-gray-100 cursor-pointer hover:bg-gray-100"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-gray-500">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  <span className={`flex-1 text-sm truncate ${
                    ws.id === activeWorkspaceId ? "text-blue-700 font-medium" : "text-gray-700"
                  }`}>
                    {isElectron ? (ws.filename || ws.name).replace(/\.json$/i, "") : ws.name}
                  </span>
                  {ws.id === activeWorkspaceId && (
                    <span className="text-xs text-blue-500 shrink-0">当前</span>
                  )}
                  {/* 重命名（另存为）按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      renameWorkspace(ws.id);
                    }}
                    className="shrink-0 p-1 text-gray-400 hover:text-gray-600"
                    title="另存为..."
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  {/* 关闭按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeWorkspace(ws.id);
                    }}
                    className="shrink-0 p-1 text-gray-400 hover:text-red-500"
                    title="关闭工作区（文件保留在磁盘上）"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {workspaces.length === 0 && (
                <div className="text-sm text-gray-400 p-2">
                  暂无打开的工作区
                </div>
              )}
            </div>

            {/* 打开工作区按钮 */}
            <button
              onClick={openWorkspace}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              {isElectron ? "刷新工作区列表" : "打开工作区"}
            </button>
            <p className="mt-2 text-xs text-gray-400">
              {isElectron
                ? "工作区文件存储在 taskData/ 目录下，每个 .json 文件是一个独立工作区。文件变更将自动同步到 Git 远程仓库。"
                : "每个工作区对应一个独立的 JSON 文件，数据完全隔离。关闭工作区仅从列表移除，文件保留在磁盘上。"}
            </p>
          </section>

          {/* 分隔线 */}
          <div className="border-t border-gray-100" />

          {/* 模块管理 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              模块管理
            </h3>

            {/* 新增模块 */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
                placeholder="新模块名称..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-300"
              />
              <button
                onClick={handleAdd}
                className="px-3 py-2 text-sm text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
              >
                添加
              </button>
            </div>

            {/* 模块列表 */}
            <div className="space-y-2">
              {sortedModules.map((module, index) => (
                <div
                  key={module.id}
                  className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100"
                >
                  {/* 排序按钮 */}
                  <div className="flex flex-col">
                    <button
                      onClick={() => reorderModule(module.id, "up")}
                      disabled={index === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="m18 15-6-6-6 6" />
                      </svg>
                    </button>
                    <button
                      onClick={() => reorderModule(module.id, "down")}
                      disabled={index === sortedModules.length - 1}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  </div>

                  {/* 显示/隐藏 */}
                  <button
                    onClick={() => toggleModuleVisible(module.id)}
                    className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      module.visible
                        ? "bg-blue-500 border-blue-500"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    title={module.visible ? "点击隐藏" : "点击显示"}
                  >
                    {module.visible && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>

                  {/* 模块名称 */}
                  {editingId === module.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleSaveRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded"
                    />
                  ) : (
                    <span
                      onClick={() =>
                        module.isPreset && handleStartRename(module.id, module.name)
                      }
                      className={`flex-1 text-sm ${
                        module.isPreset
                          ? "text-gray-700 cursor-text"
                          : "text-gray-700 cursor-pointer hover:text-blue-500"
                      }`}
                      onDoubleClick={() =>
                        handleStartRename(module.id, module.name)
                      }
                    >
                      {module.name}
                      {module.isPreset && (
                        <span className="text-xs text-gray-400 ml-1">(预设)</span>
                      )}
                    </span>
                  )}

                  {/* 重命名按钮 */}
                  <button
                    onClick={() => handleStartRename(module.id, module.name)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                    title="重命名"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>

                  {/* 背景颜色按钮 */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setColorPickerId(
                          colorPickerId === module.id ? null : module.id
                        );
                        setCustomColor(module.bgColor || "");
                      }}
                      className="p-1 rounded border border-gray-200 hover:border-gray-300"
                      title="设置背景颜色"
                    >
                      <div
                        className="w-3.5 h-3.5 rounded-sm"
                        style={{
                          backgroundColor: module.bgColor || "#ffffff",
                          border: "1px solid #e5e7eb",
                        }}
                      />
                    </button>
                    {colorPickerId === module.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setColorPickerId(null)}
                        />
                        <div className="absolute right-0 top-8 z-20 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-48">
                          <div className="text-xs text-gray-500 mb-2">背景颜色</div>
                          <div className="grid grid-cols-3 gap-1.5 mb-3">
                            {MODULE_BG_COLORS.map((color) => (
                              <button
                                key={color.label}
                                onClick={() => {
                                  setModuleBgColor(module.id, color.value);
                                  setColorPickerId(null);
                                }}
                                className={`flex flex-col items-center gap-0.5 p-1 rounded hover:bg-gray-50 transition-colors ${
                                  module.bgColor === color.value
                                    ? "ring-1 ring-blue-300 bg-blue-50"
                                    : ""
                                }`}
                                title={color.label}
                              >
                                <div
                                  className="w-6 h-6 rounded border border-gray-200"
                                  style={{
                                    backgroundColor: color.value || "#ffffff",
                                  }}
                                />
                                <span className="text-[10px] text-gray-500">
                                  {color.label}
                                </span>
                              </button>
                            ))}
                          </div>
                          <div className="border-t border-gray-100 pt-2">
                            <div className="text-xs text-gray-500 mb-1">自定义</div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={customColor || "#ffffff"}
                                onChange={(e) => {
                                  setCustomColor(e.target.value);
                                  setModuleBgColor(module.id, e.target.value);
                                }}
                                className="w-7 h-7 rounded border border-gray-200 cursor-pointer"
                              />
                              <input
                                type="text"
                                value={customColor || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCustomColor(val);
                                  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                                    setModuleBgColor(module.id, val);
                                  }
                                }}
                                placeholder="#ffffff"
                                className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:border-blue-300"
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 删除按钮 */}
                  {!module.isPreset && (
                    <button
                      onClick={() => deleteModule(module.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                      title="删除模块"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 数据管理 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              数据管理
            </h3>
            <div className="space-y-2">
              <button
                onClick={exportData}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                导出数据 (JSON)
              </button>
              <button
                onClick={importData}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                导入数据 (JSON)
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              导出/导入仅影响当前工作区的数据，可用作备份。
            </p>
          </section>

          {/* Git 自动同步设置（仅 Electron 模式）*/}
          {isElectron && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Git 自动同步
              </h3>

              {/* Git 状态信息 */}
              <div className="mb-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                {syncStatus?.gitAvailable ? (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${
                        syncStatus.state === "error" ? "bg-red-500" :
                        syncStatus.state === "syncing" ? "bg-blue-500 animate-pulse" :
                        syncStatus.state === "success" ? "bg-green-500" :
                        syncStatus.state === "pending" ? "bg-amber-500" :
                        "bg-gray-400"
                      }`} />
                      <span className="text-sm text-gray-700">
                        {syncStatus.state === "idle" && "空闲"}
                        {syncStatus.state === "pending" && "等待同步"}
                        {syncStatus.state === "syncing" && "正在同步..."}
                        {syncStatus.state === "success" && "同步成功"}
                        {syncStatus.state === "error" && "同步失败"}
                      </span>
                    </div>
                    {syncStatus.message && (
                      <p className="text-xs text-gray-500 ml-4">
                        {syncStatus.message}
                      </p>
                    )}
                    {syncStatus.lastSyncTime && (
                      <p className="text-xs text-gray-400 ml-4 mt-0.5">
                        上次同步: {new Date(syncStatus.lastSyncTime).toLocaleString("zh-CN")}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 text-sm">⚠️</span>
                    <div>
                      <p className="text-sm text-gray-700">Git 不可用</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {syncStatus?.message || "未检测到 Git 仓库，自动推送不可用。"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 自动推送开关 */}
              {syncStatus?.gitAvailable && (
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-gray-700">自动推送任务数据到 Git 远程仓库</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      文件变更后 60 秒自动提交并推送
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoPush(!syncStatus.autoPushEnabled)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      syncStatus.autoPushEnabled ? "bg-green-500" : "bg-gray-300"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        syncStatus.autoPushEnabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* 立即同步按钮 */}
              {syncStatus?.gitAvailable && (
                <button
                  onClick={() => triggerManualSync()}
                  disabled={syncStatus.state === "syncing"}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={syncStatus.state === "syncing" ? "animate-spin" : ""}>
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  立即同步
                </button>
              )}
            </section>
          )}

          {/* 分隔线 */}
          {isElectron && <div className="border-t border-gray-100" />}

          {/* 快捷键说明 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              快捷键
            </h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center justify-between">
                <span>聚焦输入框</span>
                <kbd className="px-2 py-0.5 text-xs bg-gray-100 border border-gray-200 rounded">
                  Ctrl + N
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>设置重要且紧急</span>
                <kbd className="px-2 py-0.5 text-xs bg-gray-100 border border-gray-200 rounded">
                  Ctrl + 1
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>设置重要不紧急</span>
                <kbd className="px-2 py-0.5 text-xs bg-gray-100 border border-gray-200 rounded">
                  Ctrl + 2
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>设置不重要但紧急</span>
                <kbd className="px-2 py-0.5 text-xs bg-gray-100 border border-gray-200 rounded">
                  Ctrl + 3
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>设置不重要不紧急</span>
                <kbd className="px-2 py-0.5 text-xs bg-gray-100 border border-gray-200 rounded">
                  Ctrl + 4
                </kbd>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
