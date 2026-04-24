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
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">Dockerfile</div>
          <div className="text-xs text-gray-400 mt-0.5 truncate">
            {state.dockerfiles.length > 0 ? `发现 ${state.dockerfiles.length} 个 Dockerfile` : "编辑、生成并保存项目内 Dockerfile"}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <select
            value={state.template}
            onChange={(e) => setters.setTemplate(e.target.value)}
            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 outline-none hover:border-gray-300 focus:border-blue-400"
          >
            {DOCKERFILE_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <Button onClick={actions.generateTemplate} variant="secondary" size="sm">
            <Wand2 size={14} className="mr-1.5" />
            模板
          </Button>
          <Button onClick={actions.generateWithAi} disabled={state.busy || !state.aiReady} variant="secondary" size="sm">
            <Wand2 size={14} className="mr-1.5" />
            {state.busy ? "生成中" : state.aiReady ? "AI 生成" : "AI 未配置"}
          </Button>
          <Button onClick={actions.copyAiPrompt} variant="secondary" size="sm">
            {state.copied ? <Check size={14} className="mr-1.5 text-green-500" /> : <Copy size={14} className="mr-1.5" />}
            AI 提示
          </Button>
          <Button onClick={actions.saveDockerfile} variant="secondary" size="sm">
            <Save size={14} className="mr-1.5" />
            保存
          </Button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
          <Input
            value={state.projectPath}
            onChange={(e) => setters.setProjectPath(e.target.value)}
            placeholder="项目目录"
            className="h-9 py-1.5 text-sm"
          />
          <Button onClick={() => actions.scanDockerfiles()} variant="secondary" size="sm" className="h-9">
            扫描
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] gap-2">
          <Input
            value={state.dockerfilePath}
            onChange={(e) => setters.setDockerfilePath(e.target.value)}
            placeholder="Dockerfile"
            className="h-9 py-1.5 font-mono text-sm"
          />
          {state.dockerfiles.length > 0 && (
            <select
              value={state.dockerfilePath}
              onChange={(e) => {
                setters.setDockerfilePath(e.target.value);
                actions.loadDockerfile(e.target.value);
              }}
              className="h-9 min-w-0 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 outline-none hover:border-gray-300 focus:border-blue-400"
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
      </div>

      <div className="border-t border-gray-100 bg-gray-950">
        <textarea
          value={state.dockerfileContent}
          onChange={(e) => setters.setDockerfileContent(e.target.value)}
          spellCheck={false}
          className="block w-full h-[520px] resize-none bg-gray-950 p-4 font-mono text-[13px] leading-6 text-gray-100 outline-none placeholder:text-gray-500"
          placeholder="选择项目后会自动读取 Dockerfile；没有 Dockerfile 可选择模板生成。"
        />
      </div>
      {state.notice && <div className="border-t border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-600">{state.notice}</div>}
    </div>
  );
}
