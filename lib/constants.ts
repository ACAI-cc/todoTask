import { Quadrant } from "@/types";

// 四象限配置
export const QUADRANT_CONFIG: Record<
  Quadrant,
  {
    label: string;
    shortLabel: string;
    color: string;
    bgColor: string;
    dotColor: string;
    borderColor: string;
  }
> = {
  important_urgent: {
    label: "重要且紧急",
    shortLabel: "重要紧急",
    color: "#dc2626",
    bgColor: "#fef2f2",
    dotColor: "#ef4444",
    borderColor: "#fecaca",
  },
  important_not_urgent: {
    label: "重要不紧急",
    shortLabel: "重要不紧急",
    color: "#ea580c",
    bgColor: "#fff7ed",
    dotColor: "#f97316",
    borderColor: "#fed7aa",
  },
  not_important_urgent: {
    label: "不重要但紧急",
    shortLabel: "不重要紧急",
    color: "#2563eb",
    bgColor: "#eff6ff",
    dotColor: "#3b82f6",
    borderColor: "#bfdbfe",
  },
  not_important_not_urgent: {
    label: "不重要不紧急",
    shortLabel: "不重要不紧急",
    color: "#6b7280",
    bgColor: "#f9fafb",
    dotColor: "#9ca3af",
    borderColor: "#e5e7eb",
  },
};

// 四象限列表（按顺序）
export const QUADRANT_LIST: Quadrant[] = [
  "important_urgent",
  "important_not_urgent",
  "not_important_urgent",
  "not_important_not_urgent",
];

// 四象限视图布局（2x2矩阵）
// 左上: important_urgent, 右上: not_important_urgent
// 左下: important_not_urgent, 右下: not_important_not_urgent
export const QUADRANT_LAYOUT: {
  quadrant: Quadrant;
  row: number;
  col: number;
}[] = [
  { quadrant: "important_urgent", row: 0, col: 0 },
  { quadrant: "not_important_urgent", row: 0, col: 1 },
  { quadrant: "important_not_urgent", row: 1, col: 0 },
  { quadrant: "not_important_not_urgent", row: 1, col: 1 },
];

// 预设模块
export const PRESET_MODULES = [
  {
    id: "not-started",
    name: "还没开始的任务",
    order: 0,
    visible: true,
    isPreset: true,
  },
  {
    id: "paused",
    name: "暂时搁置的任务",
    order: 1,
    visible: true,
    isPreset: true,
  },
  {
    id: "unsorted",
    name: "未整理的需求",
    order: 2,
    visible: false,
    isPreset: true,
  },
];

// 默认数据文件名
export const DEFAULT_FILE_NAME = "task-data.json";

// 防抖延迟（毫秒）
export const SAVE_DEBOUNCE_MS = 500;

// 删除撤销倒计时（秒）
export const DELETE_UNDO_SECONDS = 3;

// IndexedDB 配置
export const IDB_DB_NAME = "task-manager-db";
export const IDB_DB_VERSION = 2; // 升级版本以支持工作区
export const IDB_STORE_NAME = "file-handles"; // 存储文件句柄数组
export const IDB_FALLBACK_STORE = "task-data"; // 降级模式：按工作区存储数据
export const IDB_META_STORE = "ws-meta"; // 降级模式：存储工作区元数据
