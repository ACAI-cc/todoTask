"use client";

import { useState, useRef, useEffect } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Task } from "@/types";
import { useTaskStore } from "@/store/useTaskStore";
import { QUADRANT_CONFIG } from "@/lib/constants";
import { relativeTime, formatFullTime } from "@/lib/utils";
import PrioritySelector from "./PrioritySelector";

interface TaskCardProps {
  task: Task;
  showModuleTag?: boolean;
  moduleName?: string;
}

export default function TaskCard({
  task,
  showModuleTag = false,
  moduleName,
}: TaskCardProps) {
  const toggleTask = useTaskStore((s) => s.toggleTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const editTaskTitle = useTaskStore((s) => s.editTaskTitle);
  const editTaskContact = useTaskStore((s) => s.editTaskContact);
  const setSelectedTask = useTaskStore((s) => s.setSelectedTask);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const setContextMenu = useTaskStore((s) => s.setContextMenu);
  const modules = useTaskStore((s) => s.modules);
  const undoTaskMove = useTaskStore((s) => s.undoTaskMove);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const [editContact, setEditContact] = useState(task.contact || "");
  const [showPriority, setShowPriority] = useState(false);
  const [showContactPopover, setShowContactPopover] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const contactPopoverRef = useRef<HTMLInputElement>(null);

  // 是否是被移动后标记为完成的任务
  const isMovedTask = !!(task.completed && task.movedToModuleId);

  // dnd-kit 拖拽（已完成任务不可拖拽）
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      disabled: task.completed,
      data: { moduleId: task.moduleId, quadrant: task.quadrant },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const quadrantConfig = task.quadrant
    ? QUADRANT_CONFIG[task.quadrant]
    : null;

  const sourceModule = task.sourceModuleId
    ? modules.find((m) => m.id === task.sourceModuleId)
    : null;

  // 移动目标模块
  const movedToModule = task.movedToModuleId
    ? modules.find((m) => m.id === task.movedToModuleId)
    : null;

  const isSelected = selectedTaskId === task.id;

  // 编辑模式自动聚焦
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  // 联系人气泡自动聚焦
  useEffect(() => {
    if (showContactPopover && contactPopoverRef.current) {
      contactPopoverRef.current.focus();
    }
  }, [showContactPopover]);

  const handleStartEdit = (e: React.MouseEvent) => {
    if (task.completed) return; // 已完成任务不可编辑
    e.stopPropagation();
    setEditValue(task.title);
    setEditContact(task.contact || "");
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== task.title) {
      editTaskTitle(task.id, trimmed);
    }
    // 保存联系人
    const trimmedContact = editContact.trim();
    if (trimmedContact !== (task.contact || "")) {
      editTaskContact(task.id, trimmedContact || null);
    }
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === "Escape") {
      setIsEditing(false);
      setEditValue(task.title);
      setEditContact(task.contact || "");
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedTask(task.id);
    setContextMenu({ x: e.clientX, y: e.clientY, taskId: task.id });
  };

  const handleCardClick = () => {
    setSelectedTask(task.id);
  };

  const handleUndoMove = (e: React.MouseEvent) => {
    e.stopPropagation();
    undoTaskMove(task.id);
  };

  const handleSaveContact = () => {
    const trimmed = editContact.trim();
    if (trimmed !== (task.contact || "")) {
      editTaskContact(task.id, trimmed || null);
    }
    setShowContactPopover(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(task.completed ? {} : listeners)}
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      className={`group relative bg-white rounded-lg border px-3 py-2 transition-all no-select ${
        task.completed
          ? "cursor-default"
          : "cursor-grab active:cursor-grabbing"
      } ${
        isSelected
          ? "border-blue-300 ring-1 ring-blue-100"
          : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
      } ${isDragging ? "shadow-lg" : ""}`}
    >
      {/* 来源标签（目标模块中的副本）—— 纯文字样式 */}
      {sourceModule && (
        <div className="mb-1">
          <span className="inline-block text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
            来自「{sourceModule.name}」
          </span>
        </div>
      )}

      {/* 模块标签（四象限视图中显示） */}
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
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleTask(task.id);
          }}
          className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            task.completed
              ? "bg-gray-400 border-gray-400"
              : "border-gray-300 hover:border-gray-400"
          }`}
        >
          {task.completed && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </button>

        {/* 任务标题 / 编辑模式 */}
        {isEditing ? (
          <div className="flex-1 flex flex-col gap-1">
            <input
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={handleEditKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-gray-800 bg-transparent border-b border-blue-300 pb-0.5"
            />
            <div className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" className="shrink-0">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                type="text"
                value={editContact}
                onChange={(e) => setEditContact(e.target.value)}
                onKeyDown={handleEditKeyDown}
                onClick={(e) => e.stopPropagation()}
                placeholder="联系人（可选）"
                className="text-xs text-gray-500 bg-transparent border-b border-gray-200 pb-0.5 w-32"
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <span
              onClick={handleStartEdit}
              className={`text-sm ${
                task.completed
                  ? "text-gray-400 line-through cursor-default"
                  : "text-gray-800 cursor-text"
              }`}
            >
              {task.title}
            </span>
            {/* 联系人显示 */}
            {task.contact && (
              <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-gray-400 align-middle">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {task.contact}
              </span>
            )}
            {/* 日期显示 */}
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-gray-400">
              <span title={formatFullTime(task.createdAt)}>
                创建 {relativeTime(task.createdAt)}
              </span>
              {task.completed && task.completedAt && (
                <>
                  <span>·</span>
                  <span title={formatFullTime(task.completedAt)}>
                    完成 {relativeTime(task.completedAt)}
                  </span>
                </>
              )}
            </div>
          </div>

        )}

        {/* 联系人按钮（仅未完成任务、非编辑态显示） */}
        {!task.completed && !isEditing && (
          <div className="relative shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowContactPopover(!showContactPopover);
                setSelectedTask(task.id);
              }}
              className="p-1 rounded transition-all opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title={task.contact ? "编辑联系人" : "添加联系人"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
            {showContactPopover && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowContactPopover(false);
                  }}
                />
                <div
                  className="absolute right-0 top-7 z-20 bg-white rounded-lg shadow-lg border border-gray-200 p-2 w-40"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    ref={contactPopoverRef}
                    type="text"
                    value={editContact}
                    onChange={(e) => setEditContact(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveContact();
                      }
                      if (e.key === "Escape") {
                        setShowContactPopover(false);
                      }
                    }}
                    onBlur={handleSaveContact}
                    placeholder="联系人姓名"
                    className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:border-blue-300"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* 优先级选择器按钮（仅未完成任务显示） */}
        {!task.completed && (
          <div className="relative shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowPriority(!showPriority);
                setSelectedTask(task.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-all"
              title="设置优先级"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
            </button>
            {showPriority && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPriority(false);
                  }}
                />
                <PrioritySelector
                  taskId={task.id}
                  currentQuadrant={task.quadrant}
                  onClose={() => setShowPriority(false)}
                />
              </>
            )}
          </div>
        )}

        {/* 撤销移动按钮（被移动的任务显示） */}
        {isMovedTask ? (
          <button
            onClick={handleUndoMove}
            className="shrink-0 text-xs text-blue-500 hover:text-blue-700 hover:underline px-1"
            title="撤销移动"
          >
            撤销
          </button>
        ) : (
          /* 删除按钮 */
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteTask(task.id);
            }}
            className="opacity-0 group-hover:opacity-100 shrink-0 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
            title="删除任务"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 移动信息（被移动的已完成任务显示） */}
      {isMovedTask && movedToModule && (
        <div className="mt-1 pl-6 text-xs text-gray-400">
          {task.movedAt && relativeTime(task.movedAt)}已移至「{movedToModule.name}」
        </div>
      )}
    </div>
  );
}
