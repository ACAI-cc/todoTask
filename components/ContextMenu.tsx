"use client";

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { useTaskStore } from "@/store/useTaskStore";
import { Quadrant, TaskStatus } from "@/types";
import { QUADRANT_CONFIG, QUADRANT_LIST } from "@/lib/constants";
import { normalizeTaskStatus } from "@/lib/utils";

const VIEWPORT_MARGIN = 8; // 菜单与视口边缘的安全间距
const SUBMENU_GAP = 6; // 子菜单与父菜单之间的间距
const SUBMENU_MIN_WIDTH = 180; // 子菜单最小宽度（用于翻转判断）
const SUBMENU_ROW_HEIGHT = 32; // 子菜单每行估算高度

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
  const [submenuSide, setSubmenuSide] = useState<"right" | "left">("right");
  const [submenuAlignUp, setSubmenuAlignUp] = useState(false);
  const [showContactInput, setShowContactInput] = useState(false);
  const [contactValue, setContactValue] = useState("");
  const contactInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  // 统一关闭入口：清理子菜单 / 输入态，并清空菜单状态
  const closeMenu = useCallback(() => {
    setShowMoveSubmenu(false);
    setShowContactInput(false);
    setSubmenuAlignUp(false);
    setMenuPos(null);
    setContextMenu(null);
  }, [setContextMenu]);

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
        closeMenu();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showContactInput) {
          setShowContactInput(false);
        } else if (showMoveSubmenu) {
          setShowMoveSubmenu(false);
        } else {
          closeMenu();
        }
      }
    };

    const handleResize = () => closeMenu();

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleResize);
    };
  }, [contextMenu, closeMenu, showContactInput, showMoveSubmenu]);

  // 渲染后测量菜单实际尺寸并做边界收敛，保证父菜单完整落在视口内
  useLayoutEffect(() => {
    if (!contextMenu) {
      setMenuPos(null);
      return;
    }
    const el = menuRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = contextMenu.x;
    let y = contextMenu.y;

    if (x + rect.width > vw - VIEWPORT_MARGIN) {
      x = vw - rect.width - VIEWPORT_MARGIN;
    }
    if (y + rect.height > vh - VIEWPORT_MARGIN) {
      y = vh - rect.height - VIEWPORT_MARGIN;
    }
    if (x < VIEWPORT_MARGIN) x = VIEWPORT_MARGIN;
    if (y < VIEWPORT_MARGIN) y = VIEWPORT_MARGIN;

    setMenuPos({ x, y });
  }, [contextMenu, showContactInput]);

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

  // 展开「移动到」子菜单前先做边界检测，决定左/右弹出与向上/向下对齐
  const toggleMoveSubmenu = () => {
    if (showMoveSubmenu) {
      setShowMoveSubmenu(false);
      return;
    }

    const el = menuRef.current;
    let side: "right" | "left" = "right";
    let alignUp = false;

    if (el) {
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const needed = SUBMENU_GAP + SUBMENU_MIN_WIDTH;
      const spaceRight = vw - rect.right - VIEWPORT_MARGIN;
      const spaceLeft = rect.left - VIEWPORT_MARGIN;

      if (spaceRight < needed) {
        // 右侧放不下：优先翻到左侧；左侧也放不下时选空间更大的一侧
        side = spaceLeft >= needed || spaceLeft > spaceRight ? "left" : "right";
      }

      // 纵向：估算子菜单高度，下方空间不足且上方更宽裕时改为向上对齐
      const estimatedHeight = Math.min(
        vh - VIEWPORT_MARGIN * 2,
        Math.max(44, otherModules.length * SUBMENU_ROW_HEIGHT + 16)
      );
      if (
        rect.top + estimatedHeight > vh - VIEWPORT_MARGIN &&
        rect.bottom - estimatedHeight >= VIEWPORT_MARGIN
      ) {
        alignUp = true;
      }
    }

    setSubmenuSide(side);
    setSubmenuAlignUp(alignUp);
    setShowMoveSubmenu(true);
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[200px] animate-scale-in"
      style={{
        left: menuPos ? menuPos.x : contextMenu.x,
        top: menuPos ? menuPos.y : contextMenu.y,
        visibility: menuPos ? "visible" : "hidden",
      }}
    >
      {/* 移动到... */}
      <div>
        <button
          onClick={toggleMoveSubmenu}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <span>移动到...</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="ml-auto"
          >
            {submenuSide === "right" ? (
              <path d="m9 18 6-6-6-6" />
            ) : (
              <path d="m15 18-6-6 6-6" />
            )}
          </svg>
        </button>

        {/* 移动到子菜单：按可用空间自动左右翻转 / 上下对齐 */}
        {showMoveSubmenu && (
          <div
            className="absolute z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px] max-w-[180px] animate-scale-in overflow-y-auto"
            style={{
              maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
              ...(submenuSide === "right"
                ? { left: `calc(100% + ${SUBMENU_GAP}px)` }
                : { right: `calc(100% + ${SUBMENU_GAP}px)` }),
              ...(submenuAlignUp ? { bottom: 0 } : { top: 0 }),
            }}
          >
            {otherModules.map((module) => (
              <button
                key={module.id}
                onClick={() => {
                  moveTask(task.id, module.id);
                  closeMenu();
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

      {/* 状态切换：按任务当前 status 实时渲染 */}
      <div className="px-3 py-1 text-xs text-gray-400 font-medium">
        修改状态
      </div>
      {statusActions.map((action) => (
        <button
          key={action.status}
          onClick={() => {
            setTaskStatus(task.id, action.status);
            // 与其余菜单项保持一致：操作后立即关闭整个菜单
            closeMenu();
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
              closeMenu();
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
            closeMenu();
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
