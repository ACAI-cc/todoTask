"use client";

import { Quadrant } from "@/types";
import { QUADRANT_CONFIG, QUADRANT_LIST } from "@/lib/constants";
import { useTaskStore } from "@/store/useTaskStore";

interface PrioritySelectorProps {
  taskId: string;
  currentQuadrant: Quadrant | null;
  onClose: () => void;
}

export default function PrioritySelector({
  taskId,
  currentQuadrant,
  onClose,
}: PrioritySelectorProps) {
  const setQuadrant = useTaskStore((s) => s.setQuadrant);

  const handleSelect = (quadrant: Quadrant | null) => {
    setQuadrant(taskId, quadrant);
    onClose();
  };

  return (
    <div
      className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px] animate-scale-in"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-xs text-gray-400 font-medium">
        设置优先级
      </div>
      {QUADRANT_LIST.map((q) => {
        const config = QUADRANT_CONFIG[q];
        return (
          <button
            key={q}
            onClick={() => handleSelect(q)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${
              currentQuadrant === q ? "bg-gray-50" : ""
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: config.dotColor }}
            />
            <span className="text-gray-700">{config.label}</span>
            {currentQuadrant === q && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="ml-auto text-gray-400"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </button>
        );
      })}
      {currentQuadrant && (
        <>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => handleSelect(null)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span className="w-2.5 h-2.5 rounded-full border border-gray-300 shrink-0" />
            <span>取消标签</span>
          </button>
        </>
      )}
    </div>
  );
}
