import type { AiProviderConfig } from "@/types";
import type { DockerCommandResult, DockerImageInfo, DockerRunInput } from "@/types/toolbox";

export function imageRef(image: DockerImageInfo): string {
  return image.tag && image.tag !== "<none>" ? `${image.repository}:${image.tag}` : image.id;
}

export function commandSummary(result: DockerCommandResult | null): string {
  if (!result) return "";
  return [`$ ${result.command}`, result.stdout, result.stderr].filter(Boolean).join("\n\n");
}

export function splitListText(value: string): string[] {
  return value
    .split(/\s*,\s*|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function hasUsableAiProvider(providers: AiProviderConfig[]): boolean {
  return providers.some((provider) => provider.enabled && provider.models.some((model) => model.enabled));
}

export function dockerImageNameFromProject(name?: string): string {
  const normalized = (name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "");
  return normalized || "codeshelf-app";
}

function quote(value: string): string {
  if (!value || /[\s"'$\\]/.test(value)) {
    return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
  }
  return value;
}

function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function addYamlList(lines: string[], key: string, values?: string[]) {
  const clean = values?.map((item) => item.trim()).filter(Boolean) || [];
  if (clean.length === 0) return;
  lines.push(`    ${key}:`);
  clean.forEach((item) => lines.push(`      - ${yamlQuote(item)}`));
}

export function buildDockerRunCommand(input: DockerRunInput): string {
  const parts = ["docker", "run", "-d"];
  if (input.containerName) parts.push("--name", quote(input.containerName));
  input.ports?.forEach((port) => parts.push("-p", quote(port)));
  input.env?.forEach((env) => parts.push("-e", quote(env)));
  input.volumes?.forEach((volume) => parts.push("-v", quote(volume)));
  if (input.network) parts.push("--network", quote(input.network));
  if (input.restart) parts.push("--restart", quote(input.restart));
  if (input.user) parts.push("-u", quote(input.user));
  if (input.workdir) parts.push("-w", quote(input.workdir));
  if (input.privileged) parts.push("--privileged");
  if (input.readOnly) parts.push("--read-only");
  input.extraArgs?.forEach((arg) => parts.push(arg));
  parts.push(quote(input.image));
  if (input.command) parts.push(input.command);
  return parts.join(" ");
}

export function buildComposeYaml(input: DockerRunInput): string {
  const serviceName = (input.containerName || input.image.split(":")[0] || "app")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "app";
  const lines = ["services:", `  ${serviceName}:`, `    image: ${yamlQuote(input.image)}`];
  if (input.containerName) lines.push(`    container_name: ${yamlQuote(input.containerName)}`);
  addYamlList(lines, "ports", input.ports);
  addYamlList(lines, "environment", input.env);
  addYamlList(lines, "volumes", input.volumes);
  if (input.network) lines.push(`    network_mode: ${yamlQuote(input.network)}`);
  if (input.restart) lines.push(`    restart: ${yamlQuote(input.restart)}`);
  if (input.user) lines.push(`    user: ${yamlQuote(input.user)}`);
  if (input.workdir) lines.push(`    working_dir: ${yamlQuote(input.workdir)}`);
  if (input.privileged) lines.push("    privileged: true");
  if (input.readOnly) lines.push("    read_only: true");
  if (input.command) lines.push(`    command: ${yamlQuote(input.command)}`);
  return `${lines.join("\n")}\n`;
}

export function buildAiPrompt(input: {
  projectPath: string;
  imageName: string;
  dockerfileContent: string;
  platform?: string;
}): string {
  return `请根据以下项目生成生产可用 Dockerfile，并说明构建/运行命令：

项目目录：${input.projectPath || "<项目路径>"}
运行环境：${input.platform || "<windows/mac/linux>"}
镜像名：${input.imageName || "<镜像名:tag>"}

当前 Dockerfile：
\`\`\`Dockerfile
${input.dockerfileContent || "<暂无 Dockerfile，请根据项目结构生成>"}
\`\`\`

要求：
1. 优先使用多阶段构建
2. 只复制必要文件，减少镜像体积
3. 暴露正确端口
4. 给出 docker build / docker run / docker push 命令
5. 避免依赖宿主机绝对路径，兼容 Docker Desktop 在 Windows/macOS 的常规构建方式
6. 如需 .dockerignore，也一并生成`;
}
