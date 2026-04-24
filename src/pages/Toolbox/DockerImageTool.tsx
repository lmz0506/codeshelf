import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Check,
  Copy,
  FileCode,
  FolderOpen,
  Play,
  RefreshCw,
  Save,
  Send,
  Square,
  Trash2,
  Wand2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button, Input } from "@/components/ui";
import { ToolPanelHeader } from "./index";
import {
  dockerBuildImage,
  dockerCheckAvailable,
  dockerFindDockerfiles,
  dockerGenerateDockerfileAi,
  dockerGenerateDockerfileTemplate,
  dockerListContainers,
  dockerListImages,
  dockerPushImage,
  dockerReadDockerfile,
  dockerRemoveContainer,
  dockerRemoveImage,
  dockerRunImage,
  dockerStopContainer,
  dockerWriteDockerfile,
} from "@/services/toolbox";
import type { DockerCommandResult, DockerContainerInfo, DockerImageInfo, DockerStatus } from "@/types/toolbox";

interface DockerImageToolProps {
  onBack: () => void;
}

const TEMPLATES = [
  { id: "auto", name: "自动识别" },
  { id: "node", name: "Node / 前端" },
  { id: "java-maven", name: "Java Maven" },
  { id: "python", name: "Python" },
  { id: "rust", name: "Rust" },
  { id: "static-nginx", name: "静态 Nginx" },
];

function imageRef(image: DockerImageInfo): string {
  return image.tag && image.tag !== "<none>" ? `${image.repository}:${image.tag}` : image.id;
}

function commandSummary(result: DockerCommandResult | null): string {
  if (!result) return "";
  return [`$ ${result.command}`, result.stdout, result.stderr].filter(Boolean).join("\n\n");
}

export function DockerImageTool({ onBack }: DockerImageToolProps) {
  const [status, setStatus] = useState<DockerStatus | null>(null);
  const [projectPath, setProjectPath] = useState("");
  const [dockerfiles, setDockerfiles] = useState<string[]>([]);
  const [dockerfilePath, setDockerfilePath] = useState("Dockerfile");
  const [dockerfileContent, setDockerfileContent] = useState("");
  const [template, setTemplate] = useState("auto");
  const [imageName, setImageName] = useState("codeshelf-app");
  const [imageTag, setImageTag] = useState("latest");
  const [noCache, setNoCache] = useState(false);
  const [runImage, setRunImage] = useState("");
  const [containerName, setContainerName] = useState("");
  const [portsText, setPortsText] = useState("8080:80");
  const [envText, setEnvText] = useState("");
  const [images, setImages] = useState<DockerImageInfo[]>([]);
  const [containers, setContainers] = useState<DockerContainerInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<DockerCommandResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [aiMessage, setAiMessage] = useState("");

  const fullImageName = useMemo(() => {
    if (!imageName.trim()) return "";
    return imageName.includes(":") ? imageName.trim() : `${imageName.trim()}:${imageTag.trim() || "latest"}`;
  }, [imageName, imageTag]);

  useEffect(() => {
    refreshDocker();
  }, []);

  async function refreshDocker() {
    const nextStatus = await dockerCheckAvailable();
    setStatus(nextStatus);
    if (nextStatus.available) {
      await refreshDockerLists();
    }
  }

  async function refreshDockerLists() {
    try {
      const [nextImages, nextContainers] = await Promise.all([
        dockerListImages(),
        dockerListContainers(),
      ]);
      setImages(nextImages);
      setContainers(nextContainers);
    } catch (error) {
      console.error("刷新 Docker 列表失败:", error);
    }
  }

  async function selectProject() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择项目目录",
    });
    if (!selected || typeof selected !== "string") return;
    setProjectPath(selected);
    await scanDockerfiles(selected);
  }

  async function scanDockerfiles(path = projectPath) {
    if (!path) return;
    const found = await dockerFindDockerfiles(path);
    setDockerfiles(found);
    if (found.length > 0) {
      setDockerfilePath(found[0]);
      const content = await dockerReadDockerfile(path, found[0]);
      setDockerfileContent(content);
    } else {
      setDockerfilePath("Dockerfile");
      setDockerfileContent("");
    }
  }

  async function loadDockerfile(path = dockerfilePath) {
    if (!projectPath || !path) return;
    const content = await dockerReadDockerfile(projectPath, path);
    setDockerfileContent(content);
  }

  async function generateTemplate() {
    if (!projectPath) {
      alert("请先选择项目目录");
      return;
    }
    const content = await dockerGenerateDockerfileTemplate(projectPath, template);
    setDockerfilePath(dockerfilePath || "Dockerfile");
    setDockerfileContent(content);
    setAiMessage("");
  }

  async function generateWithAi() {
    if (!projectPath) {
      alert("请先选择项目目录");
      return;
    }
    setBusy(true);
    try {
      const result = await dockerGenerateDockerfileAi({
        projectPath,
        dockerfilePath: dockerfilePath.trim() || "Dockerfile",
        imageName: fullImageName || imageName,
      });
      setDockerfilePath(dockerfilePath.trim() || "Dockerfile");
      setDockerfileContent(result.content);
      setAiMessage(`已由 ${result.providerName} / ${result.modelName} 生成，可继续修改后保存或构建。`);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveDockerfile() {
    if (!projectPath || !dockerfilePath.trim()) {
      alert("请先选择项目目录并填写 Dockerfile 路径");
      return;
    }
    await dockerWriteDockerfile(projectPath, dockerfilePath.trim(), dockerfileContent);
    await scanDockerfiles(projectPath);
  }

  async function buildImage() {
    if (!projectPath || !dockerfilePath.trim() || !imageName.trim()) {
      alert("请填写项目目录、Dockerfile 和镜像名");
      return;
    }
    setBusy(true);
    try {
      await saveDockerfile();
      const result = await dockerBuildImage({
        projectPath,
        dockerfilePath: dockerfilePath.trim(),
        imageName: imageName.trim(),
        tag: imageTag.trim() || "latest",
        noCache,
      });
      setLastResult(result);
      setRunImage(fullImageName);
      await refreshDockerLists();
    } finally {
      setBusy(false);
    }
  }

  async function runSelectedImage(image = runImage || fullImageName) {
    if (!image.trim()) {
      alert("请填写要运行的镜像");
      return;
    }
    setBusy(true);
    try {
      const result = await dockerRunImage({
        image: image.trim(),
        containerName: containerName.trim() || undefined,
        ports: portsText.split(/\s*,\s*|\n/).map((s) => s.trim()).filter(Boolean),
        env: envText.split(/\s*,\s*|\n/).map((s) => s.trim()).filter(Boolean),
      });
      setLastResult(result);
      await refreshDockerLists();
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(image: string) {
    if (!confirm(`确定删除镜像 ${image} 吗？`)) return;
    const result = await dockerRemoveImage(image, true);
    setLastResult(result);
    await refreshDockerLists();
  }

  async function pushImage(image: string) {
    const result = await dockerPushImage(image);
    setLastResult(result);
  }

  async function stopContainer(id: string) {
    const result = await dockerStopContainer(id);
    setLastResult(result);
    await refreshDockerLists();
  }

  async function removeContainer(id: string) {
    const result = await dockerRemoveContainer(id, true);
    setLastResult(result);
    await refreshDockerLists();
  }

  async function copyAiPrompt() {
    const prompt = `请根据以下项目生成生产可用 Dockerfile，并说明构建/运行命令：

项目目录：${projectPath || "<项目路径>"}
镜像名：${fullImageName || "<镜像名:tag>"}

当前 Dockerfile：
\`\`\`Dockerfile
${dockerfileContent || "<暂无 Dockerfile，请根据项目结构生成>"}
\`\`\`

要求：
1. 优先使用多阶段构建
2. 只复制必要文件，减少镜像体积
3. 暴露正确端口
4. 给出 docker build / docker run / docker push 命令
5. 如需 .dockerignore，也一并生成`;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col min-h-full">
      <ToolPanelHeader
        title="Docker 镜像"
        icon={Box}
        onBack={onBack}
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={refreshDocker} variant="secondary" size="sm">
              <RefreshCw size={16} className="mr-2" />
              刷新
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="re-card p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">Docker 状态</div>
              <div className={`text-xs mt-1 ${status?.available ? "text-green-600" : "text-red-500"}`}>
                {status?.available ? status.version : status?.error || "检测中..."}
              </div>
            </div>
            <Button onClick={selectProject} variant="primary">
              <FolderOpen size={16} className="mr-2" />
              选择项目
            </Button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
            <div className="space-y-4">
              <div className="re-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">Dockerfile</div>
                  <div className="flex items-center gap-2">
                    <select
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                    >
                      {TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <Button onClick={generateTemplate} variant="secondary" size="sm">
                      <Wand2 size={14} className="mr-1" />
                      模板
                    </Button>
                    <Button onClick={generateWithAi} disabled={busy} variant="secondary" size="sm">
                      <Wand2 size={14} className="mr-1" />
                      {busy ? "生成中" : "AI 生成"}
                    </Button>
                    <Button onClick={copyAiPrompt} variant="secondary" size="sm">
                      {copied ? <Check size={14} className="mr-1 text-green-500" /> : <Copy size={14} className="mr-1" />}
                      AI 提示
                    </Button>
                    <Button onClick={saveDockerfile} variant="secondary" size="sm">
                      <Save size={14} className="mr-1" />
                      保存
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-2">
                  <Input
                    value={projectPath}
                    onChange={(e) => setProjectPath(e.target.value)}
                    placeholder="项目目录"
                  />
                  <Button onClick={() => scanDockerfiles()} variant="secondary">
                    扫描
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={dockerfilePath}
                    onChange={(e) => setDockerfilePath(e.target.value)}
                    placeholder="Dockerfile"
                  />
                  {dockerfiles.length > 0 && (
                    <select
                      value={dockerfilePath}
                      onChange={(e) => {
                        setDockerfilePath(e.target.value);
                        loadDockerfile(e.target.value);
                      }}
                      className="w-48 text-xs border border-gray-200 rounded px-2 bg-white"
                    >
                      {dockerfiles.map((file) => (
                        <option key={file} value={file}>{file}</option>
                      ))}
                    </select>
                  )}
                </div>

                <textarea
                  value={dockerfileContent}
                  onChange={(e) => setDockerfileContent(e.target.value)}
                  spellCheck={false}
                  className="w-full h-[420px] bg-gray-950 text-gray-100 rounded-lg p-4 text-xs leading-5 font-mono outline-none border border-gray-900 focus:border-blue-500"
                  placeholder="选择项目后会自动读取 Dockerfile；没有 Dockerfile 可选择模板生成。"
                />
                {aiMessage && <div className="text-xs text-blue-500">{aiMessage}</div>}
              </div>

              <div className="re-card p-4 space-y-3">
                <div className="text-sm font-semibold">构建镜像</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Input value={imageName} onChange={(e) => setImageName(e.target.value)} placeholder="镜像名，如 my-app" />
                  <Input value={imageTag} onChange={(e) => setImageTag(e.target.value)} placeholder="tag，如 latest" />
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={noCache} onChange={(e) => setNoCache(e.target.checked)} />
                    不使用缓存
                  </label>
                </div>
                <Button onClick={buildImage} disabled={busy || !status?.available} variant="primary">
                  <FileCode size={16} className="mr-2" />
                  {busy ? "执行中..." : `构建 ${fullImageName || "镜像"}`}
                </Button>
              </div>

              {lastResult && (
                <div className="re-card p-4">
                  <div className={`text-sm font-semibold mb-2 ${lastResult.success ? "text-green-600" : "text-red-500"}`}>
                    {lastResult.success ? "命令执行成功" : "命令执行失败"}
                  </div>
                  <pre className="max-h-80 overflow-auto bg-gray-950 text-gray-100 rounded p-3 text-xs whitespace-pre-wrap">
                    {commandSummary(lastResult)}
                  </pre>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="re-card p-4 space-y-3">
                <div className="text-sm font-semibold">在线运行镜像</div>
                <Input value={runImage} onChange={(e) => setRunImage(e.target.value)} placeholder="镜像，如 my-app:latest" />
                <Input value={containerName} onChange={(e) => setContainerName(e.target.value)} placeholder="容器名（可选）" />
                <Input value={portsText} onChange={(e) => setPortsText(e.target.value)} placeholder="端口映射，如 8080:80，多条用逗号/换行" />
                <textarea
                  value={envText}
                  onChange={(e) => setEnvText(e.target.value)}
                  className="w-full h-20 border border-gray-200 rounded p-2 text-xs"
                  placeholder="环境变量，如 NODE_ENV=production，多条用逗号/换行"
                />
                <Button onClick={() => runSelectedImage()} disabled={busy || !status?.available} variant="primary">
                  <Play size={16} className="mr-2" />
                  运行
                </Button>
              </div>

              <div className="re-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold">镜像</div>
                  <button onClick={refreshDockerLists} className="text-xs text-blue-500">刷新</button>
                </div>
                <div className="space-y-2 max-h-72 overflow-auto">
                  {images.map((image) => (
                    <div key={`${image.id}-${image.repository}-${image.tag}`} className="border border-gray-200 rounded p-2 text-xs">
                      <div className="font-mono text-gray-800 truncate">{imageRef(image)}</div>
                      <div className="text-gray-400 mt-1">{image.id} · {image.size} · {image.createdSince}</div>
                      <div className="flex gap-1 mt-2">
                        <button onClick={() => setRunImage(imageRef(image))} className="px-2 py-1 rounded bg-green-50 text-green-600">
                          <Play size={12} />
                        </button>
                        <button onClick={() => pushImage(imageRef(image))} className="px-2 py-1 rounded bg-blue-50 text-blue-600">
                          <Send size={12} />
                        </button>
                        <button onClick={() => removeImage(imageRef(image))} className="px-2 py-1 rounded bg-red-50 text-red-600">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {images.length === 0 && <div className="text-xs text-gray-400">暂无镜像</div>}
                </div>
              </div>

              <div className="re-card p-4">
                <div className="text-sm font-semibold mb-3">容器</div>
                <div className="space-y-2 max-h-72 overflow-auto">
                  {containers.map((container) => (
                    <div key={container.id} className="border border-gray-200 rounded p-2 text-xs">
                      <div className="font-medium truncate">{container.names || container.id}</div>
                      <div className="font-mono text-gray-500 truncate">{container.image}</div>
                      <div className="text-gray-400 mt-1">{container.status}</div>
                      {container.ports && <div className="text-gray-400 truncate">{container.ports}</div>}
                      <div className="flex gap-1 mt-2">
                        <button onClick={() => stopContainer(container.id)} className="px-2 py-1 rounded bg-orange-50 text-orange-600">
                          <Square size={12} />
                        </button>
                        <button onClick={() => removeContainer(container.id)} className="px-2 py-1 rounded bg-red-50 text-red-600">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {containers.length === 0 && <div className="text-xs text-gray-400">暂无容器</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
