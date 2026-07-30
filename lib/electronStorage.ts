/**
 * electronStorage.ts - Electron 环境文件存储适配器
 *
 * 在 Electron 桌面应用模式下，替代浏览器的 File System Access API，
 * 通过 IPC 调用主进程的 Node fs 模块直接读写 taskData/ 目录下的文件。
 *
 * 提供：
 * 1. isElectron() - 检测当前是否在 Electron 环境中
 * 2. ElectronFileWriter - 防抖文件写入器（与 DebouncedFileWriter 接口兼容）
 * 3. IPC 封装函数 - 列出/读取/创建/删除/重命名工作区文件
 * 4. 同步状态相关函数 - 监听状态更新、手动同步、设置自动推送
 */

import { PersistedData } from "@/types";
import type { SyncStatus } from "@/types/electron";
import { SAVE_DEBOUNCE_MS } from "./constants";

// ============================================================
// 环境检测
// ============================================================

/**
 * 检测当前是否在 Electron 环境中运行
 * 通过检查 preload.js 注入的 window.electronAPI 是否存在
 */
export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI;
}

// ============================================================
// Electron 防抖文件写入器
// ============================================================

/**
 * Electron 文件写入器（防抖）
 *
 * 与 fileStorage.ts 中的 DebouncedFileWriter 接口兼容，
 * 但使用 IPC 调用主进程的 fs.writeFileSync 进行文件写入。
 * 每个 Workspace 对应一个实例。
 */
export class ElectronFileWriter {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private filename: string | null = null;
  private pendingData: PersistedData | null = null;
  private writing: boolean = false;

  /** 设置目标文件名 */
  setFilename(filename: string | null) {
    this.filename = filename;
  }

  /** 获取当前文件名 */
  getFilename(): string | null {
    return this.filename;
  }

  /** 防抖写入：延迟 SAVE_DEBOUNCE_MS 后写入，期间有新数据则重置计时器 */
  async write(data: PersistedData): Promise<void> {
    this.pendingData = data;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      await this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  /** 立即写入（清除待写计时器，同步执行写入） */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.filename || !this.pendingData || this.writing) return;

    this.writing = true;
    const dataToWrite = this.pendingData;
    this.pendingData = null;

    try {
      await window.electronAPI!.writeWorkspace(this.filename, dataToWrite);
    } catch (err) {
      console.error("[ElectronFileWriter] 文件写入失败:", err);
    } finally {
      this.writing = false;
    }
  }
}

// ============================================================
// IPC 封装函数（文件操作）
// ============================================================

/** 列出 taskData/ 目录下所有 .json 文件名 */
export async function electronListWorkspaces(): Promise<string[]> {
  if (!window.electronAPI) return [];
  return window.electronAPI.listWorkspaces();
}

/** 获取 taskData 目录的绝对路径 */
export async function electronGetDataPath(): Promise<string | null> {
  if (!window.electronAPI) return null;
  return window.electronAPI.getDataPath();
}

/** 读取指定工作区文件的 JSON 内容 */
export async function electronReadWorkspace(
  filename: string
): Promise<PersistedData> {
  if (!window.electronAPI) {
    return { tasks: [], modules: [], moveRecords: [] };
  }
  return window.electronAPI.readWorkspace(filename);
}

/** 创建新的工作区文件，返回实际文件名（含 .json 后缀） */
export async function electronCreateWorkspace(
  filename: string
): Promise<string> {
  if (!window.electronAPI) throw new Error("Electron API 不可用");
  return window.electronAPI.createWorkspace(filename);
}

/** 删除工作区文件 */
export async function electronDeleteWorkspace(filename: string): Promise<void> {
  if (!window.electronAPI) return;
  return window.electronAPI.deleteWorkspace(filename);
}

/** 重命名工作区文件，返回新文件名 */
export async function electronRenameWorkspace(
  oldName: string,
  newName: string
): Promise<string> {
  if (!window.electronAPI) throw new Error("Electron API 不可用");
  return window.electronAPI.renameWorkspace(oldName, newName);
}

// ============================================================
// 同步状态相关函数
// ============================================================

/**
 * 注册同步状态更新监听器
 * 主进程通过 IPC 推送状态变更时触发回调
 * @returns 取消监听函数
 */
export function onSyncStatusUpdate(
  callback: (status: SyncStatus) => void
): (() => void) | null {
  if (!window.electronAPI) return null;
  return window.electronAPI.onSyncStatusUpdate(callback);
}

/** 手动触发 Git 同步（立即执行，取消防抖计时器） */
export async function triggerManualSync(): Promise<void> {
  if (!window.electronAPI) return;
  return window.electronAPI.manualSync();
}

/** 设置自动推送开关 */
export async function setAutoPushEnabled(enabled: boolean): Promise<void> {
  if (!window.electronAPI) return;
  return window.electronAPI.setAutoPush(enabled);
}

/** 获取当前同步状态 */
export async function getSyncStatus(): Promise<SyncStatus | null> {
  if (!window.electronAPI) return null;
  return window.electronAPI.getSyncStatus();
}

/** 获取 Git 是否可用 */
export async function getGitAvailable(): Promise<boolean> {
  if (!window.electronAPI) return false;
  return window.electronAPI.getGitAvailable();
}
