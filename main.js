/**
 * main.js - Electron 主进程入口
 *
 * 职责：
 * 1. 创建和管理 BrowserWindow
 * 2. 管理代码仓库路径配置（codeRepoPath）
 * 3. taskData 目录位于 codeRepoPath/taskData，通过 IPC 读写工作区文件
 * 4. 使用 chokidar 监听 taskData/ 目录变更
 * 5. 使用 simple-git 执行自动 Git 提交与推送（60秒防抖，git add -A 推送所有改动）
 * 6. 向渲染进程推送同步状态更新
 */

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const chokidar = require("chokidar");
const simpleGit = require("simple-git");

// ============================================================
// 环境判断与路径定义
// ============================================================

/** 是否开发模式（未打包） */
const isDev = !app.isPackaged;

/**
 * 安装目录（exe 所在目录）：
 * - 开发模式：process.cwd()
 * - 打包模式：exe 文件所在目录
 * 用于存放应用配置文件 .taskflow-config.json
 */
const installDir = isDev ? process.cwd() : path.dirname(process.execPath);

/** 应用配置文件路径（存储 codeRepoPath 和 gitPath） */
const configFilePath = path.join(installDir, ".taskflow-config.json");

/**
 * 代码仓库目录（用户配置，不同电脑不同）：
 * - taskData 目录 = codeRepoPath/taskData
 * - Git 仓库根目录 = codeRepoPath
 * 未配置时降级到 installDir
 */
let codeRepoPath = null;

/** taskData 目录路径（工作区 JSON 文件存储位置） */
let taskDataDir = path.join(installDir, "taskData");

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
/** git 可执行文件路径（检测到的或用户配置的） */
let gitExecutable = null;

/** chokidar 文件监听器 */
let watcher = null;

/** 防抖计时器（60秒） */
let debounceTimer = null;
const DEBOUNCE_MS = 60000;

/** 主窗口引用 */
let mainWindow = null;

// ============================================================
// 配置文件管理
// ============================================================

/**
 * 加载应用配置
 * @returns {{ codeRepoPath: string|null, gitPath: string|null }}
 */
function loadConfig() {
  try {
    if (fs.existsSync(configFilePath)) {
      const content = fs.readFileSync(configFilePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("[TaskFlow] 加载配置失败:", err.message);
  }
  return { codeRepoPath: null, gitPath: null };
}

/**
 * 保存应用配置
 * @param {{ codeRepoPath: string|null, gitPath: string|null }} config
 */
function saveConfig(config) {
  try {
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), "utf-8");
    console.log("[TaskFlow] 配置已保存:", configFilePath);
  } catch (err) {
    console.error("[TaskFlow] 保存配置失败:", err.message);
  }
}

// ============================================================
// 代码仓库路径管理
// ============================================================

/**
 * 应用代码仓库路径配置
 * 更新 codeRepoPath、taskDataDir，确保目录存在
 * @param {string|null} repoPath - 代码仓库根目录路径
 */
function applyCodeRepoPath(repoPath) {
  codeRepoPath = repoPath || null;

  if (codeRepoPath) {
    taskDataDir = path.join(codeRepoPath, "taskData");
    console.log("[TaskFlow] 代码仓库目录:", codeRepoPath);
    console.log("[TaskFlow] taskData 目录:", taskDataDir);
  } else {
    taskDataDir = path.join(installDir, "taskData");
    console.log("[TaskFlow] 未配置代码仓库路径，降级 taskData 目录:", taskDataDir);
  }

  // 确保 taskData 目录存在
  ensureTaskDataDir();
}

/** 确保 taskData/ 目录存在，不存在则自动创建 */
function ensureTaskDataDir() {
  if (!fs.existsSync(taskDataDir)) {
    fs.mkdirSync(taskDataDir, { recursive: true });
    console.log("[TaskFlow] 已创建 taskData 目录:", taskDataDir);
  }
}

// ============================================================
// Git 可执行文件检测
// ============================================================

/**
 * 检测 git 命令是否可用
 * @param {string|null} customPath - 用户自定义的 git 可执行文件路径
 * @returns {string|null} git 可执行文件路径，不可用则返回 null
 */
function detectGitExecutable(customPath) {
  // 1. 如果用户指定了路径，优先使用
  if (customPath) {
    try {
      execFileSync(customPath, ["--version"], { stdio: "pipe", timeout: 5000 });
      console.log("[TaskFlow] Git 可执行文件（用户配置）:", customPath);
      return customPath;
    } catch {
      console.log("[TaskFlow] 用户配置的 git 路径无效:", customPath);
    }
  }

  // 2. 尝试系统 PATH 中的 git
  try {
    const output = execFileSync("git", ["--version"], {
      stdio: "pipe",
      timeout: 5000,
      shell: true,
    }).toString();
    if (output.includes("git version")) {
      console.log("[TaskFlow] Git 可执行文件（系统 PATH）: git");
      return "git";
    }
  } catch {
    console.log("[TaskFlow] 系统 PATH 中未找到 git 命令");
  }

  // 3. Windows 常见安装路径
  if (process.platform === "win32") {
    const commonPaths = [
      "C:\\Program Files\\Git\\cmd\\git.exe",
      "C:\\Program Files\\Git\\bin\\git.exe",
      "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
      "C:\\Program Files (x86)\\Git\\bin\\git.exe",
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "cmd", "git.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "bin", "git.exe"),
    ];
    for (const p of commonPaths) {
      if (p && fs.existsSync(p)) {
        try {
          execFileSync(p, ["--version"], { stdio: "pipe", timeout: 5000 });
          console.log("[TaskFlow] Git 可执行文件（常见路径）:", p);
          return p;
        } catch {
          // 继续尝试下一个
        }
      }
    }
  }

  return null;
}

/**
 * 初始化 Git 仓库检测
 *
 * 流程：
 * 1. 检查 codeRepoPath 是否已配置
 * 2. 检测 git 命令是否可用
 * 3. 创建 simple-git 实例并验证
 */
async function initGit() {
  // 1. 检查 codeRepoPath 是否已配置
  if (!codeRepoPath) {
    syncState.gitAvailable = false;
    syncState.message = "未配置代码仓库路径，请在设置中指定";
    return;
  }

  // 检查目录是否有 .git
  if (!fs.existsSync(path.join(codeRepoPath, ".git"))) {
    syncState.gitAvailable = false;
    syncState.message = `目录 ${codeRepoPath} 不是 Git 仓库`;
    console.log("[TaskFlow] 目录不是 Git 仓库:", codeRepoPath);
    return;
  }

  // 2. 检测 git 命令
  const config = loadConfig();
  gitExecutable = detectGitExecutable(config.gitPath);
  if (!gitExecutable) {
    console.error("[TaskFlow] 未找到 git 可执行文件，自动推送不可用");
    syncState.gitAvailable = false;
    syncState.message = "未找到 git 命令，请在设置中指定 git.exe 路径或安装 Git";
    return;
  }

  // 3. 创建 simple-git 实例
  try {
    const gitOptions = { baseDir: codeRepoPath };
    if (gitExecutable && gitExecutable !== "git") {
      gitOptions.binary = gitExecutable;
    }
    git = simpleGit(gitOptions);

    // 验证是否为有效的 Git 仓库
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      syncState.gitAvailable = false;
      syncState.message = `${codeRepoPath} 不是有效的 Git 仓库`;
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
      console.log("[TaskFlow] Git 仓库已就绪:", codeRepoPath);
    }
  } catch (err) {
    console.error("[TaskFlow] Git 初始化失败:", err.message);
    syncState.gitAvailable = false;
    syncState.message = `Git 初始化失败: ${err.message}`;
  }
}

// ============================================================
// Git 同步操作（add -A → commit → push）
// ============================================================

/**
 * 执行完整的 Git 同步流程：
 * 1. 获取当前分支名
 * 2. 尝试 git pull --rebase（减少冲突）
 * 3. git add -A（暂存所有改动：代码 + 工作区文件）
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

    // git add -A（暂存所有改动：代码文件 + 工作区数据文件）
    await git.add("-A");

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
    await git.commit(`\u{1F4CB} 自动同步 (${timestamp})`);

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

/**
 * 启动（或重启）chokidar 监听 taskData/ 目录下的 JSON 文件变更
 * 配置 codeRepoPath 后 taskDataDir 变化，需要重启监听器
 */
function startFileWatcher() {
  // 如果已有监听器，先关闭
  if (watcher) {
    watcher.close();
    watcher = null;
  }

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
      console.log("[TaskFlow] listWorkspaces - 目录:", taskDataDir, "文件:", files);
      return files;
    } catch (err) {
      console.error("[TaskFlow] 列出工作区失败:", err.message, "目录:", taskDataDir);
      return [];
    }
  });

  // 获取 taskData 目录的绝对路径（供渲染进程显示）
  ipcMain.handle("task:getDataPath", async () => {
    return taskDataDir;
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

  // ---- 代码仓库路径配置 ----

  // 设置代码仓库路径（用户手动配置）
  // 会更新 taskDataDir、重启文件监听、重新初始化 Git
  ipcMain.handle("sync:setCodeRepoPath", async (event, repoPath, gitPath) => {
    try {
      // 保存配置
      const config = loadConfig();
      config.codeRepoPath = repoPath || null;
      config.gitPath = gitPath || null;
      saveConfig(config);

      // 应用新的代码仓库路径
      applyCodeRepoPath(repoPath || null);

      // 重启文件监听（taskDataDir 可能已变化）
      startFileWatcher();

      // 重新初始化 Git
      await initGit();
      sendSyncStatus();
      return { success: syncState.gitAvailable, message: syncState.message };
    } catch (err) {
      console.error("[TaskFlow] 设置代码仓库路径失败:", err.message);
      return { success: false, message: err.message };
    }
  });

  // 获取代码仓库路径配置
  ipcMain.handle("sync:getCodeRepoPath", async () => {
    const config = loadConfig();
    return config.codeRepoPath;
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

  // 获取 Git 诊断信息（供前端显示和排查）
  ipcMain.handle("sync:getGitInfo", async () => {
    return {
      gitAvailable: syncState.gitAvailable,
      message: syncState.message,
      installDir: installDir,
      codeRepoPath: codeRepoPath,
      taskDataDir: taskDataDir,
      gitExecutable: gitExecutable,
      configPath: configFilePath,
    };
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
  console.log("[TaskFlow] ========================");
  console.log("[TaskFlow] 运行模式:", isDev ? "开发模式" : "打包模式");
  console.log("[TaskFlow] 安装目录:", installDir);

  // 1. 加载配置，应用代码仓库路径
  const config = loadConfig();
  applyCodeRepoPath(config.codeRepoPath);

  console.log("[TaskFlow] 代码仓库目录:", codeRepoPath || "未配置");
  console.log("[TaskFlow] taskData 目录:", taskDataDir);
  console.log("[TaskFlow] ========================");

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
