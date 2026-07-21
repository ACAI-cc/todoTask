# TaskFlow — 个人任务管理应用

一个模块化、轻量、可追溯的任务管理 Web 应用，采用四象限优先级管理与多工作区隔离设计。界面干净简洁，类似 Notion 风格，仅适配桌面端浏览器。

---

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js (App Router) | 14.2.5 | React 全栈框架 |
| React | 18.3.1 | UI 库 |
| TypeScript | 5.5.3 | 类型安全 |
| Tailwind CSS | 3.4.6 | 原子化样式 |
| Zustand | 4.5.4 | 轻量状态管理 |
| dnd-kit | 6.1.0 | 拖拽交互 |
| File System Access API | — | 本地文件持久化 |

---

## 核心功能

### 1. 工作区系统

- **一个 JSON 文件 = 一个工作区**，工作区之间数据完全隔离
- 左上角工作区切换器，显示所有已打开的工作区
- 支持**新建 / 打开 / 关闭 / 重命名**工作区
- 刷新页面自动恢复上次使用的工作区（通过 IndexedDB 持久化文件句柄）
- 降级模式下工作区数据直接存储在 IndexedDB，刷新不丢失

### 2. 模块系统

- 预置三个模块：**还没开始的任务** / **暂时搁置的任务** / **未整理的需求**
- 模块可配置：新增、删除（预设模块不可删）、重命名、调整顺序、显示/隐藏
- 默认主视图左右并排展示两栏，可扩展为多栏

### 3. 任务操作

- 模块顶部输入框，Enter 直接创建任务
- 悬停显示删除按钮（×），删除后 3 秒内可撤销
- 勾选框切换完成/未完成状态
- 点击任务文字原地编辑（回车或失焦保存）
- 右键菜单：移动到其他模块、设置优先级标签

### 4. 拖拽与来源追溯

- 跨模块拖拽任务卡片（dnd-kit 实现）
- 拖拽后**原模块任务标记为已完成**，显示「5 分钟前已移至「目标模块」」并提供撤销按钮
- 目标模块中的任务副本显示来源标签（如 `← 还没开始的任务`），不可编辑
- 链式移动：A→B→C，每个模块保留各自的移动记录
- 撤销移动：恢复原模块任务为未完成，删除目标模块中的副本

### 5. 四象限优先级标签

| 象限 | 颜色 | 说明 |
|------|------|------|
| 重要且紧急 | 红色 | 最高优先级 |
| 重要不紧急 | 橙色 | 规划推进 |
| 不重要但紧急 | 蓝色 | 快速处理 |
| 不重要不紧急 | 灰色 | 低优先级 |

- 悬停任务卡片显示象限选择器，或右键菜单标记
- 任务卡片左侧显示对应颜色圆点
- 一个任务只能有一个象限标签，可取消

### 6. 四象限视图

- 顶部 Tab 切换：**模块视图** | **优先级四象限**
- 2×2 矩阵布局，坐标轴清晰显示紧急程度与重要程度
- 可在象限间拖拽任务，标签自动更新并生成变更记录
- 无标签任务不显示在四象限视图中

### 7. 排序规则

- **未完成组**（上方）：按创建时间倒序
- **已完成组**（下方）：按完成时间倒序
- 中间有分隔线，移动/编辑操作不改变排序

### 8. 全局功能

- **搜索**：按标题模糊搜索，支持筛选模块、完成状态、优先级
- **快捷键**：

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + N` | 聚焦当前活跃模块输入框 |
| `Ctrl + 1` | 设置选中任务为「重要且紧急」 |
| `Ctrl + 2` | 设置选中任务为「重要不紧急」 |
| `Ctrl + 3` | 设置选中任务为「不重要但紧急」 |
| `Ctrl + 4` | 设置选中任务为「不重要不紧急」 |

- **设置面板**：管理模块显示/隐藏/排序/重命名/增删、工作区管理、数据导入导出

---

## 数据持久化

采用 **File System Access API** 实现本地 JSON 文件存储（非 localStorage）：

```
用户操作 → Zustand 状态变更 → 防抖 500ms → 写入文件句柄 (createWritable)
```

- **初始化**：首次加载引导用户新建或打开 `.json` 数据文件
- **自动保存**：所有状态变更触发防抖写入
- **句柄持久化**：文件句柄通过 IndexedDB 持久化，刷新后自动恢复
- **权限恢复**：刷新后若权限为 `prompt`，显示「恢复工作区」按钮，用户点击授权
- **降级处理**：不支持 FSA API 的浏览器降级为 IndexedDB 存储，并显示警告

---

## 项目结构

```
todo/
├── app/
│   ├── layout.tsx              # 根布局
│   ├── page.tsx                # 主页面（快捷键监听、视图路由）
│   └── globals.css             # 全局样式
├── components/
│   ├── Header.tsx              # 顶部栏（工作区切换 / 视图 Tab / 搜索 / 设置）
│   ├── OnboardingScreen.tsx    # 工作区初始化引导
│   ├── UnsupportedWarning.tsx  # 浏览器不支持警告
│   ├── ModuleView.tsx          # 模块视图（含拖拽上下文）
│   ├── ModuleColumn.tsx        # 单个模块列
│   ├── TaskCard.tsx            # 任务卡片（拖拽 / 编辑 / 删除 / 优先级 / 移动信息）
│   ├── TaskCardPreview.tsx     # 拖拽预览组件
│   ├── TaskInput.tsx           # 任务创建输入框
│   ├── MoveRecordItem.tsx      # 移动/标签变更记录条目
│   ├── QuadrantView.tsx        # 四象限视图（含坐标轴）
│   ├── QuadrantCell.tsx        # 单个象限单元格
│   ├── PrioritySelector.tsx    # 优先级选择下拉
│   ├── SettingsPanel.tsx       # 设置面板（模块管理 / 工作区管理 / 导入导出）
│   ├── SearchOverlay.tsx       # 全局搜索浮层
│   ├── ContextMenu.tsx         # 右键菜单
│   └── DeleteToastContainer.tsx # 删除撤销提示（3 秒倒计时）
├── store/
│   └── useTaskStore.ts         # Zustand 全局状态（工作区隔离 + 任务操作）
├── lib/
│   ├── fileStorage.ts          # File System Access API + IndexedDB 持久化
│   ├── constants.ts            # 四象限配置 / 预设模块 / IDB 常量
│   └── utils.ts                # ID 生成 / 排序 / 相对时间等工具
├── types/
│   ├── index.ts                # 全部 TypeScript 类型定义
│   └── file-system-access.d.ts # FSA API 类型补充声明
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
└── .gitignore
```

---

## 快速开始

### 环境要求

- **Node.js** 18.17+（推荐 20.x LTS）
- **npm** 9+（随 Node 安装）
- **浏览器**：Chrome 或 Edge（需支持 File System Access API）

### 安装与运行

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 浏览器访问
# 打开 http://localhost:3000
```

### 生产构建

```bash
npm run build    # 构建
npm run start    # 启动生产服务器
```

### 其他命令

```bash
npm run lint     # 代码检查
npx tsc --noEmit # 类型检查（不输出文件）
```

---

## 使用指南

### 首次使用

1. 打开应用后，页面显示引导界面
2. 点击「新建工作区」，在系统对话框中选择保存位置并命名 `.json` 文件
3. 文件创建后自动进入主界面，包含三个预设模块

### 日常工作流

1. **收集任务**：在模块顶部输入框输入标题，按 Enter 创建
2. **分类整理**：拖拽任务到不同模块，或右键「移动到…」
3. **标记优先级**：悬停任务卡片选择四象限标签，或用 `Ctrl + 1~4`
4. **查看全局**：切换到「优先级四象限」视图，按重要性/紧急性纵览
5. **完成归档**：勾选完成的任务自动归入下方已完成区
6. **搜索回顾**：顶部搜索框按标题/模块/状态/优先级筛选

### 多工作区管理

- 顶部左侧 `[📂 文件名 ▾]` 切换工作区
- 下拉菜单中可新建、打开、关闭工作区
- 设置面板中可管理工作区（打开/关闭/重命名）
- 每个工作区数据独立，切换即切换全部内容

### 数据备份

- 设置面板中支持**导出数据**（下载 `.json` 文件）和**导入数据**（上传 `.json` 文件）
- 每个工作区的数据实时写入对应文件，文件即为天然备份

---

## 浏览器兼容性

| 浏览器 | 支持情况 | 说明 |
|--------|----------|------|
| Chrome 86+ | ✅ 完整支持 | 推荐使用 |
| Edge 86+ | ✅ 完整支持 | 推荐使用 |
| Opera 72+ | ✅ 完整支持 | 基于 Chromium |
| Firefox | ⚠️ 降级模式 | 不支持 FSA API，使用 IndexedDB 存储 |
| Safari | ⚠️ 降级模式 | 不支持 FSA API，使用 IndexedDB 存储 |

> 降级模式下数据存储在 IndexedDB 中，工作区功能同样可用，但无法直接读写本地文件。顶部会显示警告提示。

---

## 数据文件格式

每个工作区的 `.json` 文件结构如下：

```json
{
  "tasks": [
    {
      "id": "abc123",
      "title": "完成需求文档",
      "moduleId": "not-started",
      "completed": false,
      "createdAt": 1721536000000,
      "completedAt": null,
      "quadrant": "important_urgent",
      "sourceModuleId": null,
      "movedToModuleId": null,
      "movedToTaskId": null,
      "movedAt": null
    }
  ],
  "modules": [
    {
      "id": "not-started",
      "name": "还没开始的任务",
      "order": 0,
      "visible": true,
      "isPreset": true
    }
  ],
  "moveRecords": [
    {
      "id": "rec456",
      "taskId": "abc123",
      "taskTitle": "完成需求文档",
      "fromModuleId": "not-started",
      "toModuleId": "paused",
      "timestamp": 1721536000000,
      "type": "quadrant_change",
      "fromQuadrant": "important_urgent",
      "toQuadrant": "important_not_urgent"
    }
  ]
}
```

---

## 许可证

MIT License
