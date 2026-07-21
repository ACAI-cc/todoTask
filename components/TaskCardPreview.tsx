"use client";

import { Task } from "@/types";
import { useTaskStore } from "@/store/useTaskStore";
import { QUADRANT_CONFIG } from "@/lib/constants";
import { relativeTime } from "@/lib/utils";

interface TaskCardPreviewProps {
  task: Task;
  showModuleTag?: boolean;
  moduleName?: string;
}

/**
 * TaskCard 的纯展示版本，用于 DragOverlay。
 * 不使用 useDraggable 钩子，避免重复注册。
 */
export default function TaskCardPreview({
  task,
  showModuleTag = false,
  moduleName,
}: TaskCardPreviewProps) {
  const modules = useTaskStore((s) => s.modules);

  const quadrantConfig = task.quadrant
    ? QUADRANT_CONFIG[task.quadrant]
    : null;

  const sourceModule = task.sourceModuleId
    ? modules.find((m) => m.id === task.sourceModuleId)
    : null;

  const movedToModule = task.movedToModuleId
    ? modules.find((m) => m.id === task.movedToModuleId)
    : null;

  const isMovedTask = !!(task.completed && task.movedToModuleId);

  return (
    <div className="relative bg-white rounded-lg border border-gray-300 px-3 py-2 shadow-lg no-select">
      {/* 来源标签 */}
      {sourceModule && (
        <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
          <span>←</span>
          <span>{sourceModule.name}</span>
        </div>
      )}

      {/* 模块标签 */}
      {showModuleTag && moduleName && (
        <div className="text-xs text-gray-400 mb-1">{moduleName}</div>
      )}

      <div className="flex items-center gap-2">
        {/* 优先级圆点 */}
        {quadrantConfig && (
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: quadrantConfig.dotColor }}
            title={quadrantConfig.label}
          />
        )}
        {!quadrantConfig && <div className="w-2 shrink-0" />}

        {/* 勾选框 */}
        <div
          className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
            task.completed
              ? "bg-gray-400 border-gray-400"
              : "border-gray-300"
          }`}
        >
          {task.completed && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </div>

        {/* 任务标题 */}
        <span
          className={`flex-1 text-sm ${
            task.completed ? "text-gray-400 line-through" : "text-gray-800"
          }`}
        >
          {task.title}
        </span>

        {/* 时间 */}
        <span className="text-xs text-gray-300 shrink-0">
          {task.completed
            ? task.completedAt
              ? relativeTime(task.completedAt)
              : ""
            : relativeTime(task.createdAt)}
        </span>
      </div>

      {/* 移动信息 */}
      {isMovedTask && movedToModule && (
        <div className="mt-1 pl-6 text-xs text-gray-400">
          {task.movedAt && relativeTime(task.movedAt)}已移至「{movedToModule.name}」
        </div>
      )}
    </div>
  );
}
