export type JobDirection = "backend" | "frontend" | "fullstack";
export type Tone = "professional" | "concise";
export type ToolPermissionMode = "read_only" | "workspace_write" | "full_agent";
export type AgentRunStatus = "running" | "success" | "error" | "cancelled";

export interface AiModelConfig {
  id: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  thinking: boolean;
  stream?: boolean;
  vision?: boolean;
}

export interface AiProviderConfig {
  id: string;
  name: string;
  providerType: string;
  presetKey?: string;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  isDefaultProvider: boolean;
  models: AiModelConfig[];
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  tags: string[];
  labels: string[];
}

export interface SensitiveRule {
  pattern: string;
  enabled?: boolean;
}

export interface ResumeAgentPromptConfig {
  version: string;
  backgroundPrompt: string;
  resumePrompt: string;
}

export interface RunAgentRequest {
  requestId: string;
  project: ProjectInfo;
  provider: AiProviderConfig;
  jobDirection: JobDirection;
  jdKeywords: string[];
  tone: Tone;
  dataDir: string;
  sensitiveRules?: SensitiveRule[];
  promptConfig?: ResumeAgentPromptConfig | null;
  toolPermissionMode?: ToolPermissionMode;
}

export interface KnowledgeInput {
  projectId: string;
  projectName: string;
  projectPath: string;
  content: string;
}

export interface GenerateResumeRequest {
  requestId: string;
  provider: AiProviderConfig;
  jobDirection: JobDirection;
  jdKeywords: string[];
  tone: Tone;
  dataDir: string;
  knowledgeDocs: KnowledgeInput[];
  promptConfig?: ResumeAgentPromptConfig | null;
}

export interface ResumeWorkExperienceInput {
  id: string;
  company?: string;
  position?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface ResumeCustomFieldInput {
  id: string;
  label: string;
  value: string;
}

export interface ResumeProfileInput {
  summary?: string;
  customFields?: ResumeCustomFieldInput[];
  workExperiences?: ResumeWorkExperienceInput[];
}

export type GenerateResumeFragment =
  | {
      kind: "summary_generate" | "summary_polish";
      profile?: ResumeProfileInput;
      skills?: string[];
      instruction?: string;
    }
  | {
      kind: "work_polish";
      workExperience: ResumeWorkExperienceInput;
      profile?: ResumeProfileInput;
      skills?: string[];
      instruction?: string;
    }
  | {
      kind: "project_regenerate";
      projectId: string;
      currentExperience?: ResumeProjectExperience;
      skills?: string[];
      instruction?: string;
    };

export interface GenerateResumeFragmentRequest {
  requestId: string;
  provider: AiProviderConfig;
  jobDirection: JobDirection;
  jdKeywords: string[];
  tone: Tone;
  dataDir: string;
  knowledgeDocs: KnowledgeInput[];
  fragment: GenerateResumeFragment;
}

export interface StarExperience {
  situation: string;
  task: string;
  action: string;
  result: string;
}

export interface ResumeProjectExperience {
  projectId: string;
  projectName: string;
  projectTime?: string;
  projectRole?: string;
  techStack: string[];
  starExperience: StarExperience;
  customDescription?: string;
  isEdited: boolean;
  evidenceFiles?: string[];
}

export interface ResumeV2 {
  id: string;
  createdAt: string;
  updatedAt: string;
  jobDirection: JobDirection;
  jdKeywords: string[];
  tone: Tone;
  summary?: string;
  skills: string[];
  experiences: ResumeProjectExperience[];
  isSaved: boolean;
}

export interface FinalizeAllInput {
  background: string;
  summary?: string;
  skills?: string[];
}

export interface ArtifactRef {
  id: string;
  label: string;
  kind: string;
  chars: number;
}

export type AgentEventType = "system" | "model_call" | "tool_call" | "finalize" | "error";

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  status: string;
  at: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  turnIndex?: number;
  title?: string;
  modelProvider?: string;
  modelName?: string;
  thinkingEnabled?: boolean;
  temperature?: number;
  toolName?: string;
  returnedChars?: number;
  truncated?: boolean;
  blocked?: boolean;
  blockedBy?: string;
  data?: Record<string, unknown>;
  artifacts?: ArtifactRef[];
  error?: string;
}

export interface AgentRunRecord {
  id: string;
  requestId: string;
  projectId: string;
  status: AgentRunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  modelProvider?: string;
  modelName?: string;
  promptSnapshot: ResumeAgentPromptConfig;
  toolPermissionMode: ToolPermissionMode;
  events: AgentEvent[];
  output?: {
    backgroundChars: number;
    resume?: ResumeV2;
  };
  error?: {
    message: string;
    eventId?: string;
  };
}

export interface AgentRunState {
  current?: AgentRunRecord;
}

export interface ArtifactContent {
  artifactId: string;
  content: string;
}

export type RpcRequest =
  | { id: string; method: "run_agent"; params: RunAgentRequest }
  | { id: string; method: "generate_resume"; params: GenerateResumeRequest }
  | { id: string; method: "generate_resume_fragment"; params: GenerateResumeFragmentRequest }
  | { id: string; method: "cancel_run"; params: { requestId: string } }
  | { id: string; method: "get_runs"; params: { dataDir: string; projectId: string } }
  | { id: string; method: "read_artifact"; params: { dataDir: string; projectId: string; artifactId: string } }
  | { id: string; method: "get_prompt_config"; params: { dataDir: string } }
  | { id: string; method: "save_prompt_config"; params: { dataDir: string; config: ResumeAgentPromptConfig } }
  | { id: string; method: "reset_prompt_config"; params: { dataDir: string } }
  | { id: string; method: "load_background"; params: { dataDir: string; projectId: string } }
  | { id: string; method: "save_background"; params: { dataDir: string; projectId: string; content: string } }
  | { id: string; method: "list_background"; params: { dataDir: string } }
  | { id: string; method: "delete_background"; params: { dataDir: string; projectId: string } }
  | { id: string; method: "delete_runs"; params: { dataDir: string; projectId: string } };

export interface RpcResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface RpcEvent {
  type: "event";
  requestId: string;
  projectId: string;
  run: AgentRunRecord;
}
