"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState } from "react";
import { Quadrant } from "@/types";
import { useTaskStore } from "@/store/useTaskStore";
import QuadrantCell from "./QuadrantCell";
import TaskCardPreview from "./TaskCardPreview";

const QUADRANT_LAYOUT: { quadrant: Quadrant; label: string }[][] = [
  [
    { quadrant: "important_urgent", label: "重要且紧急" },
    { quadrant: "not_important_urgent", label: "不重要但紧急" },
  ],
  [
    { quadrant: "important_not_urgent", label: "重要不紧急" },
    { quadrant: "not_important_not_urgent", label: "不重要不紧急" },
  ],
];

export default function QuadrantView() {
  const tasks = useTaskStore((s) => s.tasks);
  const setQuadrant = useTaskStore((s) => s.setQuadrant);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

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

    const overData = over.data.current;
    if (overData?.type === "quadrant") {
      const targetQuadrant = overData.quadrant as Quadrant;
      if (task.quadrant !== targetQuadrant) {
        setQuadrant(taskId, targetQuadrant);
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
      <div className="h-full p-4 flex flex-col">
        {/* 坐标轴和矩阵 */}
        <div className="flex-1 flex min-h-0">
          {/* Y 轴标签（重要程度） */}
          <div className="flex flex-col items-center justify-between py-4 pr-2">
            <span className="text-xs font-medium text-gray-600 [writing-mode:vertical-rl] rotate-180">
              重要 ▲
            </span>
            <span className="text-xs font-medium text-gray-600 [writing-mode:vertical-rl] rotate-180">
              ▼ 不重要
            </span>
          </div>

          {/* 矩阵区域 */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* 矩阵 */}
            <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 min-h-0">
              {QUADRANT_LAYOUT.flat().map(({ quadrant }) => (
                <QuadrantCell key={quadrant} quadrant={quadrant} />
              ))}
            </div>

            {/* X 轴标签（紧急程度） */}
            <div className="flex justify-between px-8 py-2">
              <span className="text-xs font-medium text-gray-600">
                ← 不紧急
              </span>
              <span className="text-xs font-medium text-gray-600">
                紧急 →
              </span>
            </div>
          </div>
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
