import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, Circle, Clock, Trash2, Plus, X } from "lucide-react";
import {
  createChatTask,
  deleteChatTask,
  listChatTasks,
  updateChatTask,
  type ChatTask,
} from "@/services/chat";

interface TaskPanelProps {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

function statusIcon(status: ChatTask["status"]) {
  if (status === "completed") return <CheckCircle2 size={14} className="text-emerald-500" />;
  if (status === "in_progress") return <Clock size={14} className="text-blue-500 animate-pulse" />;
  return <Circle size={14} className="text-gray-400" />;
}

function nextStatus(s: ChatTask["status"]): ChatTask["status"] {
  if (s === "pending") return "in_progress";
  if (s === "in_progress") return "completed";
  return "pending";
}

export function TaskPanel({ sessionId, open, onClose }: TaskPanelProps) {
  const [tasks, setTasks] = useState<ChatTask[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  async function refresh() {
    try {
      const list = await listChatTasks(sessionId);
      setTasks(list);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!open) return;
    refresh();
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    listen<{ sessionId: string }>("chat-tasks-changed", (event) => {
      if (cancelled) return;
      if (event.payload.sessionId === sessionId) refresh();
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  if (!open) return null;

  const grouped = {
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    pending: tasks.filter((t) => t.status === "pending"),
    completed: tasks.filter((t) => t.status === "completed"),
  };

  async function toggle(t: ChatTask) {
    try {
      await updateChatTask({ sessionId, taskId: t.id, status: nextStatus(t.status) });
      refresh();
    } catch {
      /* ignore */
    }
  }

  async function remove(t: ChatTask) {
    try {
      await deleteChatTask(sessionId, t.id);
      refresh();
    } catch {
      /* ignore */
    }
  }

  async function submitAdd() {
    if (!subject.trim()) return;
    try {
      await createChatTask({ sessionId, subject: subject.trim(), description: description.trim() });
      setSubject("");
      setDescription("");
      setAddOpen(false);
      refresh();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end pointer-events-none">
      <div className="w-80 h-full bg-white shadow-xl border-l border-gray-200 flex flex-col pointer-events-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="text-sm font-semibold">任务</div>
          <div className="flex items-center gap-2">
            <button
              className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
              onClick={() => setAddOpen((v) => !v)}
            >
              <Plus size={12} /> 新建
            </button>
            <button className="text-gray-400 hover:text-gray-700" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        {addOpen && (
          <div className="px-4 py-3 space-y-2 border-b border-gray-200 bg-gray-50">
            <input
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              placeholder="标题"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <textarea
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              placeholder="描述"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button className="px-2 py-1 text-xs border border-gray-200 rounded" onClick={() => setAddOpen(false)}>
                取消
              </button>
              <button className="px-2 py-1 text-xs bg-blue-500 text-white rounded" onClick={submitAdd}>
                保存
              </button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-auto p-3 space-y-4">
          {(["in_progress", "pending", "completed"] as const).map((s) => {
            const list = grouped[s];
            if (list.length === 0) return null;
            return (
              <div key={s} className="space-y-1">
                <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                  {s === "in_progress" ? "进行中" : s === "pending" ? "待办" : "已完成"}（{list.length}）
                </div>
                {list.map((t) => (
                  <div key={t.id} className="border border-gray-200 rounded p-2 group">
                    <div className="flex items-start gap-2">
                      <button className="mt-0.5" onClick={() => toggle(t)} title="切换状态">
                        {statusIcon(t.status)}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm ${t.status === "completed" ? "line-through text-gray-400" : "text-gray-800"}`}>
                          {t.subject}
                        </div>
                        {t.description && (
                          <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{t.description}</div>
                        )}
                      </div>
                      <button
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"
                        onClick={() => remove(t)}
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {tasks.length === 0 && <div className="text-xs text-gray-400">当前会话尚无任务</div>}
        </div>
      </div>
    </div>
  );
}
