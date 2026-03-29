// 简历生成器类型定义

export type JobDirection = "backend" | "frontend" | "fullstack";

export interface JobDirectionConfig {
  id: JobDirection;
  name: string;
  description: string;
  promptTemplate: string;
}

// 依赖分析结果
export interface DependencyAnalysis {
  language: string;
  framework?: string;
  keyLibraries: string[];
  devTools: string[];
  architectureHints: string[];
}

// STAR 结构的项目经历
export interface STARExperience {
  situation: string;
  task: string;
  action: string;
  result: string;
}

// 项目经历（单条）
export interface ProjectExperience {
  projectId: string;
  projectName: string;
  path: string;
  category: string[];
  labels: string[];
  techStack: string[];
  dependencyAnalysis?: DependencyAnalysis;
  timeRange: {
    start: string;
    end: string;
  };
  commitStats: {
    totalCommits: number;
    totalInsertions: number;
    totalDeletions: number;
    keyCommits: KeyCommit[];
  };
  starExperience?: STARExperience;
  // 可编辑字段
  customDescription?: string;
  isEdited: boolean;
}

// 关键提交记录
export interface KeyCommit {
  hash: string;
  message: string;
  type: "feat" | "fix" | "refactor" | "perf" | "other";
  date: string;
  insertions: number;
  deletions: number;
  filesChanged: number;
}

// 简历数据源
export interface ResumeDataSource {
  projects: ProjectExperience[];
  overallStats: {
    totalProjects: number;
    totalCommits: number;
    totalInsertions: number;
    totalDeletions: number;
    techStackFrequency: Record<string, number>;
    activeTimeRange: {
      start: string;
      end: string;
    };
  };
}

// 生成的完整简历
export interface GeneratedResume {
  id: string;
  createdAt: string;
  updatedAt: string;
  jobDirection: JobDirection;
  summary?: string;
  skills: string[];
  experiences: ProjectExperience[];
  isSaved: boolean;
}

// 生成配置
export interface ResumeGenerateConfig {
  jobDirection: JobDirection;
  selectedProjectIds: string[];
  includeDependencyAnalysis: boolean;
  customPrompt?: string;
}

// 支持的依赖文件类型
export const DEPENDENCY_FILES: Record<string, string[]> = {
  node: ["package.json", "package-lock.json"],
  java: ["pom.xml", "build.gradle", "gradle.properties"],
  rust: ["Cargo.toml", "Cargo.lock"],
  go: ["go.mod", "go.sum"],
  python: ["requirements.txt", "pyproject.toml", "Pipfile"],
  php: ["composer.json", "composer.lock"],
  ruby: ["Gemfile", "Gemfile.lock"],
  dotnet: ["*.csproj", "*.sln"],
};

// 岗位方向配置
export const JOB_DIRECTIONS: JobDirectionConfig[] = [
  {
    id: "backend",
    name: "后端开发",
    description: "重点突出架构设计、数据库优化、API设计、并发处理、性能优化、微服务",
    promptTemplate: `
你是一位专业的后端开发简历撰写专家。请根据项目数据生成符合STAR结构的项目经历描述。

【后端重点】
- 架构设计：微服务、分布式、高并发架构
- 数据库：SQL优化、缓存策略、分库分表
- API设计：RESTful、GraphQL、接口规范
- 性能：QPS提升、响应时间优化、资源利用率
- 工程化：CI/CD、容器化、监控告警

【技术术语】
使用以下术语，禁止编造：{techStack}

【STAR结构要求】
- S: 项目背景，在什么场景下（如日均百万请求、千人团队）
- T: 承担的后端职责和技术挑战
- A: 采取的技术方案（具体到框架/中间件）
- R: 量化结果（性能提升%、成本降低%、可用性达到X个9）
`,
  },
  {
    id: "frontend",
    name: "前端开发",
    description: "重点突出组件封装、页面性能优化、用户体验、状态管理、构建优化、跨端适配",
    promptTemplate: `
你是一位专业的前端开发简历撰写专家。请根据项目数据生成符合STAR结构的项目经历描述。

【前端重点】
- 组件化：组件库建设、复用性设计、设计系统
- 性能：首屏加载、运行时性能、Bundle优化
- 体验：交互设计、响应式、无障碍、动画效果
- 工程化：构建工具、代码规范、自动化测试
- 跨端：移动端适配、小程序、桌面端

【技术术语】
使用以下术语，禁止编造：{techStack}

【STAR结构要求】
- S: 项目背景，面向什么用户、什么业务场景
- T: 前端技术挑战（如首屏<1s、支持IE11）
- A: 采取的技术方案（具体到库/工具）
- R: 量化结果（性能提升%、用户满意度、开发效率提升）
`,
  },
  {
    id: "fullstack",
    name: "全栈开发",
    description: "重点突出端到端交付、技术选型、全链路优化、DevOps、部署流程、前后端协同",
    promptTemplate: `
你是一位专业的全栈开发简历撰写专家。请根据项目数据生成符合STAR结构的项目经历描述。

【全栈重点】
- 端到端：从需求到上线全流程负责
- 技术选型：前后端框架选择、数据库设计
- 全链路：API设计、数据库、前端、部署一体化
- DevOps：自动化部署、监控、日志、告警
- 协同：接口规范、前后端分离、团队协作

【技术术语】
使用以下术语，禁止编造：{techStack}

【STAR结构要求】
- S: 项目背景，完整业务场景描述
- T: 全栈技术挑战（如独立负责、从0到1）
- A: 前后端及部署完整技术方案
- R: 量化结果（交付效率、系统稳定性、团队协作提升）
`,
  },
];

// Commit message 类型分析
export function analyzeCommitType(message: string): KeyCommit["type"] {
  const lower = message.toLowerCase();
  if (lower.startsWith("feat") || lower.includes("add") || lower.includes("新增")) {
    return "feat";
  }
  if (lower.startsWith("fix") || lower.includes("bug") || lower.includes("修复")) {
    return "fix";
  }
  if (lower.startsWith("refactor") || lower.includes("重构")) {
    return "refactor";
  }
  if (lower.startsWith("perf") || lower.includes("优化") || lower.includes("performance")) {
    return "perf";
  }
  return "other";
}

// 提取 commit 中的 issue 引用
export function extractIssueRefs(message: string): string[] {
  const matches = message.match(/#\d+/g);
  return matches || [];
}
