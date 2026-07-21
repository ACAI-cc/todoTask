"use client";

import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useState } from "react";
import { useTaskStore } from "@/store/useTaskStore";
import ModuleColumn from "./ModuleColumn";
import TaskCardPreview from "./TaskCardPreview";

export default function ModuleView() {
  const modules = useTaskStore((s) => s.modules);
  const tasks = useTaskStore((s) => s.tasks);
  const moveTask = useTaskStore((s) => s.moveTask);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // 按顺序排列可见模块
  const visibleModules = modules
    .filter((m) => m.visible)
    .sort((a, b) => a.order - b.order);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveTaskId(e.active.id as string);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveTaskId(null);
    const { active, over } = e;
    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // 检查放置目标是否是模块
    const overData = over.data.current;
    if (overData?.type === "module") {
      const targetModuleId = overData.moduleId as string;
      if (task.moduleId !== targetModuleId) {
        moveTask(taskId, targetModuleId);
      }
    }
  };

  const activeTask = activeTaskId
    ? tasks.find((t) => t.id === activeTaskId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 p-4 h-full min-w-fit">
          {visibleModules.map((module) => (
            <ModuleColumn key={module.id} module={module} />
          ))}
          {visibleModules.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              没有可见模块。请点击右上角设置按钮来显示模块。
            </div>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-3">
            <TaskCardPreview task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
