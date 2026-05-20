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
    typeCounts?: { feat: number; fix: number; perf: number; refactor: number; other: number };
    issueRefsCount?: number;
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
- S: 项目背景，在什么场景下（如内部系统、对外平台、技术中台）
- T: 承担的后端职责和技术挑战
- A: 采取的技术方案（具体到框架/中间件，限定在【技术术语】范围内）
- R: 量化结果（**必须直接引用下方"量化贡献"中的真实数字**，如累计提交数、修复数、功能数、活跃月数；禁止编造 QPS / 响应时间 / 可用性 9 数等业务指标的具体数值）
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
- T: 前端技术挑战（结合项目类型，避免无依据的指标承诺）
- A: 采取的技术方案（具体到库/工具，限定在【技术术语】范围内）
- R: 量化结果（**必须直接引用下方"量化贡献"中的真实数字**，如累计提交数、修复数、功能数、活跃月数；禁止编造首屏时间 / 用户满意度 / 转化率等业务指标的具体数值）
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
- A: 前后端及部署完整技术方案（限定在【技术术语】范围内）
- R: 量化结果（**必须直接引用下方"量化贡献"中的真实数字**，如累计提交数、修复数、功能数、活跃月数；禁止编造交付周期 / 系统可用性 / 性能提升百分比等业务指标的具体数值）
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

// ============== Deep Agents 重构（新版） ==============

/** 语气偏好 */
export type Tone = "professional" | "concise";

/** 单个项目的「背景知识」文档（Markdown）。每个项目对应一份，独立持久化与版本化。 */
export interface ProjectKnowledge {
  projectId: string;
  projectName: string;
  projectPath: string;
  /** Markdown 全文 */
  content: string;
  /** 最近一次写入的 iso 时间戳 */
  updatedAt: string;
  /** 是否为用户手编版本（区别于纯 Agent 生成） */
  userEdited: boolean;
  /** 最近一次产出该版本的质检结果(内存态;来自 agent 返回的 qualityIssues)。
   *  从磁盘 load 时为空——质量信息保存在历史元信息里,需要从 history 读 meta 才能拿到。 */
  qualityIssues?: import("@/services/resume/knowledgeStore").QualityIssue[];
}

/** 背景知识的历史版本元数据（不含正文，按需 fetch） */
export interface KnowledgeHistoryEntry {
  /** 文件名上的毫秒级时间戳 */
  timestamp: string;
  /** 文件字节数 */
  size: number;
}

/** ResumeAgent 的输入选项 */
export interface ResumeGenerateOptions {
  projectIds: string[];
  jobDirection: JobDirection;
  /** JD 关键词列表（可空） */
  jdKeywords: string[];
  tone: Tone;
}

/** ResumeAgent 产出的单条项目经历（V2，无 git 数据） */
export interface ResumeProjectExperience {
  projectId: string;
  projectName: string;
  techStack: string[];
  starExperience: STARExperience;
  customDescription?: string;
  isEdited: boolean;
}

/** ResumeAgent 产出的完整简历（V2） */
export interface ResumeV2 {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** 用户自定义简历名字。可选,旧数据无此字段时回退到 `${jobDirection} · N 个项目` */
  name?: string;
  jobDirection: JobDirection;
  jdKeywords: string[];
  tone: Tone;
  summary?: string;
  /** 综合所有项目得到的技能词云 */
  skills: string[];
  experiences: ResumeProjectExperience[];
  isSaved: boolean;
  /** HR 简历预览/docx 顶部固定栏的个人信息。Agent 不生成,用户在预览面板里手填。 */
  personalInfo?: PersonalInfo;
}

/** 当前简历生成器持久化使用的格式。旧版 GeneratedResume 只作为历史兼容。 */
export type SavedResume = ResumeV2;

// ============== 个人信息(预览 / docx 顶部固定栏) ==============
//
// HR 简历模板里固定的「个人信息」区。值都是 string 可空 —— Agent 不会生成它们,
// 用户在预览面板里手动填,填完跟简历一起持久化。导出 docx 时即使全空也会输出
// 占位结构,方便用户在 Word 里继续手填。

export interface PersonalInfoBasic {
  name?: string;
  gender?: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  location?: string;
  jobStatus?: string;
}

export interface PersonalInfoEducation {
  degree?: string;
  school?: string;
  major?: string;
  graduationYear?: string;
}

export interface PersonalInfoJobPreference {
  yearsOfExperience?: string;
  expectedPosition?: string;
  expectedSalary?: string;
  expectedCity?: string;
}

export interface PersonalInfoSocial {
  website?: string;
  github?: string;
  blog?: string;
  linkedin?: string;
  wechat?: string;
}

export interface PersonalInfo {
  basic: PersonalInfoBasic;
  education: PersonalInfoEducation;
  jobPreference: PersonalInfoJobPreference;
  social: PersonalInfoSocial;
}

export function emptyPersonalInfo(): PersonalInfo {
  return {
    basic: {},
    education: {},
    jobPreference: {},
    social: {},
  };
}

