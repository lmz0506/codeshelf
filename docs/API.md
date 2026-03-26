# CodeShelf API 文档

## 前端 API

### 数据库服务 (src/services/db/index.ts)

#### getProjects()
获取所有项目列表

```typescript
async function getProjects(): Promise<Project[]>
```

**返回值**: 项目数组

**示例**:
```typescript
const projects = await getProjects();
```

---

#### addProject(input)
添加新项目

```typescript
async function addProject(input: CreateProjectInput): Promise<Project>
```

**参数**:
- `input.name` - 项目名称
- `input.path` - 项目路径
- `input.tags` - 标签数组（可选）

**返回值**: 创建的项目对象

**示例**:
```typescript
const project = await addProject({
  name: "my-project",
  path: "/path/to/project",
  tags: ["react", "typescript"]
});
```

---

#### updateProject(id, updates)
更新项目信息

```typescript
async function updateProject(id: string, updates: Partial<Project>): Promise<Project>
```

**参数**:
- `id` - 项目 ID
- `updates` - 要更新的字段

**返回值**: 更新后的项目对象

**示例**:
```typescript
const updated = await updateProject("project-id", {
  name: "new-name",
  tags: ["vue", "typescript"]
});
```

---

#### removeProject(id)
删除项目

```typescript
async function removeProject(id: string): Promise<void>
```

**参数**:
- `id` - 项目 ID

**示例**:
```typescript
await removeProject("project-id");
```

---

#### toggleFavorite(id)
切换项目收藏状态

```typescript
async function toggleFavorite(id: string): Promise<Project>
```

**参数**:
- `id` - 项目 ID

**返回值**: 更新后的项目对象

**示例**:
```typescript
const project = await toggleFavorite("project-id");
```

---

#### openInEditor(path)
在编辑器中打开项目

```typescript
async function openInEditor(path: string): Promise<void>
```

**参数**:
- `path` - 项目路径

**示例**:
```typescript
await openInEditor("/path/to/project");
```

---

#### openInTerminal(path)
在终端中打开项目

```typescript
async function openInTerminal(path: string): Promise<void>
```

**参数**:
- `path` - 项目路径

**示例**:
```typescript
await openInTerminal("/path/to/project");
```

---

### AI 供应商与聊天服务 (src/services/chat/index.ts)

#### getChatHistoryDir()
获取当前会话历史目录

```typescript
async function getChatHistoryDir(): Promise<string>
```

**返回值**: 当前会话历史目录路径

---

#### migrateChatHistoryDir(newDir)
迁移会话历史目录（目标目录必须为空）

```typescript
async function migrateChatHistoryDir(newDir: string): Promise<string>
```

**参数**:
- `newDir` - 新目录路径

**返回值**: 迁移后的目录路径

---

#### listChatSessions()
获取会话列表摘要

```typescript
async function listChatSessions(): Promise<ChatSessionSummary[]>
```

---

#### getChatSession(sessionId)
获取指定会话详情

```typescript
async function getChatSession(sessionId: string): Promise<ChatSession>
```

---

#### createChatSession(input)
创建会话

```typescript
async function createChatSession(input: CreateChatSessionInput): Promise<ChatSession>
```

**参数**:
- `input.title` - 会话标题（可选）
- `input.providerId` - 供应商 ID
- `input.modelId` - 模型 ID

---

#### saveChatSession(session)
保存会话

```typescript
async function saveChatSession(session: ChatSession): Promise<ChatSession>
```

---

#### renameChatSession(sessionId, title)
重命名会话

```typescript
async function renameChatSession(sessionId: string, title: string): Promise<ChatSession>
```

---

#### deleteChatSession(sessionId)
删除会话

```typescript
async function deleteChatSession(sessionId: string): Promise<void>
```

---

#### chatStream(request)
发起流式聊天

```typescript
async function chatStream(request: ChatStreamRequest): Promise<void>
```

**参数**:
- `request.requestId` - 请求 ID
- `request.providerId` - 供应商 ID
- `request.model` - 模型名
- `request.baseUrl` - Base URL
- `request.apiKey` - API Key（可选）
- `request.thinking` - 是否启用思考（可选）
- `request.messages` - 消息数组

---

#### chatCancel(requestId)
取消流式请求

```typescript
async function chatCancel(requestId: string): Promise<void>
```

---


**参数**:
- `path` - 要扫描的目录路径

**返回值**: Git 仓库数组

**示例**:
```typescript
const repos = await scanDirectory("/path/to/scan");
```

---

#### getGitStatus(path)
获取 Git 状态

```typescript
async function getGitStatus(path: string): Promise<GitStatus>
```

**参数**:
- `path` - 项目路径

**返回值**: Git 状态对象

**示例**:
```typescript
const status = await getGitStatus("/path/to/project");
console.log(status.branch); // "main"
console.log(status.ahead); // 2
console.log(status.behind); // 0
console.log(status.isClean); // false
```

---

#### getCommitHistory(path, limit?)
获取提交历史

```typescript
async function getCommitHistory(path: string, limit?: number): Promise<CommitInfo[]>
```

**参数**:
- `path` - 项目路径
- `limit` - 限制返回数量（可选，默认 10）

**返回值**: 提交信息数组

**示例**:
```typescript
const commits = await getCommitHistory("/path/to/project", 20);
commits.forEach(commit => {
  console.log(commit.shortHash, commit.message);
});
```

---

#### getBranches(path)
获取分支列表

```typescript
async function getBranches(path: string): Promise<BranchInfo[]>
```

**参数**:
- `path` - 项目路径

**返回值**: 分支信息数组

**示例**:
```typescript
const branches = await getBranches("/path/to/project");
const currentBranch = branches.find(b => b.isCurrent);
```

---

#### getRemotes(path)
获取远程仓库列表

```typescript
async function getRemotes(path: string): Promise<RemoteInfo[]>
```

**参数**:
- `path` - 项目路径

**返回值**: 远程仓库信息数组

**示例**:
```typescript
const remotes = await getRemotes("/path/to/project");
const origin = remotes.find(r => r.name === "origin");
console.log(origin?.url); // "https://github.com/user/repo.git"
```

---

#### gitPush(path, remote, branch, force?)
推送到远程仓库

```typescript
async function gitPush(
  path: string,
  remote: string,
  branch: string,
  force?: boolean
): Promise<string>
```

**参数**:
- `path` - 项目路径
- `remote` - 远程仓库名称
- `branch` - 分支名称
- `force` - 是否强制推送（可选，默认 false）

**返回值**: 命令输出

**示例**:
```typescript
const output = await gitPush("/path/to/project", "origin", "main");
```

---

#### gitPull(path, remote, branch)
从远程仓库拉取

```typescript
async function gitPull(
  path: string,
  remote: string,
  branch: string
): Promise<string>
```

**参数**:
- `path` - 项目路径
- `remote` - 远程仓库名称
- `branch` - 分支名称

**返回值**: 命令输出

**示例**:
```typescript
const output = await gitPull("/path/to/project", "origin", "main");
```

---

#### gitFetch(path, remote?)
从远程仓库获取更新

```typescript
async function gitFetch(path: string, remote?: string): Promise<string>
```

**参数**:
- `path` - 项目路径
- `remote` - 远程仓库名称（可选，默认所有）

**返回值**: 命令输出

**示例**:
```typescript
const output = await gitFetch("/path/to/project", "origin");
```

---

## 状态管理 (src/stores/appStore.ts)

### 状态

```typescript
interface AppState {
  // 项目
  projects: Project[];

  // UI 状态
  viewMode: "grid" | "list";
  selectedProjectId: string | null;
  searchQuery: string;
  selectedTags: string[];

  // 主题
  theme: "light" | "dark";

  // 侧边栏
  sidebarCollapsed: boolean;
}
```

### Actions

#### setProjects(projects)
设置项目列表

```typescript
setProjects: (projects: Project[]) => void
```

---

#### addProject(project)
添加项目到状态

```typescript
addProject: (project: Project) => void
```

---

#### removeProject(id)
从状态中移除项目

```typescript
removeProject: (id: string) => void
```

---

#### updateProject(id, updates)
更新状态中的项目

```typescript
updateProject: (id: string, updates: Partial<Project>) => void
```

---

#### setViewMode(mode)
设置视图模式

```typescript
setViewMode: (mode: "grid" | "list") => void
```

---

#### setTheme(theme)
设置主题

```typescript
setTheme: (theme: "light" | "dark") => void
```

---

#### setSearchQuery(query)
设置搜索关键词

```typescript
setSearchQuery: (query: string) => void
```

---

#### setSidebarCollapsed(collapsed)
设置侧边栏折叠状态

```typescript
setSidebarCollapsed: (collapsed: boolean) => void
```

---

### 使用示例

```typescript
import { useAppStore } from "@/stores/appStore";

function MyComponent() {
  const {
    projects,
    theme,
    setTheme,
    viewMode,
    setViewMode
  } = useAppStore();

  return (
    <div>
      <p>当前主题: {theme}</p>
      <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
        切换主题
      </button>

      <p>项目数量: {projects.length}</p>
      <p>视图模式: {viewMode}</p>
    </div>
  );
}
```

---

## 类型定义 (src/types/index.ts)

### Project
项目信息

```typescript
interface Project {
  id: string;
  name: string;
  path: string;
  isFavorite: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastOpened?: string;
  remoteUrl?: string;
  remoteType?: "github" | "gitee" | "gitlab" | "other" | "none";
}
```

---

### GitStatus
Git 状态

```typescript
interface GitStatus {
  branch: string;           // 当前分支
  isClean: boolean;         // 工作区是否干净
  staged: string[];         // 暂存的文件
  unstaged: string[];       // 未暂存的文件
  untracked: string[];      // 未跟踪的文件
  ahead: number;            // 领先远程的提交数
  behind: number;           // 落后远程的提交数
}
```

---

### CommitInfo
提交信息

```typescript
interface CommitInfo {
  hash: string;             // 完整哈希
  shortHash: string;        // 短哈希
  message: string;          // 提交信息
  author: string;           // 作者
  email: string;            // 邮箱
  date: string;             // 日期
}
```

---

### BranchInfo
分支信息

```typescript
interface BranchInfo {
  name: string;             // 分支名称
  isCurrent: boolean;       // 是否当前分支
  isRemote: boolean;        // 是否远程分支
  upstream?: string;        // 上游分支
}
```

---

### RemoteInfo
远程仓库信息

```typescript
interface RemoteInfo {
  name: string;             // 远程名称
  url: string;              // URL
  fetchUrl?: string;        // Fetch URL
  pushUrl?: string;         // Push URL
}
```

---

### DashboardStats
统计数据

```typescript
interface DashboardStats {
  totalProjects: number;        // 总项目数
  todayCommits: number;         // 今日提交数
  weekCommits: number;          // 本周提交数
  unpushedCommits: number;      // 待推送提交数
  unmergedBranches: number;     // 未合并分支数
}
```

---

### DailyActivity
每日活动

```typescript
interface DailyActivity {
  date: string;             // 日期 (YYYY-MM-DD)
  count: number;            // 提交数量
}
```

---

## 组件 Props

### AiModelConfig
AI 模型配置

```typescript
interface AiModelConfig {
  id: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  thinking: boolean;
}
```

---

### AiProviderConfig
AI 供应商配置

```typescript
interface AiProviderConfig {
  id: string;
  name: string;
  providerType: "preset" | "custom";
  presetKey?: "bailian" | "deepseek" | "openai" | "ollama" | "moonshot";
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  isDefaultProvider: boolean;
  models: AiModelConfig[];
}
```

---

### ChatMessage
聊天消息

```typescript
interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
  tokens?: number;
  thinking?: boolean;
  thinkingContent?: string;
}
```

---

### ChatSession
聊天会话

```typescript
interface ChatSession {
  id: string;
  title: string;
  providerId: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}
```

---

### ChatSessionSummary
聊天会话摘要

```typescript
interface ChatSessionSummary {
  id: string;
  title: string;
  providerId: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}
```

---

### ProjectCard

```typescript
interface ProjectCardProps {
  project: Project;                           // 项目对象
  viewMode: "grid" | "list";                  // 视图模式
  onUpdate?: (project: Project) => void;      // 更新回调
  onShowDetail?: (project: Project) => void;  // 显示详情回调
}
```

---

### ScanResultDialog

```typescript
interface ScanResultDialogProps {
  repos: GitRepo[];                           // 扫描结果
  onConfirm: (selectedPaths: string[]) => void; // 确认回调
  onCancel: () => void;                       // 取消回调
}
```

---

### ProjectDetailDialog

```typescript
interface ProjectDetailDialogProps {
  project: Project;                           // 项目对象
  onClose: () => void;                        // 关闭回调
}
```

---

### CommitHeatmap

```typescript
interface HeatmapProps {
  data: { date: string; count: number }[];   // 热力图数据
}
```

---

## Tauri 命令 (Rust 后端)

> **详细开发指南**: 请参考 [Tauri 命令开发指南](TAURI-COMMANDS.md) 了解如何编写和调用 Tauri 命令。

### 命令调用方式

所有 Tauri 命令通过 `invoke` 函数调用：

```typescript
import { invoke } from "@tauri-apps/api/core";

// 调用命令
const result = await invoke<ReturnType>("command_name", { param1, param2 });
```

### 项目管理

- `get_projects()` - 获取所有项目
- `add_project(input)` - 添加项目
- `update_project(id, updates)` - 更新项目
- `remove_project(id)` - 删除项目
- `toggle_favorite(id)` - 切换收藏
- `open_in_editor(path)` - 在编辑器中打开
- `open_in_terminal(path)` - 在终端中打开

### Git 操作

- `scan_directory(path)` - 扫描目录
- `get_git_status(path)` - 获取 Git 状态
- `get_commit_history(path, limit)` - 获取提交历史
- `get_branches(path)` - 获取分支列表
- `get_remotes(path)` - 获取远程仓库
- `add_remote(path, name, url)` - 添加远程仓库
- `remove_remote(path, name)` - 删除远程仓库
- `git_push(path, remote, branch, force)` - 推送
- `git_pull(path, remote, branch)` - 拉取
- `git_fetch(path, remote)` - 获取更新

### AI 供应商管理

- `get_ai_providers()` - 获取 AI 供应商配置
- `save_ai_providers(providers)` - 保存 AI 供应商配置

### 会话与聊天

- `get_chat_history_dir()` - 获取会话历史目录
- `migrate_chat_history_dir(new_dir)` - 迁移会话历史目录（目标需为空）
- `list_chat_sessions()` - 会话列表摘要
- `get_chat_session(session_id)` - 获取会话详情
- `create_chat_session(input)` - 创建会话
- `save_chat_session(session)` - 保存会话
- `rename_chat_session(session_id, title)` - 重命名会话
- `delete_chat_session(session_id)` - 删除会话
- `chat_stream(request)` - 发起流式聊天
- `chat_cancel(request_id)` - 取消流式请求

### 命令示例

```typescript
// 获取项目列表
const projects = await invoke<Project[]>("get_projects");

// 添加项目
const newProject = await invoke<Project>("add_project", {
  input: {
    name: "My Project",
    path: "/path/to/project",
    tags: ["react", "typescript"]
  }
});

// 获取 Git 状态
const status = await invoke<GitStatus>("get_git_status", {
  path: "/path/to/project"
});
```

---

## 错误处理

所有 API 调用都应该使用 try-catch 处理错误：

```typescript
try {
  const projects = await getProjects();
  // 处理成功
} catch (error) {
  console.error("Failed to load projects:", error);
  // 显示错误提示
}
```

---

## 最佳实践

1. **类型安全**: 始终使用 TypeScript 类型
2. **错误处理**: 所有异步操作都要有错误处理
3. **加载状态**: 显示加载指示器
4. **用户反馈**: 操作成功/失败要有提示
5. **性能优化**: 避免不必要的重新渲染
6. **代码复用**: 提取公共逻辑到 hooks 或 utils
