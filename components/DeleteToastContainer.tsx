"use client";

import { useTaskStore } from "@/store/useTaskStore";

export default function DeleteToastContainer() {
  const toasts = useTaskStore((s) => s.deleteToasts);
  const undoDelete = useTaskStore((s) => s.undoDelete);
  const dismissDeleteToast = useTaskStore((s) => s.dismissDeleteToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="relative flex items-center gap-3 px-4 py-2.5 bg-gray-900 text-white rounded-lg shadow-lg animate-slide-up overflow-hidden"
        >
          <span className="text-sm">
            已删除「{toast.task.title}」
          </span>
          <span className="text-xs text-gray-400">
            {toast.countdown}s 后永久删除
          </span>
          {/* 倒计时进度条 */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-700 rounded-b-lg overflow-hidden">
            <div
              className="h-full bg-gray-500 transition-all duration-1000 ease-linear"
              style={{
                width: `${(toast.countdown / 3) * 100}%`,
              }}
            />
          </div>
          <button
            onClick={() => undoDelete(toast.id)}
            className="text-sm text-blue-400 hover:text-blue-300 font-medium ml-2"
          >
            撤销
          </button>
          <button
            onClick={() => dismissDeleteToast(toast.id)}
            className="text-gray-500 hover:text-gray-300"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
