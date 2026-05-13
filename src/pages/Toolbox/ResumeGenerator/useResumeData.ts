import { useState, useCallback, useRef } from "react";
import { useAppStore } from "@/stores/appStore";
import { getCommitHistory } from "@/services/git";
import { parseProjectDependencies } from "@/services/resume/dependencyParser";
import type { Project } from "@/types";
import type {
  ResumeDataSource,
  ProjectExperience,
  KeyCommit,
} from "@/types/resume";
import { analyzeCommitType, extractIssueRefs } from "@/types/resume";

// 敏感信息过滤关键词
const SENSITIVE_KEYWORDS = [
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
  "auth",
  "登录密码",
  "密钥",
  "密码",
];

/**
 * 过滤敏感信息
 */
function sanitizeText(text: string): string {
  if (!text) return text;

  // 替换可能包含敏感信息的内容
  let sanitized = text;

  // 过滤 URL 中的凭证信息 (http://user:pass@host)
  sanitized = sanitized.replace(
    /(https?:\/\/)[^@\s]+@/gi,
    "$1***@"
  );

  // 过滤邮箱地址
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "***@***.com"
  );

  // 过滤敏感关键词后的内容
  SENSITIVE_KEYWORDS.forEach((keyword) => {
    const regex = new RegExp(
      `(${keyword}[:=\s]+)[^\\s,;\"'\n]+`,
      "gi"
    );
    sanitized = sanitized.replace(regex, "$1***");
  });

  return sanitized;
}

interface UseResumeDataOptions {
  maxCommitsPerProject?: number;
}

interface UseResumeDataReturn {
  isLoading: boolean;
  progress: {
    current: number;
    total: number;
    projectName: string;
  } | null;
  data: ResumeDataSource | null;
  error: string | null;
  collectData: (projectIds?: string[]) => Promise<void>;
  reset: () => void;
}

export function useResumeData(options: UseResumeDataOptions = {}): UseResumeDataReturn {
  const { maxCommitsPerProject = 100 } = options;
  const { projects } = useAppStore();

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    projectName: string;
  } | null>(null);
  const [data, setData] = useState<ResumeDataSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 使用 ref 避免重复请求
  const abortRef = useRef(false);

  const collectData = useCallback(
    async (projectIds?: string[]) => {
      if (isLoading) return;

      // 过滤项目
      const targetProjects = projectIds
        ? projects.filter((p) => projectIds.includes(p.id))
        : projects;

      if (targetProjects.length === 0) {
        setError("没有可分析的项目");
        return;
      }

      setIsLoading(true);
      setError(null);
      setData(null);
      abortRef.current = false;

      const experiences: ProjectExperience[] = [];
      let totalCommits = 0;
      let totalInsertions = 0;
      let totalDeletions = 0;
      const techStackFrequency: Record<string, number> = {};
      let earliestDate: Date | null = null;
      let latestDate: Date | null = null;

      try {
        for (let i = 0; i < targetProjects.length; i++) {
          if (abortRef.current) break;

          const project = targetProjects[i];
          setProgress({
            current: i + 1,
            total: targetProjects.length,
            projectName: project.name,
          });

          try {
            const experience = await analyzeProject(
              project,
              maxCommitsPerProject
            );

            if (experience) {
              experiences.push(experience);

              // 统计数据
              totalCommits += experience.commitStats.totalCommits;
              totalInsertions += experience.commitStats.totalInsertions;
              totalDeletions += experience.commitStats.totalDeletions;

              // 技术栈频率
              [...experience.labels, ...(experience.dependencyAnalysis?.keyLibraries || [])].forEach(
                (tech) => {
                  techStackFrequency[tech] = (techStackFrequency[tech] || 0) + 1;
                }
              );

              // 时间范围
              const startDate = new Date(experience.timeRange.start);
              const endDate = new Date(experience.timeRange.end);
              if (!earliestDate || startDate < earliestDate) {
                earliestDate = startDate;
              }
              if (!latestDate || endDate > latestDate) {
                latestDate = endDate;
              }
            }
          } catch (err) {
            console.error(`分析项目 ${project.name} 失败:`, err);
            // 继续处理其他项目
          }
        }

        if (!abortRef.current) {
          setData({
            projects: experiences,
            overallStats: {
              totalProjects: experiences.length,
              totalCommits,
              totalInsertions,
              totalDeletions,
              techStackFrequency,
              activeTimeRange: {
                start: earliestDate?.toISOString() || new Date().toISOString(),
                end: latestDate?.toISOString() || new Date().toISOString(),
              },
            },
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "数据收集失败");
      } finally {
        setIsLoading(false);
        setProgress(null);
      }
    },
    [projects, isLoading, maxCommitsPerProject]
  );

  const reset = useCallback(() => {
    abortRef.current = true;
    setIsLoading(false);
    setProgress(null);
    setData(null);
    setError(null);
  }, []);

  return {
    isLoading,
    progress,
    data,
    error,
    collectData,
    reset,
  };
}

/**
 * 分析单个项目
 */
async function analyzeProject(
  project: Project,
  maxCommits: number
): Promise<ProjectExperience | null> {
  try {
    // 1. 获取 Git 提交历史
    const commits = await getCommitHistory(project.path, maxCommits);

    if (commits.length === 0) {
      return null;
    }

    // 2. 解析依赖文件
    const dependencyAnalysis = await parseProjectDependencies(project.path);

    // 3. 分析提交数据
    const commitStats = analyzeCommits(commits);

    // 4. 确定时间范围
    const dates = commits.map((c) => new Date(c.date));
    const earliestDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const latestDate = new Date(Math.max(...dates.map((d) => d.getTime())));

    // 5. 合并技术栈
    const techStack = [...project.labels];
    if (dependencyAnalysis?.framework) {
      techStack.push(dependencyAnalysis.framework);
    }
    if (dependencyAnalysis?.language) {
      const languages = dependencyAnalysis.language.split(" / ");
      languages.forEach((lang) => {
        if (!techStack.includes(lang)) {
          techStack.push(lang);
        }
      });
    }

    return {
      projectId: project.id,
      projectName: project.name,
      path: project.path,
      category: project.tags,
      labels: project.labels,
      techStack: [...new Set(techStack)],
      dependencyAnalysis: dependencyAnalysis ?? undefined,
      timeRange: {
        start: earliestDate.toISOString(),
        end: latestDate.toISOString(),
      },
      commitStats,
      isEdited: false,
    };
  } catch (err) {
    console.error(`分析项目 ${project.name} 失败:`, err);
    return null;
  }
}

/**
 * 分析提交记录
 */
export function analyzeCommits(commits: import("@/types").CommitInfo[]): {
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  keyCommits: KeyCommit[];
  typeCounts: { feat: number; fix: number; perf: number; refactor: number; other: number };
  issueRefsCount: number;
} {
  let totalInsertions = 0;
  let totalDeletions = 0;
  const keyCommits: KeyCommit[] = [];
  const typeCounts = { feat: 0, fix: 0, perf: 0, refactor: 0, other: 0 };
  const issueSet = new Set<string>();

  commits.forEach((commit) => {
    // 统计代码量
    totalInsertions += commit.insertions || 0;
    totalDeletions += commit.deletions || 0;

    // 过滤敏感信息
    const sanitizedMessage = sanitizeText(commit.message);

    // 提取关键提交
    const type = analyzeCommitType(sanitizedMessage);
    const issueRefs = extractIssueRefs(sanitizedMessage);
    typeCounts[type] += 1;
    issueRefs.forEach((ref) => issueSet.add(ref));

    // 优先保留 feat/fix/perf/refactor 类型的提交
    if (type !== "other" || issueRefs.length > 0 || (commit.insertions || 0) > 100) {
      keyCommits.push({
        hash: commit.shortHash,
        message: sanitizedMessage.split("\n")[0], // 只保留第一行
        type,
        date: commit.date,
        insertions: commit.insertions || 0,
        deletions: commit.deletions || 0,
        filesChanged: commit.filesChanged || 0,
      });
    }
  });

  // 按重要性排序并截取前 10 个
  const sortedKeyCommits = keyCommits
    .sort((a, b) => {
      // feat/fix 优先
      const typePriority: Record<string, number> = {
        feat: 4,
        fix: 3,
        perf: 2,
        refactor: 1,
        other: 0,
      };
      const priorityDiff = typePriority[b.type] - typePriority[a.type];
      if (priorityDiff !== 0) return priorityDiff;

      // 代码变更量大的优先
      return (b.insertions + b.deletions) - (a.insertions + a.deletions);
    })
    .slice(0, 10);

  return {
    totalCommits: commits.length,
    totalInsertions,
    totalDeletions,
    keyCommits: sortedKeyCommits,
    typeCounts,
    issueRefsCount: issueSet.size,
  };
}

/**
 * 格式化技术栈频率为排序数组
 */
export function getTopTechStack(
  frequency: Record<string, number>,
  limit = 10
): Array<{ name: string; count: number }> {
  return Object.entries(frequency)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * 格式化时间范围为可读文本
 */
export function formatTimeRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const months =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());

  if (months < 1) {
    return "1个月内";
  } else if (months < 12) {
    return `${months}个月`;
  } else {
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (remainingMonths === 0) {
      return `${years}年`;
    }
    return `${years}年${remainingMonths}个月`;
  }
}
