import { invoke } from "@tauri-apps/api/core";

import type { AiProviderConfig } from "@/types";
import type {
  JobDirection,
  PersonalInfo,
  ProjectKnowledge,
  ResumeProjectExperience,
  Tone,
  WorkExperience,
} from "@/types/resume";

type FragmentKind =
  | "summary_generate"
  | "summary_polish"
  | "work_polish"
  | "project_regenerate";

interface BaseFragmentOptions {
  provider: AiProviderConfig;
  jobDirection: JobDirection;
  jdKeywords: string[];
  tone: Tone;
  knowledgeDocs: ProjectKnowledge[];
}

export interface GenerateSummaryFragmentOptions extends BaseFragmentOptions {
  kind: "summary_generate" | "summary_polish";
  personalInfo: PersonalInfo;
  skills: string[];
  instruction?: string;
}

export interface PolishWorkFragmentOptions extends BaseFragmentOptions {
  workExperience: WorkExperience;
  personalInfo: PersonalInfo;
  skills: string[];
  instruction?: string;
}

export interface RegenerateProjectFragmentOptions extends BaseFragmentOptions {
  projectId: string;
  currentExperience: ResumeProjectExperience;
  skills: string[];
  instruction?: string;
}

export async function generateSummaryFragment(
  options: GenerateSummaryFragmentOptions,
): Promise<string> {
  const result = await invoke<{ summary: string }>("generate_resume_fragment", {
    request: buildRequest(options, {
      kind: options.kind,
      profile: profilePayload(options.personalInfo),
      skills: options.skills,
      instruction: options.instruction ?? "",
    }),
  });
  return result.summary;
}

export async function polishWorkExperienceFragment(
  options: PolishWorkFragmentOptions,
): Promise<string> {
  const result = await invoke<{ description: string }>("generate_resume_fragment", {
    request: buildRequest(options, {
      kind: "work_polish",
      workExperience: options.workExperience,
      profile: profilePayload(options.personalInfo),
      skills: options.skills,
      instruction: options.instruction ?? "",
    }),
  });
  return result.description;
}

export async function regenerateProjectExperienceFragment(
  options: RegenerateProjectFragmentOptions,
): Promise<ResumeProjectExperience> {
  const result = await invoke<{ experience: ResumeProjectExperience }>("generate_resume_fragment", {
    request: buildRequest(options, {
      kind: "project_regenerate",
      projectId: options.projectId,
      currentExperience: options.currentExperience,
      skills: options.skills,
      instruction: options.instruction ?? "",
    }),
  });
  return result.experience;
}

function buildRequest(
  options: BaseFragmentOptions,
  fragment: Record<string, unknown> & { kind: FragmentKind },
) {
  return {
    requestId: generateRequestId(),
    provider: options.provider,
    jobDirection: options.jobDirection,
    jdKeywords: options.jdKeywords,
    tone: options.tone,
    knowledgeDocs: options.knowledgeDocs.map((doc) => ({
      projectId: doc.projectId,
      projectName: doc.projectName,
      projectPath: doc.projectPath,
      content: doc.content,
    })),
    fragment,
  };
}

function profilePayload(info: PersonalInfo) {
  return {
    summary: info.summary ?? "",
    customFields: info.customFields,
    workExperiences: info.workExperiences,
  };
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
