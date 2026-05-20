import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  ResumeDataSource,
  GeneratedResume,
  JobDirection,
  ProjectKnowledge,
  ResumeV2,
  SavedResume,
  STARExperience,
} from "@/types/resume";
import type { AgentStep } from "@/services/resume/agents/resumeAgent";
import {
  loadResumeKnowledge,
  saveResumeKnowledge,
  listResumeKnowledge,
  deleteResumeKnowledge,
} from "@/services/resume/knowledgeStore";

interface ResumeGeneratorState {
  data: ResumeDataSource | null;
  generatedResume: GeneratedResume | null;
  selectedDirection: JobDirection;
  selectedProjects: string[];
  isOpen: boolean;
  isAnalyzing: boolean;
}

/** 单个项目背景知识 agent 的运行状态。按 projectId 隔离,跨页面/tab 不丢,关窗口才清。 */
export interface KnowledgeRunState {
  status: "running" | "done" | "error";
  /** 最近 30 条进度,超出自动 slice */
  steps: AgentStep[];
  /** 用于 cancel_knowledge_agent IPC */
  requestId: string;
  startedAt: number;
  error?: string;
}

/** 简历 agent 的运行状态。全局只有一个(simultaneously 只能跑一次简历生成)。 */
export interface ResumeRunState {
  status: "running" | "done" | "error";
  steps: AgentStep[];
  requestId: string;
  startedAt: number;
  error?: string;
}

const MAX_STEPS = 30;

interface ResumeState {
  resumeGeneratorState: ResumeGeneratorState;
  savedResumes: SavedResume[];
  /** 项目背景知识缓存：projectId -> ProjectKnowledge */
  knowledgeDocs: Record<string, ProjectKnowledge>;
  /** 背景知识是否已从磁盘载入过（避免重复 IO） */
  knowledgeLoaded: boolean;
  /** 背景知识 agent 运行状态:projectId -> KnowledgeRunState */
  knowledgeRuns: Record<string, KnowledgeRunState>;
  /** 简历 agent 运行状态 */
  resumeRun: ResumeRunState | null;
  setSavedResumes: (resumes: unknown[]) => void;
  saveCurrentResume: () => Promise<void>;
  loadSavedResume: (resume: SavedResume) => void;
  deleteSavedResume: (id: string) => Promise<void>;
  setResumeGeneratorData: (data: ResumeDataSource | null) => void;
  setGeneratedResume: (resume: GeneratedResume | null) => void;
  setResumeGeneratorDirection: (direction: JobDirection) => void;
  setResumeGeneratorSelectedProjects: (projects: string[]) => void;
  setResumeGeneratorOpen: (isOpen: boolean) => void;
  setResumeGeneratorAnalyzing: (isAnalyzing: boolean) => void;
  clearResumeGeneratorState: () => void;
  // 背景知识管理
  loadAllKnowledgeFromDisk: (resolveName?: (projectId: string) => { name?: string; path?: string } | undefined) => Promise<void>;
  upsertKnowledge: (doc: ProjectKnowledge, userEdited: boolean) => Promise<void>;
  setKnowledgeInMemory: (doc: ProjectKnowledge) => void;
  removeKnowledge: (projectId: string) => Promise<void>;
  getKnowledge: (projectId: string) => ProjectKnowledge | undefined;
  // Agent run lifecycle
  startKnowledgeRun: (projectId: string, requestId: string) => void;
  appendKnowledgeStep: (projectId: string, step: AgentStep) => void;
  finishKnowledgeRun: (projectId: string, error?: string) => void;
  clearKnowledgeRun: (projectId: string) => void;
  startResumeRun: (requestId: string) => void;
  appendResumeStep: (step: AgentStep) => void;
  finishResumeRun: (error?: string) => void;
  clearResumeRun: () => void;
}

const INITIAL_STATE: ResumeGeneratorState = {
  data: null,
  generatedResume: null,
  selectedDirection: "backend",
  selectedProjects: [],
  isOpen: false,
  isAnalyzing: false,
};

function emptyStar(): STARExperience {
  return { situation: "", task: "", action: "", result: "" };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeSavedResume(input: unknown): SavedResume | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const id =
    typeof raw.id === "string"
      ? raw.id
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdAt =
    typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
  const updatedAt =
    typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;
  const jobDirection =
    raw.jobDirection === "frontend" || raw.jobDirection === "fullstack"
      ? raw.jobDirection
      : "backend";
  const tone = raw.tone === "concise" ? "concise" : "professional";
  const experiences = Array.isArray(raw.experiences) ? raw.experiences : [];

  return {
    id,
    createdAt,
    updatedAt,
    name: typeof raw.name === "string" ? raw.name : undefined,
    jobDirection,
    jdKeywords: asStringArray(raw.jdKeywords),
    tone,
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
    skills: asStringArray(raw.skills),
    experiences: experiences
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => {
        const star =
          item.starExperience && typeof item.starExperience === "object"
            ? (item.starExperience as Partial<STARExperience>)
            : emptyStar();
        return {
          projectId: typeof item.projectId === "string" ? item.projectId : "",
          projectName: typeof item.projectName === "string" ? item.projectName : "未命名项目",
          techStack: asStringArray(item.techStack),
          starExperience: {
            situation: typeof star.situation === "string" ? star.situation : "",
            task: typeof star.task === "string" ? star.task : "",
            action: typeof star.action === "string" ? star.action : "",
            result: typeof star.result === "string" ? star.result : "",
          },
          customDescription:
            typeof item.customDescription === "string" ? item.customDescription : undefined,
          isEdited: item.isEdited === true,
        };
      }),
    isSaved: raw.isSaved !== false,
  };
}

function normalizeSavedResumes(resumes: unknown[]): SavedResume[] {
  return resumes
    .map(normalizeSavedResume)
    .filter((resume): resume is SavedResume => resume !== null);
}

function generatedToSavedResume(resume: GeneratedResume | ResumeV2): SavedResume {
  return normalizeSavedResume({ ...resume, isSaved: true })!;
}

export const useResumeStore = create<ResumeState>()((set, get) => ({
  resumeGeneratorState: INITIAL_STATE,
  savedResumes: [],
  knowledgeDocs: {},
  knowledgeLoaded: false,
  knowledgeRuns: {},
  resumeRun: null,
  setSavedResumes: (savedResumes) => set({ savedResumes: normalizeSavedResumes(savedResumes) }),
  saveCurrentResume: async () => {
    const state = get();
    const resume = state.resumeGeneratorState.generatedResume;
    if (!resume) return;
    const saved = {
      ...generatedToSavedResume(resume),
      isSaved: true,
      updatedAt: new Date().toISOString(),
    };
    const existing = state.savedResumes.findIndex((r) => r.id === saved.id);
    const updated = [...state.savedResumes];
    if (existing >= 0) {
      updated[existing] = saved;
    } else {
      updated.unshift(saved);
    }
    set({ savedResumes: updated });
    try {
      await invoke("save_resumes", { data: updated });
    } catch (err) {
      console.error("保存简历失败:", err);
    }
  },
  loadSavedResume: (resume) =>
    set((state) => ({
      resumeGeneratorState: {
        ...state.resumeGeneratorState,
        generatedResume: null,
        selectedDirection: resume.jobDirection,
        selectedProjects: resume.experiences.map((e) => e.projectId),
      },
    })),
  deleteSavedResume: async (id) => {
    const state = get();
    const updated = state.savedResumes.filter((r) => r.id !== id);
    set({ savedResumes: updated });
    if (state.resumeGeneratorState.generatedResume?.id === id) {
      set((s) => ({
        resumeGeneratorState: {
          ...s.resumeGeneratorState,
          generatedResume: null,
        },
      }));
    }
    try {
      await invoke("save_resumes", { data: updated });
    } catch (err) {
      console.error("删除简历失败:", err);
    }
  },
  setResumeGeneratorData: (data) =>
    set((state) => ({
      resumeGeneratorState: { ...state.resumeGeneratorState, data },
    })),
  setGeneratedResume: (generatedResume) =>
    set((state) => ({
      resumeGeneratorState: {
        ...state.resumeGeneratorState,
        generatedResume,
      },
    })),
  setResumeGeneratorDirection: (selectedDirection) =>
    set((state) => ({
      resumeGeneratorState: {
        ...state.resumeGeneratorState,
        selectedDirection,
      },
    })),
  setResumeGeneratorSelectedProjects: (selectedProjects) =>
    set((state) => ({
      resumeGeneratorState: {
        ...state.resumeGeneratorState,
        selectedProjects,
      },
    })),
  setResumeGeneratorOpen: (isOpen) =>
    set((state) => ({
      resumeGeneratorState: { ...state.resumeGeneratorState, isOpen },
    })),
  setResumeGeneratorAnalyzing: (isAnalyzing) =>
    set((state) => ({
      resumeGeneratorState: {
        ...state.resumeGeneratorState,
        isAnalyzing,
      },
    })),
  clearResumeGeneratorState: () =>
    set({ resumeGeneratorState: INITIAL_STATE }),

  // ============== 项目背景知识 ==============
  loadAllKnowledgeFromDisk: async (resolveName) => {
    if (get().knowledgeLoaded) return;
    try {
      const ids = await listResumeKnowledge();
      const docs: Record<string, ProjectKnowledge> = {};
      for (const projectId of ids) {
        const content = await loadResumeKnowledge(projectId);
        if (content == null) continue;
        const meta = resolveName?.(projectId) ?? {};
        docs[projectId] = {
          projectId,
          projectName: meta.name ?? projectId,
          projectPath: meta.path ?? "",
          content,
          updatedAt: new Date().toISOString(),
          userEdited: false,
        };
      }
      set({ knowledgeDocs: docs, knowledgeLoaded: true });
    } catch (err) {
      console.error("加载项目背景知识失败:", err);
      set({ knowledgeLoaded: true });
    }
  },
  upsertKnowledge: async (doc, userEdited) => {
    const next: ProjectKnowledge = {
      ...doc,
      userEdited,
      updatedAt: new Date().toISOString(),
    };
    set((s) => ({
      knowledgeDocs: { ...s.knowledgeDocs, [doc.projectId]: next },
    }));
    try {
      await saveResumeKnowledge(doc.projectId, doc.content, userEdited);
    } catch (err) {
      console.error("保存项目背景知识失败:", err);
      throw err;
    }
  },
  setKnowledgeInMemory: (doc) =>
    set((s) => ({ knowledgeDocs: { ...s.knowledgeDocs, [doc.projectId]: doc } })),
  removeKnowledge: async (projectId) => {
    set((s) => {
      const next = { ...s.knowledgeDocs };
      delete next[projectId];
      return { knowledgeDocs: next };
    });
    try {
      await deleteResumeKnowledge(projectId);
    } catch (err) {
      console.error("删除项目背景知识失败:", err);
    }
  },
  getKnowledge: (projectId) => get().knowledgeDocs[projectId],

  // ============== Agent 运行状态 ==============
  startKnowledgeRun: (projectId, requestId) =>
    set((s) => ({
      knowledgeRuns: {
        ...s.knowledgeRuns,
        [projectId]: {
          status: "running",
          steps: [],
          requestId,
          startedAt: Date.now(),
        },
      },
    })),
  appendKnowledgeStep: (projectId, step) =>
    set((s) => {
      const cur = s.knowledgeRuns[projectId];
      if (!cur) return s;
      return {
        knowledgeRuns: {
          ...s.knowledgeRuns,
          [projectId]: {
            ...cur,
            steps: [...cur.steps, step].slice(-MAX_STEPS),
          },
        },
      };
    }),
  finishKnowledgeRun: (projectId, error) =>
    set((s) => {
      const cur = s.knowledgeRuns[projectId];
      if (!cur) return s;
      return {
        knowledgeRuns: {
          ...s.knowledgeRuns,
          [projectId]: {
            ...cur,
            status: error ? "error" : "done",
            error,
          },
        },
      };
    }),
  clearKnowledgeRun: (projectId) =>
    set((s) => {
      if (!s.knowledgeRuns[projectId]) return s;
      const next = { ...s.knowledgeRuns };
      delete next[projectId];
      return { knowledgeRuns: next };
    }),
  startResumeRun: (requestId) =>
    set({
      resumeRun: {
        status: "running",
        steps: [],
        requestId,
        startedAt: Date.now(),
      },
    }),
  appendResumeStep: (step) =>
    set((s) => {
      if (!s.resumeRun) return s;
      return {
        resumeRun: {
          ...s.resumeRun,
          steps: [...s.resumeRun.steps, step].slice(-MAX_STEPS),
        },
      };
    }),
  finishResumeRun: (error) =>
    set((s) => {
      if (!s.resumeRun) return s;
      return {
        resumeRun: {
          ...s.resumeRun,
          status: error ? "error" : "done",
          error,
        },
      };
    }),
  clearResumeRun: () => set({ resumeRun: null }),
}));
