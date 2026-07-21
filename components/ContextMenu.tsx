"use client";

import { useState, useEffect, useRef } from "react";
import { useTaskStore } from "@/store/useTaskStore";
import { Quadrant } from "@/types";
import { QUADRANT_CONFIG, QUADRANT_LIST } from "@/lib/constants";

export default function ContextMenu() {
  const contextMenu = useTaskStore((s) => s.contextMenu);
  const setContextMenu = useTaskStore((s) => s.setContextMenu);
  const tasks = useTaskStore((s) => s.tasks);
  const modules = useTaskStore((s) => s.modules);
  const moveTask = useTaskStore((s) => s.moveTask);
  const setQuadrant = useTaskStore((s) => s.setQuadrant);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) {
      setShowMoveSubmenu(false);
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu, setContextMenu]);

  if (!contextMenu) return null;

  const task = tasks.find((t) => t.id === contextMenu.taskId);
  if (!task) return null;

  // 可移动到的模块（排除当前模块）
  const otherModules = modules
    .filter((m) => m.id !== task.moduleId)
    .sort((a, b) => a.order - b.order);

  // 调整菜单位置，确保不超出视口
  const menuWidth = 200;
  const menuHeight = showMoveSubmenu ? 300 : 220;
  const x = Math.min(contextMenu.x, window.innerWidth - menuWidth - 10);
  const y = Math.min(contextMenu.y, window.innerHeight - menuHeight - 10);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[200px] animate-scale-in"
      style={{ left: x, top: y }}
    >
      {/* 移动到... */}
      <div className="relative">
        <button
          onClick={() => setShowMoveSubmenu(!showMoveSubmenu)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <span>移动到...</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        {/* 移动到子菜单 */}
        {showMoveSubmenu && (
          <div className="absolute left-full top-0 ml-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px] animate-scale-in">
            {otherModules.map((module) => (
              <button
                key={module.id}
                onClick={() => {
                  moveTask(task.id, module.id);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                <span className="truncate">{module.name}</span>
              </button>
            ))}
            {otherModules.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">
                没有其他模块
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 my-1" />

      {/* 设置优先级 */}
      <div className="px-3 py-1 text-xs text-gray-400 font-medium">
        设置优先级
      </div>
      {QUADRANT_LIST.map((q) => {
        const config = QUADRANT_CONFIG[q];
        return (
          <button
            key={q}
            onClick={() => {
              setQuadrant(
                task.id,
                task.quadrant === q ? null : q
              );
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: config.dotColor }}
            />
            <span>{config.label}</span>
            {task.quadrant === q && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto text-gray-400">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </button>
        );
      })}
      {task.quadrant && (
        <button
          onClick={() => {
            setQuadrant(task.id, null);
            setContextMenu(null);
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <span className="w-2.5 h-2.5 rounded-full border border-gray-300 shrink-0" />
          <span>取消标签</span>
        </button>
      )}
    </div>
  );
}
