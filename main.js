/**
 * main.js - Electron 主进程入口
 *
 * 职责：
 * 1. 创建和管理 BrowserWindow
 * 2. 管理 taskData/ 目录（自动创建）
 * 3. 通过 IPC 处理渲染进程的文件读写请求（Node fs）
 * 4. 使用 chokidar 监听 taskData/ 目录变更
 * 5. 使用 simple-git 执行自动 Git 提交与推送（60秒防抖）
 * 6. 向渲染进程推送同步状态更新
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");
const simpleGit = require("simple-git");

// ============================================================
// 环境判断与路径定义
// ============================================================

/** 是否开发模式（未打包） */
const isDev = !app.isPackaged;

/**
 * 项目根目录：
 * - 开发模式：process.cwd()（即项目仓库根目录）
 * - 打包模式：可执行文件所在目录（用户可将 exe 放在仓库根目录下）
 */
const projectRoot = isDev ? process.cwd() : path.dirname(process.execPath);

/** taskData 目录路径（所有工作区 JSON 文件的存储位置） */
const taskDataDir = path.join(projectRoot, "taskData");

// ============================================================
// 全局状态
// ============================================================

/** Git 同步状态 */
const syncState = {
  state: "idle", // idle | pending | syncing | success | error
  lastSyncTime: null, // 上次成功同步的时间戳
  message: null, // 状态描述信息
  gitAvailable: false, // Git 仓库是否可用
  autoPushEnabled: true, // 自动推送是否开启
};

/** simple-git 实例 */
let git = null;
/** Git 仓库根目录（可能不同于 projectRoot，向上查找） */
let gitRepoRoot = null;

/** chokidar 文件监听器 */
let watcher = null;

/** 防抖计时器（60秒） */
let debounceTimer = null;
const DEBOUNCE_MS = 60000;

/** 主窗口引用 */
let mainWindow = null;

// ============================================================
// taskData 目录管理
// ============================================================

/** 确保 taskData/ 目录存在，不存在则自动创建 */
function ensureTaskDataDir() {
  if (!fs.existsSync(taskDataDir)) {
    fs.mkdirSync(taskDataDir, { recursive: true });
    console.log("[TaskFlow] 已创建 taskData 目录:", taskDataDir);
  }
}

// ============================================================
// Git 仓库检测与初始化
// ============================================================

/**
 * 向上查找 Git 仓库根目录（最多 10 层）
 * 检测到 .git 目录则初始化 simple-git 实例
 */
async function initGit() {
  try {
    let currentDir = projectRoot;
    let found = false;

    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(path.join(currentDir, ".git"))) {
        found = true;
        break;
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }

    if (!found) {
      console.log("[TaskFlow] 未检测到 Git 仓库，自动推送不可用");
      syncState.gitAvailable = false;
      syncState.message = "未检测到 Git 仓库，自动推送不可用";
      return;
    }

    gitRepoRoot = currentDir;
    git = simpleGit({ baseDir: gitRepoRoot });

    // 验证是否为有效的 Git 仓库
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      syncState.gitAvailable = false;
      syncState.message = "当前目录不是有效的 Git 仓库";
      return;
    }

    // 检查远程仓库配置
    const remotes = await git.getRemotes(true);
    if (remotes.length === 0) {
      syncState.gitAvailable = true;
      syncState.message = "Git 仓库可用，但未配置远程仓库";
      console.log("[TaskFlow] Git 仓库可用，但未配置远程仓库");
    } else {
      syncState.gitAvailable = true;
      syncState.message = null;
      console.log("[TaskFlow] Git 仓库已就绪:", gitRepoRoot);
    }
  } catch (err) {
    console.error("[TaskFlow] Git 初始化失败:", err.message);
    syncState.gitAvailable = false;
    syncState.message = `Git 初始化失败: ${err.message}`;
  }
}

// ============================================================
// Git 同步操作（add → commit → push）
// ============================================================

/**
 * 执行完整的 Git 同步流程：
 * 1. 获取当前分支名
 * 2. 尝试 git pull --rebase（减少冲突）
 * 3. git add taskData/*.json（仅暂存任务数据文件）
 * 4. 检查是否有变更，无变更则跳过
 * 5. git commit（带时间戳）
 * 6. git push origin <分支>
 */
async function performGitSync() {
  if (!syncState.gitAvailable || !git) {
    sendSyncStatus();
    return;
  }

  if (!syncState.autoPushEnabled) {
    syncState.state = "idle";
    syncState.message = "自动推送已关闭";
    sendSyncStatus();
    return;
  }

  syncState.state = "syncing";
  syncState.message = "正在同步...";
  sendSyncStatus();

  try {
    // 获取当前分支名
    const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
    const branchName = branch.trim();

    // 尝试 pull --rebase 以减少冲突
    try {
      await git.pull("origin", branchName, ["--rebase"]);
    } catch (pullErr) {
      // pull 失败可能是没有远程分支或网络问题，不影响后续操作
      console.log("[TaskFlow] pull --rebase 跳过:", pullErr.message);
    }

    // git add taskData/*.json（仅暂存任务数据文件，不影响其他文件）
    // 使用正斜杠确保 git glob 匹配正确（Windows 下 path.join 会用反斜杠）
    const taskDataRelative = path.relative(gitRepoRoot, taskDataDir).replace(/\\/g, "/");
    await git.add(`${taskDataRelative}/*.json`);

    // 检查是否有暂存的变更
    const status = await git.status();
    const hasChanges = status.staged.length > 0;

    if (!hasChanges) {
      syncState.state = "success";
      syncState.lastSyncTime = Date.now();
      syncState.message = "没有需要提交的变更";
      sendSyncStatus();
      return;
    }

    // git commit（提交信息包含时间戳）
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    await git.commit(`\u{1F4CB} 自动同步任务数据 (${timestamp})`);

    // git push
    try {
      await git.push("origin", branchName);
      syncState.state = "success";
      syncState.lastSyncTime = Date.now();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      syncState.message = `\u2705 已同步于 ${timeStr}`;
      console.log("[TaskFlow] Git 同步成功");
    } catch (pushErr) {
      // 推送失败（网络/权限等），不影响本地操作
      syncState.state = "error";
      syncState.lastSyncTime = Date.now();
      syncState.message = `推送失败: ${pushErr.message}`;
      console.error("[TaskFlow] Git 推送失败:", pushErr.message);
    }
  } catch (err) {
    // 可能是 rebase 冲突或其他 Git 错误
    syncState.state = "error";
    syncState.lastSyncTime = Date.now();
    syncState.message = `同步失败: ${err.message}（请手动处理冲突）`;
    console.error("[TaskFlow] Git 同步失败:", err.message);
  }

  sendSyncStatus();
}

/**
 * 防抖同步：文件变更后重置 60 秒计时器
 * 60 秒内无新变更则执行 Git 同步
 */
function debouncedSync() {
  if (debounceTimer) clearTimeout(debounceTimer);

  // 标记为待同步状态
  syncState.state = "pending";
  syncState.message = "文件已变更，等待同步（60秒倒计时）...";
  sendSyncStatus();

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    performGitSync();
  }, DEBOUNCE_MS);
}

// ============================================================
// 文件监听（chokidar）
// ============================================================

/** 启动 chokidar 监听 taskData/ 目录下的 JSON 文件变更 */
function startFileWatcher() {
  watcher = chokidar.watch(path.join(taskDataDir, "*.json"), {
    persistent: true,
    ignoreInitial: true, // 忽略初始扫描事件
    awaitWriteFinish: {
      // 等待文件写入完成（避免写入过程中触发事件）
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  watcher.on("change", (filePath) => {
    console.log("[TaskFlow] 文件变更:", path.basename(filePath));
    debouncedSync();
  });

  watcher.on("add", (filePath) => {
    console.log("[TaskFlow] 文件新增:", path.basename(filePath));
    debouncedSync();
  });

  console.log("[TaskFlow] 文件监听已启动:", taskDataDir);
}

// ============================================================
// IPC 通信（主进程 ↔ 渲染进程）
// ============================================================

/** 向渲染进程发送当前同步状态 */
function sendSyncStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("sync:statusUpdate", { ...syncState });
  }
}

/** 注册所有 IPC 处理器 */
function setupIPC() {
  // ---- 文件操作 ----

  // 列出 taskData/ 目录下所有 .json 文件
  ipcMain.handle("task:listWorkspaces", async () => {
    try {
      const files = fs
        .readdirSync(taskDataDir)
        .filter((f) => f.endsWith(".json"))
        .sort();
      return files;
    } catch (err) {
      console.error("[TaskFlow] 列出工作区失败:", err.message);
      return [];
    }
  });

  // 读取指定工作区文件内容
  ipcMain.handle("task:readWorkspace", async (event, filename) => {
    try {
      const filePath = path.join(taskDataDir, filename);
      const content = fs.readFileSync(filePath, "utf-8");
      if (!content.trim()) {
        return { tasks: [], modules: [], moveRecords: [] };
      }
      return JSON.parse(content);
    } catch (err) {
      console.error("[TaskFlow] 读取工作区失败:", err.message);
      return { tasks: [], modules: [], moveRecords: [] };
    }
  });

  // 写入工作区文件（覆盖写入）
  ipcMain.handle("task:writeWorkspace", async (event, filename, data) => {
    try {
      const filePath = path.join(taskDataDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("[TaskFlow] 写入工作区失败:", err.message);
      throw err;
    }
  });

  // 创建新的工作区文件
  ipcMain.handle("task:createWorkspace", async (event, filename) => {
    // 确保 .json 后缀
    if (!filename.endsWith(".json")) {
      filename += ".json";
    }
    const filePath = path.join(taskDataDir, filename);
    if (fs.existsSync(filePath)) {
      throw new Error("文件已存在");
    }
    const emptyData = { tasks: [], modules: [], moveRecords: [] };
    fs.writeFileSync(filePath, JSON.stringify(emptyData, null, 2), "utf-8");
    console.log("[TaskFlow] 创建工作区:", filename);
    return filename;
  });

  // 删除工作区文件
  ipcMain.handle("task:deleteWorkspace", async (event, filename) => {
    try {
      const filePath = path.join(taskDataDir, filename);
      fs.unlinkSync(filePath);
      console.log("[TaskFlow] 删除工作区:", filename);
    } catch (err) {
      console.error("[TaskFlow] 删除工作区失败:", err.message);
      throw err;
    }
  });

  // 重命名工作区文件
  ipcMain.handle("task:renameWorkspace", async (event, oldName, newName) => {
    if (!newName.endsWith(".json")) {
      newName += ".json";
    }
    const oldPath = path.join(taskDataDir, oldName);
    const newPath = path.join(taskDataDir, newName);
    if (fs.existsSync(newPath)) {
      throw new Error("目标文件名已存在");
    }
    fs.renameSync(oldPath, newPath);
    console.log("[TaskFlow] 重命名工作区:", oldName, "->", newName);
    return newName;
  });

  // 检查文件是否存在
  ipcMain.handle("task:workspaceExists", async (event, filename) => {
    try {
      const filePath = path.join(taskDataDir, filename);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  });

  // ---- 同步状态与控制 ----

  // 获取当前同步状态
  ipcMain.handle("sync:getStatus", async () => {
    return { ...syncState };
  });

  // 手动触发同步（立即执行，取消防抖计时器）
  ipcMain.handle("sync:manualSync", async () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    await performGitSync();
  });

  // 设置自动推送开关
  ipcMain.handle("sync:setAutoPush", async (event, enabled) => {
    syncState.autoPushEnabled = enabled;
    if (!enabled && debounceTimer) {
      // 关闭自动推送时取消防抖计时器
      clearTimeout(debounceTimer);
      debounceTimer = null;
      syncState.state = "idle";
      syncState.message = "自动推送已关闭";
    } else if (enabled) {
      syncState.message = "自动推送已开启";
    }
    sendSyncStatus();
  });

  // 获取 Git 是否可用
  ipcMain.handle("sync:getGitAvailable", async () => {
    return syncState.gitAvailable;
  });
}

// ============================================================
// 窗口创建
// ============================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, // 启用上下文隔离（安全要求）
      nodeIntegration: false, // 禁用 Node 集成（安全要求）
      sandbox: false, // 允许 preload 脚本使用 Node API
    },
    title: "TaskFlow - 任务管理",
  });

  if (isDev) {
    // 开发模式：加载 Next.js 开发服务器
    mainWindow.loadURL("http://localhost:3000");
    // 自动打开 DevTools
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式：加载静态导出文件
    mainWindow.loadFile(path.join(__dirname, "out", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ============================================================
// 应用生命周期
// ============================================================

app.whenReady().then(async () => {
  // 1. 确保 taskData/ 目录存在
  ensureTaskDataDir();

  // 2. 初始化 Git（检测仓库、创建 simple-git 实例）
  await initGit();

  // 3. 注册 IPC 处理器
  setupIPC();

  // 4. 启动文件监听（chokidar）
  startFileWatcher();

  // 5. 创建主窗口
  createWindow();

  // 6. 延迟发送初始同步状态（等待渲染进程就绪）
  setTimeout(() => sendSyncStatus(), 1500);
});

// 所有窗口关闭时退出应用
app.on("window-all-closed", () => {
  if (watcher) {
    watcher.close();
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  app.quit();
});

// 应用退出前执行最后一次同步
app.on("before-quit", async (event) => {
  if (debounceTimer) {
    // 有待同步的变更，执行最后一次同步
    event.preventDefault();
    clearTimeout(debounceTimer);
    debounceTimer = null;
    await performGitSync();
    app.quit();
  }
});
