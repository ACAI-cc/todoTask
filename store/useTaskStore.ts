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
import type { SyncStatus } from "@/types/electron";
import { PRESET_MODULES, DELETE_UNDO_SECONDS } from "@/lib/constants";
import {
  generateId,
  isFileSystemAccessSupported,
  isElectron,
} from "@/lib/utils";
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
import {
  ElectronFileWriter,
  electronListWorkspaces,
  electronGetDataPath,
  electronReadWorkspace,
  electronCreateWorkspace,
  electronRenameWorkspace,
  onSyncStatusUpdate,
  triggerManualSync,
  setAutoPushEnabled,
  getSyncStatus,
} from "@/lib/electronStorage";

// ============================================================
// 模块级（非 Zustand 状态）：文件写入器和数据缓存
// ============================================================

// 每个工作区一个独立的防抖写入器（浏览器模式用 DebouncedFileWriter，Electron 模式用 ElectronFileWriter）
const fileWriters = new Map<string, DebouncedFileWriter | ElectronFileWriter>();

// 工作区数据缓存：切换工作区时先缓存当前数据，再加载新数据
const dataCache = new Map<string, WorkspaceData>();

// 待恢复的文件句柄（需要用户点击授权后才能恢复）
let pendingRestoreHandles: FileSystemFileHandle[] = [];

interface TaskStore {
  // ===== 工作区管理 =====
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  isElectron: boolean; // 是否在 Electron 桌面应用环境中

  // ===== Git 同步状态（仅 Electron 模式）=====
  syncStatus: SyncStatus | null;
  taskDataPath: string | null; // taskData 目录的绝对路径（仅 Electron 模式）
  codeRepoPath: string | null; // 用户配置的代码仓库目录（仅 Electron 模式）

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

  // ===== 日历视图状态 =====
  calendarSubview: "month" | "week" | "day";
  calendarDate: string;

  // ===== 工作区操作 =====
  initStore: () => Promise<void>;
  restoreWorkspacesWithPermission: () => Promise<void>;
  createWorkspace: () => Promise<void>;
  openWorkspace: () => Promise<void>;
  openSpecificWorkspace: (filename: string) => Promise<void>;
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
  editTaskContact: (taskId: string, contact: string | null) => void;
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
  setModuleBgColor: (moduleId: string, bgColor: string | null) => void;

  // ===== UI 操作 =====
  setView: (view: ViewMode) => void;
  setActiveModule: (moduleId: string) => void;
  setSelectedTask: (taskId: string | null) => void;
  setSettingsOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSearchFilters: (filters: Partial<SearchFilters>) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;

  // ===== 日历视图操作 =====
  setCalendarSubview: (subview: "month" | "week" | "day") => void;
  setCalendarDate: (date: Date) => void;
  navigateCalendar: (direction: "prev" | "next") => void;
  goToToday: () => void;

  // ===== 数据导入导出 =====
  exportData: () => void;
  importData: () => Promise<void>;

  // ===== Git 同步操作（仅 Electron 模式）=====
  triggerManualSync: () => Promise<void>;
  setAutoPush: (enabled: boolean) => Promise<void>;
  setCodeRepoPath: (repoPath: string, gitPath: string) => Promise<void>;

  // ===== 自定义 Prompt 对话框（替代 window.prompt，Electron 不支持）=====
  promptDialog: {
    title: string;
    label?: string;
    defaultValue?: string;
    placeholder?: string;
    confirmText?: string;
    resolve: ((value: string | null) => void) | null;
  } | null;
  showPromptDialog: (options: {
    title: string;
    label?: string;
    defaultValue?: string;
    placeholder?: string;
    confirmText?: string;
  }) => Promise<string | null>;
  closePromptDialog: (value: string | null) => void;

  // ===== 内部方法 =====
  _triggerSave: () => void;
}

// 获取默认模块数据
function getDefaultModules(): ModuleItem[] {
  return PRESET_MODULES.map((m) => ({ ...m }));
}

// 数据迁移：确保旧数据文件包含新字段
function migrateData(data: WorkspaceData): WorkspaceData {
  return {
    tasks: (data.tasks || []).map((t) => ({
      ...t,
      contact: t.contact ?? null,
      movedToModuleId: t.movedToModuleId ?? null,
      movedToTaskId: t.movedToTaskId ?? null,
      movedAt: t.movedAt ?? null,
      sourceModuleId: t.sourceModuleId ?? null,
      originId: t.originId ?? t.id,
    })),
    modules: (data.modules || []).map((m) => ({
      ...m,
      bgColor: m.bgColor ?? null,
    })),
    moveRecords: data.moveRecords || [],
  };
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

// 设置 Git 同步状态监听（仅 Electron 模式有效）
function setupSyncListener(set: (partial: Partial<TaskStore>) => void) {
  if (!isElectron()) return;
  const unsubscribe = onSyncStatusUpdate((status) => {
    set({ syncStatus: status });
  });
  // 注意：unsubscribe 在应用生命周期内不需要手动调用
  // 如果需要清理，可以存储到模块级变量中
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

    if (state.isElectron || state.fileSupported) {
      // Electron 模式使用 ElectronFileWriter（IPC 写入），浏览器模式使用 DebouncedFileWriter
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

  // 内部：持久化句柄/元数据到 IndexedDB（仅浏览器模式需要）
  const persistToIDB = async () => {
    const state = get();
    if (state.isElectron) return; // Electron 模式不需要持久化到 IDB
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
    isElectron: isElectron(),
    syncStatus: null,
    taskDataPath: null,
    codeRepoPath: null,
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
    calendarSubview: "month",
    calendarDate: new Date().toISOString(),

    // ===== 初始化 =====
    initStore: async () => {
      set({ isInitializing: true });

      // ===== Electron 桌面应用模式 =====
      if (isElectron()) {
        set({ isElectron: true, fileSupported: false });

        try {
          // 获取 taskData 目录路径（供 UI 显示）
          const dataPath = await electronGetDataPath();
          set({ taskDataPath: dataPath });

          // 获取已配置的代码仓库路径
          const repoPath = await window.electronAPI?.getCodeRepoPath();
          set({ codeRepoPath: repoPath || null });

          // 列出 taskData/ 目录下所有 .json 文件
          const filenames = await electronListWorkspaces();
          console.log("[TaskFlow] initStore - taskData 文件列表:", filenames, "路径:", dataPath);

          if (filenames.length === 0) {
            // 没有工作区文件，显示引导界面
            set({ isOnboarded: false, isInitializing: false });
            // 仍然设置同步状态监听
            setupSyncListener(set);
            return;
          }

          // 加载每个文件的数据
          const wsList: Workspace[] = [];
          for (const filename of filenames) {
            try {
              const rawData = await electronReadWorkspace(filename);
              const data = migrateData(rawData);
              const wsId = generateId();
              dataCache.set(wsId, data);

              // 创建 ElectronFileWriter
              const writer = new ElectronFileWriter();
              writer.setFilename(filename);
              fileWriters.set(wsId, writer);

              wsList.push({
                id: wsId,
                name: filename.replace(/\.json$/i, ""),
                filename,
                fileHandle: null,
                loaded: true,
              });
            } catch {
              // 读取文件失败，跳过
            }
          }

          if (wsList.length === 0) {
            set({ isOnboarded: false, isInitializing: false });
            setupSyncListener(set);
            return;
          }

          // 尝试恢复上次活跃的工作区（按文件名匹配）
          let lastActiveName: string | null = null;
          try {
            lastActiveName = await loadLastActiveWorkspaceName();
          } catch {}

          const targetWs =
            wsList.find((w) => w.filename === lastActiveName) || wsList[0];

          set({
            workspaces: wsList,
            activeWorkspaceId: targetWs.id,
            isOnboarded: true,
            isInitializing: false,
          });
          loadWorkspaceData(targetWs.id);

          try {
            await saveLastActiveWorkspaceName(targetWs.filename || targetWs.name);
          } catch {}

          // 设置同步状态监听并获取初始状态
          setupSyncListener(set);
          try {
            const status = await getSyncStatus();
            if (status) set({ syncStatus: status });
          } catch {}

          return;
        } catch (err) {
          console.error("Electron 初始化失败:", err);
          set({ isOnboarded: false, isInitializing: false });
          return;
        }
      }

      // ===== 浏览器模式 =====
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
              const rawData = await idbFallbackGet(ws.id);
              if (rawData) {
                dataCache.set(ws.id, migrateData(rawData));
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
              const rawData = await readFileContent(handle);
              const data = migrateData(rawData);
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
            const rawData = await readFileContent(handle);
            const data = migrateData(rawData);
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
      // ===== Electron 模式：通过 IPC 在 taskData/ 目录创建文件 =====
      if (get().isElectron) {
        const input = await get().showPromptDialog({
          title: "新建工作区",
          label: "请输入工作区名称（不含 .json 后缀）:",
          placeholder: "例如：MyTasks",
          confirmText: "创建",
        });
        if (!input || !input.trim()) return;

        let name = input.trim();
        if (!name.endsWith(".json")) name += ".json";

        try {
          await electronCreateWorkspace(name);
        } catch (err: any) {
          console.error("创建工作区失败:", err);
          return;
        }

        const state = get();
        const wsId = generateId();
        const defaultModules = getDefaultModules();
        const initialData: WorkspaceData = {
          tasks: [],
          modules: defaultModules,
          moveRecords: [],
        };

        // 缓存当前工作区数据
        if (state.activeWorkspaceId) {
          cacheCurrentData();
        }

        dataCache.set(wsId, initialData);

        const writer = new ElectronFileWriter();
        writer.setFilename(name);
        fileWriters.set(wsId, writer);

        const newWorkspace: Workspace = {
          id: wsId,
          name: name.replace(/\.json$/i, ""),
          filename: name,
          fileHandle: null,
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

        try {
          await saveLastActiveWorkspaceName(name);
        } catch {}
        return;
      }

      // ===== 浏览器模式（File System Access API）=====
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
      // ===== Electron 模式：刷新文件列表，加载新文件 =====
      if (get().isElectron) {
        try {
          // 确保有 taskDataPath（用户可能从引导界面直接点刷新）
          if (!get().taskDataPath) {
            const dataPath = await electronGetDataPath();
            set({ taskDataPath: dataPath });
          }

          const filenames = await electronListWorkspaces();
          const existingNames = new Set(
            get().workspaces.map((w) => w.filename)
          );
          const newFiles = filenames.filter((f) => !existingNames.has(f));

          if (newFiles.length === 0) {
            const dataPath = get().taskDataPath || "taskData/";
            if (filenames.length === 0) {
              alert(
                `taskData 目录中没有工作区文件。\n\n` +
                `查找路径: ${dataPath}\n\n` +
                `请将 .json 工作区文件放入该目录，或点击"新建工作区"创建。`
              );
            } else {
              alert(
                `taskData 目录中的所有工作区文件已加载。\n\n` +
                `查找路径: ${dataPath}\n` +
                `已有文件: ${filenames.join(", ")}`
              );
            }
            return;
          }

          // 缓存当前工作区
          if (get().activeWorkspaceId) {
            cacheCurrentData();
          }

          // 加载新文件
          const newWorkspaces: Workspace[] = [];
          for (const filename of newFiles) {
            try {
              const rawData = await electronReadWorkspace(filename);
              const data = migrateData(rawData);
              const wsId = generateId();
              dataCache.set(wsId, data);

              const writer = new ElectronFileWriter();
              writer.setFilename(filename);
              fileWriters.set(wsId, writer);

              newWorkspaces.push({
                id: wsId,
                name: filename,
                filename,
                fileHandle: null,
                loaded: true,
              });
            } catch {
              // 读取失败，跳过
            }
          }

          if (newWorkspaces.length === 0) {
            alert("读取新工作区文件失败");
            return;
          }

          const allWorkspaces = [...get().workspaces, ...newWorkspaces];
          const targetWs = newWorkspaces[0];

          set({
            workspaces: allWorkspaces,
            activeWorkspaceId: targetWs.id,
          });
          loadWorkspaceData(targetWs.id);

          try {
            await saveLastActiveWorkspaceName(targetWs.name);
          } catch {}
        } catch (err: any) {
          alert(`打开工作区失败: ${err.message || err}`);
        }
        return;
      }

      // ===== 浏览器模式（File System Access API）=====
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
      dataCache.set(wsId, migrateData(result.data));

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

    // 打开指定文件名的工作区（从首页列表点击直接打开）
    openSpecificWorkspace: async (filename) => {
      if (!get().isElectron) return;

      // 检查是否已在工作区列表中（按 filename 匹配）
      const existing = get().workspaces.find((w) => w.filename === filename);
      if (existing) {
        // 已在列表中，直接切换
        get().switchWorkspace(existing.id);
        return;
      }

      try {
        // 缓存当前工作区
        if (get().activeWorkspaceId) {
          cacheCurrentData();
        }

        // 读取指定文件
        const rawData = await electronReadWorkspace(filename);
        const data = migrateData(rawData);
        const wsId = generateId();
        dataCache.set(wsId, data);

        const writer = new ElectronFileWriter();
        writer.setFilename(filename);
        fileWriters.set(wsId, writer);

        const newWorkspace: Workspace = {
          id: wsId,
          name: filename.replace(/\.json$/i, ""),
          filename,
          fileHandle: null,
          loaded: true,
        };

        set({
          workspaces: [...get().workspaces, newWorkspace],
          activeWorkspaceId: wsId,
          isOnboarded: true,
        });
        loadWorkspaceData(wsId);

        try {
          await saveLastActiveWorkspaceName(filename);
        } catch {}
      } catch (err: any) {
        alert(`打开工作区失败: ${err.message || err}`);
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

      // 降级模式下删除 IDB 中的数据（Electron 模式和 File System Access API 模式不删除）
      if (!state.fileSupported && !state.isElectron) {
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
            await saveLastActiveWorkspaceName(newActive.filename || newActive.name);
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
      if (!cachedData) {
        if (targetWs.filename && get().isElectron) {
          // Electron 模式：通过 IPC 读取文件
          try {
            const rawData = await electronReadWorkspace(targetWs.filename);
            cachedData = migrateData(rawData);
            dataCache.set(workspaceId, cachedData);
          } catch {
            // 读取失败，使用空数据
          }
        } else if (targetWs.fileHandle) {
          // 浏览器模式：通过 File System Access API 读取
          try {
            const rawData = await readFileContent(targetWs.fileHandle);
            cachedData = migrateData(rawData);
            dataCache.set(workspaceId, cachedData);
          } catch {
            // 读取失败，使用空数据
          }
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
        calendarSubview: "month",
        calendarDate: new Date().toISOString(),
      });

      // 保存最后活跃工作区名（用于刷新恢复）
      try {
        await saveLastActiveWorkspaceName(targetWs.filename || targetWs.name);
      } catch {
        // 忽略
      }
    },

    renameWorkspace: async (workspaceId) => {
      // ===== Electron 模式：通过 IPC 重命名文件 =====
      if (get().isElectron) {
        const state = get();
        const ws = state.workspaces.find((w) => w.id === workspaceId);
        if (!ws || !ws.filename) return;

        const input = await get().showPromptDialog({
          title: "重命名工作区",
          label: "请输入新的工作区名称（不含 .json 后缀）:",
          defaultValue: ws.name,
          placeholder: ws.name,
          confirmText: "重命名",
        });
        if (!input || !input.trim()) return;

        let newName = input.trim();
        if (!newName.endsWith(".json")) newName += ".json";

        if (newName === ws.filename) return;

        try {
          await electronRenameWorkspace(ws.filename, newName);
        } catch (err: any) {
          console.error("重命名失败:", err);
          return;
        }

        // 更新写入器的文件名
        const writer = fileWriters.get(workspaceId);
        if (writer instanceof ElectronFileWriter) {
          writer.setFilename(newName);
        }

        // 更新工作区列表
        const wasActive = state.activeWorkspaceId === workspaceId;
        const newWorkspaces = state.workspaces.map((w) =>
          w.id === workspaceId
            ? { ...w, name: newName.replace(/\.json$/i, ""), filename: newName }
            : w
        );

        set({ workspaces: newWorkspaces });

        if (wasActive) {
          try {
            await saveLastActiveWorkspaceName(newName);
          } catch {}
        }
        return;
      }

      // ===== 浏览器模式：重命名 = "另存为" 新文件 + 移除旧工作区引用 =====
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

      const newTaskId = generateId();
      const newTask: Task = {
        id: newTaskId,
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
        contact: null,
        originId: newTaskId,
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

    editTaskContact: (taskId, contact) => {
      const trimmed = contact ? contact.trim() : "";
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId
            ? { ...t, contact: trimmed || null }
            : t
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
        contact: task.contact, // 保留联系人信息
        originId: task.originId, // 继承原任务的 originId
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
        bgColor: null,
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

    setModuleBgColor: (moduleId, bgColor) => {
      set((s) => ({
        modules: s.modules.map((m) =>
          m.id === moduleId ? { ...m, bgColor } : m
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

    // ===== 日历视图操作 =====
    setCalendarSubview: (subview) => set({ calendarSubview: subview }),
    setCalendarDate: (date) => set({ calendarDate: date.toISOString() }),
    navigateCalendar: (direction) => {
      const state = get();
      const currentDate = new Date(state.calendarDate);
      const newDate = new Date(currentDate);
      
      if (state.calendarSubview === "month") {
        newDate.setMonth(currentDate.getMonth() + (direction === "next" ? 1 : -1));
      } else if (state.calendarSubview === "week") {
        newDate.setDate(currentDate.getDate() + (direction === "next" ? 7 : -7));
      } else {
        newDate.setDate(currentDate.getDate() + (direction === "next" ? 1 : -1));
      }
      
      set({ calendarDate: newDate.toISOString() });
    },
    goToToday: () => set({ calendarDate: new Date().toISOString() }),

    // ===== 数据导入导出 =====
    exportData: () => {
      const state = get();
      const data = getPersistableData(state);
      exportDataAsFile(data, getActiveWorkspaceName(state));
    },

    importData: async () => {
      const rawData = await importDataFromFile();
      if (!rawData) return;

      const data = migrateData(rawData);
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

    // ===== Git 同步操作（仅 Electron 模式）=====

    // 手动触发 Git 同步
    triggerManualSync: async () => {
      if (!get().isElectron) return;
      try {
        await triggerManualSync();
      } catch (err) {
        console.error("手动同步失败:", err);
      }
    },

    // 设置自动推送开关
    setAutoPush: async (enabled) => {
      if (!get().isElectron) return;
      try {
        await setAutoPushEnabled(enabled);
        // 立即更新本地状态
        const currentStatus = get().syncStatus;
        if (currentStatus) {
          set({
            syncStatus: { ...currentStatus, autoPushEnabled: enabled },
          });
        }
      } catch (err) {
        console.error("设置自动推送失败:", err);
      }
    },

    // 设置代码仓库路径（用户手动配置）
    setCodeRepoPath: async (repoPath, gitPath) => {
      if (!get().isElectron) return;
      try {
        await window.electronAPI?.setCodeRepoPath(repoPath, gitPath);
        // 更新 codeRepoPath 和 taskDataPath
        const newRepoPath = await window.electronAPI?.getCodeRepoPath();
        const newDataPath = await electronGetDataPath();
        set({ codeRepoPath: newRepoPath || null, taskDataPath: newDataPath });
        // 重新获取同步状态
        const status = await getSyncStatus();
        if (status) set({ syncStatus: status });
      } catch (err) {
        console.error("设置代码仓库路径失败:", err);
      }
    },

    // ===== 自定义 Prompt 对话框 =====
    promptDialog: null,

    showPromptDialog: (options) => {
      return new Promise<string | null>((resolve) => {
        set({
          promptDialog: {
            title: options.title,
            label: options.label,
            defaultValue: options.defaultValue,
            placeholder: options.placeholder,
            confirmText: options.confirmText,
            resolve,
          },
        });
      });
    },

    closePromptDialog: (value) => {
      const dialog = get().promptDialog;
      if (dialog && dialog.resolve) {
        dialog.resolve(value);
      }
      set({ promptDialog: null });
    },

    // ===== 内部方法 =====
    _triggerSave: triggerSave,
  };
});
