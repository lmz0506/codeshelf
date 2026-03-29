import { useState } from "react";
import { Pencil, Save, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import type { ProjectExperience, STARExperience } from "@/types/resume";

interface ResumeEditorProps {
  experience: ProjectExperience;
  onSave: (updated: ProjectExperience) => void;
  onRegenerate?: () => void;
}

export function ResumeEditor({
  experience,
  onSave,
  onRegenerate,
}: ResumeEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editedStar, setEditedStar] = useState<STARExperience>(
    experience.starExperience || {
      situation: "",
      task: "",
      action: "",
      result: "",
    }
  );

  const hasStarContent =
    experience.starExperience?.situation ||
    experience.starExperience?.task ||
    experience.starExperience?.action ||
    experience.starExperience?.result;

  const handleSave = () => {
    onSave({
      ...experience,
      starExperience: editedStar,
      isEdited: true,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedStar(
      experience.starExperience || {
        situation: "",
        task: "",
        action: "",
        result: "",
      }
    );
    setIsEditing(false);
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* 头部信息 */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900">{experience.projectName}</h4>
            {experience.isEdited && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                已编辑
              </span>
            )}
            {hasStarContent && !experience.isEdited && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                AI生成
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <span>{experience.techStack.slice(0, 5).join(" · ")}</span>
            {experience.techStack.length > 5 && (
              <span>+{experience.techStack.length - 5}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronUp size={18} className="text-gray-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-400" />
          )}
        </div>
      </div>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="p-4">
          {/* 项目元数据 */}
          <div className="grid grid-cols-2 gap-4 mb-4 text-xs text-gray-500">
            <div>
              <span className="text-gray-400">时间跨度：</span>
              {formatDate(experience.timeRange.start)} -{" "}
              {formatDate(experience.timeRange.end)}
            </div>
            <div>
              <span className="text-gray-400">提交记录：</span>
              {experience.commitStats.totalCommits} 次提交
              {experience.commitStats.totalInsertions > 0 && (
                <span className="text-green-600 ml-1">
                  +{formatNumber(experience.commitStats.totalInsertions)}
                </span>
              )}
              {experience.commitStats.totalDeletions > 0 && (
                <span className="text-red-500 ml-1">
                  -{formatNumber(experience.commitStats.totalDeletions)}
                </span>
              )}
            </div>
            <div>
              <span className="text-gray-400">项目分类：</span>
              {experience.category.join(", ") || "未分类"}
            </div>
            <div>
              <span className="text-gray-400">原始标签：</span>
              {experience.labels.join(", ") || "无"}
            </div>
          </div>

          {/* STAR 内容 */}
          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  S - 项目背景（Situation）
                </label>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="描述项目背景，如业务场景、用户规模、技术挑战等"
                  value={editedStar.situation}
                  onChange={(e) =>
                    setEditedStar((prev) => ({ ...prev, situation: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  T - 承担任务（Task）
                </label>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="描述你在项目中承担的具体任务和职责"
                  value={editedStar.task}
                  onChange={(e) =>
                    setEditedStar((prev) => ({ ...prev, task: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  A - 采取行动（Action）
                </label>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="描述你采取的技术方案和具体行动"
                  value={editedStar.action}
                  onChange={(e) =>
                    setEditedStar((prev) => ({ ...prev, action: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  R - 量化结果（Result）
                </label>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="描述项目成果，尽量使用量化指标"
                  value={editedStar.result}
                  onChange={(e) =>
                    setEditedStar((prev) => ({ ...prev, result: e.target.value }))
                  }
                />
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-1"
                >
                  <Save size={14} />
                  保存
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {hasStarContent ? (
                <>
                  {experience.starExperience?.situation && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-700 mb-1">
                        项目背景
                      </h5>
                      <p className="text-sm text-gray-600">
                        {experience.starExperience.situation}
                      </p>
                    </div>
                  )}
                  {experience.starExperience?.task && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-700 mb-1">
                        承担任务
                      </h5>
                      <p className="text-sm text-gray-600">
                        {experience.starExperience.task}
                      </p>
                    </div>
                  )}
                  {experience.starExperience?.action && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-700 mb-1">
                        技术行动
                      </h5>
                      <p className="text-sm text-gray-600">
                        {experience.starExperience.action}
                      </p>
                    </div>
                  )}
                  {experience.starExperience?.result && (
                    <div>
                      <h5 className="text-xs font-medium text-gray-700 mb-1">
                        项目成果
                      </h5>
                      <p className="text-sm text-gray-600">
                        {experience.starExperience.result}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-6 text-gray-400 text-sm">
                  暂无项目经历描述，请点击"重新生成"
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                {onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1"
                  >
                    <RotateCcw size={14} />
                    重新生成
                  </button>
                )}
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 text-xs border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 flex items-center gap-1"
                >
                  <Pencil size={14} />
                  {hasStarContent ? "编辑" : "手动填写"}
                </button>
              </div>
            </div>
          )}

          {/* 关键提交记录 */}
          {experience.commitStats.keyCommits.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h5 className="text-xs font-medium text-gray-500 mb-2">关键提交</h5>
              <div className="space-y-1">
                {experience.commitStats.keyCommits.slice(0, 3).map((commit) => (
                  <div
                    key={commit.hash}
                    className="flex items-center gap-2 text-xs text-gray-500"
                  >
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        commit.type === "feat"
                          ? "bg-green-100 text-green-700"
                          : commit.type === "fix"
                          ? "bg-red-100 text-red-700"
                          : commit.type === "perf"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {commit.type}
                    </span>
                    <span className="font-mono text-gray-400">{commit.hash}</span>
                    <span className="flex-1 truncate">{commit.message}</span>
                    {(commit.insertions > 0 || commit.deletions > 0) && (
                      <span>
                        <span className="text-green-600">+{commit.insertions}</span>
                        <span className="text-red-500 ml-1">-{commit.deletions}</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatNumber(num: number): string {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return String(num);
}
