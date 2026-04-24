import { Check, Copy, Save, Wand2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { DOCKERFILE_TEMPLATES } from "./constants";
import type { DockerImageToolModel } from "./useDockerImageTool";

interface DockerfilePanelProps {
  model: DockerImageToolModel;
}

export function DockerfilePanel({ model }: DockerfilePanelProps) {
  const { state, setters, actions } = model;

  return (
    <div className="re-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Dockerfile</div>
          {state.platform && <div className="text-xs text-gray-400 mt-0.5">当前环境：{state.platform}</div>}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <select
            value={state.template}
            onChange={(e) => setters.setTemplate(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
          >
            {DOCKERFILE_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <Button onClick={actions.generateTemplate} variant="secondary" size="sm">
            <Wand2 size={14} className="mr-1" />
            模板
          </Button>
          <Button onClick={actions.generateWithAi} disabled={state.busy || !state.aiReady} variant="secondary" size="sm">
            <Wand2 size={14} className="mr-1" />
            {state.busy ? "生成中" : state.aiReady ? "AI 生成" : "AI 未配置"}
          </Button>
          <Button onClick={actions.copyAiPrompt} variant="secondary" size="sm">
            {state.copied ? <Check size={14} className="mr-1 text-green-500" /> : <Copy size={14} className="mr-1" />}
            AI 提示
          </Button>
          <Button onClick={actions.saveDockerfile} variant="secondary" size="sm">
            <Save size={14} className="mr-1" />
            保存
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-2">
        <Input
          value={state.projectPath}
          onChange={(e) => setters.setProjectPath(e.target.value)}
          placeholder="项目目录"
        />
        <Button onClick={() => actions.scanDockerfiles()} variant="secondary">
          扫描
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          value={state.dockerfilePath}
          onChange={(e) => setters.setDockerfilePath(e.target.value)}
          placeholder="Dockerfile"
        />
        {state.dockerfiles.length > 0 && (
          <select
            value={state.dockerfilePath}
            onChange={(e) => {
              setters.setDockerfilePath(e.target.value);
              actions.loadDockerfile(e.target.value);
            }}
            className="w-48 text-xs border border-gray-200 rounded px-2 bg-white"
            title={state.dockerfilePath}
          >
            {state.dockerfiles.map((file) => (
              <option key={file} value={file}>
                {file}
              </option>
            ))}
          </select>
        )}
      </div>

      <textarea
        value={state.dockerfileContent}
        onChange={(e) => setters.setDockerfileContent(e.target.value)}
        spellCheck={false}
        className="w-full h-[420px] bg-gray-950 text-gray-100 rounded-lg p-4 text-xs leading-5 font-mono outline-none border border-gray-900 focus:border-blue-500"
        placeholder="选择项目后会自动读取 Dockerfile；没有 Dockerfile 可选择模板生成。"
      />
      {state.notice && <div className="text-xs text-blue-500">{state.notice}</div>}
    </div>
  );
}
