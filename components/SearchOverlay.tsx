"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useTaskStore } from "@/store/useTaskStore";
import { Quadrant, SearchFilters } from "@/types";
import { QUADRANT_CONFIG, QUADRANT_LIST } from "@/lib/constants";
import { sortTasks, relativeTime } from "@/lib/utils";

// 高亮匹配文本
function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return text;
  return (
    <>
      {text.substring(0, index)}
      <mark className="bg-yellow-200 text-inherit rounded px-0.5">
        {text.substring(index, index + query.length)}
      </mark>
      {text.substring(index + query.length)}
    </>
  );
}

export default function SearchOverlay() {
  const searchOpen = useTaskStore((s) => s.searchOpen);
  const setSearchOpen = useTaskStore((s) => s.setSearchOpen);
  const searchQuery = useTaskStore((s) => s.searchQuery);
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery);
  const searchFilters = useTaskStore((s) => s.searchFilters);
  const setSearchFilters = useTaskStore((s) => s.setSearchFilters);
  const tasks = useTaskStore((s) => s.tasks);
  const modules = useTaskStore((s) => s.modules);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchOpen]);

  const filteredTasks = useMemo(() => {
    let result = tasks;

    // 标题 + 联系人模糊搜索
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          (t.contact && t.contact.toLowerCase().includes(query))
      );
    }

    // 模块筛选
    if (searchFilters.moduleId) {
      result = result.filter((t) => t.moduleId === searchFilters.moduleId);
    }

    // 状态筛选
    if (searchFilters.status === "completed") {
      result = result.filter((t) => t.completed);
    } else if (searchFilters.status === "uncompleted") {
      result = result.filter((t) => !t.completed);
    }

    // 优先级筛选
    if (searchFilters.quadrant === "none") {
      result = result.filter((t) => !t.quadrant);
    } else if (searchFilters.quadrant !== "all") {
      result = result.filter(
        (t) => t.quadrant === (searchFilters.quadrant as Quadrant)
      );
    }

    return sortTasks(result);
  }, [tasks, searchQuery, searchFilters]);

  if (!searchOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/20 z-40 animate-fade-in"
      onClick={() => setSearchOpen(false)}
    >
      <div
        className="absolute top-20 left-1/2 -translate-x-1/2 w-[640px] max-h-[70vh] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索输入 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder="搜索任务标题或联系人..."
            className="flex-1 text-sm text-gray-800 placeholder-gray-400"
          />
          <span className="text-xs text-gray-400">
            {filteredTasks.length} 个结果
          </span>
        </div>

        {/* 筛选器 */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50">
          {/* 模块筛选 */}
          <select
            value={searchFilters.moduleId || ""}
            onChange={(e) =>
              setSearchFilters({
                moduleId: e.target.value || null,
              })
            }
            className="text-xs px-2 py-1 border border-gray-200 rounded bg-white text-gray-600"
          >
            <option value="">所有模块</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {/* 状态筛选 */}
          <select
            value={searchFilters.status}
            onChange={(e) =>
              setSearchFilters({
                status: e.target.value as SearchFilters["status"],
              })
            }
            className="text-xs px-2 py-1 border border-gray-200 rounded bg-white text-gray-600"
          >
            <option value="all">全部状态</option>
            <option value="uncompleted">未完成</option>
            <option value="completed">已完成</option>
          </select>

          {/* 优先级筛选 */}
          <select
            value={searchFilters.quadrant}
            onChange={(e) =>
              setSearchFilters({
                quadrant: e.target.value as SearchFilters["quadrant"],
              })
            }
            className="text-xs px-2 py-1 border border-gray-200 rounded bg-white text-gray-600"
          >
            <option value="all">全部优先级</option>
            <option value="none">无标签</option>
            {QUADRANT_LIST.map((q) => (
              <option key={q} value={q}>
                {QUADRANT_CONFIG[q].label}
              </option>
            ))}
          </select>

          {(searchFilters.moduleId ||
            searchFilters.status !== "all" ||
            searchFilters.quadrant !== "all") && (
            <button
              onClick={() =>
                setSearchFilters({
                  moduleId: null,
                  status: "all",
                  quadrant: "all",
                })
              }
              className="text-xs text-gray-400 hover:text-gray-600 ml-auto"
            >
              清除筛选
            </button>
          )}
        </div>

        {/* 搜索结果 */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-300">
              {searchQuery.trim() ? "没有匹配的任务" : "输入关键词搜索任务"}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredTasks.map((task) => {
                const module = modules.find((m) => m.id === task.moduleId);
                const quadrantConfig = task.quadrant
                  ? QUADRANT_CONFIG[task.quadrant]
                  : null;
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer group"
                    onClick={() => {
                      useTaskStore.getState().setActiveModule(task.moduleId);
                      useTaskStore.getState().setView("module");
                      useTaskStore.getState().setSelectedTask(task.id);
                      setSearchOpen(false);
                    }}
                  >
                    {/* 优先级圆点 */}
                    <div className="w-2 h-2 rounded-full shrink-0">
                      {quadrantConfig && (
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor: quadrantConfig.dotColor,
                          }}
                        />
                      )}
                    </div>

                    {/* 完成状态 */}
                    <div
                      className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                        task.completed
                          ? "bg-gray-400 border-gray-400"
                          : "border-gray-300"
                      }`}
                    >
                      {task.completed && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </div>

                    {/* 标题 */}
                    <span
                      className={`flex-1 text-sm ${
                        task.completed
                          ? "text-gray-400 line-through"
                          : "text-gray-700"
                      }`}
                    >
                      {highlightText(task.title, searchQuery)}
                    </span>

                    {/* 联系人 */}
                    {task.contact && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-gray-400 shrink-0">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        {highlightText(task.contact, searchQuery)}
                      </span>
                    )}

                    {/* 模块标签 */}
                    {module && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                        {module.name}
                      </span>
                    )}

                    {/* 时间 */}
                    <span className="text-xs text-gray-300 shrink-0">
                      {task.completed
                        ? task.completedAt
                          ? relativeTime(task.completedAt)
                          : ""
                        : relativeTime(task.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
