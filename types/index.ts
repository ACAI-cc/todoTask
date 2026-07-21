// 四象限优先级类型
export type Quadrant =
  | "important_urgent"
  | "important_not_urgent"
  | "not_important_urgent"
  | "not_important_not_urgent";

// 任务类型
export interface Task {
  id: string;
  title: string;
  moduleId: string;
  completed: boolean;
  createdAt: number;
  completedAt: number | null;
  quadrant: Quadrant | null;
  sourceModuleId: string | null; // 最近一次来源模块（目标模块中副本的来源标签）
  // 跨模块移动后，原模块中任务的移动信息
  movedToModuleId: string | null; // 被移至的目标模块 ID
  movedToTaskId: string | null; // 目标模块中的副本任务 ID
  movedAt: number | null; // 移动发生的时间
  contact: string | null; // 联系人姓名（可选）
}

// 模块类型
export interface ModuleItem {
  id: string;
  name: string;
  order: number;
  visible: boolean;
  isPreset: boolean;
  bgColor: string | null; // 自定义背景颜色（HEX 值，null 为默认白色）
}

// 移动记录类型（留在原模块中的追溯记录）
export interface MoveRecord {
  id: string;
  taskId: string;
  taskTitle: string;
  fromModuleId: string;
  toModuleId: string;
  timestamp: number;
  type: "move" | "quadrant_change";
  // 用于象限变更记录
  fromQuadrant?: Quadrant | null;
  toQuadrant?: Quadrant | null;
}

// 删除撤销提示
export interface DeleteToastItem {
  id: string;
  task: Task;
  countdown: number;
}

// 搜索筛选条件
export interface SearchFilters {
  moduleId: string | null; // null = 所有模块
  status: "all" | "completed" | "uncompleted";
  quadrant: Quadrant | "none" | "all";
}

// 持久化数据结构（写入文件的 JSON 格式）
export interface PersistedData {
  tasks: Task[];
  modules: ModuleItem[];
  moveRecords: MoveRecord[];
}

// 视图类型
export type ViewMode = "module" | "quadrant";

// 右键菜单状态
export interface ContextMenuState {
  x: number;
  y: number;
  taskId: string;
}

// 工作区类型
export interface Workspace {
  id: string;
  name: string; // 取文件名
  fileHandle: FileSystemFileHandle | null; // 降级模式下为 null
  loaded: boolean; // 数据是否已从文件加载
}

// 工作区数据（每个工作区独立的任务/模块/记录）
export interface WorkspaceData {
  tasks: Task[];
  modules: ModuleItem[];
  moveRecords: MoveRecord[];
}

// 工作区元数据（用于降级模式下 IndexedDB 持久化）
export interface WorkspaceMetadata {
  id: string;
  name: string;
}
