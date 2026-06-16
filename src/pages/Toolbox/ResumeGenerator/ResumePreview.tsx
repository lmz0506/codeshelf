// 简历预览模态。
//
// 设计动机:用户保存到磁盘的 STAR 数据保持兼容结构,
// 但 HR 端看的简历应该是「项目描述 / 核心职责 / 项目成果」的投递版结构。
// 这个组件是「面向 HR 的渲染层」,转换在 services/resume/preview.ts。
//
// 个人信息由简历制作页的全局资料区维护,这里只负责预览。

import { useMemo } from "react";
import { Eye } from "lucide-react";
import { Dialog } from "@/components/common";
import { Button } from "@/components/ui";
import { MarkdownRenderer } from "@/components/project/MarkdownRenderer";
import type {
  PersonalInfo,
  ResumeV2,
} from "@/types/resume";
import { formatResume } from "@/services/resume/preview";

interface ResumePreviewDialogProps {
  open: boolean;
  resume: ResumeV2 | null;
  personalInfo: PersonalInfo;
  onClose: () => void;
}

export function ResumePreviewDialog({
  open,
  resume,
  personalInfo,
  onClose,
}: ResumePreviewDialogProps) {
  const formatted = useMemo(
    () => (resume ? formatResume(resume) : null),
    [resume]
  );

  if (!resume || !formatted) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`简历预览 · ${formatted.title}`}
      icon={Eye}
      size="xl"
      footer={
        <Button onClick={onClose} variant="secondary">
          关闭
        </Button>
      }
    >
      <div className="space-y-5">
        <ResumeBody formatted={formatted} info={personalInfo} />
      </div>
    </Dialog>
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
      <ResumeHeader info={info} title={formatted.title} />

      {/* 个人简介 */}
      {info.summary?.trim() && (
        <Section title="个人简介">
          <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
            {info.summary.trim()}
          </p>
        </Section>
      )}

      {/* 技术栈 */}
      {formatted.skills.length > 0 && (
        <Section title="核心技能">
          <p className="text-sm leading-relaxed text-gray-800">
            {formatted.skills.join(" · ")}
          </p>
        </Section>
      )}

      <WorkExperienceSection info={info} />

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
                {exp.projectTime && (
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">项目时间:</span>{" "}
                    {exp.projectTime}
                  </p>
                )}
                {exp.projectRole && (
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">项目角色:</span>{" "}
                    {exp.projectRole}
                  </p>
                )}
                {exp.description && (
                  <FormattedBlock title="项目描述">
                    <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                      {exp.description}
                    </p>
                  </FormattedBlock>
                )}
                {exp.responsibilitiesMarkdown && (
                  <FormattedBlock title="核心职责">
                    <div className="text-sm text-gray-800">
                      <MarkdownRenderer content={exp.responsibilitiesMarkdown} />
                    </div>
                  </FormattedBlock>
                )}
                {exp.achievementsMarkdown && (
                  <FormattedBlock title="项目成果">
                    <div className="text-sm text-gray-800">
                      <MarkdownRenderer content={exp.achievementsMarkdown} />
                    </div>
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

      <EducationSection info={info} />
    </section>
  );
}

function ResumeHeader({ info, title }: { info: PersonalInfo; title: string }) {
  const b = info.basic;
  const job = info.jobPreference;
  const websites = collectWebsites(info);
  const contactRow = [
    b.phone && `手机: ${b.phone}`,
    b.email && `邮箱: ${b.email}`,
  ].filter(Boolean) as string[];
  const careerRow = [
    b.workExperience && `工作经验: ${b.workExperience}`,
    job.expectedSalary && `期望薪资: ${job.expectedSalary}`,
  ].filter(Boolean) as string[];
  const customRow = (info.customFields ?? [])
    .filter((item) => item.label.trim() || item.value.trim())
    .map((item) => `${item.label || "自定义"}: ${item.value}`);
  const hasMeta = contactRow.length > 0 || careerRow.length > 0 || customRow.length > 0;
  return (
    <header className="border-b border-gray-200 pb-5">
      <div className="flex items-start gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50 text-xl font-semibold text-gray-500">
          {b.avatarUrl ? (
            <img src={b.avatarUrl} alt="头像" className="h-full w-full object-cover" />
          ) : (
            (b.name || "简").slice(0, 1)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-2xl font-bold text-gray-950">{b.name || "未填写姓名"}</h2>
            <span className="text-sm text-gray-500">{job.expectedPosition || title}</span>
          </div>
          {hasMeta ? (
            <div className="mt-2 space-y-1 text-xs text-gray-600">
              <InfoLine items={contactRow} />
              <InfoLine items={careerRow} />
              <InfoLine items={customRow} />
            </div>
          ) : (
            <div className="mt-2 text-xs text-gray-300">个人联系方式未填写</div>
          )}
          {websites.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {websites.map((site) => (
                <span key={`${site.label}-${site.url}`} className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                  {site.label ? `${site.label}: ` : ""}{site.url}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function InfoLine({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function WorkExperienceSection({ info }: { info: PersonalInfo }) {
  if (!info.workExperiences.length) return null;
  return (
    <Section title="工作经历">
      <div className="space-y-3">
        {info.workExperiences.map((item) => (
          <article key={item.id} className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h5 className="text-sm font-medium text-gray-900">
                {[item.company, item.position].filter(Boolean).join(" · ") || "未命名工作经历"}
              </h5>
              <span className="text-xs text-gray-500">{[item.startDate, item.endDate].filter(Boolean).join(" - ")}</span>
            </div>
            {item.description && <MarkdownRenderer content={item.description} />}
          </article>
        ))}
      </div>
    </Section>
  );
}

function EducationSection({ info }: { info: PersonalInfo }) {
  const items = info.educations.filter((item) =>
    Boolean(item.school || item.degree || item.startDate || item.endDate)
  );
  if (items.length === 0) return null;
  return (
    <Section title="教育背景">
      <div className="space-y-2 text-sm text-gray-800">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">
              {[item.school, item.degree].filter(Boolean).join(" · ") || "教育经历未填写"}
            </span>
            <span className="text-xs text-gray-500">
              {[item.startDate, item.endDate].filter(Boolean).join(" - ")}
            </span>
          </div>
        ))}
      </div>
    </Section>
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

function collectWebsites(info: PersonalInfo): Array<{ label: string; url: string }> {
  return [...(info.social.websites ?? [])]
    .filter((item) => item.url.trim())
    .map((item) => ({ label: item.label, url: item.url }));
}
