/**
 * electron.d.ts - Electron API 类型声明
 *
 * 为 window.electronAPI 提供类型支持，
 * 供渲染进程（Next.js 前端）安全调用主进程 IPC 接口。
 */

/** Git 同步状态 */
export interface SyncStatus {
  /** 当前状态：idle(空闲) | pending(待同步) | syncing(同步中) | success(成功) | error(失败) */
  state: "idle" | "pending" | "syncing" | "success" | "error";
  /** 上次成功同步的时间戳（毫秒），null 表示从未同步 */
  lastSyncTime: number | null;
  /** 状态描述信息 */
  message: string | null;
  /** Git 仓库是否可用 */
  gitAvailable: boolean;
  /** 自动推送是否开启 */
  autoPushEnabled: boolean;
}

/** Electron 主进程暴露给渲染进程的 API 接口 */
export interface ElectronAPI {
  // 文件操作
  listWorkspaces: () => Promise<string[]>;
  readWorkspace: (filename: string) => Promise<any>;
  writeWorkspace: (filename: string, data: any) => Promise<void>;
  createWorkspace: (filename: string) => Promise<string>;
  deleteWorkspace: (filename: string) => Promise<void>;
  renameWorkspace: (oldName: string, newName: string) => Promise<string>;
  workspaceExists: (filename: string) => Promise<boolean>;

  // 同步状态与控制
  getSyncStatus: () => Promise<SyncStatus>;
  manualSync: () => Promise<void>;
  setAutoPush: (enabled: boolean) => Promise<void>;
  getGitAvailable: () => Promise<boolean>;

  // 事件监听
  onSyncStatusUpdate: (callback: (status: SyncStatus) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
