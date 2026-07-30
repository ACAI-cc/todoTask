"use client";

import { useState, useEffect, useRef } from "react";
import { useTaskStore } from "@/store/useTaskStore";

/**
 * 自定义 Prompt 对话框组件
 *
 * 替代 window.prompt()，因为 Electron (contextIsolation: true) 不支持原生 prompt。
 * 通过 store 的 promptDialog 状态驱动，使用 Promise 返回用户输入。
 *
 * 使用非受控输入（defaultValue + ref）以避免 Electron 中的状态同步问题。
 */
export default function PromptDialog() {
  const promptDialog = useTaskStore((s) => s.promptDialog);
  const closePromptDialog = useTaskStore((s) => s.closePromptDialog);

  const inputRef = useRef<HTMLInputElement>(null);

  // 对话框打开时聚焦输入框
  useEffect(() => {
    if (!promptDialog) return;

    // 用 setTimeout 确保 DOM 完成渲染后再聚焦
    const timer = setTimeout(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [promptDialog]);

  // ESC 键取消
  useEffect(() => {
    if (!promptDialog) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePromptDialog(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [promptDialog, closePromptDialog]);

  if (!promptDialog) return null;

  const handleConfirm = () => {
    const val = inputRef.current?.value?.trim() || "";
    closePromptDialog(val || null);
  };

  const handleCancel = () => {
    closePromptDialog(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onMouseDown={handleCancel}
    >
      <form
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm mx-4 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden"
      >
        {/* 标题栏 */}
        <div className="px-5 pt-5 pb-2">
          <h3 className="text-base font-semibold text-gray-900">
            {promptDialog.title}
          </h3>
        </div>

        {/* 内容区 */}
        <div className="px-5 pb-4">
          {promptDialog.label && (
            <label className="block text-sm text-gray-600 mb-2">
              {promptDialog.label}
            </label>
          )}
          <input
            ref={inputRef}
            type="text"
            defaultValue={promptDialog.defaultValue || ""}
            placeholder={promptDialog.placeholder}
            autoFocus
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* 按钮区 */}
        <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-1.5 text-sm text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 text-sm text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
          >
            {promptDialog.confirmText || "确定"}
          </button>
        </div>
      </form>
    </div>
  );
}
