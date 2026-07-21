"use client";

import { useDroppable } from "@dnd-kit/core";
import { Quadrant } from "@/types";
import { QUADRANT_CONFIG } from "@/lib/constants";
import { useTaskStore } from "@/store/useTaskStore";
import { sortTasks } from "@/lib/utils";
import TaskCard from "./TaskCard";

interface QuadrantCellProps {
  quadrant: Quadrant;
}

export default function QuadrantCell({ quadrant }: QuadrantCellProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const modules = useTaskStore((s) => s.modules);
  const config = QUADRANT_CONFIG[quadrant];

  const { setNodeRef, isOver } = useDroppable({
    id: `quadrant-${quadrant}`,
    data: { type: "quadrant", quadrant },
  });

  const quadrantTasks = tasks.filter((t) => t.quadrant === quadrant);
  const sortedTasks = sortTasks(quadrantTasks);
  const uncompleted = sortedTasks.filter((t) => !t.completed);
  const completed = sortedTasks.filter((t) => t.completed);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg border-2 transition-colors min-h-0 ${
        isOver ? "border-solid" : "border-dashed"
      }`}
      style={{
        borderColor: isOver ? config.dotColor : config.borderColor,
        backgroundColor: isOver ? config.bgColor : "#fafafa",
      }}
    >
      {/* 象限标题 */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0 border-b"
        style={{ borderColor: config.borderColor }}
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: config.dotColor }}
        />
        <span
          className="text-sm font-medium"
          style={{ color: config.color }}
        >
          {config.label}
        </span>
        <span className="text-xs text-gray-400 ml-auto">
          {uncompleted.length} 项
        </span>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {uncompleted.map((task) => {
          const module = modules.find((m) => m.id === task.moduleId);
          return (
            <TaskCard
              key={task.id}
              task={task}
              showModuleTag
              moduleName={module?.name}
            />
          );
        })}

        {completed.length > 0 && (
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">已完成</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        )}

        {completed.map((task) => {
          const module = modules.find((m) => m.id === task.moduleId);
          return (
            <TaskCard
              key={task.id}
              task={task}
              showModuleTag
              moduleName={module?.name}
            />
          );
        })}

        {quadrantTasks.length === 0 && (
          <div className="text-center py-6 text-xs text-gray-300">
            拖拽任务到此象限
          </div>
        )}
      </div>
    </div>
  );
}
