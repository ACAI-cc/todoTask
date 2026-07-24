"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTaskStore } from "@/store/useTaskStore";
import { Task } from "@/types";
import { QUADRANT_CONFIG } from "@/lib/constants";
import { relativeTime, formatFullTime } from "@/lib/utils";

export default function CalendarView() {
  const tasks = useTaskStore((s) => s.tasks);
  const modules = useTaskStore((s) => s.modules);
  const calendarSubview = useTaskStore((s) => s.calendarSubview);
  const calendarDateStr = useTaskStore((s) => s.calendarDate);
  const calendarDate = new Date(calendarDateStr);
  const setCalendarSubview = useTaskStore((s) => s.setCalendarSubview);
  const setCalendarDate = useTaskStore((s) => s.setCalendarDate);
  const navigateCalendar = useTaskStore((s) => s.navigateCalendar);
  const goToToday = useTaskStore((s) => s.goToToday);
  const setView = useTaskStore((s) => s.setView);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateInputValue, setDateInputValue] = useState("");
  const datePickerRef = useRef<HTMLDivElement>(null);

  // 获取去重后的已完成任务（同一 originId 仅保留 completedAt 最晚的）
  const getDeduplicatedCompletedTasks = (): Task[] => {
    const completedTasks = tasks.filter((t) => t.completed && t.completedAt);
    
    const originMap = new Map<string, Task>();
    for (const task of completedTasks) {
      const existing = originMap.get(task.originId);
      if (!existing || (task.completedAt && (!existing.completedAt || task.completedAt > existing.completedAt))) {
        originMap.set(task.originId, task);
      }
    }
    
    return Array.from(originMap.values());
  };

  const deduplicatedTasks = getDeduplicatedCompletedTasks();

  // 日期选择器输入处理
  useEffect(() => {
    const date = calendarDate;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    setDateInputValue(`${year}-${month}-${day}`);
  }, [calendarDate]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    if (showDatePicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDatePicker]);

  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateInputValue(e.target.value);
  };

  const handleDateInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const match = dateInputValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const year = parseInt(match[1]);
        const month = parseInt(match[2]) - 1;
        const day = parseInt(match[3]);
        if (year >= 2000 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
          setCalendarDate(new Date(year, month, day));
        }
      }
      setShowDatePicker(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    setCalendarDate(date);
    setShowDatePicker(false);
  };

  // 获取月视图数据
  const getMonthData = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const days: { date: Date; isCurrentMonth: boolean; isToday: boolean; tasks: Task[] }[] = [];
    
    // 填充上月剩余天数
    const startDay = firstDay.getDay();
    for (let i = startDay - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: isSameDay(date, new Date()),
        tasks: getTasksForDate(date),
      });
    }
    
    // 填充当月天数
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month, i);
      days.push({
        date,
        isCurrentMonth: true,
        isToday: isSameDay(date, new Date()),
        tasks: getTasksForDate(date),
      });
    }
    
    // 填充下月天数补齐到6行
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: isSameDay(date, new Date()),
        tasks: getTasksForDate(date),
      });
    }
    
    return { year, month, days };
  };

  // 获取周视图数据（以周日为起始）
  const getWeekData = () => {
    const currentDay = calendarDate.getDay();
    const startOfWeek = new Date(calendarDate);
    startOfWeek.setDate(calendarDate.getDate() - currentDay);
    
    const days: { date: Date; isToday: boolean; isSelected: boolean; tasks: Task[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push({
        date,
        isToday: isSameDay(date, new Date()),
        isSelected: isSameDay(date, calendarDate),
        tasks: getTasksForDate(date),
      });
    }
    
    return days;
  };

  // 获取日视图数据
  const getDayData = () => {
    return {
      date: calendarDate,
      isToday: isSameDay(calendarDate, new Date()),
      tasks: getTasksForDate(calendarDate).sort((a, b) => {
        const aTime = a.completedAt || 0;
        const bTime = b.completedAt || 0;
        return bTime - aTime;
      }),
    };
  };

  // 获取指定日期的任务
  const getTasksForDate = (date: Date): Task[] => {
    return deduplicatedTasks.filter((task) => {
      if (!task.completedAt) return false;
      const taskDate = new Date(task.completedAt);
      return isSameDay(taskDate, date);
    });
  };

  // 判断两天是否同一天
  const isSameDay = (d1: Date, d2: Date): boolean => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  // 点击任务卡片
  const handleTaskClick = (task: Task) => {
    setView("module");
    const targetTask = tasks.find((t) => t.id === task.id);
    if (targetTask) {
      useTaskStore.getState().setSelectedTask(task.id);
    }
  };

  const monthData = getMonthData();
  const weekData = getWeekData();
  const dayData = getDayData();

  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
        {/* 子视图切换 */}
        <div className="flex items-center gap-1">
          {[
            { key: "month", label: "月" },
            { key: "week", label: "周" },
            { key: "day", label: "日" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setCalendarSubview(item.key as "month" | "week" | "day")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                calendarSubview === item.key
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              {item.label}视图
            </button>
          ))}
        </div>

        {/* 日期选择器和翻页 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateCalendar("prev")}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="relative" ref={datePickerRef}>
            <input
              type="text"
              value={dateInputValue}
              onChange={handleDateInputChange}
              onKeyDown={handleDateInputKeyDown}
              onFocus={() => setShowDatePicker(true)}
              onClick={() => setShowDatePicker(true)}
              className="text-sm px-3 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400 w-36 text-center"
            />
            
            {showDatePicker && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-2 w-72">
                <div className="flex items-center justify-between px-2 mb-2">
                  <button
                    onClick={() => setCalendarDate(new Date(monthData.year, monthData.month - 1, 1))}
                    className="p-1 text-gray-500 hover:text-gray-700"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-sm font-medium">
                    {monthData.year}年{monthData.month + 1}月
                  </span>
                  <button
                    onClick={() => setCalendarDate(new Date(monthData.year, monthData.month + 1, 1))}
                    className="p-1 text-gray-500 hover:text-gray-700"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                
                <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
                  {weekDays.map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                </div>
                
                <div className="grid grid-cols-7 gap-1">
                  {monthData.days.map((dayItem, index) => (
                    <button
                      key={index}
                      onClick={() => handleDateSelect(dayItem.date)}
                      className={`relative h-8 text-xs rounded-md transition-colors ${
                        dayItem.isToday
                          ? "bg-gray-900 text-white"
                          : dayItem.isCurrentMonth
                            ? "text-gray-700 hover:bg-gray-100"
                            : "text-gray-300 hover:bg-gray-50"
                      } ${isSameDay(dayItem.date, calendarDate) ? "ring-2 ring-gray-400" : ""}`}
                    >
                      {dayItem.date.getDate()}
                      {dayItem.tasks.length > 0 && (
                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-500 rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={() => {
                    goToToday();
                    setShowDatePicker(false);
                  }}
                  className="w-full mt-2 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                >
                  今天
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => navigateCalendar("next")}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            onClick={goToToday}
            className="ml-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-md transition-colors"
          >
            今天
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        {/* 月视图 */}
        {calendarSubview === "month" && (
          <div className="p-4">
            <div className="grid grid-cols-7 gap-2">
              <div className="text-center text-xs font-medium text-gray-500 py-2">日</div>
              <div className="text-center text-xs font-medium text-gray-500 py-2">一</div>
              <div className="text-center text-xs font-medium text-gray-500 py-2">二</div>
              <div className="text-center text-xs font-medium text-gray-500 py-2">三</div>
              <div className="text-center text-xs font-medium text-gray-500 py-2">四</div>
              <div className="text-center text-xs font-medium text-gray-500 py-2">五</div>
              <div className="text-center text-xs font-medium text-gray-500 py-2">六</div>
              
              {monthData.days.map((dayItem, index) => (
                <div
                  key={index}
                  className={`min-h-[120px] p-2 rounded-lg border transition-colors ${
                    dayItem.isCurrentMonth
                      ? "bg-white border-gray-200"
                      : "bg-gray-50 border-gray-100"
                  } ${dayItem.isToday ? "ring-2 ring-gray-300" : ""}`}
                >
                  <div className={`text-xs font-medium mb-1 ${
                    dayItem.isToday ? "text-gray-900" : dayItem.isCurrentMonth ? "text-gray-600" : "text-gray-400"
                  }`}>
                    {dayItem.date.getDate()}
                  </div>
                  <div className="space-y-1 max-h-[90px] overflow-y-auto">
                    {dayItem.tasks.map((task) => (
                      <CalendarTaskCard
                        key={task.id}
                        task={task}
                        modules={modules}
                        onClick={() => handleTaskClick(task)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 周视图 */}
        {calendarSubview === "week" && (
          <div className="p-4">
            <div className="grid grid-cols-7 gap-2">
              {weekData.map((dayItem, index) => (
                <div
                  key={index}
                  className={`flex flex-col min-h-[calc(100vh-200px)] rounded-lg border transition-colors ${
                    dayItem.isSelected ? "bg-gray-50 border-gray-300" : "bg-white border-gray-200"
                  } ${dayItem.isToday ? "ring-2 ring-gray-300" : ""}`}
                >
                  <div className="px-2 py-2 border-b border-gray-100">
                    <div className={`text-xs text-gray-500 ${dayItem.isSelected ? "font-medium" : ""}`}>
                      {weekDays[index]}
                    </div>
                    <div className={`text-sm font-medium ${dayItem.isToday ? "text-gray-900" : "text-gray-700"}`}>
                      {dayItem.date.getMonth() + 1}/{dayItem.date.getDate()}
                    </div>
                  </div>
                  <div className="flex-1 p-2 space-y-1 overflow-y-auto">
                    {dayItem.tasks.map((task) => (
                      <CalendarTaskCard
                        key={task.id}
                        task={task}
                        modules={modules}
                        onClick={() => handleTaskClick(task)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 日视图 */}
        {calendarSubview === "day" && (
          <div className="p-4">
            <div className="text-sm font-medium text-gray-700 mb-4">
              {dayData.isToday ? "今天" : `${dayData.date.getFullYear()}年${dayData.date.getMonth() + 1}月${dayData.date.getDate()}日`}
              （{weekDays[dayData.date.getDay()]}）
            </div>
            <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
              {dayData.tasks.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  当天没有完成的任务
                </div>
              ) : (
                dayData.tasks.map((task) => (
                  <CalendarTaskCard
                    key={task.id}
                    task={task}
                    modules={modules}
                    onClick={() => handleTaskClick(task)}
                    showTime
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CalendarTaskCard({
  task,
  modules,
  onClick,
  showTime = false,
}: {
  task: Task;
  modules: any[];
  onClick: () => void;
  showTime?: boolean;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0, below: false });
  const cardRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const module = modules.find((m) => m.id === task.moduleId);
  const quadrantConfig = task.quadrant ? QUADRANT_CONFIG[task.quadrant] : null;
  const bgColor = module?.bgColor || "#f3f4f6";

  const getTextColor = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 180 ? "#1f2937" : "#ffffff";
  };

  const textColor = getTextColor(bgColor);
  const borderColor = () => {
    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    const darken = (c: number) => Math.max(0, c - 40);
    return `rgb(${darken(r)}, ${darken(g)}, ${darken(b)})`;
  };

  const calculateTooltipPosition = () => {
    if (!cardRef.current) return;
    const cardRect = cardRef.current.getBoundingClientRect();
    
    const tooltipEl = tooltipRef.current;
    const tooltipHeight = tooltipEl ? tooltipEl.offsetHeight : 80;
    const gap = 4;
    const arrowSize = 6;

    const spaceAbove = cardRect.top;
    const spaceBelow = window.innerHeight - cardRect.bottom;

    const below = spaceAbove < tooltipHeight + gap;

    let tooltipY: number;
    if (below) {
      tooltipY = cardRect.bottom + gap;
    } else {
      tooltipY = cardRect.top - tooltipHeight - gap;
    }

    setTooltipPosition({
      x: cardRect.left,
      y: tooltipY,
      below,
    });
  };

  useEffect(() => {
    if (showTooltip) {
      const timer = setTimeout(() => {
        calculateTooltipPosition();
      }, 0);
      const handleResize = () => calculateTooltipPosition();
      window.addEventListener("resize", handleResize);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("resize", handleResize);
      };
    }
  }, [showTooltip]);

  return (
    <div className="relative w-full">
      <div
        ref={cardRef}
        onClick={onClick}
        onMouseEnter={() => {
          calculateTooltipPosition();
          setShowTooltip(true);
        }}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-colors text-xs w-full"
        style={{ 
          backgroundColor: bgColor,
          color: textColor
        }}
      >
        {quadrantConfig && (
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: quadrantConfig.dotColor }}
          />
        )}
        
        <div className="flex-1 min-w-0" style={{ maxWidth: "calc(100% - 1rem)" }}>
          <span 
            className="truncate"
            style={{ 
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              overflow: "hidden",
              display: "block"
            }}
          >
            {task.title}
          </span>
          {showTime && task.completedAt && (
            <span 
              className="ml-2"
              style={{ opacity: 0.7 }}
            >
              {new Date(task.completedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {showTooltip &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[9999] px-3 py-2 rounded-xl shadow-lg pointer-events-none whitespace-pre-wrap max-w-xs"
            style={{
              backgroundColor: bgColor,
              color: textColor,
              border: `1px solid ${borderColor()}`,
              left: tooltipPosition.x,
              top: tooltipPosition.y,
            }}
          >
            <div className="font-medium mb-1">{task.title}</div>
            <div style={{ fontSize: "12px", opacity: 0.8 }}>
              创建时间：{formatFullTime(task.createdAt)}
              {task.completedAt && `\n完成时间：${formatFullTime(task.completedAt)}`}
              {module && `\n来自「${module.name}」`}
            </div>
            <div
              className="absolute w-3 h-3"
              style={{
                backgroundColor: bgColor,
                borderLeft: `1px solid ${borderColor()}`,
                borderBottom: `1px solid ${borderColor()}`,
                [tooltipPosition.below ? "top" : "bottom"]: "-6px",
                left: "12px",
                transform: tooltipPosition.below ? "rotate(-135deg)" : "rotate(45deg)",
              }}
            />
          </div>,
          document.body
        )}
    </div>
  );
}