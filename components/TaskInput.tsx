"use client";

import { useState, useRef } from "react";
import { useTaskStore } from "@/store/useTaskStore";

export default function TaskInput({ moduleId }: { moduleId: string }) {
  const [value, setValue] = useState("");
  const createTask = useTaskStore((s) => s.createTask);
  const setActiveModule = useTaskStore((s) => s.setActiveModule);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && value.trim()) {
      createTask(value, moduleId);
      setValue("");
    }
    if (e.key === "Escape") {
      setValue("");
      inputRef.current?.blur();
    }
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
      onClick={() => setActiveModule(moduleId)}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#9ca3af"
        strokeWidth="2"
        className="shrink-0"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setActiveModule(moduleId)}
        data-task-input={moduleId}
        placeholder="输入新任务，按 Enter 创建..."
        className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400"
      />
    </div>
  );
}
