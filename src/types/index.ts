// Project types
export interface Project {
  id: string;
  name: string;
  path: string;
  isFavorite: boolean;
  tags: string[]; // Categories for organization (工作、个人、学习等)
  labels: string[]; // Tech stack labels (Java, Vue, 小程序等)
  createdAt: string;
  updatedAt: string;
  lastOpened?: string;
  remoteUrl?: string;
  remoteType?: "github" | "gitee" | "gitlab" | "other" | "none";
}

export interface CreateProjectInput {
  name: string;
  path: string;
  tags?: string[];
  labels?: string[];
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
  tags?: string[];
  labels?: string[];
}

// Git types
export interface GitStatus {
  branch: string;
  isClean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  date: string;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
}

export interface RemoteInfo {
  name: string;
  url: string;
  fetchUrl?: string;
  pushUrl?: string;
}

export interface GitRepo {
  path: string;
  name: string;
}

// View types
export type ViewMode = "grid" | "list";

// Statistics types
export interface DailyActivity {
  date: string;
  count: number;
}

export interface DashboardStats {
  totalProjects: number;
  todayCommits: number;
  weekCommits: number;
  unpushedCommits: number;
  unmergedBranches: number;
}
