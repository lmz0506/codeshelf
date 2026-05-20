import { useMemo, useState } from "react";
import {
  Loader2,
  Wand2,
  FileDown,
  Save,
  Edit3,
  RotateCcw,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  FileText as FileIcon,
} from "lucide-react";
import type { AiProviderConfig } from "@/types";
import type {
  JobDirection,
  Tone,
  ProjectKnowledge,
  ResumeV2,
  ResumeProjectExperience,
  STARExperience,
} from "@/types/resume";
import { runResumeAgent } from "@/services/resume/agents/resumeAgent";
import { exportResumeV2ToMarkdownWithDialog } from "@/services/resume/export";
import { Button, showToast } from "@/components/ui";
import { EmptyState } from "@/components/common";

interface ResumePanelV2Props {
  knowledgeDocs: ProjectKnowledge[];
  provider: AiProviderConfig | null;
  jobDirection: JobDirection;
  jdKeywords: string[];
  tone: Tone;
  resume: ResumeV2 | null;
  onResumeChange: (r: ResumeV2 | null) => void;
  onSaveResume: (r: ResumeV2) => Promise<void>;
}

export function ResumePanelV2({
  knowledgeDocs,
  provider,
  jobDirection,
  jdKeywords,
  tone,
  resume,
  onResumeChange,
  onSaveResume,
}: ResumePanelV2Props) {
  const [running, setRunning] = useState(false);
  const [runningSteps, setRunningSteps] = useState<string[]>([]);

  const ready = knowledgeDocs.length > 0 && !!provider;

  const handleGenerate = async () => {
    if (!provider) {
      showToast("warning", "请先配置默认 AI 供应商");
      return;
    }
    if (knowledgeDocs.length === 0) {
      showToast("warning", "请先在「背景知识」页生成至少一份项目背景");
      return;
    }
    setRunning(true);
    setRunningSteps([]);
    try {
      const next = await runResumeAgent({
        knowledgeDocs,
        provider,
        jobDirection,
        jdKeywords,
        tone,
        onStep: (step) => {
          setRunningSteps((prev) => {
            const label =
              step.kind === "tool_call"
                ? `调用 ${step.label ?? "tool"}`
                : step.kind === "tool_result"
                ? `${step.label ?? "tool"} 返回`
                : step.kind === "todo_update"
                ? `更新待办${step.detail ? `: ${step.detail}` : ""}`
                : step.kind === "llm_text"
                ? step.label ?? "模型输出"
                : `错误: ${step.detail ?? ""}`;
            return [...prev, label].slice(-30);
          });
        },
      });
      onResumeChange(next);
      showToast("success", "简历已生成");
    } catch (err) {
      showToast("error", `生成失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  };

  const handleUpdateExperience = (updated: ResumeProjectExperience) => {
    if (!resume) return;
    const next: ResumeV2 = {
      ...resume,
      experiences: resume.experiences.map((e) =>
        e.projectId === updated.projectId ? updated : e
      ),
      updatedAt: new Date().toISOString(),
    };
    onResumeChange(next);
  };

  const handleExportMarkdown = async () => {
    if (!resume) return;
    try {
      const filePath = await exportResumeV2ToMarkdownWithDialog(resume);
      if (filePath) showToast("success", `已导出到 ${filePath}`);
    } catch (err) {
      showToast("error", `导出失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSave = async () => {
    if (!resume) return;
    try {
      await onSaveResume(resume);
      showToast("success", "已保存");
    } catch (err) {
      showToast("error", `保存失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-gray-500">
          基于 {knowledgeDocs.length} 份背景知识 · 岗位「{jobDirection}」 · 语气「{tone}」
          {jdKeywords.length > 0 && ` · ${jdKeywords.length} 个 JD 关键词`}
        </div>
        <Button
          onClick={handleGenerate}
          disabled={!ready || running}
          variant="primary"
          size="md"
          className="gap-2"
        >
          {running ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Wand2 size={16} />
              {resume ? "重新生成简历" : "生成简历"}
            </>
          )}
        </Button>
      </div>

      {!resume && !running && (
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-200">
          <EmptyState
            icon={FileIcon}
            title="尚未生成简历"
            description="先生成几份项目背景知识，再回来这里出简历"
            className="py-10"
          />
        </div>
      )}

      {running && !resume && (
        <div className="p-6 bg-blue-50 rounded-lg border border-blue-100 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Loader2 size={18} className="animate-spin" />
            Agent 正在基于背景知识撰写项目经历...
          </div>
          {runningSteps.length > 0 && (
            <div className="text-xs text-left text-blue-600/80 max-h-40 overflow-auto w-full max-w-md mx-auto">
              {runningSteps.map((s, i) => (
                <div key={i} className="font-mono py-0.5 truncate">
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {resume && (
        <>
          <ResumeSummary resume={resume} />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">项目经历</h4>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSave}
                  variant="secondary"
                  size="sm"
                  className="gap-1 border-green-200 text-green-700 hover:bg-green-50"
                >
                  <Save size={14} /> 保存
                </Button>
                <Button
                  onClick={handleExportMarkdown}
                  variant="secondary"
                  size="sm"
                  className="gap-1"
                >
                  <FileDown size={14} /> 导出 Markdown
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              {resume.experiences.map((exp) => (
                <ExperienceCard
                  key={exp.projectId}
                  experience={exp}
                  onUpdate={handleUpdateExperience}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ResumeSummary({ resume }: { resume: ResumeV2 }) {
  return (
    <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
      {resume.summary && (
        <div>
          <h4 className="text-xs text-gray-500 mb-1">个人简介</h4>
          <p className="text-sm text-gray-800">{resume.summary}</p>
        </div>
      )}
      <div>
        <h4 className="text-xs text-gray-500 mb-1">技能词云</h4>
        <div className="flex flex-wrap gap-1.5">
          {resume.skills.length === 0 ? (
            <span className="text-xs text-gray-400">无</span>
          ) : (
            resume.skills.map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 rounded-full text-xs bg-white border border-gray-200 text-gray-700"
              >
                {s}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ExperienceCard({
  experience,
  onUpdate,
}: {
  experience: ResumeProjectExperience;
  onUpdate: (e: ResumeProjectExperience) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<STARExperience>(experience.starExperience);

  const hasContent = useMemo(() => {
    const s = experience.starExperience;
    return !!(s.situation || s.task || s.action || s.result);
  }, [experience.starExperience]);

  const startEdit = () => {
    setDraft(experience.starExperience);
    setEditing(true);
    setExpanded(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(experience.starExperience);
  };
  const save = () => {
    onUpdate({ ...experience, starExperience: draft, isEdited: true });
    setEditing(false);
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer"
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
          {experience.techStack.length > 0 && (
            <div className="text-xs text-gray-500 mt-0.5 truncate">
              {experience.techStack.slice(0, 6).join(" · ")}
              {experience.techStack.length > 6 && ` +${experience.techStack.length - 6}`}
            </div>
          )}
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-gray-400" />
        ) : (
          <ChevronDown size={16} className="text-gray-400" />
        )}
      </div>

      {expanded && (
        <div className="p-4">
          {editing ? (
            <div className="space-y-3">
              {(["situation", "task", "action", "result"] as const).map((k) => (
                <div key={k}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {labelOf(k)}
                  </label>
                  <textarea
                    rows={k === "action" ? 4 : 3}
                    value={draft[k]}
                    onChange={(e) => setDraft((p) => ({ ...p, [k]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                (["situation", "task", "action", "result"] as const).map((k) =>
                  experience.starExperience[k] ? (
                    <div key={k}>
                      <h6 className="text-xs font-medium text-gray-700 mb-1">{labelOf(k)}</h6>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {experience.starExperience[k]}
                      </p>
                    </div>
                  ) : null
                )
              ) : (
                <div className="text-center py-4 text-gray-400 text-sm">暂无内容</div>
              )}
              <div className="flex items-center justify-end pt-2 border-t border-gray-100">
                <Button
                  onClick={startEdit}
                  variant="secondary"
                  size="sm"
                  className="gap-1 border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                  {hasContent ? <Edit3 size={12} /> : <RotateCcw size={12} />}
                  {hasContent ? "编辑" : "手动填写"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function labelOf(key: "situation" | "task" | "action" | "result"): string {
  return {
    situation: "S - 项目背景",
    task: "T - 承担任务",
    action: "A - 技术行动",
    result: "R - 项目成果",
  }[key];
}
