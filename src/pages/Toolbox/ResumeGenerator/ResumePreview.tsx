// 简历预览 / 导出 docx 模态。
//
// 设计动机:用户保存到磁盘的 STAR 数据保持 S/T/A/R 学术风格(便于二次生成、训练),
// 但 HR 端看的简历应该是「项目背景 / 主要职责 / 项目成果」的传统三段式。
// 这个组件是「面向 HR 的渲染层」,转换在 services/resume/preview.ts。
//
// 同时承担「个人信息」收集职责 —— Agent 不会生成基础信息,在这里用户手动填,
// 填好的内容随 ResumeV2.personalInfo 持久化。导出 docx 时整套带过去,空字段也会
// 输出占位结构,用户在 Word 里继续填。

import { useEffect, useMemo, useState } from "react";
import { FileDown, Save, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Dialog } from "@/components/common";
import { Button, showToast } from "@/components/ui";
import type {
  PersonalInfo,
  ResumeV2,
} from "@/types/resume";
import { emptyPersonalInfo } from "@/types/resume";
import {
  formatResume,
  jobDirectionTitle,
  PERSONAL_INFO_BASIC_FIELDS,
  PERSONAL_INFO_EDUCATION_FIELDS,
  PERSONAL_INFO_JOB_FIELDS,
  PERSONAL_INFO_SOCIAL_FIELDS,
} from "@/services/resume/preview";

interface ResumePreviewDialogProps {
  open: boolean;
  resume: ResumeV2 | null;
  /** 用户在面板里改了 personalInfo 后回写到父组件,父组件负责持久化 + setResume */
  onPersonalInfoChange: (info: PersonalInfo) => void;
  onClose: () => void;
}

export function ResumePreviewDialog({
  open,
  resume,
  onPersonalInfoChange,
  onClose,
}: ResumePreviewDialogProps) {
  // 本地 draft,关闭时同步给父组件;期间编辑不会立刻持久化,避免每个字符都触发存储。
  const [draft, setDraft] = useState<PersonalInfo>(() =>
    resume?.personalInfo ?? emptyPersonalInfo()
  );
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(resume?.personalInfo ?? emptyPersonalInfo());
    }
  }, [open, resume]);

  const formatted = useMemo(
    () => (resume ? formatResume(resume) : null),
    [resume]
  );

  if (!resume || !formatted) return null;

  const handleSaveInfo = () => {
    onPersonalInfoChange(draft);
    showToast(
      "success",
      "个人信息已应用,如需永久保存请回到工具栏点「保存」入库"
    );
  };

  const handleExportDocx = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      const defaultName = draft.basic.name
        ? `${draft.basic.name}-${jobDirectionTitle(resume.jobDirection)}-${timestamp}.docx`
        : `resume-${timestamp}.docx`;
      const filePath = await saveDialog({
        filters: [{ name: "Word 文档", extensions: ["docx"] }],
        defaultPath: defaultName,
      });
      if (!filePath) {
        setExporting(false);
        return;
      }
      // 同步 personalInfo 给父组件 + 持久化,然后用最新值导出。
      onPersonalInfoChange(draft);
      const payload: ResumeV2 = { ...resume, personalInfo: draft };
      await invoke<string>("export_resume_docx", {
        resume: payload,
        filePath,
      });
      showToast("success", `已导出到 ${filePath}`);
    } catch (err) {
      showToast(
        "error",
        `导出失败: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`简历预览 · ${formatted.title}`}
      icon={Eye}
      size="xl"
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            关闭
          </Button>
          <Button onClick={handleSaveInfo} variant="secondary" className="gap-1">
            <Save size={14} /> 保存个人信息
          </Button>
          <Button
            onClick={handleExportDocx}
            variant="primary"
            disabled={exporting}
            className="gap-1"
          >
            <FileDown size={14} />
            {exporting ? "导出中..." : "导出 docx"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <PersonalInfoEditor draft={draft} onChange={setDraft} />
        <ResumeBody formatted={formatted} info={draft} />
      </div>
    </Dialog>
  );
}

// =============================================================================
// 个人信息编辑器(4 section 折叠)
// =============================================================================

interface PersonalInfoEditorProps {
  draft: PersonalInfo;
  onChange: (next: PersonalInfo) => void;
}

function PersonalInfoEditor({ draft, onChange }: PersonalInfoEditorProps) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border border-blue-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-blue-50 hover:bg-blue-100"
      >
        <span className="text-sm font-medium text-blue-900">
          个人信息(可留空,导出后在 Word 里手填)
        </span>
        {open ? (
          <ChevronUp size={16} className="text-blue-600" />
        ) : (
          <ChevronDown size={16} className="text-blue-600" />
        )}
      </button>
      {open && (
        <div className="p-4 space-y-4 bg-white">
          <FieldGroup title="基础信息">
            {PERSONAL_INFO_BASIC_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                value={draft.basic[f.key] ?? ""}
                onChange={(v) =>
                  onChange({
                    ...draft,
                    basic: { ...draft.basic, [f.key]: v },
                  })
                }
              />
            ))}
          </FieldGroup>
          <FieldGroup title="教育背景">
            {PERSONAL_INFO_EDUCATION_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                value={draft.education[f.key] ?? ""}
                onChange={(v) =>
                  onChange({
                    ...draft,
                    education: { ...draft.education, [f.key]: v },
                  })
                }
              />
            ))}
          </FieldGroup>
          <FieldGroup title="求职偏好">
            {PERSONAL_INFO_JOB_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                value={draft.jobPreference[f.key] ?? ""}
                onChange={(v) =>
                  onChange({
                    ...draft,
                    jobPreference: { ...draft.jobPreference, [f.key]: v },
                  })
                }
              />
            ))}
          </FieldGroup>
          <FieldGroup title="社交链接">
            {PERSONAL_INFO_SOCIAL_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                value={draft.social[f.key] ?? ""}
                onChange={(v) =>
                  onChange({
                    ...draft,
                    social: { ...draft.social, [f.key]: v },
                  })
                }
              />
            ))}
          </FieldGroup>
        </div>
      )}
    </section>
  );
}

function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs font-medium text-gray-600 mb-2">{title}</h4>
      <div className="grid gap-2 grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-gray-600 w-20 text-right flex-shrink-0">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-800"
      />
    </label>
  );
}

// =============================================================================
// 简历正文渲染
// =============================================================================

interface ResumeBodyProps {
  formatted: ReturnType<typeof formatResume>;
  info: PersonalInfo;
}

function ResumeBody({ formatted, info }: ResumeBodyProps) {
  return (
    <section className="border border-gray-200 rounded-lg p-6 bg-white space-y-5 font-sans">
      {/* 标题 */}
      <header className="text-center pb-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900">
          {info.basic.name ? `${info.basic.name} - ` : ""}
          {formatted.title}简历
        </h2>
      </header>

      {/* 个人信息展示 */}
      <PersonalInfoDisplay info={info} />

      {/* 个人简介 */}
      {formatted.summary && (
        <Section title="个人简介">
          <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
            {formatted.summary}
          </p>
        </Section>
      )}

      {/* 技术栈 */}
      {formatted.skills.length > 0 && (
        <Section title="技术栈">
          <p className="text-sm leading-relaxed text-gray-800">
            {formatted.skills.join(" · ")}
          </p>
        </Section>
      )}

      {/* 项目经历 */}
      {formatted.experiences.length > 0 && (
        <Section title="项目经历">
          <div className="space-y-5">
            {formatted.experiences.map((exp, i) => (
              <article key={`${exp.projectName}-${i}`} className="space-y-2">
                <div className="flex items-start gap-2">
                  <h5 className="text-sm font-medium text-gray-900">
                    {i + 1}. {exp.projectName}
                  </h5>
                </div>
                {exp.techStack.length > 0 && (
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">技术栈:</span>{" "}
                    {exp.techStack.join(", ")}
                  </p>
                )}
                {exp.background && (
                  <FormattedBlock title="项目背景">
                    <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                      {exp.background}
                    </p>
                  </FormattedBlock>
                )}
                {exp.responsibilities.length > 0 && (
                  <FormattedBlock title="主要职责">
                    <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
                      {exp.responsibilities.map((it, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {it}
                        </li>
                      ))}
                    </ul>
                  </FormattedBlock>
                )}
                {exp.achievements.length > 0 && (
                  <FormattedBlock title="项目成果">
                    <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
                      {exp.achievements.map((it, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {it}
                        </li>
                      ))}
                    </ul>
                  </FormattedBlock>
                )}
                {!exp.hasContent && (
                  <p className="text-xs text-gray-400 italic">(本项目暂无内容)</p>
                )}
              </article>
            ))}
          </div>
        </Section>
      )}
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-1 mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function FormattedBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pl-3 border-l-2 border-gray-200">
      <h6 className="text-xs font-medium text-gray-700 mb-1">{title}</h6>
      {children}
    </div>
  );
}

function PersonalInfoDisplay({ info }: { info: PersonalInfo }) {
  const basicRows: Array<[string, string]> = PERSONAL_INFO_BASIC_FIELDS.map((f) => [
    f.label,
    info.basic[f.key] ?? "",
  ]);
  const educationLines = PERSONAL_INFO_EDUCATION_FIELDS.filter(
    (f) => (info.education[f.key] ?? "").trim() !== ""
  ).map((f) => `${f.label}: ${info.education[f.key]}`);
  const jobLines = PERSONAL_INFO_JOB_FIELDS.filter(
    (f) => (info.jobPreference[f.key] ?? "").trim() !== ""
  ).map((f) => `${f.label}: ${info.jobPreference[f.key]}`);
  const socialLines = PERSONAL_INFO_SOCIAL_FIELDS.filter(
    (f) => (info.social[f.key] ?? "").trim() !== ""
  ).map((f) => `${f.label}: ${info.social[f.key]}`);

  return (
    <Section title="个人信息">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-800">
        {basicRows.map(([label, value]) => (
          <div key={label} className="flex">
            <span className="text-gray-500 w-20 flex-shrink-0">{label}:</span>
            <span>{value || <span className="text-gray-300">未填写</span>}</span>
          </div>
        ))}
      </div>
      {(educationLines.length > 0 ||
        jobLines.length > 0 ||
        socialLines.length > 0) && (
        <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
          <SubBlock title="教育背景" lines={educationLines} />
          <SubBlock title="求职偏好" lines={jobLines} />
          <SubBlock title="社交链接" lines={socialLines} />
        </div>
      )}
    </Section>
  );
}

function SubBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div>
      <h6 className="text-gray-600 font-medium mb-1">{title}</h6>
      {lines.length === 0 ? (
        <p className="text-gray-300 italic">未填写</p>
      ) : (
        <ul className="space-y-0.5 text-gray-700">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
