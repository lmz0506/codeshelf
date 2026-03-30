import { readTextFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import type { Project } from "@/types";
import type { KeyCommit, DependencyAnalysis } from "@/types/resume";

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
  filteredFiles: { filename: string; reason: string }[];
  readme?: string;
  dependencies?: string;
  techStack: string[];
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
 * 简单 glob 匹配（支持 * 和 .）
 */
function matchGlob(filename: string, pattern: string): boolean {
  // 将 glob pattern 转为正则
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // 转义特殊字符（除了 *）
    .replace(/\\\./g, "\\.") // 还原对 . 的转义
    .replace(/\*/g, ".*"); // * -> .*
  const regex = new RegExp(`^${escaped}$`, "i");
  return regex.test(filename);
}

/**
 * 读取项目的所有关键文件
 */
export async function readProjectFiles(project: Project, sensitivePatterns?: string[]): Promise<ProjectFileAnalysis> {
  const files: ProjectFileContent[] = [];
  const filteredFiles: { filename: string; reason: string }[] = [];
  let readme: string | undefined;
  let dependencies: string | undefined;

  // 检查文件名是否匹配敏感规则
  const isSensitive = (filename: string): string | null => {
    if (!sensitivePatterns || sensitivePatterns.length === 0) return null;
    for (const pattern of sensitivePatterns) {
      if (matchGlob(filename, pattern)) {
        return pattern;
      }
    }
    return null;
  };

  // 主动扫描常见敏感文件
  if (sensitivePatterns && sensitivePatterns.length > 0) {
    const commonSensitiveFiles = [
      ".env", ".env.local", ".env.production", ".env.development",
      ".env.staging", ".env.test",
      "id_rsa", "id_ed25519",
      ".npmrc", ".pypirc",
    ];
    const scanResults = await Promise.all(
      commonSensitiveFiles.map(async (name) => {
        try {
          const filePath = await join(project.path, name);
          if (await exists(filePath)) {
            return name;
          }
        } catch { /* ignore */ }
        return null;
      })
    );
    for (const name of scanResults) {
      if (name) {
        const matchedPattern = isSensitive(name);
        if (matchedPattern) {
          filteredFiles.push({ filename: name, reason: matchedPattern });
        }
      }
    }
  }

  // 并行读取所有 README 变体
  const readmeNames = ["README.md", "readme.md", "README", "readme", "README.zh.md", "README_CN.md"];
  const readmeResults = await Promise.all(readmeNames.map((name) => readFile(project.path, name)));
  for (let i = 0; i < readmeNames.length; i++) {
    if (readmeResults[i]) {
      const matched = isSensitive(readmeNames[i]);
      if (matched) {
        filteredFiles.push({ filename: readmeNames[i], reason: matched });
        continue;
      }
      readme = sanitizeContent(readmeResults[i]!);
      files.push({ filename: readmeNames[i], content: readme, type: "readme" });
      break;
    }
  }

  // 并行读取所有依赖文件
  const depFiles = [
    "package.json", "pom.xml", "build.gradle", "build.gradle.kts",
    "Cargo.toml", "go.mod", "requirements.txt", "pyproject.toml",
    "composer.json", "Gemfile",
  ];
  const depResults = await Promise.all(depFiles.map((name) => readFile(project.path, name)));
  for (let i = 0; i < depFiles.length; i++) {
    if (depResults[i]) {
      const matched = isSensitive(depFiles[i]);
      if (matched) {
        filteredFiles.push({ filename: depFiles[i], reason: matched });
        continue;
      }
      dependencies = sanitizeContent(depResults[i]!);
      files.push({ filename: depFiles[i], content: dependencies, type: "dependency" });
      break;
    }
  }

  // 并行读取配置文件（最多取2个）
  const configFiles = [
    "tsconfig.json", "vite.config.ts", "vite.config.js",
    "webpack.config.js", "docker-compose.yml", "Dockerfile",
  ];
  const configResults = await Promise.all(configFiles.map((name) => readFile(project.path, name)));
  let configCount = 0;
  for (let i = 0; i < configFiles.length; i++) {
    if (configCount >= 2) break;
    if (configResults[i]) {
      const matched = isSensitive(configFiles[i]);
      if (matched) {
        filteredFiles.push({ filename: configFiles[i], reason: matched });
        continue;
      }
      files.push({ filename: configFiles[i], content: sanitizeContent(configResults[i]!), type: "config" });
      configCount++;
    }
  }

  const techStack = [...project.labels];

  // 去重 filteredFiles（同一文件可能被主动扫描和正常读取都匹配到）
  const uniqueFiltered = filteredFiles.filter((f, idx) =>
    filteredFiles.findIndex((ff) => ff.filename === f.filename) === idx
  );

  return { project, files, filteredFiles: uniqueFiltered, readme, dependencies, techStack };
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
 * Commit 统计数据（用于增强 AI prompt）
 */
export interface CommitAnalysisData {
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  keyCommits: KeyCommit[];
  timeRange: { start: string; end: string };
  dependencyAnalysis?: DependencyAnalysis | null;
}

/**
 * 构建项目分析的 Prompt
 */
export function buildProjectAnalysisPrompt(
  fileAnalysis: ProjectFileAnalysis,
  jobDirection: "backend" | "frontend" | "fullstack",
  commitData?: CommitAnalysisData
): string {
  const { project, files } = fileAnalysis;

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

  // 构建 commit 数据部分
  let commitSection = "";
  if (commitData) {
    const keyCommitsDesc = commitData.keyCommits
      .slice(0, 8)
      .map((c) => `- [${c.type}] ${c.message} (+${c.insertions}/-${c.deletions})`)
      .join("\n");

    commitSection = `
## Git 提交统计
- 提交次数：${commitData.totalCommits}
- 代码新增：${commitData.totalInsertions} 行
- 代码删除：${commitData.totalDeletions} 行
- 活跃时间：${formatDate(commitData.timeRange.start)} - ${formatDate(commitData.timeRange.end)}

## 关键提交记录
${keyCommitsDesc || "无关键提交"}
`;

    if (commitData.dependencyAnalysis) {
      const dep = commitData.dependencyAnalysis;
      commitSection += `
## 依赖分析
- 语言：${dep.language}
${dep.framework ? `- 框架：${dep.framework}` : ""}
- 关键库：${dep.keyLibraries.join(", ") || "无"}
- 架构特征：${dep.architectureHints.join(", ") || "未检测"}
`;
    }
  }

  return `请根据以下项目信息，为${directionDesc}岗位生成一份专业的项目经历描述。

## 项目基本信息
- 项目名称：${project.name}
- 项目分类：${project.tags.join(", ") || "未分类"}
- 技术标签：${project.labels.join(", ")}

## 项目文件内容
${fileContents}
${commitSection}
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
${commitData ? "6. 结合 Git 提交统计和关键提交记录，让描述更加真实可信\n7. 时间跨度和代码量数据可以用来佐证项目规模" : ""}
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}
