"use client";

import { useDroppable } from "@dnd-kit/core";
import { ModuleItem } from "@/types";
import { useTaskStore } from "@/store/useTaskStore";
import { sortTasks } from "@/lib/utils";
import TaskInput from "./TaskInput";
import TaskCard from "./TaskCard";
import MoveRecordItem from "./MoveRecordItem";

interface ModuleColumnProps {
  module: ModuleItem;
}

export default function ModuleColumn({ module }: ModuleColumnProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const moveRecords = useTaskStore((s) => s.moveRecords);
  const setActiveModule = useTaskStore((s) => s.setActiveModule);

  // 该模块下的任务
  const moduleTasks = tasks.filter((t) => t.moduleId === module.id);
  const sortedTasks = sortTasks(moduleTasks);
  const uncompletedTasks = sortedTasks.filter((t) => !t.completed);
  const completedTasks = sortedTasks.filter((t) => t.completed);

  // 该模块下的象限变更记录（移动记录不再使用独立记录条目）
  const moduleMoveRecords = moveRecords
    .filter((r) => r.fromModuleId === module.id && r.type === "quadrant_change")
    .sort((a, b) => b.timestamp - a.timestamp);

  // dnd-kit droppable
  const { setNodeRef, isOver } = useDroppable({
    id: `module-${module.id}`,
    data: { type: "module", moduleId: module.id },
  });

  // 模块背景色
  const bgColor = module.bgColor || "#ffffff";

  // 计算背景色亮度，决定文字颜色
  const getTextColor = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 180 ? "#1f2937" : "#ffffff";
  };

  const textColor = module.bgColor ? getTextColor(module.bgColor) : "#1f2937";
  const subTextColor = module.bgColor ? getTextColor(module.bgColor) : "#9ca3af";
  const borderColor = module.bgColor && getTextColor(module.bgColor) === "#ffffff" 
    ? "rgba(255,255,255,0.1)" 
    : "rgba(209,213,219,0.6)";

  return (
    <div
      ref={setNodeRef}
      onClick={() => setActiveModule(module.id)}
      className={`flex flex-col w-[360px] shrink-0 rounded-xl border transition-colors ${
        isOver
          ? "border-blue-300"
          : "border-gray-200"
      }`}
      style={{ backgroundColor: bgColor }}
    >
      {/* 模块头部 */}
      <div 
        className="px-4 py-3 border-b shrink-0"
        style={{ borderColor }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: textColor }}>
            {module.name}
          </h2>
          <span className="text-xs" style={{ color: subTextColor }}>
            {uncompletedTasks.length} 项
          </span>
        </div>
      </div>

      {/* 任务输入框 */}
      <div className="px-3 pt-3 shrink-0">
        <TaskInput moduleId={module.id} />
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {/* 未完成任务 */}
        {uncompletedTasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}

        {/* 移动记录（在未完成和已完成之间） */}
        {moduleMoveRecords.map((record) => (
          <MoveRecordItem key={record.id} record={record} />
        ))}

        {/* 分隔线 */}
        {completedTasks.length > 0 && (
          <div className="flex items-center gap-2 py-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">已完成</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        )}

        {/* 已完成任务 */}
        {completedTasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}

        {/* 空状态 */}
        {uncompletedTasks.length === 0 &&
          completedTasks.length === 0 &&
          moduleMoveRecords.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-300">
              暂无任务
            </div>
          )}
      </div>
    </div>
  );
}
