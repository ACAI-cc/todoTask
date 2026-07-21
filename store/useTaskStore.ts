import { create } from "zustand";
import {
  Task,
  ModuleItem,
  MoveRecord,
  Quadrant,
  ViewMode,
  ContextMenuState,
  DeleteToastItem,
  SearchFilters,
  PersistedData,
  Workspace,
  WorkspaceData,
} from "@/types";
import { PRESET_MODULES, DELETE_UNDO_SECONDS } from "@/lib/constants";
import { generateId, isFileSystemAccessSupported } from "@/lib/utils";
import {
  DebouncedFileWriter,
  createNewFile,
  openExistingFile,
  readFileContent,
  saveFileHandlesToIDB,
  loadFileHandlesFromIDB,
  clearFileHandlesFromIDB,
  requestFilePermission,
  queryPermissionOnly,
  saveLastActiveWorkspaceName,
  loadLastActiveWorkspaceName,
  idbFallbackGet,
  idbFallbackSet,
  idbFallbackDelete,
  saveWorkspaceMetadataToIDB,
  loadWorkspaceMetadataFromIDB,
  exportDataAsFile,
  importDataFromFile,
} from "@/lib/fileStorage";

// ============================================================
// 模块级（非 Zustand 状态）：文件写入器和数据缓存
// ============================================================

// 每个工作区一个独立的防抖写入器
const fileWriters = new Map<string, DebouncedFileWriter>();

// 工作区数据缓存：切换工作区时先缓存当前数据，再加载新数据
const dataCache = new Map<string, WorkspaceData>();

// 待恢复的文件句柄（需要用户点击授权后才能恢复）
let pendingRestoreHandles: FileSystemFileHandle[] = [];

interface TaskStore {
  // ===== 工作区管理 =====
  workspaces: Workspace[];
  activeWorkspaceId: string | null;

  // ===== 当前工作区数据（始终反映 activeWorkspaceId）=====
  tasks: Task[];
  modules: ModuleItem[];
  moveRecords: MoveRecord[];

  // ===== UI 状态（不持久化到文件）=====
  view: ViewMode;
  activeModuleId: string | null;
  selectedTaskId: string | null;
  isOnboarded: boolean;
  isInitializing: boolean; // 初始化加载中
  needsRestoreClick: boolean; // 需要用户点击授权恢复工作区
  fileSupported: boolean;
  settingsOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchFilters: SearchFilters;
  contextMenu: ContextMenuState | null;
  deleteToasts: DeleteToastItem[];

  // ===== 工作区操作 =====
  initStore: () => Promise<void>;
  restoreWorkspacesWithPermission: () => Promise<void>;
  createWorkspace: () => Promise<void>;
  openWorkspace: () => Promise<void>;
  closeWorkspace: (workspaceId: string) => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  renameWorkspace: (workspaceId: string) => Promise<void>;

  // ===== 任务操作 =====
  createTask: (title: string, moduleId: string) => void;
  deleteTask: (taskId: string) => void;
  undoDelete: (toastId: string) => void;
  dismissDeleteToast: (toastId: string) => void;
  toggleTask: (taskId: string) => void;
  editTaskTitle: (taskId: string, title: string) => void;
  moveTask: (taskId: string, toModuleId: string) => void;
  undoTaskMove: (taskId: string) => void;
  undoMove: (recordId: string) => void; // 仅用于 quadrant_change 记录
  setQuadrant: (taskId: string, quadrant: Quadrant | null) => void;

  // ===== 模块管理 =====
  addModule: (name: string) => void;
  deleteModule: (moduleId: string) => void;
  renameModule: (moduleId: string, name: string) => void;
  reorderModule: (moduleId: string, direction: "up" | "down") => void;
  toggleModuleVisible: (moduleId: string) => void;

  // ===== UI 操作 =====
  setView: (view: ViewMode) => void;
  setActiveModule: (moduleId: string) => void;
  setSelectedTask: (taskId: string | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSearchFilters: (filters: Partial<SearchFilters>) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;

  // ===== 数据导入导出 =====
  exportData: () => void;
  importData: () => Promise<void>;

  // ===== 内部方法 =====
  _triggerSave: () => void;
}

// 获取默认模块数据
function getDefaultModules(): ModuleItem[] {
  return PRESET_MODULES.map((m) => ({ ...m }));
}

// 获取可持久化的数据
function getPersistableData(state: TaskStore): PersistedData {
  return {
    tasks: state.tasks,
    modules: state.modules,
    moveRecords: state.moveRecords,
  };
}

// 获取当前活动工作区名称
function getActiveWorkspaceName(state: TaskStore): string {
  const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  return ws?.name || "未命名";
}

// 获取当前所有文件句柄
function getAllHandles(state: TaskStore): FileSystemFileHandle[] {
  return state.workspaces
    .map((w) => w.fileHandle)
    .filter((h): h is FileSystemFileHandle => h !== null);
}

export const useTaskStore = create<TaskStore>((set, get) => {
  // 内部：缓存当前工作区数据到 dataCache
  const cacheCurrentData = () => {
    const state = get();
    const wsId = state.activeWorkspaceId;
    if (!wsId) return;
    dataCache.set(wsId, {
      tasks: state.tasks,
      modules: state.modules,
      moveRecords: state.moveRecords,
    });
  };

  // 内部：触发防抖保存（写入当前工作区对应的文件）
  const triggerSave = () => {
    const state = get();
    const wsId = state.activeWorkspaceId;
    if (!wsId || !state.isOnboarded) return;

    const data = getPersistableData(state);

    // 更新内存缓存
    dataCache.set(wsId, data);

    if (state.fileSupported) {
      // 使用 File System Access API 写入对应文件
      const writer = fileWriters.get(wsId);
      if (writer) {
        writer.write(data);
      }
    } else {
      // 降级到 IndexedDB（按工作区 key 隔离）
      idbFallbackSet(data, wsId);
    }
  };

  // 内部：加载工作区数据到顶层字段
  const loadWorkspaceData = (wsId: string) => {
    const cached = dataCache.get(wsId);
    if (cached) {
      set({
        tasks: cached.tasks,
        modules:
          cached.modules.length > 0 ? cached.modules : getDefaultModules(),
        moveRecords: cached.moveRecords,
      });
    } else {
      set({
        tasks: [],
        modules: getDefaultModules(),
        moveRecords: [],
      });
    }
  };

  // 内部：持久化句柄/元数据到 IndexedDB
  const persistToIDB = async () => {
    const state = get();
    if (state.fileSupported) {
      const handles = getAllHandles(state);
      await saveFileHandlesToIDB(handles);
    } else {
      const metadata = state.workspaces.map((w) => ({
        id: w.id,
        name: w.name,
      }));
      await saveWorkspaceMetadataToIDB(metadata);
    }
  };

  return {
    // ===== 初始状态 =====
    workspaces: [],
    activeWorkspaceId: null,
    tasks: [],
    modules: getDefaultModules(),
    moveRecords: [],
    view: "module",
    activeModuleId: "not-started",
    selectedTaskId: null,
    isOnboarded: false,
    isInitializing: true,
    needsRestoreClick: false,
    fileSupported: isFileSystemAccessSupported(),
    settingsOpen: false,
    searchOpen: false,
    searchQuery: "",
    searchFilters: {
      moduleId: null,
      status: "all",
      quadrant: "all",
    },
    contextMenu: null,
    deleteToasts: [],

    // ===== 初始化 =====
    initStore: async () => {
      set({ isInitializing: true });
      const supported = isFileSystemAccessSupported();

      if (!supported) {
        // 降级模式：从 IndexedDB 恢复工作区元数据和数据
        try {
          const metadata = await loadWorkspaceMetadataFromIDB();
          if (metadata && metadata.length > 0) {
            const wsList: Workspace[] = metadata.map((m) => ({
              id: m.id,
              name: m.name,
              fileHandle: null,
              loaded: true,
            }));

            // 加载所有工作区的数据到缓存
            for (const ws of wsList) {
              const data = await idbFallbackGet(ws.id);
              if (data) {
                dataCache.set(ws.id, data);
              } else {
                dataCache.set(ws.id, {
                  tasks: [],
                  modules: getDefaultModules(),
                  moveRecords: [],
                });
              }
            }

            // 尝试恢复上次活跃的工作区（按文件名匹配）
            let lastActiveName: string | null = null;
            try {
              lastActiveName = await loadLastActiveWorkspaceName();
            } catch {
              // 忽略
            }
            const targetWs =
              wsList.find((w) => w.name === lastActiveName) || wsList[0];

            set({
              workspaces: wsList,
              activeWorkspaceId: targetWs.id,
              isOnboarded: true,
              isInitializing: false,
              fileSupported: false,
            });
            loadWorkspaceData(targetWs.id);
            return;
          }
        } catch {
          // 元数据恢复失败
        }
        set({
          isOnboarded: false,
          isInitializing: false,
          fileSupported: false,
        });
        return;
      }

      // File System Access API 模式：从 IndexedDB 恢复文件句柄数组
      try {
        const handles = await loadFileHandlesFromIDB();
        if (handles && handles.length > 0) {
          const grantedHandles: FileSystemFileHandle[] = [];
          const pendingHandles: FileSystemFileHandle[] = [];

          // 逐个检查权限（queryPermission 不需要用户手势）
          for (const handle of handles) {
            try {
              const perm = await queryPermissionOnly(handle, "readwrite");
              if (perm === "granted") {
                grantedHandles.push(handle);
              } else if (perm === "prompt") {
                // 需要用户点击授权
                pendingHandles.push(handle);
              }
              // perm === "denied" 则跳过（文件权限被撤销）
            } catch {
              // 查询权限失败，文件可能已被删除/移动
            }
          }

          // 恢复已有权限的句柄
          const wsList: Workspace[] = [];
          for (const handle of grantedHandles) {
            try {
              const data = await readFileContent(handle);
              const wsId = generateId();
              dataCache.set(wsId, data);

              const writer = new DebouncedFileWriter();
              writer.setHandle(handle);
              fileWriters.set(wsId, writer);

              wsList.push({
                id: wsId,
                name: handle.name,
                fileHandle: handle,
                loaded: true,
              });
            } catch {
              // 读取文件失败，跳过
            }
          }

          if (wsList.length > 0) {
            // 尝试恢复上次活跃的工作区（按文件名匹配）
            let lastActiveName: string | null = null;
            try {
              lastActiveName = await loadLastActiveWorkspaceName();
            } catch {
              // 忽略
            }
            const targetWs =
              wsList.find((w) => w.name === lastActiveName) || wsList[0];

            set({
              workspaces: wsList,
              activeWorkspaceId: targetWs.id,
              isOnboarded: true,
              isInitializing: false,
              fileSupported: true,
            });
            loadWorkspaceData(targetWs.id);

            // 保存当前活跃工作区名
            try {
              await saveLastActiveWorkspaceName(targetWs.name);
            } catch {
              // 忽略
            }

            // 如果有句柄需要授权，保存到 pending
            if (pendingHandles.length > 0) {
              pendingRestoreHandles = pendingHandles;
              set({ needsRestoreClick: true });
            }

            // 如果有句柄因权限问题被跳过且无 pending，更新 IDB
            if (
              pendingHandles.length === 0 &&
              wsList.length < handles.length
            ) {
              const validHandles = wsList.map(
                (w) => w.fileHandle!
              ) as FileSystemFileHandle[];
              await saveFileHandlesToIDB(validHandles);
            }
            return;
          }

          // 没有已授权的句柄，但有 pending 句柄
          if (pendingHandles.length > 0) {
            pendingRestoreHandles = pendingHandles;
            set({
              isOnboarded: false,
              needsRestoreClick: true,
              isInitializing: false,
              fileSupported: true,
            });
            return;
          }
        }
      } catch {
        // 句柄恢复失败，需要重新选择文件
      }

      // 未找到有效工作区，显示引导界面
      set({
        isOnboarded: false,
        isInitializing: false,
        fileSupported: true,
      });
    },

    // 用户点击后恢复需要授权的工作区
    restoreWorkspacesWithPermission: async () => {
      const handles = pendingRestoreHandles;
      pendingRestoreHandles = [];

      if (handles.length === 0) {
        set({ needsRestoreClick: false, isOnboarded: false });
        return;
      }

      set({ needsRestoreClick: false, isInitializing: true });

      const wsList: Workspace[] = [];
      const validHandles: FileSystemFileHandle[] = [];

      for (const handle of handles) {
        try {
          const granted = await requestFilePermission(handle, "readwrite");
          if (granted) {
            const data = await readFileContent(handle);
            const wsId = generateId();
            dataCache.set(wsId, data);

            const writer = new DebouncedFileWriter();
            writer.setHandle(handle);
            fileWriters.set(wsId, writer);

            wsList.push({
              id: wsId,
              name: handle.name,
              fileHandle: handle,
              loaded: true,
            });
            validHandles.push(handle);
          }
        } catch {
          // 文件读取失败，跳过
        }
      }

      // 合并已有工作区
      const existingWorkspaces = get().workspaces;
      const allWorkspaces = [...existingWorkspaces, ...wsList];

      if (allWorkspaces.length > 0) {
        // 优先激活新恢复的工作区，否则保持当前
        const targetWs = wsList[0] || allWorkspaces[0];
        set({
          workspaces: allWorkspaces,
          activeWorkspaceId: targetWs.id,
          isOnboarded: true,
          isInitializing: false,
        });
        loadWorkspaceData(targetWs.id);

        // 更新 IDB 中的句柄列表
        const allHandles = allWorkspaces
          .map((w) => w.fileHandle)
          .filter((h): h is FileSystemFileHandle => h !== null);
        await saveFileHandlesToIDB(allHandles);

        // 保存最后活跃工作区名
        try {
          await saveLastActiveWorkspaceName(targetWs.name);
        } catch {
          // 忽略
        }
      } else {
        // 所有句柄都失败了，显示引导界面
        set({
          isOnboarded: false,
          isInitializing: false,
        });
        await clearFileHandlesFromIDB();
      }
    },

    // ===== 工作区操作 =====
    createWorkspace: async () => {
      const result = await createNewFile();
      if (!result) return;

      const state = get();
      const wsId = generateId();
      const defaultModules = getDefaultModules();
      const initialData: WorkspaceData = {
        tasks: [],
        modules: defaultModules,
        moveRecords: [],
      };

      // 写入初始数据到文件
      const writer = new DebouncedFileWriter();
      writer.setHandle(result.handle);
      writer.write(initialData);
      fileWriters.set(wsId, writer);
      dataCache.set(wsId, initialData);

      // 缓存当前工作区数据并刷盘
      if (state.activeWorkspaceId) {
        cacheCurrentData();
        const currentWriter = fileWriters.get(state.activeWorkspaceId);
        if (currentWriter) await currentWriter.flush();
      }

      const newWorkspace: Workspace = {
        id: wsId,
        name: result.handle.name,
        fileHandle: result.handle,
        loaded: true,
      };

      set({
        workspaces: [...state.workspaces, newWorkspace],
        activeWorkspaceId: wsId,
        isOnboarded: true,
        tasks: initialData.tasks,
        modules: initialData.modules,
        moveRecords: initialData.moveRecords,
        activeModuleId: defaultModules[0]?.id || null,
      });

      await persistToIDB();
      try {
        await saveLastActiveWorkspaceName(result.handle.name);
      } catch {
        // 忽略
      }
    },

    openWorkspace: async () => {
      const result = await openExistingFile();
      if (!result) return;

      const state = get();

      // 检查是否已打开同一文件（防止重复）
      if (state.fileSupported) {
        for (const ws of state.workspaces) {
          if (ws.fileHandle) {
            try {
              const same = await ws.fileHandle.isSameEntry(result.handle);
              if (same) {
                // 已打开，直接切换
                get().switchWorkspace(ws.id);
                return;
              }
            } catch {
              // 忽略错误
            }
          }
        }
      }

      const wsId = generateId();
      dataCache.set(wsId, result.data);

      const writer = new DebouncedFileWriter();
      writer.setHandle(result.handle);
      fileWriters.set(wsId, writer);

      // 缓存当前工作区数据并刷盘
      if (state.activeWorkspaceId) {
        cacheCurrentData();
        const currentWriter = fileWriters.get(state.activeWorkspaceId);
        if (currentWriter) await currentWriter.flush();
      }

      const newWorkspace: Workspace = {
        id: wsId,
        name: result.handle.name,
        fileHandle: result.handle,
        loaded: true,
      };

      const loadedModules =
        result.data.modules.length > 0
          ? result.data.modules
          : getDefaultModules();

      set({
        workspaces: [...state.workspaces, newWorkspace],
        activeWorkspaceId: wsId,
        isOnboarded: true,
        tasks: result.data.tasks,
        modules: loadedModules,
        moveRecords: result.data.moveRecords,
        activeModuleId: loadedModules[0]?.id || null,
      });

      await persistToIDB();
      try {
        await saveLastActiveWorkspaceName(result.handle.name);
      } catch {
        // 忽略
      }
    },

    closeWorkspace: async (workspaceId) => {
      const state = get();
      const ws = state.workspaces.find((w) => w.id === workspaceId);
      if (!ws) return;

      // 刷盘并清理写入器
      const writer = fileWriters.get(workspaceId);
      if (writer) {
        await writer.flush();
        fileWriters.delete(workspaceId);
      }

      // 清理缓存
      dataCache.delete(workspaceId);

      // 降级模式下删除 IDB 中的数据
      if (!state.fileSupported) {
        await idbFallbackDelete(workspaceId);
      }

      const newWorkspaces = state.workspaces.filter(
        (w) => w.id !== workspaceId
      );

      await persistToIDB();

      if (state.activeWorkspaceId === workspaceId) {
        // 关闭的是当前活动工作区
        if (newWorkspaces.length > 0) {
          const newActive = newWorkspaces[0];
          const cachedData = dataCache.get(newActive.id);
          set({
            workspaces: newWorkspaces,
            activeWorkspaceId: newActive.id,
            tasks: cachedData?.tasks || [],
            modules:
              cachedData && cachedData.modules.length > 0
                ? cachedData.modules
                : getDefaultModules(),
            moveRecords: cachedData?.moveRecords || [],
            activeModuleId:
              (cachedData && cachedData.modules[0]?.id) || "not-started",
          });
          try {
            await saveLastActiveWorkspaceName(newActive.name);
          } catch {
            // 忽略
          }
        } else {
          // 没有工作区了，显示引导界面
          set({
            workspaces: [],
            activeWorkspaceId: null,
            isOnboarded: false,
            tasks: [],
            modules: getDefaultModules(),
            moveRecords: [],
            activeModuleId: "not-started",
          });
          try {
            await saveLastActiveWorkspaceName(null);
          } catch {
            // 忽略
          }
        }
      } else {
        set({ workspaces: newWorkspaces });
      }
    },

    switchWorkspace: async (workspaceId) => {
      const state = get();
      if (state.activeWorkspaceId === workspaceId) return;

      const targetWs = state.workspaces.find((w) => w.id === workspaceId);
      if (!targetWs) return;

      // 缓存当前工作区数据并刷盘
      if (state.activeWorkspaceId) {
        cacheCurrentData();
        const writer = fileWriters.get(state.activeWorkspaceId);
        if (writer) await writer.flush();
      }

      // 加载目标工作区数据
      let cachedData = dataCache.get(workspaceId);

      // 如果缓存中没有，尝试从文件读取
      if (!cachedData && targetWs.fileHandle) {
        try {
          const data = await readFileContent(targetWs.fileHandle);
          cachedData = data;
          dataCache.set(workspaceId, data);
        } catch {
          // 读取失败，使用空数据
        }
      }

      set({
        activeWorkspaceId: workspaceId,
        tasks: cachedData?.tasks || [],
        modules:
          cachedData && cachedData.modules.length > 0
            ? cachedData.modules
            : getDefaultModules(),
        moveRecords: cachedData?.moveRecords || [],
        activeModuleId:
          (cachedData && cachedData.modules[0]?.id) || "not-started",
        selectedTaskId: null,
        deleteToasts: [],
      });

      // 保存最后活跃工作区名（用于刷新恢复）
      try {
        await saveLastActiveWorkspaceName(targetWs.name);
      } catch {
        // 忽略
      }
    },

    renameWorkspace: async (workspaceId) => {
      // 重命名 = "另存为" 新文件 + 移除旧工作区引用
      const state = get();
      const ws = state.workspaces.find((w) => w.id === workspaceId);
      if (!ws) return;

      // 弹出保存对话框，让用户选择新文件名
      const result = await createNewFile();
      if (!result) return;

      // 获取当前数据（优先从缓存）
      const currentData =
        dataCache.get(workspaceId) ||
        ({
          tasks: state.tasks,
          modules: state.modules,
          moveRecords: state.moveRecords,
        } as WorkspaceData);

      // 写入新文件
      const writable = await result.handle.createWritable();
      await writable.write(JSON.stringify(currentData, null, 2));
      await writable.close();

      const newWsId = generateId();
      dataCache.set(newWsId, currentData);

      const writer = new DebouncedFileWriter();
      writer.setHandle(result.handle);
      fileWriters.set(newWsId, writer);

      // 清理旧工作区的写入器和缓存
      const oldWriter = fileWriters.get(workspaceId);
      if (oldWriter) {
        fileWriters.delete(workspaceId);
      }
      dataCache.delete(workspaceId);

      const newWorkspace: Workspace = {
        id: newWsId,
        name: result.handle.name,
        fileHandle: result.handle,
        loaded: true,
      };

      // 替换工作区列表中的旧工作区
      const newWorkspaces = state.workspaces.map((w) =>
        w.id === workspaceId ? newWorkspace : w
      );

      const wasActive = state.activeWorkspaceId === workspaceId;

      set({
        workspaces: newWorkspaces,
        activeWorkspaceId: wasActive ? newWsId : state.activeWorkspaceId,
        tasks: wasActive ? currentData.tasks : state.tasks,
        modules: wasActive
          ? currentData.modules.length > 0
            ? currentData.modules
            : getDefaultModules()
          : state.modules,
        moveRecords: wasActive ? currentData.moveRecords : state.moveRecords,
      });

      await persistToIDB();
    },

    // ===== 任务操作 =====
    createTask: (title, moduleId) => {
      const trimmed = title.trim();
      if (!trimmed) return;

      const newTask: Task = {
        id: generateId(),
        title: trimmed,
        moduleId,
        completed: false,
        createdAt: Date.now(),
        completedAt: null,
        quadrant: null,
        sourceModuleId: null,
        movedToModuleId: null,
        movedToTaskId: null,
        movedAt: null,
      };

      set((state) => ({
        tasks: [...state.tasks, newTask],
        activeModuleId: moduleId,
      }));
      triggerSave();
    },

    deleteTask: (taskId) => {
      const state = get();
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;

      const toastId = generateId();
      const toast: DeleteToastItem = {
        id: toastId,
        task: { ...task },
        countdown: DELETE_UNDO_SECONDS,
      };

      set((s) => ({
        tasks: s.tasks.filter((t) => t.id !== taskId),
        deleteToasts: [...s.deleteToasts, toast],
        selectedTaskId: null,
      }));
      triggerSave();

      // 启动倒计时
      const countdownInterval = setInterval(() => {
        const toasts = get().deleteToasts;
        const current = toasts.find((t) => t.id === toastId);
        if (!current) {
          clearInterval(countdownInterval);
          return;
        }
        const newCountdown = current.countdown - 1;
        if (newCountdown <= 0) {
          clearInterval(countdownInterval);
          set((s) => ({
            deleteToasts: s.deleteToasts.filter((t) => t.id !== toastId),
          }));
        } else {
          set((s) => ({
            deleteToasts: s.deleteToasts.map((t) =>
              t.id === toastId ? { ...t, countdown: newCountdown } : t
            ),
          }));
        }
      }, 1000);
    },

    undoDelete: (toastId) => {
      const state = get();
      const toast = state.deleteToasts.find((t) => t.id === toastId);
      if (!toast) return;

      set((s) => ({
        tasks: [...s.tasks, toast.task],
        deleteToasts: s.deleteToasts.filter((t) => t.id !== toastId),
      }));
      triggerSave();
    },

    dismissDeleteToast: (toastId) => {
      set((s) => ({
        deleteToasts: s.deleteToasts.filter((t) => t.id !== toastId),
      }));
    },

    toggleTask: (taskId) => {
      const state = get();
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;

      // 如果任务因移动而标记为完成，取消勾选 = 撤销移动
      if (task.completed && task.movedToTaskId) {
        get().undoTaskMove(taskId);
        return;
      }

      set((state) => ({
        tasks: state.tasks.map((t) => {
          if (t.id !== taskId) return t;
          if (t.completed) {
            return { ...t, completed: false, completedAt: null };
          } else {
            return { ...t, completed: true, completedAt: Date.now() };
          }
        }),
      }));
      triggerSave();
    },

    editTaskTitle: (taskId, title) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, title: trimmed } : t
        ),
      }));
      triggerSave();
    },

    moveTask: (taskId, toModuleId) => {
      const state = get();
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;
      if (task.moduleId === toModuleId) return;

      const fromModuleId = task.moduleId;
      const moveTime = Date.now();
      const newTaskId = generateId();

      // 在目标模块创建副本任务
      const copiedTask: Task = {
        ...task,
        id: newTaskId,
        moduleId: toModuleId,
        completed: false,
        completedAt: null,
        sourceModuleId: fromModuleId,
        movedToModuleId: null,
        movedToTaskId: null,
        movedAt: null,
        createdAt: moveTime,
      };

      // 原任务保留在原模块，标记为已完成并记录移动信息
      set((s) => ({
        tasks: s.tasks
          .map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  completed: true,
                  completedAt: moveTime,
                  movedToModuleId: toModuleId,
                  movedToTaskId: newTaskId,
                  movedAt: moveTime,
                }
              : t
          )
          .concat(copiedTask),
      }));
      triggerSave();
    },

    undoTaskMove: (taskId) => {
      const state = get();
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task || !task.movedToTaskId) return;

      const copyId = task.movedToTaskId;

      // 删除目标模块中的副本，恢复原任务为未完成
      set((s) => ({
        tasks: s.tasks
          .filter((t) => t.id !== copyId)
          .map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  completed: false,
                  completedAt: null,
                  movedToModuleId: null,
                  movedToTaskId: null,
                  movedAt: null,
                }
              : t
          ),
      }));
      triggerSave();
    },

    undoMove: (recordId) => {
      // 仅用于 quadrant_change 记录的撤销
      const state = get();
      const record = state.moveRecords.find((r) => r.id === recordId);
      if (!record) return;

      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === record.taskId
            ? { ...t, quadrant: record.fromQuadrant ?? null }
            : t
        ),
        moveRecords: s.moveRecords.filter((r) => r.id !== recordId),
      }));
      triggerSave();
    },

    setQuadrant: (taskId, quadrant) => {
      const state = get();
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;

      const oldQuadrant = task.quadrant;
      if (oldQuadrant === quadrant) return;

      if (oldQuadrant && quadrant) {
        const record: MoveRecord = {
          id: generateId(),
          taskId: task.id,
          taskTitle: task.title,
          fromModuleId: task.moduleId,
          toModuleId: task.moduleId,
          timestamp: Date.now(),
          type: "quadrant_change",
          fromQuadrant: oldQuadrant,
          toQuadrant: quadrant,
        };
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId ? { ...t, quadrant } : t
          ),
          moveRecords: [...s.moveRecords, record],
        }));
      } else {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId ? { ...t, quadrant } : t
          ),
        }));
      }
      triggerSave();
    },

    // ===== 模块管理 =====
    addModule: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const maxOrder = Math.max(...get().modules.map((m) => m.order), 0);
      const newModule: ModuleItem = {
        id: generateId(),
        name: trimmed,
        order: maxOrder + 1,
        visible: false,
        isPreset: false,
      };
      set((s) => ({ modules: [...s.modules, newModule] }));
      triggerSave();
    },

    deleteModule: (moduleId) => {
      const module = get().modules.find((m) => m.id === moduleId);
      if (!module || module.isPreset) return;

      set((s) => ({
        modules: s.modules.filter((m) => m.id !== moduleId),
        tasks: s.tasks.map((t) =>
          t.moduleId === moduleId
            ? { ...t, moduleId: "unsorted", sourceModuleId: moduleId }
            : t
        ),
        moveRecords: s.moveRecords.filter(
          (r) => r.fromModuleId !== moduleId && r.toModuleId !== moduleId
        ),
      }));
      triggerSave();
    },

    renameModule: (moduleId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      set((s) => ({
        modules: s.modules.map((m) =>
          m.id === moduleId ? { ...m, name: trimmed } : m
        ),
      }));
      triggerSave();
    },

    reorderModule: (moduleId, direction) => {
      const modules = [...get().modules].sort((a, b) => a.order - b.order);
      const index = modules.findIndex((m) => m.id === moduleId);
      if (index === -1) return;

      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= modules.length) return;

      const tempOrder = modules[index].order;
      modules[index].order = modules[swapIndex].order;
      modules[swapIndex].order = tempOrder;

      set({ modules });
      triggerSave();
    },

    toggleModuleVisible: (moduleId) => {
      set((s) => ({
        modules: s.modules.map((m) =>
          m.id === moduleId ? { ...m, visible: !m.visible } : m
        ),
      }));
      triggerSave();
    },

    // ===== UI 操作 =====
    setView: (view) => set({ view }),
    setActiveModule: (moduleId) => set({ activeModuleId: moduleId }),
    setSelectedTask: (taskId) => set({ selectedTaskId: taskId }),
    setSettingsOpen: (open) => set({ settingsOpen: open }),
    setSearchOpen: (open) =>
      set({
        searchOpen: open,
        searchQuery: open ? get().searchQuery : "",
      }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setSearchFilters: (filters) =>
      set((s) => ({ searchFilters: { ...s.searchFilters, ...filters } })),
    setContextMenu: (menu) => set({ contextMenu: menu }),

    // ===== 数据导入导出 =====
    exportData: () => {
      const state = get();
      const data = getPersistableData(state);
      exportDataAsFile(data, getActiveWorkspaceName(state));
    },

    importData: async () => {
      const data = await importDataFromFile();
      if (!data) return;

      const wsId = get().activeWorkspaceId;
      if (wsId) {
        dataCache.set(wsId, data);
      }
      set({
        tasks: data.tasks || [],
        modules:
          data.modules && data.modules.length > 0
            ? data.modules
            : getDefaultModules(),
        moveRecords: data.moveRecords || [],
      });
      triggerSave();
    },

    // ===== 内部方法 =====
    _triggerSave: triggerSave,
  };
});
