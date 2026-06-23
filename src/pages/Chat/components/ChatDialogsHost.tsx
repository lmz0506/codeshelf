import type { AiProviderConfig, ChatSession } from "@/types";
import type { ToolSchema } from "@/services/chat";
import { AtMentionPicker } from "./AtMentionPicker";
import { MemoryEditorDialog } from "./MemoryEditorDialog";
import { ModelManagerDialog } from "./ModelManagerDialog";
import { RenameDialog } from "./RenameDialog";
import { SessionConfigPanel, type SessionConfigValues } from "./SessionConfigPanel";
import { SkillsPicker } from "./SkillsPicker";
import { TaskPanel } from "./TaskPanel";
import { ToolApprovalDialog, type PendingApproval } from "./ToolApprovalDialog";
import { ToolPicker } from "./ToolPicker";

interface ChatDialogsHostProps {
  // Rename
  renameOpen: boolean;
  renameInitial: string;
  onRenameCancel: () => void;
  onRenameConfirm: (title: string) => void;

  // Session config
  configOpen: boolean;
  configFocus: "system" | "params" | undefined;
  activeSession: ChatSession | null;
  onConfigClose: () => void;
  onConfigSave: (values: SessionConfigValues) => void;

  // Tool approval
  pendingApproval: PendingApproval | null;
  onApprovalDecide: (decision: "once" | "always" | "reject") => void;

  // Task panel
  taskPanelOpen: boolean;
  onTaskPanelClose: () => void;

  // Skills
  skillsOpen: boolean;
  onSkillsClose: () => void;
  onSkillsSelect: (rendered: string) => void;

  // Tools
  toolPickerOpen: boolean;
  toolSchemas: ToolSchema[];
  onToolPickerClose: () => void;
  onToolPickerInsertHint: (hint: string) => void;
  onToolPickerExecuted: (toolName: string, argumentsJson: string, result: string) => Promise<void>;

  // Mentions
  mentionOpen: boolean;
  onMentionClose: () => void;
  onMentionPick: (paths: string[]) => void;

  // Model manager
  modelManagerOpen: boolean;
  modelManagerInitialProviderId: string;
  aiProviders: AiProviderConfig[];
  normalized: AiProviderConfig[];
  saveAiProviders: (providers: AiProviderConfig[]) => Promise<void>;
  onModelManagerClose: () => void;
  onGoToProviders: () => void;

  // Memory editor
  memoryEditorOpen: boolean;
  memoryDraft: string;
  onMemoryDraftChange: (v: string) => void;
  onMemoryClose: () => void;
  onMemorySaved: (saved: string) => void;
}

export function ChatDialogsHost(props: ChatDialogsHostProps) {
  return (
    <>
      <RenameDialog
        open={props.renameOpen}
        initialValue={props.renameInitial}
        onCancel={props.onRenameCancel}
        onConfirm={props.onRenameConfirm}
      />

      <SessionConfigPanel
        open={props.configOpen}
        session={props.activeSession}
        focus={props.configFocus}
        onClose={props.onConfigClose}
        onSave={props.onConfigSave}
      />

      <ToolApprovalDialog pending={props.pendingApproval} onDecide={props.onApprovalDecide} />

      {props.activeSession && (
        <TaskPanel
          sessionId={props.activeSession.id}
          open={props.taskPanelOpen}
          onClose={props.onTaskPanelClose}
        />
      )}

      <SkillsPicker
        open={props.skillsOpen}
        onClose={props.onSkillsClose}
        onSelect={props.onSkillsSelect}
      />

      <ToolPicker
        open={props.toolPickerOpen}
        toolSchemas={props.toolSchemas}
        sessionId={props.activeSession?.id ?? null}
        allowedCwd={props.activeSession?.allowedCwd ?? null}
        onClose={props.onToolPickerClose}
        onInsertHint={props.onToolPickerInsertHint}
        onExecuted={props.onToolPickerExecuted}
      />

      <AtMentionPicker
        open={props.mentionOpen}
        root={props.activeSession?.allowedCwd ?? null}
        onClose={props.onMentionClose}
        onPick={props.onMentionPick}
      />

      <ModelManagerDialog
        open={props.modelManagerOpen}
        onClose={props.onModelManagerClose}
        onGoToProviders={props.onGoToProviders}
        aiProviders={props.aiProviders}
        normalized={props.normalized}
        saveAiProviders={props.saveAiProviders}
        initialProviderId={props.modelManagerInitialProviderId}
      />

      <MemoryEditorDialog
        open={props.memoryEditorOpen}
        draft={props.memoryDraft}
        onDraftChange={props.onMemoryDraftChange}
        onClose={props.onMemoryClose}
        onSaved={props.onMemorySaved}
      />
    </>
  );
}
