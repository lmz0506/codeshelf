import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Loader2,
  FileDown,
  Save,
  Edit3,
  RotateCcw,
  Check,
  X,
  Plus,
  ChevronDown,
  ChevronUp,
  FileText as FileIcon,
  Eye,
  User,
  BriefcaseBusiness,
  GraduationCap,
  Link as LinkIcon,
  Trash2,
  Upload,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { AiProviderConfig } from "@/types";
import type {
  JobDirection,
  PersonalInfo,
  ProjectKnowledge,
  ResumeV2,
  ResumeProjectExperience,
  STARExperience,
  WorkExperience,
  PersonalWebsite,
  EducationExperience,
  PersonalCustomField,
} from "@/types/resume";
import type { AgentStep } from "@/services/resume/agents/resumeAgent";
import {
  generateSummaryFragment,
  polishWorkExperienceFragment,
  regenerateProjectExperienceFragment,
} from "@/services/resume/agents/resumeFragments";
import { useResumeStore } from "@/stores/resumeStore";
import {
  exportResumeV2ToDocxWithDialog,
  exportResumeV2ToMarkdownWithDialog,
} from "@/services/resume/export";
import { Button, showToast } from "@/components/ui";
import { Dialog, EmptyState } from "@/components/common";
import { MarkdownRenderer } from "@/components/project/MarkdownRenderer";
import { ResumePreviewDialog } from "./ResumePreview";

interface ResumePanelV2Props {
  knowledgeDocs: ProjectKnowledge[];
  provider: AiProviderConfig | null;
  jobDirection: JobDirection;
  onJobDirectionChange: (d: JobDirection) => void;
  resume: ResumeV2 | null;
  personalInfo: PersonalInfo;
  onResumeChange: (r: ResumeV2 | null) => void;
  onPersonalInfoChange: (info: PersonalInfo) => void;
  onSaveResume: (r: ResumeV2) => Promise<void>;
}

type RefineTask =
  | { kind: "summary_generate" | "summary_polish" }
  | { kind: "work_polish"; workId: string }
  | { kind: "project_regenerate"; projectId: string };

const DEFAULT_TONE = "professional" as const;
const EMPTY_JD_KEYWORDS: string[] = [];

export function ResumePanelV2({
  knowledgeDocs,
  provider,
  jobDirection,
  onJobDirectionChange,
  resume,
  personalInfo,
  onResumeChange,
  onPersonalInfoChange,
  onSaveResume,
}: ResumePanelV2Props) {
  const {
    resumeRun,
    startResumeRun,
    appendResumeStep,
    finishResumeRun,
    knowledgeDocs: allKnowledgeDocMap,
  } = useResumeStore();
  const running = resumeRun?.status === "running";
  const [previewOpen, setPreviewOpen] = useState(false);
  const [refineTask, setRefineTask] = useState<RefineTask | null>(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refineRunning, setRefineRunning] = useState(false);
  const [docxExporting, setDocxExporting] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addSelectedProjectIds, setAddSelectedProjectIds] = useState<string[]>([]);
  const [addRunning, setAddRunning] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generateSelectedProjectIds, setGenerateSelectedProjectIds] = useState<string[]>([]);

  // 生成 / 润色 / 新增 任一在进行时，禁用其它所有简历操作按钮，避免并发 AI 调用相互覆盖。
  const busy = running || refineRunning || addRunning;

  const allKnowledgeDocs = useMemo(() => Object.values(allKnowledgeDocMap), [allKnowledgeDocMap]);
  const ready = allKnowledgeDocs.length > 0 && !!provider;
  const knowledgeDocByProjectId = useMemo(() => {
    const map = new Map<string, ProjectKnowledge>();
    allKnowledgeDocs.forEach((doc) => map.set(doc.projectId, doc));
    return map;
  }, [allKnowledgeDocs]);
  const availableKnowledgeDocs = useMemo(() => {
    const used = new Set(resume?.experiences.map((item) => item.projectId) ?? []);
    return allKnowledgeDocs.filter((doc) => !used.has(doc.projectId));
  }, [allKnowledgeDocs, resume]);
  const generatedExperienceProjectIds = useMemo(
    () => new Set(resume?.experiences.map((item) => item.projectId) ?? []),
    [resume]
  );

  const executeGenerate = async (docs: ProjectKnowledge[]) => {
    if (!provider) {
      showToast("warning", "请先配置默认 AI 供应商");
      return;
    }
    if (docs.length === 0) {
      showToast("warning", "请至少选择一份项目背景知识");
      return;
    }
    const requestId = generateRequestId();
    startResumeRun(requestId);
    try {
      const baseResume = resume ?? createDraftResume(jobDirection);
      const selectedProjectIds = new Set(docs.map((doc) => doc.projectId));
      const sourceExperiences = docs.map((doc) =>
        baseResume.experiences.find((item) => item.projectId === doc.projectId)
          ?? createEmptyProjectExperience(doc)
      );
      appendResumeStep({
        kind: "llm_text",
        label: "准备项目经历",
        detail: `${sourceExperiences.length} 个项目`,
        ts: Date.now(),
      });

      const experiences: ResumeProjectExperience[] = [];
      for (const [index, experience] of sourceExperiences.entries()) {
        appendResumeStep({
          kind: "llm_text",
          label: "生成项目经历",
          detail: `${index + 1}/${sourceExperiences.length} ${experience.projectName}`,
          ts: Date.now(),
        });
        const updated = await regenerateProjectExperienceFragment({
          provider,
          jobDirection,
          jdKeywords: EMPTY_JD_KEYWORDS,
          tone: DEFAULT_TONE,
          knowledgeDocs: docs.filter((doc) => doc.projectId === experience.projectId),
          projectId: experience.projectId,
          currentExperience: experience,
          skills: baseResume.skills,
          instruction: "",
        });
        experiences.push(updated);
      }

      const generatedSkills = uniqueTags(experiences.flatMap((item) => item.techStack));
      const generatedByProjectId = new Map(
        experiences.map((item) => [item.projectId, item] as const)
      );
      const mergedExperiences = baseResume.experiences.map((item) =>
        generatedByProjectId.get(item.projectId) ?? item
      );
      experiences.forEach((item) => {
        if (!baseResume.experiences.some((exp) => exp.projectId === item.projectId)) {
          mergedExperiences.push(item);
        }
      });
      const orderedExperiences = [
        ...mergedExperiences.filter((item) => selectedProjectIds.has(item.projectId)),
        ...mergedExperiences.filter((item) => !selectedProjectIds.has(item.projectId)),
      ];
      const skills = uniqueTags(orderedExperiences.flatMap((item) => item.techStack));
      appendResumeStep({
        kind: "llm_text",
        label: "生成核心技能标签",
        detail: `${skills.length} 个`,
        ts: Date.now(),
      });

      const next: ResumeV2 = {
        ...baseResume,
        jobDirection,
        jdKeywords: EMPTY_JD_KEYWORDS,
        tone: DEFAULT_TONE,
        experiences: orderedExperiences,
        skills,
        updatedAt: new Date().toISOString(),
      };
      onResumeChange(next);

      if (!personalInfo.summary?.trim()) {
        appendResumeStep({
          kind: "llm_text",
          label: "生成个人简介",
          detail: "当前个人简介为空",
          ts: Date.now(),
        });
        const summary = await generateSummaryFragment({
          kind: "summary_generate",
          provider,
          jobDirection,
          jdKeywords: EMPTY_JD_KEYWORDS,
          tone: DEFAULT_TONE,
          knowledgeDocs: docs,
          personalInfo,
          skills,
          instruction: "",
        });
        onPersonalInfoChange({ ...personalInfo, summary });
      } else {
        appendResumeStep({
          kind: "llm_text",
          label: "保留个人简介",
          detail: "已有内容，不自动覆盖",
          ts: Date.now(),
        });
      }

      finishResumeRun();
      showToast("success", "简历生成完成", `已生成 ${experiences.length} 个项目内容`, 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      finishResumeRun(msg);
      showToast("error", `生成失败: ${msg}`);
    }
  };

  const openGenerateDialog = () => {
    const defaults = allKnowledgeDocs
      .filter((doc) => !generatedExperienceProjectIds.has(doc.projectId))
      .map((doc) => doc.projectId);
    setGenerateSelectedProjectIds(defaults);
    setGenerateDialogOpen(true);
  };

  const closeGenerateDialog = () => {
    if (running) return;
    setGenerateDialogOpen(false);
    setGenerateSelectedProjectIds([]);
  };

  const toggleGenerateProject = (projectId: string) => {
    setGenerateSelectedProjectIds((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  };

  const handleGenerateFromSelection = async () => {
    const docs = allKnowledgeDocs.filter((doc) => generateSelectedProjectIds.includes(doc.projectId));
    if (docs.length === 0) return;
    // 先关弹窗再生成：生成过程会持续向主面板流式追加步骤（含 loading 动画），
    // 半透明遮罩长时间盖在不断重绘的背景上会触发 WebView 合成花屏。进度改由主面板呈现。
    setGenerateDialogOpen(false);
    setGenerateSelectedProjectIds([]);
    await executeGenerate(docs);
  };

  const handleUpdateExperience = (updated: ResumeProjectExperience) => {
    if (!resume) return;
    const experiences = resume.experiences.map((e) =>
      e.projectId === updated.projectId ? updated : e
    );
    const next: ResumeV2 = {
      ...resume,
      experiences,
      skills: uniqueTags(experiences.flatMap((item) => item.techStack)),
      updatedAt: new Date().toISOString(),
    };
    onResumeChange(next);
  };

  const handleExportMarkdown = async () => {
    if (!resume) return;
    try {
      const filePath = await exportResumeV2ToMarkdownWithDialog({
        ...resume,
        personalInfo,
      });
      if (filePath) showToast("success", `已导出到 ${filePath}`);
    } catch (err) {
      showToast("error", `导出失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExportDocx = async () => {
    if (!resume || docxExporting) return;
    setDocxExporting(true);
    try {
      const filePath = await exportResumeV2ToDocxWithDialog({
        ...resume,
        personalInfo,
      });
      if (filePath) showToast("success", `已导出到 ${filePath}`);
    } catch (err) {
      showToast("error", `导出失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDocxExporting(false);
    }
  };

  const handleSave = async () => {
    if (!resume) return;
    try {
      await onSaveResume({ ...resume, personalInfo });
    } catch (err) {
      showToast("error", `保存失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const updateResume = (patch: Partial<ResumeV2>) => {
    if (!resume) return;
    onResumeChange({
      ...resume,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const openRefineDialog = (task: RefineTask) => {
    setRefineTask(task);
    setRefineInstruction("");
  };

  const closeRefineDialog = () => {
    if (refineRunning) return;
    setRefineTask(null);
    setRefineInstruction("");
  };

  const toggleAddProject = (projectId: string) => {
    setAddSelectedProjectIds((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  };

  const openAddDialog = () => {
    setAddSelectedProjectIds([]);
    setAddDialogOpen(true);
  };

  const closeAddDialog = () => {
    if (addRunning) return;
    setAddDialogOpen(false);
    setAddSelectedProjectIds([]);
  };

  const handleAddExperiences = async () => {
    if (!provider) {
      showToast("warning", "请先配置默认 AI 供应商");
      return;
    }
    if (!resume) {
      showToast("warning", "请先生成一份简历");
      return;
    }
    const docs = availableKnowledgeDocs.filter((doc) => addSelectedProjectIds.includes(doc.projectId));
    if (docs.length === 0) {
      showToast("warning", "请先选择至少一个背景知识项目");
      return;
    }
    setAddRunning(true);
    try {
      const created: ResumeProjectExperience[] = [];
      for (const doc of docs) {
        const generated = await regenerateProjectExperienceFragment({
          provider,
          jobDirection,
          jdKeywords: EMPTY_JD_KEYWORDS,
          tone: DEFAULT_TONE,
          knowledgeDocs: [doc],
          projectId: doc.projectId,
          currentExperience: createEmptyProjectExperience(doc),
          skills: resume.skills,
          instruction: "",
        });
        created.push(generated);
      }
      const nextExperiences = [...resume.experiences, ...created];
      onResumeChange({
        ...resume,
        experiences: nextExperiences,
        skills: uniqueTags(nextExperiences.flatMap((item) => item.techStack)),
        updatedAt: new Date().toISOString(),
      });
      showToast("success", `已新增 ${created.length} 个项目经历`);
      closeAddDialog();
    } catch (err) {
      showToast("error", `新增项目经历失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAddRunning(false);
    }
  };

  const handleConfirmRefine = async () => {
    if (!refineTask) return;
    if (!provider) {
      showToast("warning", "请先配置默认 AI 供应商");
      return;
    }
    const instruction = refineInstruction.trim();
    setRefineRunning(true);
    try {
      if (refineTask.kind === "summary_generate" || refineTask.kind === "summary_polish") {
        const summary = await generateSummaryFragment({
          kind: refineTask.kind,
          provider,
          jobDirection,
          jdKeywords: EMPTY_JD_KEYWORDS,
          tone: DEFAULT_TONE,
          knowledgeDocs,
          personalInfo,
          skills: resume?.skills ?? [],
          instruction,
        });
        onPersonalInfoChange({ ...personalInfo, summary });
        showToast("success", refineTask.kind === "summary_generate" ? "个人简介已生成" : "个人简介已润色");
      } else if (refineTask.kind === "work_polish") {
        const item = personalInfo.workExperiences.find((work) => work.id === refineTask.workId);
        if (!item) throw new Error("工作经历不存在");
        const description = await polishWorkExperienceFragment({
          provider,
          jobDirection,
          jdKeywords: EMPTY_JD_KEYWORDS,
          tone: DEFAULT_TONE,
          knowledgeDocs,
          workExperience: item,
          personalInfo,
          skills: resume?.skills ?? [],
          instruction,
        });
        onPersonalInfoChange({
          ...personalInfo,
          workExperiences: personalInfo.workExperiences.map((work) =>
            work.id === item.id ? { ...work, description } : work
          ),
        });
        showToast("success", "岗位职责已润色");
      } else {
        if (!resume) throw new Error("尚未生成简历");
        const current = resume.experiences.find((exp) => exp.projectId === refineTask.projectId);
        if (!current) throw new Error("项目经历不存在");
        const doc = knowledgeDocByProjectId.get(refineTask.projectId);
        if (!doc) throw new Error("未找到对应的背景知识");
        const updated = await regenerateProjectExperienceFragment({
          provider,
          jobDirection,
          jdKeywords: EMPTY_JD_KEYWORDS,
          tone: DEFAULT_TONE,
          knowledgeDocs: [doc],
          projectId: refineTask.projectId,
          currentExperience: current,
          skills: resume.skills,
          instruction,
        });
        handleUpdateExperience(updated);
        showToast("success", "项目经历已重新生成");
      }
      setRefineTask(null);
      setRefineInstruction("");
    } catch (err) {
      showToast("error", `操作失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefineRunning(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[304px_minmax(0,1fr)]">
      <ResumeSidebar
        ready={ready}
        running={running}
        busy={busy}
        hasResume={!!resume}
        knowledgeCount={allKnowledgeDocs.length}
        jobDirection={jobDirection}
        onJobDirectionChange={onJobDirectionChange}
        onGenerate={openGenerateDialog}
        onPreview={() => setPreviewOpen(true)}
        onSave={handleSave}
        onExportDocx={handleExportDocx}
        onExportMarkdown={handleExportMarkdown}
        docxExporting={docxExporting}
        steps={resumeRun?.steps ?? []}
      />

      <main className="min-w-0 space-y-4">
        <GlobalProfileEditor
          value={personalInfo}
          onChange={onPersonalInfoChange}
          onGenerateSummary={() => openRefineDialog({ kind: "summary_generate" })}
          onPolishSummary={() => openRefineDialog({ kind: "summary_polish" })}
          onPolishWork={(workId) => openRefineDialog({ kind: "work_polish", workId })}
          refineRunning={refineRunning}
          activeRefineTask={refineTask}
          busy={busy}
        />

        {!resume && !running && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white">
            <EmptyState
              icon={FileIcon}
              title="尚未生成简历"
              description="左侧选择岗位方向后，点击 AI 生成简历"
              className="py-12"
            />
          </div>
        )}

        {running && !resume && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-6">
            <div className="flex items-center justify-center gap-2 text-sm text-blue-700">
              <Loader2 size={18} className="animate-spin" />
              模型正在基于背景知识生成简历...
            </div>
          </div>
        )}

        {resume && (
          <>
            <CoreSkillsEditor
              resume={resume}
              onUpdate={(patch) => updateResume(patch)}
              busy={busy}
            />
            <SectionCard
              icon={<FileIcon size={16} />}
              title="项目经历"
              description={`${resume.experiences.length} 个项目，可编辑项目描述、核心职责、项目成果和关键词（技术标签）`}
              action={
                <Button
                  onClick={openAddDialog}
                  variant="secondary"
                  size="sm"
                  className="gap-1"
                  disabled={availableKnowledgeDocs.length === 0 || busy}
                  title={
                    availableKnowledgeDocs.length === 0
                      ? "当前没有可新增的背景知识"
                      : "从已有背景知识新增项目经历"
                  }
                >
                  <Plus size={14} /> 新增项目经历
                </Button>
              }
            >
              <div className="space-y-3">
                {resume.experiences.map((exp) => (
                  <ExperienceCard
                    key={exp.projectId}
                    experience={exp}
                    onUpdate={handleUpdateExperience}
                    onRegenerate={(projectId) => openRefineDialog({ kind: "project_regenerate", projectId })}
                    regenerateRunning={refineRunning && refineTask?.kind === "project_regenerate" && refineTask.projectId === exp.projectId}
                    busy={busy}
                  />
                ))}
              </div>
            </SectionCard>
          </>
        )}
      </main>

      <ResumePreviewDialog
        open={previewOpen}
        resume={resume}
        personalInfo={personalInfo}
        onClose={() => setPreviewOpen(false)}
      />
      <RefineInstructionDialog
        task={refineTask}
        value={refineInstruction}
        running={refineRunning}
        onChange={setRefineInstruction}
        onCancel={closeRefineDialog}
        onConfirm={handleConfirmRefine}
      />
      <AddProjectExperienceDialog
        open={addDialogOpen}
        docs={availableKnowledgeDocs}
        selectedProjectIds={addSelectedProjectIds}
        running={addRunning}
        onToggle={toggleAddProject}
        onCancel={closeAddDialog}
        onConfirm={handleAddExperiences}
      />
      <GenerateProjectSelectionDialog
        open={generateDialogOpen}
        docs={allKnowledgeDocs}
        generatedProjectIds={generatedExperienceProjectIds}
        selectedProjectIds={generateSelectedProjectIds}
        running={running}
        onToggle={toggleGenerateProject}
        onCancel={closeGenerateDialog}
        onConfirm={handleGenerateFromSelection}
      />
    </div>
  );
}

function RefineInstructionDialog({
  task,
  value,
  running,
  onChange,
  onCancel,
  onConfirm,
}: {
  task: RefineTask | null;
  value: string;
  running: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const meta = task ? refineTaskMeta(task) : null;
  return (
    <Dialog
      open={!!task}
      onClose={onCancel}
      title={meta?.title ?? "生成 / 润色"}
      icon={Sparkles}
      size="md"
      closeOnOverlayClick={!running}
      footer={
        <>
          <Button onClick={onCancel} variant="secondary" disabled={running}>
            取消
          </Button>
          <Button onClick={onConfirm} variant="primary" disabled={running} className="gap-1">
            {running && <Loader2 size={14} className="animate-spin" />}
            {running ? "处理中..." : "确认"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm leading-6 text-gray-600">{meta?.description}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">
            补充要求（选填）
          </span>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={5}
            className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={meta?.placeholder}
          />
        </label>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500">
          留空时会使用默认策略：保留事实边界，不虚构数据，增强专业表达和信息密度。
        </div>
      </div>
    </Dialog>
  );
}

function AddProjectExperienceDialog({
  open,
  docs,
  selectedProjectIds,
  running,
  onToggle,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  docs: ProjectKnowledge[];
  selectedProjectIds: string[];
  running: boolean;
  onToggle: (projectId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="新增项目经历"
      icon={Plus}
      size="md"
      closeOnOverlayClick={!running}
      footer={
        <>
          <Button onClick={onCancel} variant="secondary" disabled={running}>
            取消
          </Button>
          <Button
            onClick={onConfirm}
            variant="primary"
            disabled={running || selectedProjectIds.length === 0}
            className="gap-1"
          >
            {running && <Loader2 size={14} className="animate-spin" />}
            {running ? "生成中..." : `生成 ${selectedProjectIds.length} 个项目经历`}
          </Button>
        </>
      }
    >
      {docs.length === 0 ? (
        <EmptyState
          icon={FileIcon}
          title="没有可新增的背景知识"
          description="当前已有背景知识都已经生成过项目经历了。"
          className="py-8"
        />
      ) : (
        <div className="space-y-2">
          <p className="text-sm leading-6 text-gray-600">
            可从尚未生成项目经历的背景知识中选择，直接新增到当前简历。
          </p>
          <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
            {docs.map((doc) => {
              const checked = selectedProjectIds.includes(doc.projectId);
              return (
                <button
                  key={doc.projectId}
                  type="button"
                  onClick={() => onToggle(doc.projectId)}
                  className={`flex w-full items-start justify-between rounded-xl border px-3 py-3 text-left transition ${
                    checked
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-gray-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{doc.projectName}</div>
                    <div className="mt-1 truncate text-xs text-gray-500">{doc.projectPath}</div>
                    <div className="mt-1 text-[11px] text-gray-400">
                      最近更新于 {formatRelativeTime(doc.updatedAt)}
                    </div>
                  </div>
                  <span
                    className={`ml-3 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${
                      checked
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-gray-300 bg-white text-transparent"
                    }`}
                  >
                    <Check size={12} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function GenerateProjectSelectionDialog({
  open,
  docs,
  generatedProjectIds,
  selectedProjectIds,
  running,
  onToggle,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  docs: ProjectKnowledge[];
  generatedProjectIds: Set<string>;
  selectedProjectIds: string[];
  running: boolean;
  onToggle: (projectId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="选择项目背景知识"
      icon={Sparkles}
      size="lg"
      closeOnOverlayClick={!running}
      footer={
        <>
          <Button onClick={onCancel} variant="secondary" disabled={running}>
            取消
          </Button>
          <Button
            onClick={onConfirm}
            variant="primary"
            disabled={running || selectedProjectIds.length === 0}
            className="gap-1"
          >
            {running && <Loader2 size={14} className="animate-spin" />}
            {running ? "生成中..." : `生成 ${selectedProjectIds.length} 个项目内容`}
          </Button>
        </>
      }
    >
      {docs.length === 0 ? (
        <EmptyState
          icon={FileIcon}
          title="没有可用的背景知识"
          description="请先到背景知识页生成至少一份项目背景知识。"
          className="py-8"
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-gray-600">
            默认勾选尚未生成项目经历的项目。你也可以手动选择已生成项目，重新生成对应内容。
          </p>
          <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
            {docs.map((doc) => {
              const checked = selectedProjectIds.includes(doc.projectId);
              const generated = generatedProjectIds.has(doc.projectId);
              return (
                <button
                  key={doc.projectId}
                  type="button"
                  onClick={() => onToggle(doc.projectId)}
                  className={`flex w-full items-start justify-between rounded-xl border px-3 py-3 text-left transition ${
                    checked
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-gray-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium text-gray-900">{doc.projectName}</div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          generated
                            ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {generated ? "已生成项目经历" : "未生成项目经历"}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-gray-500">{doc.projectPath}</div>
                    <div className="mt-1 text-[11px] text-gray-400">
                      最近更新于 {formatRelativeTime(doc.updatedAt)}
                    </div>
                  </div>
                  <span
                    className={`ml-3 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${
                      checked
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-gray-300 bg-white text-transparent"
                    }`}
                  >
                    <Check size={12} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function refineTaskMeta(task: RefineTask): {
  title: string;
  description: string;
  placeholder: string;
} {
  switch (task.kind) {
    case "summary_generate":
      return {
        title: "生成个人简介",
        description: "基于现有个人简介、工作经历、技术栈和项目背景知识，生成面向投递的个人简介。",
        placeholder: "例如：突出 AI+政务经验、团队负责人经历、Java/Spring Cloud 技术深度",
      };
    case "summary_polish":
      return {
        title: "润色个人简介",
        description: "在不改变事实的前提下，提升个人简介的表达密度、岗位匹配度和专业度。",
        placeholder: "例如：更偏后端架构师表达；弱化管理，突出技术落地",
      };
    case "work_polish":
      return {
        title: "润色岗位职责",
        description: "润色当前工作经历的岗位职责，输出 Markdown 要点，适合直接放入简历。",
        placeholder: "例如：突出团队管理、需求交付、AI 项目推进、后端架构治理",
      };
    case "project_regenerate":
      return {
        title: "重新生成项目经历",
        description: "只重新生成当前项目经历，保留项目证据边界，输出项目描述、核心职责和项目成果。",
        placeholder: "例如：职责更聚焦后端；成果不要写虚假指标；突出 AI 模型接入与数据闭环",
      };
  }
}

const JOB_OPTIONS: Array<{ id: JobDirection; name: string; description: string }> = [
  { id: "backend", name: "后端", description: "架构、接口、数据库、工程化" },
  { id: "frontend", name: "前端", description: "组件、体验、性能、工程化" },
  { id: "fullstack", name: "全栈", description: "前后端协同与端到端交付" },
];

function ResumeSidebar({
  ready,
  running,
  busy,
  hasResume,
  knowledgeCount,
  jobDirection,
  onJobDirectionChange,
  onGenerate,
  onPreview,
  onSave,
  onExportDocx,
  onExportMarkdown,
  docxExporting,
  steps,
}: {
  ready: boolean;
  running: boolean;
  busy: boolean;
  hasResume: boolean;
  knowledgeCount: number;
  jobDirection: JobDirection;
  onJobDirectionChange: (d: JobDirection) => void;
  onGenerate: () => void;
  onPreview: () => void;
  onSave: () => void;
  onExportDocx: () => void;
  onExportMarkdown: () => void;
  docxExporting: boolean;
  steps: AgentStep[];
}) {
  const [configOpen, setConfigOpen] = useState(false);
  const direction = JOB_OPTIONS.find((item) => item.id === jobDirection);

  return (
    <aside className="xl:sticky xl:top-4 xl:self-start">
      <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm shadow-emerald-900/5">
        <div className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                <Sparkles size={16} className="text-emerald-600" />
                简历生成
              </div>
              <div className="mt-1 text-xs text-emerald-700/75">
                {knowledgeCount} 份背景知识 · {direction?.name ?? "岗位方向"}
              </div>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm">
              AI
            </span>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <button
            type="button"
            onClick={onGenerate}
            disabled={!ready || busy}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-emerald-500/25 transition hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {running ? "生成中..." : hasResume ? "AI 重新生成内容" : "AI 生成简历"}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onPreview}
              disabled={!hasResume || busy}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Eye size={14} /> 预览
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!hasResume || busy}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={14} /> 保存
            </button>
            <button
              type="button"
              onClick={onExportDocx}
              disabled={!hasResume || docxExporting || busy}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {docxExporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              {docxExporting ? "导出中..." : "导出 docx"}
            </button>
            <button
              type="button"
              onClick={onExportMarkdown}
              disabled={!hasResume || busy}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileIcon size={14} /> 导出 MD
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50/60">
            <button
              type="button"
              onClick={() => setConfigOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
            >
              <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                <SlidersHorizontal size={14} className="text-gray-500" />
                生成配置
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                {direction?.name}
                {configOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>

            {configOpen && (
              <div className="border-t border-gray-200 px-3 pb-3 pt-2">
                <div className="mb-2 text-xs font-medium text-gray-600">岗位方向</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {JOB_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onJobDirectionChange(opt.id)}
                      disabled={busy}
                      className={`rounded-lg border px-2 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        jobDirection === opt.id
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 bg-white text-gray-700 hover:border-emerald-200 hover:bg-white"
                      }`}
                      title={opt.description}
                    >
                      <div className="text-xs font-medium">{opt.name}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 text-[11px] leading-4 text-gray-400">
                  {direction?.description}
                </div>
              </div>
            )}
          </div>

          {running && steps.length > 0 && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <Loader2 size={13} className="animate-spin" />
                生成过程
              </div>
              <div className="max-h-36 space-y-1 overflow-auto text-[11px] leading-4 text-emerald-700/80">
                {steps.slice(-8).map((step, index) => (
                  <div key={index} className="truncate font-mono">
                    {formatStep(step)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function SectionCard({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm shadow-emerald-900/5">
      <div className="flex items-start justify-between gap-3 border-b border-emerald-50 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 rounded-lg bg-emerald-50 p-1.5 text-emerald-600">{icon}</div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
            {description && (
              <p className="mt-0.5 text-xs leading-5 text-gray-500">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function GlobalProfileEditor({
  value,
  onChange,
  onGenerateSummary,
  onPolishSummary,
  onPolishWork,
  refineRunning,
  activeRefineTask,
  busy,
}: {
  value: PersonalInfo;
  onChange: (next: PersonalInfo) => void;
  onGenerateSummary: () => void;
  onPolishSummary: () => void;
  onPolishWork: (workId: string) => void;
  refineRunning: boolean;
  activeRefineTask: RefineTask | null;
  busy: boolean;
}) {
  const basic = value.basic;
  const job = value.jobPreference;
  const websites = value.social.websites ?? [];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const updateBasic = (patch: Partial<PersonalInfo["basic"]>) =>
    onChange({ ...value, basic: { ...value.basic, ...patch } });
  const updateJob = (patch: Partial<PersonalInfo["jobPreference"]>) =>
    onChange({ ...value, jobPreference: { ...value.jobPreference, ...patch } });
  const updateWebsites = (next: PersonalWebsite[]) =>
    onChange({ ...value, social: { ...value.social, websites: next } });
  const updateCustomFields = (next: PersonalCustomField[]) =>
    onChange({ ...value, customFields: next });
  const updateWorkExperiences = (next: WorkExperience[]) =>
    onChange({ ...value, workExperiences: next });
  const updateEducations = (next: EducationExperience[]) =>
    onChange({ ...value, educations: next });

  const handleAvatarFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("warning", "请选择图片文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") updateBasic({ avatarUrl: reader.result });
    };
    reader.onerror = () => showToast("error", "头像读取失败");
    reader.readAsDataURL(file);
  };

  return (
    <>
      <SectionCard
        icon={<User size={16} />}
        title="基本信息"
        description="全局维护一份，所有简历预览、保存和导出都会使用"
      >
        <div className="grid gap-5 lg:grid-cols-[132px_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 text-2xl font-semibold text-gray-500 transition hover:border-emerald-300 hover:bg-emerald-50"
              title="上传头像"
            >
              {basic.avatarUrl ? (
                <img src={basic.avatarUrl} alt="头像" className="h-full w-full object-cover" />
              ) : (
                (basic.name || "头像").slice(0, 1)
              )}
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gray-950/65 py-1 text-[11px] font-normal text-white opacity-0 transition group-hover:opacity-100">
                <Upload size={11} /> 上传
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                handleAvatarFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            {basic.avatarUrl && (
              <button
                type="button"
                onClick={() => updateBasic({ avatarUrl: undefined })}
                className="text-xs text-gray-400 hover:text-red-600"
              >
                移除头像
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <ProfileField label="姓名" value={basic.name ?? ""} onChange={(name) => updateBasic({ name })} />
              <ProfileField label="手机" value={basic.phone ?? ""} onChange={(phone) => updateBasic({ phone })} />
              <ProfileField label="邮箱" value={basic.email ?? ""} onChange={(email) => updateBasic({ email })} />
              <ProfileField label="工作经验" value={basic.workExperience ?? ""} onChange={(workExperience) => updateBasic({ workExperience })} placeholder="如 3 年" />
              <ProfileField label="求职岗位" value={job.expectedPosition ?? ""} onChange={(expectedPosition) => updateJob({ expectedPosition })} />
              <ProfileField label="期望薪资" value={job.expectedSalary ?? ""} onChange={(expectedSalary) => updateJob({ expectedSalary })} placeholder="如 15-20K" />
            </div>
            <CustomFieldEditor
              fields={value.customFields ?? []}
              onChange={updateCustomFields}
            />
            <WebsiteEditor websites={websites} onChange={updateWebsites} />
          </div>
        </div>
      </SectionCard>

      <SummaryEditor
        value={value.summary ?? ""}
        onChange={(summary) => onChange({ ...value, summary })}
        onGenerate={onGenerateSummary}
        onPolish={onPolishSummary}
        busy={busy}
      />

      <WorkExperienceEditor
        items={value.workExperiences}
        onChange={updateWorkExperiences}
        onPolish={onPolishWork}
        activePolishId={activeRefineTask?.kind === "work_polish" ? activeRefineTask.workId : null}
        polishRunning={refineRunning}
        busy={busy}
      />

      <EducationEditor
        items={value.educations}
        onChange={updateEducations}
      />
    </>
  );
}

function SummaryEditor({
  value,
  onChange,
  onGenerate,
  onPolish,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  onPolish: () => void;
  busy: boolean;
}) {
  return (
    <SectionCard
      icon={<Sparkles size={16} />}
      title="个人简介"
      description="围绕工作经验方向、技术能力和项目领域生成或润色"
      action={
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            <Sparkles size={12} /> AI 生成
          </button>
          <button
            type="button"
            onClick={onPolish}
            disabled={busy || !value.trim()}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Edit3 size={12} /> 润色
          </button>
        </div>
      }
    >
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
        placeholder="用 2-4 句话概括经验方向、技术能力、项目领域和岗位定位"
      />
    </SectionCard>
  );
}

function CoreSkillsEditor({
  resume,
  onUpdate,
  busy,
}: {
  resume: ResumeV2;
  onUpdate: (patch: Partial<ResumeV2>) => void;
  busy: boolean;
}) {
  const [newSkill, setNewSkill] = useState("");
  const addSkill = () => {
    const value = normalizeTag(newSkill);
    if (!value) return;
    onUpdate({ skills: uniqueTags([...resume.skills, value]) });
    setNewSkill("");
  };
  return (
    <SectionCard
      icon={<FileIcon size={16} />}
      title="核心技能"
      description="技能标签会完整展示，并支持新增或删除"
    >
      <div>
        <div className="flex flex-wrap gap-1.5">
          {resume.skills.length === 0 ? (
            <span className="text-xs text-gray-400">无</span>
          ) : (
            resume.skills.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
              >
                {s}
                <button
                  type="button"
                  onClick={() => onUpdate({ skills: resume.skills.filter((item) => item !== s) })}
                  disabled={busy}
                  className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`删除 ${s}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="mt-2 flex max-w-md gap-2">
          <input
            value={newSkill}
            onChange={(event) => setNewSkill(event.target.value)}
            disabled={busy}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addSkill();
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="新增核心技能，回车确认"
          />
          <Button type="button" onClick={addSkill} variant="secondary" size="sm" className="gap-1" disabled={busy}>
            <Plus size={12} /> 新增
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </label>
  );
}

function WebsiteEditor({
  websites,
  onChange,
}: {
  websites: PersonalWebsite[];
  onChange: (next: PersonalWebsite[]) => void;
}) {
  const add = () => onChange([...websites, { id: makeId("site"), label: "", url: "" }]);
  const update = (id: string, patch: Partial<PersonalWebsite>) =>
    onChange(websites.map((item) => item.id === id ? { ...item, ...patch } : item));
  const remove = (id: string) => onChange(websites.filter((item) => item.id !== id));
  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LinkIcon size={15} className="text-gray-500" />
          <h5 className="text-sm font-medium text-gray-900">网站链接</h5>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={add} className="gap-1">
          <Plus size={12} /> 添加
        </Button>
      </div>
      <div className="space-y-2">
        {websites.length === 0 && <div className="text-xs text-gray-400">可添加 GitHub、博客、作品集等多个链接。</div>}
        {websites.map((item) => (
          <div key={item.id} className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_32px]">
              <input
                value={item.label}
                onChange={(event) => update(item.id, { label: event.target.value })}
                placeholder="名称"
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <input
              value={item.url}
              onChange={(event) => update(item.id, { url: event.target.value })}
              placeholder="https://..."
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="inline-flex items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
              aria-label="删除网站"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomFieldEditor({
  fields,
  onChange,
}: {
  fields: PersonalCustomField[];
  onChange: (next: PersonalCustomField[]) => void;
}) {
  const add = () => onChange([...fields, { id: makeId("field"), label: "", value: "" }]);
  const update = (id: string, patch: Partial<PersonalCustomField>) =>
    onChange(fields.map((item) => item.id === id ? { ...item, ...patch } : item));
  const remove = (id: string) => onChange(fields.filter((item) => item.id !== id));
  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <div key={field.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px]">
          <input
            value={field.label}
            onChange={(event) => update(field.id, { label: event.target.value })}
            placeholder="字段名称"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            value={field.value}
            onChange={(event) => update(field.id, { value: event.target.value })}
            placeholder="字段内容"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => remove(field.id)}
            className="inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
            aria-label="删除自定义字段"
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-emerald-300 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50"
      >
        <Plus size={15} /> 新增自定义字段
      </button>
    </div>
  );
}

function WorkExperienceEditor({
  items,
  onChange,
  onPolish,
  activePolishId,
  polishRunning,
  busy,
}: {
  items: WorkExperience[];
  onChange: (next: WorkExperience[]) => void;
  onPolish: (workId: string) => void;
  activePolishId: string | null;
  polishRunning: boolean;
  busy: boolean;
}) {
  const add = () => onChange([...items, { id: makeId("work"), company: "", position: "", startDate: "", endDate: "", description: "" }]);
  const update = (id: string, patch: Partial<WorkExperience>) =>
    onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const remove = (id: string) => onChange(items.filter((item) => item.id !== id));
  return (
    <SectionCard
      icon={<BriefcaseBusiness size={16} />}
      title="工作经历"
      description="单独维护，可按 Markdown 要点填写职责"
      action={
        <Button type="button" size="sm" variant="secondary" onClick={add} className="shrink-0 gap-1">
          <Plus size={12} /> 添加
        </Button>
      }
    >
      <div className="space-y-3">
        {items.length === 0 && <div className="text-xs text-gray-400">没有工作经历时可以留空。</div>}
        {items.map((item, index) => (
          <div key={item.id} className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">工作经历 {index + 1}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onPolish(item.id)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {polishRunning && activePolishId === item.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  润色职责
                </button>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="删除工作经历"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={item.company ?? ""} onChange={(event) => update(item.id, { company: event.target.value })} placeholder="公司名称" className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500" />
              <input value={item.position ?? ""} onChange={(event) => update(item.id, { position: event.target.value })} placeholder="职位" className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500" />
              <input value={item.startDate ?? ""} onChange={(event) => update(item.id, { startDate: event.target.value })} placeholder="开始时间" className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500" />
              <input value={item.endDate ?? ""} onChange={(event) => update(item.id, { endDate: event.target.value })} placeholder="结束时间 / 至今" className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <textarea
              value={item.description ?? ""}
              onChange={(event) => update(item.id, { description: event.target.value })}
              rows={4}
              className="mt-2 w-full resize-y rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs leading-5 outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="- 负责...\n- 推动..."
            />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function EducationEditor({
  items,
  onChange,
}: {
  items: EducationExperience[];
  onChange: (next: EducationExperience[]) => void;
}) {
  const add = () => onChange([...items, { id: makeId("edu"), school: "", degree: "", startDate: "", endDate: "" }]);
  const update = (id: string, patch: Partial<EducationExperience>) =>
    onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const remove = (id: string) => onChange(items.filter((item) => item.id !== id));
  return (
    <SectionCard
      icon={<GraduationCap size={16} />}
      title="教育背景"
      description="可添加多条，仅保留学校、学历和起止时间"
      action={
        <Button type="button" size="sm" variant="secondary" onClick={add} className="shrink-0 gap-1">
          <Plus size={12} /> 添加
        </Button>
      }
    >
      <div className="space-y-3">
        {items.length === 0 && <div className="text-xs text-gray-400">没有教育背景时可以留空。</div>}
        {items.map((item, index) => (
          <div key={item.id} className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">教育背景 {index + 1}</span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label="删除教育背景"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <input value={item.school ?? ""} onChange={(event) => update(item.id, { school: event.target.value })} placeholder="学校" className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500" />
              <input value={item.degree ?? ""} onChange={(event) => update(item.id, { degree: event.target.value })} placeholder="学历" className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500" />
              <input value={item.startDate ?? ""} onChange={(event) => update(item.id, { startDate: event.target.value })} placeholder="开始时间" className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500" />
              <input value={item.endDate ?? ""} onChange={(event) => update(item.id, { endDate: event.target.value })} placeholder="结束时间" className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ExperienceCard({
  experience,
  onUpdate,
  onRegenerate,
  regenerateRunning,
  busy,
}: {
  experience: ResumeProjectExperience;
  onUpdate: (e: ResumeProjectExperience) => void;
  onRegenerate: (projectId: string) => void;
  regenerateRunning: boolean;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<STARExperience>(experience.starExperience);
  const [draftProjectTime, setDraftProjectTime] = useState(experience.projectTime ?? "");
  const [draftProjectRole, setDraftProjectRole] = useState(experience.projectRole ?? "");
  const [draftTechStack, setDraftTechStack] = useState<string[]>(experience.techStack);
  const [newSkill, setNewSkill] = useState("");

  const hasContent = useMemo(() => {
    const s = experience.starExperience;
    return !!(s.situation || s.task || s.action || s.result);
  }, [experience.starExperience]);

  const startEdit = () => {
    setDraft(experience.starExperience);
    setDraftProjectTime(experience.projectTime ?? "");
    setDraftProjectRole(experience.projectRole ?? "");
    setDraftTechStack(experience.techStack);
    setNewSkill("");
    setEditing(true);
    setExpanded(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(experience.starExperience);
    setDraftProjectTime(experience.projectTime ?? "");
    setDraftProjectRole(experience.projectRole ?? "");
    setDraftTechStack(experience.techStack);
    setNewSkill("");
  };
  const save = () => {
    onUpdate({
      ...experience,
      projectTime: draftProjectTime.trim() || undefined,
      projectRole: draftProjectRole.trim() || undefined,
      techStack: uniqueTags(draftTechStack),
      starExperience: draft,
      isEdited: true,
    });
    setEditing(false);
  };
  const addSkill = () => {
    const next = normalizeTag(newSkill);
    if (!next) return;
    setDraftTechStack((items) => uniqueTags([...items, next]));
    setNewSkill("");
  };

  return (
    <div className="overflow-hidden rounded-lg border border-emerald-100 bg-white">
      <div
        className="flex cursor-pointer items-center justify-between border-b border-emerald-50 bg-emerald-50/30 px-4 py-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h5 className="font-medium text-gray-900 truncate">{experience.projectName}</h5>
            {experience.isEdited && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                已编辑
              </span>
            )}
            {hasContent && !experience.isEdited && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                AI 生成
              </span>
            )}
          </div>
          {(experience.projectTime || experience.projectRole) && (
            <div className="text-xs text-gray-500 mt-0.5 truncate">
              {[experience.projectTime, experience.projectRole].filter(Boolean).join(" · ")}
            </div>
          )}
          {experience.techStack.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {experience.techStack.map((skill) => (
                <SkillPill key={skill} skill={skill} />
              ))}
            </div>
          )}
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRegenerate(experience.projectId);
            }}
            disabled={regenerateRunning || editing || busy}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs text-white hover:bg-emerald-600 disabled:cursor-default disabled:opacity-50"
          >
            {regenerateRunning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            重生成
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (!editing) startEdit();
            }}
            disabled={editing}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:cursor-default disabled:border-gray-200 disabled:text-gray-400"
          >
            {hasContent ? <Edit3 size={12} /> : <RotateCcw size={12} />}
            {editing ? "编辑中" : hasContent ? "编辑" : "填写"}
          </button>
        {expanded ? (
          <ChevronUp size={16} className="text-gray-400" />
        ) : (
          <ChevronDown size={16} className="text-gray-400" />
        )}
        </div>
      </div>

      {expanded && (
        <div className="p-4">
          {editing ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    项目时间
                  </label>
                  <input
                    value={draftProjectTime}
                    onChange={(e) => setDraftProjectTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="如：2024年01月 - 至今；无法确认可留空"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    项目角色
                  </label>
                  <input
                    value={draftProjectRole}
                    onChange={(e) => setDraftProjectRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="如：后端开发工程师 / 核心开发"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  关键词（技术标签）
                </label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {draftTechStack.length === 0 ? (
                      <span className="px-2 py-1 text-xs text-gray-400">暂无标签</span>
                    ) : (
                      draftTechStack.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                        >
                          {skill}
                          <button
                            type="button"
                            onClick={() => setDraftTechStack((items) => items.filter((item) => item !== skill))}
                            className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                            aria-label={`删除 ${skill}`}
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={newSkill}
                      onChange={(event) => setNewSkill(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSkill();
                        }
                      }}
                      className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="新增关键词，回车确认"
                    />
                    <Button type="button" onClick={addSkill} variant="secondary" size="sm" className="gap-1">
                      <Plus size={12} /> 新增
                    </Button>
                  </div>
                </div>
              </div>
              {(["situation", "action", "result"] as const).map((k) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {labelOf(k)}
                  </label>
                  <textarea
                    rows={k === "situation" ? 3 : k === "action" ? 8 : 5}
                    value={draft[k]}
                    onChange={(e) => setDraft((p) => ({ ...p, [k]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={k === "situation" ? "项目描述正文" : "- 第一条\n- 第二条"}
                  />
                </div>
              ))}
              <div className="flex items-center justify-end gap-2">
                <Button onClick={cancelEdit} variant="secondary" size="sm" className="gap-1">
                  <X size={12} /> 取消
                </Button>
                <Button onClick={save} variant="primary" size="sm" className="gap-1">
                  <Check size={12} /> 保存
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {hasContent ? (
                (["situation", "action", "result"] as const).map((k) =>
                  experience.starExperience[k] ? (
                    <div key={k}>
                      <h6 className="text-xs font-medium text-gray-700 mb-1">{labelOf(k)}</h6>
                      {k === "situation" ? (
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {experience.starExperience[k]}
                        </p>
                      ) : (
                        <MarkdownBlock content={experience.starExperience[k]} />
                      )}
                    </div>
                  ) : null
                )
              ) : (
                <div className="text-center py-4 text-gray-400 text-sm">暂无内容</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SkillPill({ skill }: { skill: string }) {
  return (
    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600">
      {skill}
    </span>
  );
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
      <MarkdownRenderer content={content} />
    </div>
  );
}

function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const value = normalizeTag(tag);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function createDraftResume(jobDirection: JobDirection): ResumeV2 {
  const now = new Date().toISOString();
  return {
    id: generateRequestId(),
    createdAt: now,
    updatedAt: now,
    jobDirection,
    jdKeywords: EMPTY_JD_KEYWORDS,
    tone: DEFAULT_TONE,
    summary: "",
    skills: [],
    experiences: [],
    isSaved: false,
  };
}

function createEmptyProjectExperience(doc: ProjectKnowledge): ResumeProjectExperience {
  return {
    projectId: doc.projectId,
    projectName: doc.projectName,
    techStack: [],
    starExperience: {
      situation: "",
      task: "",
      action: "",
      result: "",
    },
    isEdited: false,
    evidenceFiles: [],
  };
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function labelOf(key: "situation" | "action" | "result"): string {
  return {
    situation: "项目描述",
    action: "核心职责",
    result: "项目成果",
  }[key];
}

function formatRelativeTime(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  const diff = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return new Date(value).toLocaleDateString("zh-CN");
}

function formatStep(step: AgentStep): string {
  switch (step.kind) {
    case "tool_call":
      return `调用 ${step.label ?? "tool"}`;
    case "tool_result":
      return `${step.label ?? "tool"} 返回`;
    case "todo_update":
      return `更新待办${step.detail ? `: ${step.detail}` : ""}`;
    case "llm_text":
      return `${step.label ?? "模型输出"}${step.detail ? `: ${step.detail}` : ""}`;
    default:
      return `错误: ${step.detail ?? ""}`;
  }
}

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
