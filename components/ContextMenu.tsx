"use client";

import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useTaskStore } from "@/store/useTaskStore";
import { Quadrant, TaskStatus } from "@/types";
import { QUADRANT_CONFIG, QUADRANT_LIST } from "@/lib/constants";
import { normalizeTaskStatus } from "@/lib/utils";

export default function ContextMenu() {
  const contextMenu = useTaskStore((s) => s.contextMenu);
  const setContextMenu = useTaskStore((s) => s.setContextMenu);
  const tasks = useTaskStore((s) => s.tasks);
  const modules = useTaskStore((s) => s.modules);
  const moveTask = useTaskStore((s) => s.moveTask);
  const setQuadrant = useTaskStore((s) => s.setQuadrant);
  const editTaskContact = useTaskStore((s) => s.editTaskContact);
  const setTaskStatus = useTaskStore((s) => s.setTaskStatus);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const [showContactInput, setShowContactInput] = useState(false);
  const [contactValue, setContactValue] = useState("");
  const contactInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) {
      setShowMoveSubmenu(false);
      setShowContactInput(false);
      return;
    }

    if (showContactInput && contactInputRef.current) {
      contactInputRef.current.focus();
      contactInputRef.current.select();
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showContactInput) {
          setShowContactInput(false);
        } else {
          setContextMenu(null);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu, setContextMenu, showContactInput]);

  if (!contextMenu) return null;

  const task = tasks.find((t) => t.id === contextMenu.taskId);
  if (!task) return null;

  // 可移动到的模块（排除当前模块）
  const otherModules = modules
    .filter((m) => m.id !== task.moduleId)
    .sort((a, b) => a.order - b.order);

  // 状态切换图标
  const checkIcon: ReactNode = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
  const banIcon: ReactNode = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
  );
  const undoIcon: ReactNode = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );

  // 每个「当前状态」对应的可切换目标：
  //   todo       → 改为已完成 / 废弃
  //   completed  → 恢复为未完成 / 废弃
  //   discarded  → 恢复为未完成 / 改为已完成
  const STATUS_ACTIONS: Record<
    TaskStatus,
    { status: TaskStatus; label: string; icon: ReactNode }[]
  > = {
    todo: [
      { status: "completed", label: "改为已完成", icon: checkIcon },
      { status: "discarded", label: "废弃", icon: banIcon },
    ],
    completed: [
      { status: "todo", label: "恢复为未完成", icon: undoIcon },
      { status: "discarded", label: "废弃", icon: banIcon },
    ],
    discarded: [
      { status: "todo", label: "恢复为未完成", icon: undoIcon },
      { status: "completed", label: "改为已完成", icon: checkIcon },
    ],
  };

  // 实时按任务当前 status 取值；数据缺少 status 字段时由 completed 推导，
  // 不存在任何中间状态，也不需要二次右键刷新。
  const currentStatus = normalizeTaskStatus(task);
  const statusActions = STATUS_ACTIONS[currentStatus];

  // 调整菜单位置，确保不超出视口
  const menuWidth = 200;
  const menuHeight = showMoveSubmenu ? 370 : 290;
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

      {/* 编辑联系人 */}
      {showContactInput ? (
        <div className="px-3 py-1">
          <input
            ref={contactInputRef}
            type="text"
            value={contactValue}
            onChange={(e) => setContactValue(e.target.value)}
            onBlur={() => {
              const trimmed = contactValue.trim();
              if (trimmed !== (task.contact || "")) {
                editTaskContact(task.id, trimmed || null);
              }
              setShowContactInput(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const trimmed = contactValue.trim();
                if (trimmed !== (task.contact || "")) {
                  editTaskContact(task.id, trimmed || null);
                }
                setShowContactInput(false);
              }
            }}
            className="w-full text-sm px-2 py-1 border border-blue-300 rounded focus:outline-none"
            placeholder="输入联系人姓名..."
          />
        </div>
      ) : (
        <button
          onClick={() => {
            setContactValue(task.contact || "");
            setShowContactInput(true);
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>{task.contact ? `编辑联系人：${task.contact}` : "添加联系人"}</span>
        </button>
      )}

      <div className="border-t border-gray-100 my-1" />

      {/* 状态切换：按任务当前 status 实时渲染，点击后立即生效并原地刷新菜单 */}
      <div className="px-3 py-1 text-xs text-gray-400 font-medium">
        修改状态
      </div>
      {statusActions.map((action) => (
        <button
          key={action.status}
          onClick={() => {
            setTaskStatus(task.id, action.status);
            // 不关闭菜单：状态写入 store 后本组件会按新的 status 重新渲染选项，
            // 同时 setTaskStatus 内部已触发自动保存与 Git 同步
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}

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
