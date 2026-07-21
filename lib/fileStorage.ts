import { PersistedData, WorkspaceMetadata } from "@/types";
import {
  IDB_DB_NAME,
  IDB_DB_VERSION,
  IDB_STORE_NAME,
  IDB_FALLBACK_STORE,
  IDB_META_STORE,
  SAVE_DEBOUNCE_MS,
} from "./constants";

// ============================================================
// IndexedDB 工具函数（用于持久化文件句柄数组和降级存储）
// ============================================================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(IDB_FALLBACK_STORE)) {
        db.createObjectStore(IDB_FALLBACK_STORE);
      }
      if (!db.objectStoreNames.contains(IDB_META_STORE)) {
        db.createObjectStore(IDB_META_STORE);
      }

      // 版本 1 → 2 迁移：将旧的单个 fileHandle 迁移为 handles 数组
      if (oldVersion < 2) {
        const tx = request.transaction;
        if (tx) {
          const store = tx.objectStore(IDB_STORE_NAME);
          const getRequest = store.get("fileHandle");
          getRequest.onsuccess = () => {
            const oldHandle = getRequest.result;
            if (oldHandle) {
              store.put([oldHandle], "handles");
              store.delete("fileHandle");
            }
          };
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================
// 文件句柄数组持久化（File System Access API 模式）
// ============================================================

// 保存文件句柄数组到 IndexedDB
export async function saveFileHandlesToIDB(
  handles: FileSystemFileHandle[]
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readwrite");
    tx.objectStore(IDB_STORE_NAME).put(handles, "handles");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// 从 IndexedDB 读取文件句柄数组
export async function loadFileHandlesFromIDB(): Promise<
  FileSystemFileHandle[]
> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readonly");
    const request = tx.objectStore(IDB_STORE_NAME).get("handles");
    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// 清除 IndexedDB 中的所有文件句柄
export async function clearFileHandlesFromIDB(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readwrite");
    tx.objectStore(IDB_STORE_NAME).delete("handles");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// 请求文件句柄权限
export async function requestFilePermission(
  handle: FileSystemFileHandle,
  mode: "read" | "readwrite" = "readwrite"
): Promise<boolean> {
  // @ts-ignore - queryPermission/requestPermission 是较新的 API
  if (handle.queryPermission) {
    // @ts-ignore
    const queryResult = await handle.queryPermission({ mode });
    if (queryResult === "granted") return true;
    // @ts-ignore
    const requestResult = await handle.requestPermission({ mode });
    return requestResult === "granted";
  }
  // 如果不支持 queryPermission/requestPermission，直接返回 true（让后续操作决定）
  return true;
}

// 仅查询权限状态（不触发权限请求，可在无用户手势时调用）
export async function queryPermissionOnly(
  handle: FileSystemFileHandle,
  mode: "read" | "readwrite" = "readwrite"
): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  // @ts-ignore
  if (handle.queryPermission) {
    // @ts-ignore
    const result = await handle.queryPermission({ mode });
    return result as "granted" | "denied" | "prompt";
  }
  return "unknown";
}

// ============================================================
// 最后活跃工作区持久化（用于刷新后恢复到上次使用的工作区）
// 存储文件名而非 wsId（wsId 每次刷新重新生成，文件名稳定）
// ============================================================

export async function saveLastActiveWorkspaceName(name: string | null): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_META_STORE, "readwrite");
    tx.objectStore(IDB_META_STORE).put(name, "lastActiveWorkspaceName");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function loadLastActiveWorkspaceName(): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_META_STORE, "readonly");
    const request = tx.objectStore(IDB_META_STORE).get("lastActiveWorkspaceName");
    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// ============================================================
// 文件系统操作（File System Access API）
// ============================================================

// 创建新数据文件
export async function createNewFile(): Promise<{
  handle: FileSystemFileHandle;
  data: PersistedData;
} | null> {
  try {
    if (!window.showSaveFilePicker) return null;
    const handle = await window.showSaveFilePicker({
      suggestedName: "task-data.json",
      types: [
        {
          description: "JSON 文件",
          accept: { "application/json": [".json"] },
        },
      ],
    });

    // 写入空数据（含预设模块由 store 层负责填充）
    const emptyData: PersistedData = {
      tasks: [],
      modules: [],
      moveRecords: [],
    };
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(emptyData, null, 2));
    await writable.close();

    return { handle, data: emptyData };
  } catch {
    // 用户取消
    return null;
  }
}

// 打开已有数据文件
export async function openExistingFile(): Promise<{
  handle: FileSystemFileHandle;
  data: PersistedData;
} | null> {
  try {
    if (!window.showOpenFilePicker) return null;
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: "JSON 文件",
          accept: { "application/json": [".json"] },
        },
      ],
      multiple: false,
    });

    const data = await readFileContent(handle);

    return { handle, data };
  } catch {
    // 用户取消
    return null;
  }
}

// 读取文件内容
export async function readFileContent(
  handle: FileSystemFileHandle
): Promise<PersistedData> {
  const file = await handle.getFile();
  const text = await file.text();

  if (!text.trim()) {
    return { tasks: [], modules: [], moveRecords: [] };
  }

  try {
    const parsed = JSON.parse(text);
    return {
      tasks: parsed.tasks || [],
      modules: parsed.modules || [],
      moveRecords: parsed.moveRecords || [],
    };
  } catch {
    return { tasks: [], modules: [], moveRecords: [] };
  }
}

// ============================================================
// 防抖文件写入器（每个工作区一个实例）
// ============================================================

export class DebouncedFileWriter {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private handle: FileSystemFileHandle | null = null;
  private pendingData: PersistedData | null = null;
  private writing: boolean = false;

  setHandle(handle: FileSystemFileHandle | null) {
    this.handle = handle;
  }

  getHandle(): FileSystemFileHandle | null {
    return this.handle;
  }

  async write(data: PersistedData): Promise<void> {
    this.pendingData = data;

    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(async () => {
      await this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.handle || !this.pendingData || this.writing) return;

    this.writing = true;
    const dataToWrite = this.pendingData;
    this.pendingData = null;

    try {
      const writable = await this.handle.createWritable();
      await writable.write(JSON.stringify(dataToWrite, null, 2));
      await writable.close();
    } catch (err) {
      console.error("文件写入失败:", err);
    } finally {
      this.writing = false;
    }
  }
}

// ============================================================
// 降级方案：IndexedDB 存储（当浏览器不支持 File System Access API）
// 每个工作区使用独立的 key（ws-{workspaceId}）
// ============================================================

export async function idbFallbackGet(
  workspaceId: string
): Promise<PersistedData | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_FALLBACK_STORE, "readonly");
    const request = tx.objectStore(IDB_FALLBACK_STORE).get(`ws-${workspaceId}`);
    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function idbFallbackSet(
  data: PersistedData,
  workspaceId: string
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_FALLBACK_STORE, "readwrite");
    tx.objectStore(IDB_FALLBACK_STORE).put(data, `ws-${workspaceId}`);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function idbFallbackDelete(workspaceId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_FALLBACK_STORE, "readwrite");
    tx.objectStore(IDB_FALLBACK_STORE).delete(`ws-${workspaceId}`);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ============================================================
// 降级模式：工作区元数据持久化
// ============================================================

export async function saveWorkspaceMetadataToIDB(
  metadata: WorkspaceMetadata[]
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_META_STORE, "readwrite");
    tx.objectStore(IDB_META_STORE).put(metadata, "metadata");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function loadWorkspaceMetadataFromIDB(): Promise<
  WorkspaceMetadata[]
> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_META_STORE, "readonly");
    const request = tx.objectStore(IDB_META_STORE).get("metadata");
    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// ============================================================
// 数据导入导出（备份用）
// ============================================================

export function exportDataAsFile(data: PersistedData, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importDataFromFile(): Promise<PersistedData | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        resolve({
          tasks: parsed.tasks || [],
          modules: parsed.modules || [],
          moveRecords: parsed.moveRecords || [],
        });
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}
