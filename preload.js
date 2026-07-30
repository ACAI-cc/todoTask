/**
 * preload.js - Electron 预加载脚本
 *
 * 在 contextIsolation: true 的安全模式下，通过 contextBridge
 * 向渲染进程暴露受控的 API 接口，避免直接暴露 ipcRenderer 或 Node API。
 *
 * 渲染进程通过 window.electronAPI 访问这些方法。
 */

const { contextBridge, ipcRenderer } = require("electron");

// 使用 contextBridge 暴露安全 API（而非直接暴露 ipcRenderer）
contextBridge.exposeInMainWorld("electronAPI", {
  // ============================================================
  // 文件操作（读写 taskData/ 目录下的 JSON 文件）
  // ============================================================

  /** 列出 taskData/ 目录下所有 .json 文件名 */
  listWorkspaces: () => ipcRenderer.invoke("task:listWorkspaces"),

  /** 获取 taskData 目录的绝对路径 */
  getDataPath: () => ipcRenderer.invoke("task:getDataPath"),

  /** 读取指定工作区文件的 JSON 内容 */
  readWorkspace: (filename) =>
    ipcRenderer.invoke("task:readWorkspace", filename),

  /** 写入工作区文件（覆盖写入） */
  writeWorkspace: (filename, data) =>
    ipcRenderer.invoke("task:writeWorkspace", filename, data),

  /** 创建新的工作区文件 */
  createWorkspace: (filename) =>
    ipcRenderer.invoke("task:createWorkspace", filename),

  /** 删除工作区文件 */
  deleteWorkspace: (filename) =>
    ipcRenderer.invoke("task:deleteWorkspace", filename),

  /** 重命名工作区文件，返回新文件名 */
  renameWorkspace: (oldName, newName) =>
    ipcRenderer.invoke("task:renameWorkspace", oldName, newName),

  /** 检查工作区文件是否存在 */
  workspaceExists: (filename) =>
    ipcRenderer.invoke("task:workspaceExists", filename),

  // ============================================================
  // Git 同步状态与控制
  // ============================================================

  /** 获取当前同步状态 */
  getSyncStatus: () => ipcRenderer.invoke("sync:getStatus"),

  /** 手动触发立即同步 */
  manualSync: () => ipcRenderer.invoke("sync:manualSync"),

  /** 设置自动推送开关 */
  setAutoPush: (enabled) => ipcRenderer.invoke("sync:setAutoPush", enabled),

  /** 获取 Git 是否可用 */
  getGitAvailable: () => ipcRenderer.invoke("sync:getGitAvailable"),

  /** 设置代码仓库路径和 git 可执行文件路径 */
  setCodeRepoPath: (repoPath, gitPath) =>
    ipcRenderer.invoke("sync:setCodeRepoPath", repoPath, gitPath),

  /** 获取已配置的代码仓库路径 */
  getCodeRepoPath: () => ipcRenderer.invoke("sync:getCodeRepoPath"),

  /** 获取 Git 诊断信息（路径、可执行文件等） */
  getGitInfo: () => ipcRenderer.invoke("sync:getGitInfo"),

  /** 打开文件夹选择对话框，返回选中的文件夹路径 */
  selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),

  /** 从指定目录向上查找 Git 仓库根目录 */
  autoDetectGitRepo: (startDir) =>
    ipcRenderer.invoke("sync:autoDetectGitRepo", startDir),

  /** 打开文件夹选择对话框并自动设置代码仓库路径
   *  allowNoGit: 为 true 时，未找到 Git 仓库仍将 codeRepoPath 设为用户选择的目录 */
  selectAndSetRepoPath: (allowNoGit) =>
    ipcRenderer.invoke("sync:selectAndSetRepoPath", allowNoGit),

  // ============================================================
  // 事件监听（主进程 → 渲染进程推送）
  // ============================================================

  /**
   * 监听同步状态更新事件
   * @param {function} callback - 回调函数，接收 SyncStatus 对象
   * @returns {function} 取消监听函数
   */
  onSyncStatusUpdate: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("sync:statusUpdate", handler);
    // 返回取消监听函数，供组件卸载时调用
    return () => {
      ipcRenderer.removeListener("sync:statusUpdate", handler);
    };
  },
});
