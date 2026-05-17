import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  ResumeDataSource,
  GeneratedResume,
  JobDirection,
} from "@/types/resume";

interface ResumeGeneratorState {
  data: ResumeDataSource | null;
  generatedResume: GeneratedResume | null;
  selectedDirection: JobDirection;
  selectedProjects: string[];
  isOpen: boolean;
  isAnalyzing: boolean;
}

interface ResumeState {
  resumeGeneratorState: ResumeGeneratorState;
  savedResumes: GeneratedResume[];
  setSavedResumes: (resumes: GeneratedResume[]) => void;
  saveCurrentResume: () => Promise<void>;
  loadSavedResume: (resume: GeneratedResume) => void;
  deleteSavedResume: (id: string) => Promise<void>;
  setResumeGeneratorData: (data: ResumeDataSource | null) => void;
  setGeneratedResume: (resume: GeneratedResume | null) => void;
  setResumeGeneratorDirection: (direction: JobDirection) => void;
  setResumeGeneratorSelectedProjects: (projects: string[]) => void;
  setResumeGeneratorOpen: (isOpen: boolean) => void;
  setResumeGeneratorAnalyzing: (isAnalyzing: boolean) => void;
  clearResumeGeneratorState: () => void;
}

const INITIAL_STATE: ResumeGeneratorState = {
  data: null,
  generatedResume: null,
  selectedDirection: "backend",
  selectedProjects: [],
  isOpen: false,
  isAnalyzing: false,
};

export const useResumeStore = create<ResumeState>()((set, get) => ({
  resumeGeneratorState: INITIAL_STATE,
  savedResumes: [],
  setSavedResumes: (savedResumes) => set({ savedResumes }),
  saveCurrentResume: async () => {
    const state = get();
    const resume = state.resumeGeneratorState.generatedResume;
    if (!resume) return;
    const saved = {
      ...resume,
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
    set((s) => ({
      resumeGeneratorState: {
        ...s.resumeGeneratorState,
        generatedResume: saved,
      },
    }));
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
        generatedResume: resume,
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
}));
