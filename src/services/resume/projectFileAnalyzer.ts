import { readTextFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import type { Project } from "@/types";

// 要读取的关键文件列表（按优先级排序）
const KEY_FILES = [
  // 项目描述文件
  "README.md",
  "readme.md",
  "README",
  "readme",
  "README.zh.md",
  "README_CN.md",
  // 依赖文件
  "package.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Cargo.toml",
  "go.mod",
  "requirements.txt",
  "pyproject.toml",
  "composer.json",
  "Gemfile",
  // 配置文件
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "webpack.config.js",
  "docker-compose.yml",
  "Dockerfile",
  ".github/workflows/*.yml",
];

// 敏感文件模式
const SENSITIVE_PATTERNS = [
  /^\.env/,
  /^\.env\./,
  /^config\.json$/i,
  /^config\.local\.json$/i,
  /^secrets?\.json$/i,
  /^credentials?\.json$/i,
  /^\.aws$/i,
  /^\.ssh$/i,
  /^id_rsa$/i,
  /^id_dsa$/i,
  /^id_ecdsa$/i,
  /^id_ed25519$/i,
  /^.*\.key$/i,
  /^.*\.pem$/i,
  /^.*\.p12$/i,
  /^.*\.pfx$/i,
  /^npmrc$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^.*\.keystore$/i,
  /^.*\.jks$/i,
];

/**
 * 项目文件内容
 */
export interface ProjectFileContent {
  filename: string;
  content: string;
  type: "readme" | "dependency" | "config" | "other";
}

/**
 * 项目分析结果
 */
export interface ProjectFileAnalysis {
  project: Project;
  files: ProjectFileContent[];
  readme?: string;
  dependencies?: string;
  techStack: string[];
}

/**
 * 检查文件是否敏感
 */
function isSensitiveFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => p.test(lower));
}

/**
 * 读取单个文件
 */
async function readFile(projectPath: string, filename: string): Promise<string | null> {
  try {
    const filePath = await join(projectPath, filename);
    if (await exists(filePath)) {
      return await readTextFile(filePath);
    }
  } catch {
    // 忽略错误
  }
  return null;
}

/**
 * 读取项目的所有关键文件
 */
export async function readProjectFiles(project: Project): Promise<ProjectFileAnalysis> {
  const files: ProjectFileContent[] = [];
  let readme: string | undefined;
  let dependencies: string | undefined;

  // 读取 README
  for (const readmeName of ["README.md", "readme.md", "README", "readme", "README.zh.md", "README_CN.md"]) {
    const content = await readFile(project.path, readmeName);
    if (content) {
      readme = sanitizeContent(content);
      files.push({
        filename: readmeName,
        content: readme,
        type: "readme",
      });
      break;
    }
  }

  // 读取依赖文件
  const depFiles = [
    "package.json",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "Cargo.toml",
    "go.mod",
    "requirements.txt",
    "pyproject.toml",
    "composer.json",
    "Gemfile",
  ];

  for (const depFile of depFiles) {
    const content = await readFile(project.path, depFile);
    if (content) {
      dependencies = sanitizeContent(content);
      files.push({
        filename: depFile,
        content: dependencies,
        type: "dependency",
      });
      break; // 只读取第一个找到的依赖文件
    }
  }

  // 读取其他配置文件（最多3个）
  const configFiles = [
    "tsconfig.json",
    "vite.config.ts",
    "vite.config.js",
    "webpack.config.js",
    "docker-compose.yml",
    "Dockerfile",
  ];

  let configCount = 0;
  for (const configFile of configFiles) {
    if (configCount >= 2) break;
    const content = await readFile(project.path, configFile);
    if (content) {
      files.push({
        filename: configFile,
        content: sanitizeContent(content),
        type: "config",
      });
      configCount++;
    }
  }

  // 合并技术栈
  const techStack = [...project.labels];

  return {
    project,
    files,
    readme,
    dependencies,
    techStack,
  };
}

/**
 * 清理敏感内容
 */
function sanitizeContent(content: string): string {
  // 限制长度
  const maxLength = 5000;
  let sanitized = content.slice(0, maxLength);

  // 过滤敏感关键词
  const sensitiveKeywords = [
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "private_key",
    "access_key",
    "client_secret",
    "credential",
  ];

  sensitiveKeywords.forEach((keyword) => {
    const regex = new RegExp(`(${keyword}[:=\\s]+)[^\\s,;\\"'\\n]+`, "gi");
    sanitized = sanitized.replace(regex, "$1***");
  });

  // 过滤 URL 中的凭证
  sanitized = sanitized.replace(/(https?:\/\/)[^@\\s]+@/gi, "$1***@");

  return sanitized;
}

/**
 * 构建项目分析的 Prompt
 */
export function buildProjectAnalysisPrompt(
  fileAnalysis: ProjectFileAnalysis,
  jobDirection: "backend" | "frontend" | "fullstack"
): string {
  const { project, files, readme, dependencies, techStack } = fileAnalysis;

  // 文件内容摘要
  const fileContents = files
    .map((f) => {
      const maxLen = 2000;
      const content = f.content.length > maxLen ? f.content.slice(0, maxLen) + "..." : f.content;
      return `【${f.filename}】\n${content}`;
    })
    .join("\n\n");

  // 岗位方向描述
  const directionDesc = {
    backend: "后端开发",
    frontend: "前端开发",
    fullstack: "全栈开发",
  }[jobDirection];

  return `请根据以下项目信息，为${directionDesc}岗位生成一份专业的项目经历描述。

## 项目基本信息
- 项目名称：${project.name}
- 项目分类：${project.tags.join(", ") || "未分类"}
- 技术标签：${project.labels.join(", ")}

## 项目文件内容
${fileContents}

## 要求
1. 根据以上文件内容，分析项目的真实技术栈和架构特点
2. 生成符合 STAR 结构的项目经历：
   - Situation（项目背景）：描述项目是什么、解决什么问题、面向什么用户
   - Task（承担任务）：描述你在项目中的职责和技术挑战
   - Action（技术行动）：描述你采取的技术方案和具体实现（必须使用文件中真实存在的技术）
   - Result（项目成果）：描述量化的项目成果（性能提升、效率提高等）

3. 技术栈必须基于文件内容分析得出，不能编造
4. 如果 README 中有项目描述，请充分利用
5. 如果依赖文件中有框架信息，请明确指出使用了什么框架
6. 每个字段控制在 100-200 字之间

## 输出格式
请严格按照以下 JSON 格式输出，不要包含任何其他内容：
{
  "techStack": ["技术1", "技术2", "技术3"],
  "situation": "项目背景描述...",
  "task": "承担的任务描述...",
  "action": "采取的技术行动描述...",
  "result": "量化结果描述..."
}`;
}

/**
 * 综合分析所有项目生成完整简历的 Prompt
 */
export function buildResumeSummaryPrompt(
  projectAnalyses: Array<{
    projectName: string;
    techStack: string[];
    experience: {
      situation: string;
      task: string;
      action: string;
      result: string;
    };
  }>,
  jobDirection: "backend" | "frontend" | "fullstack"
): string {
  const directionDesc = {
    backend: "后端开发工程师",
    frontend: "前端开发工程师",
    fullstack: "全栈开发工程师",
  }[jobDirection];

  const projectsSummary = projectAnalyses
    .map(
      (p, i) => `
项目 ${i + 1}：${p.projectName}
技术栈：${p.techStack.join(", ")}
背景：${p.experience.situation}
任务：${p.experience.task}
行动：${p.experience.action}
成果：${p.experience.result}
`
    )
    .join("\n---\n");

  return `你是一位资深的 ${directionDesc}，请根据以下项目经历，生成一份完整的简历。

## 各项目经历
${projectsSummary}

## 要求
1. 生成一份综合技术栈列表（去重，按重要性排序）
2. 为每个项目优化描述，使其更加专业
3. 确保所有技术术语准确无误
4. 突出项目之间的技术关联和个人成长

## 输出格式
请严格按照以下 JSON 格式输出：
{
  "summary": "个人技术简介（50字左右）",
  "skills": ["技术1", "技术2", "技术3"],
  "projects": [
    {
      "projectName": "项目名称",
      "techStack": ["技术1", "技术2"],
      "situation": "...",
      "task": "...",
      "action": "...",
      "result": "..."
    }
  ]
}`;
}
