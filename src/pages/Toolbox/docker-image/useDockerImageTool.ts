import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/appStore";
import {
  dockerBuildImage,
  dockerCheckAvailable,
  dockerFindDockerfiles,
  dockerGenerateDockerfileAi,
  dockerGenerateDockerfileTemplate,
  dockerInspectContainerYaml,
  dockerListContainers,
  dockerListImages,
  dockerPushImage,
  dockerReadDockerfile,
  dockerRemoveContainer,
  dockerRemoveImage,
  dockerRunImage,
  dockerStopContainer,
  dockerWriteDockerfile,
  getCurrentPlatform,
} from "@/services/toolbox";
import type { DockerCommandResult, DockerContainerInfo, DockerImageInfo, DockerStatus } from "@/types/toolbox";
import { buildAiPrompt, dockerImageNameFromProject, hasUsableAiProvider, splitListText } from "./utils";

interface UseDockerImageToolOptions {
  initialProjectPath?: string;
  initialProjectName?: string;
  onInitialProjectConsumed?: () => void;
}

export function useDockerImageTool(options: UseDockerImageToolOptions = {}) {
  const { aiProviders } = useAppStore();
  const [status, setStatus] = useState<DockerStatus | null>(null);
  const [platform, setPlatform] = useState("");
  const [projectPath, setProjectPath] = useState(options.initialProjectPath || "");
  const [dockerfiles, setDockerfiles] = useState<string[]>([]);
  const [dockerfilePath, setDockerfilePath] = useState("Dockerfile");
  const [dockerfileContent, setDockerfileContent] = useState("");
  const [template, setTemplate] = useState("auto");
  const [imageName, setImageName] = useState(dockerImageNameFromProject(options.initialProjectName));
  const [imageTag, setImageTag] = useState("latest");
  const [noCache, setNoCache] = useState(false);
  const [runImage, setRunImage] = useState("");
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [containerName, setContainerName] = useState("");
  const [portsText, setPortsText] = useState("8080:80");
  const [envText, setEnvText] = useState("");
  const [volumesText, setVolumesText] = useState("");
  const [network, setNetwork] = useState("");
  const [restart, setRestart] = useState("");
  const [user, setUser] = useState("");
  const [workdir, setWorkdir] = useState("");
  const [command, setCommand] = useState("");
  const [extraArgsText, setExtraArgsText] = useState("");
  const [privileged, setPrivileged] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [images, setImages] = useState<DockerImageInfo[]>([]);
  const [containers, setContainers] = useState<DockerContainerInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<DockerCommandResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const [containerConfigYaml, setContainerConfigYaml] = useState("");
  const [containerConfigName, setContainerConfigName] = useState("");
  const [containerConfigOpen, setContainerConfigOpen] = useState(false);

  const aiReady = useMemo(() => hasUsableAiProvider(aiProviders), [aiProviders]);
  const fullImageName = useMemo(() => {
    if (!imageName.trim()) return "";
    return imageName.includes(":") ? imageName.trim() : `${imageName.trim()}:${imageTag.trim() || "latest"}`;
  }, [imageName, imageTag]);

  useEffect(() => {
    refreshDocker();
    getCurrentPlatform().then(setPlatform).catch(() => setPlatform(""));
  }, []);

  useEffect(() => {
    if (!options.initialProjectPath) return;
    setProjectPath(options.initialProjectPath);
    setImageName(dockerImageNameFromProject(options.initialProjectName));
    scanDockerfiles(options.initialProjectPath);
    options.onInitialProjectConsumed?.();
  }, [options.initialProjectPath]);

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
    setNotice("");
  }

  async function generateWithAi() {
    if (!projectPath) {
      alert("请先选择项目目录");
      return;
    }
    if (!aiReady) {
      setNotice("AI 未配置或没有启用模型，可先使用模板或复制 AI 提示。");
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
      setNotice(`已由 ${result.providerName} / ${result.modelName} 生成，可继续修改后保存或构建。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
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
        ports: splitListText(portsText),
        env: splitListText(envText),
        volumes: splitListText(volumesText),
        network: network.trim() || undefined,
        restart: restart.trim() || undefined,
        user: user.trim() || undefined,
        workdir: workdir.trim() || undefined,
        command: command.trim() || undefined,
        privileged,
        readOnly,
        extraArgs: splitListText(extraArgsText),
      });
      setLastResult(result);
      await refreshDockerLists();
    } finally {
      setBusy(false);
    }
  }

  function openRunDialog(image = runImage || fullImageName) {
    setRunImage(image);
    setRunDialogOpen(true);
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

  async function inspectContainerConfig(container: string, name?: string) {
    setContainerConfigName(name || container);
    setContainerConfigOpen(true);
    setContainerConfigYaml("加载中...");
    try {
      const yaml = await dockerInspectContainerYaml(container);
      setContainerConfigYaml(yaml);
    } catch (error) {
      setContainerConfigYaml(error instanceof Error ? error.message : String(error));
    }
  }

  async function copyAiPrompt() {
    await navigator.clipboard.writeText(buildAiPrompt({
      projectPath,
      imageName: fullImageName,
      dockerfileContent,
      platform,
    }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return {
    state: {
      aiReady,
      busy,
      containerName,
      containers,
      copied,
      dockerfileContent,
      dockerfilePath,
      dockerfiles,
      envText,
      extraArgsText,
      fullImageName,
      imageName,
      imageTag,
      images,
      lastResult,
      network,
      noCache,
      notice,
      platform,
      portsText,
      projectPath,
      privileged,
      readOnly,
      restart,
      runImage,
      runDialogOpen,
      status,
      template,
      user,
      volumesText,
      workdir,
      command,
      containerConfigYaml,
      containerConfigName,
      containerConfigOpen,
    },
    setters: {
      setContainerName,
      setContainerConfigOpen,
      setDockerfileContent,
      setDockerfilePath,
      setEnvText,
      setExtraArgsText,
      setImageName,
      setImageTag,
      setNetwork,
      setNoCache,
      setPortsText,
      setPrivileged,
      setProjectPath,
      setReadOnly,
      setRestart,
      setRunImage,
      setRunDialogOpen,
      setTemplate,
      setUser,
      setVolumesText,
      setWorkdir,
      setCommand,
    },
    actions: {
      buildImage,
      copyAiPrompt,
      generateTemplate,
      generateWithAi,
      inspectContainerConfig,
      loadDockerfile,
      openRunDialog,
      pushImage,
      refreshDocker,
      refreshDockerLists,
      removeContainer,
      removeImage,
      runSelectedImage,
      saveDockerfile,
      scanDockerfiles,
      selectProject,
      stopContainer,
    },
  };
}

export type DockerImageToolModel = ReturnType<typeof useDockerImageTool>;
