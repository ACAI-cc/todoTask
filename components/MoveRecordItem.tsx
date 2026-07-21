"use client";

import { MoveRecord } from "@/types";
import { useTaskStore } from "@/store/useTaskStore";
import { QUADRANT_CONFIG } from "@/lib/constants";
import { relativeTime } from "@/lib/utils";

export default function MoveRecordItem({ record }: { record: MoveRecord }) {
  const undoMove = useTaskStore((s) => s.undoMove);
  const modules = useTaskStore((s) => s.modules);

  const targetModule = modules.find((m) => m.id === record.toModuleId);

  const getDescription = () => {
    if (record.type === "quadrant_change") {
      const fromLabel = record.fromQuadrant
        ? QUADRANT_CONFIG[record.fromQuadrant].shortLabel
        : "无";
      const toLabel = record.toQuadrant
        ? QUADRANT_CONFIG[record.toQuadrant].shortLabel
        : "无";
      return `标签由${fromLabel}改为${toLabel}`;
    }
    // 旧版 move 类型记录（仅兼容旧数据，不再生成）
    return `已移至【${targetModule?.name || "未知模块"}】`;
  };

  // 仅象限变更记录显示撤销按钮
  const canUndo = record.type === "quadrant_change";

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-sm">
      <div className="flex-1 min-w-0">
        <span className="text-gray-500">
          <span className="text-gray-400">«</span>
          <span className="text-gray-600 font-medium">{record.taskTitle}</span>
          <span className="text-gray-400">»</span>
          <span className="text-gray-500"> {getDescription()}</span>
        </span>
        <span className="text-xs text-gray-400 ml-2">
          {relativeTime(record.timestamp)}
        </span>
      </div>
      {canUndo && (
        <button
          onClick={() => undoMove(record.id)}
          className="shrink-0 text-xs text-blue-500 hover:text-blue-700 hover:underline"
        >
          撤销
        </button>
      )}
    </div>
  );
}
