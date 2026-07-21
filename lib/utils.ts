import { Quadrant } from "@/types";
import { QUADRANT_CONFIG } from "./constants";

// 生成唯一 ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// 相对时间格式化
export function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (seconds < 60) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN");
}

// 获取象限配置
export function getQuadrantConfig(quadrant: Quadrant | null) {
  if (!quadrant) return null;
  return QUADRANT_CONFIG[quadrant];
}

// 任务排序：未完成在上（按创建时间倒序），已完成在下（按完成时间倒序）
export function sortTasks<T extends { completed: boolean; createdAt: number; completedAt: number | null }>(
  tasks: T[]
): T[] {
  return [...tasks].sort((a, b) => {
    // 未完成在上，已完成在下
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    // 未完成组：按创建时间倒序
    if (!a.completed) {
      return b.createdAt - a.createdAt;
    }
    // 已完成组：按完成时间倒序
    const aTime = a.completedAt ?? a.createdAt;
    const bTime = b.completedAt ?? b.createdAt;
    return bTime - aTime;
  });
}

// 防抖函数
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// 检测浏览器是否支持 File System Access API
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "showSaveFilePicker" in window &&
    "showOpenFilePicker" in window
  );
}

// 截断文本
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + "...";
}
