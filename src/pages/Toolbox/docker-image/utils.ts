import type { AiProviderConfig } from "@/types";
import type { DockerCommandResult, DockerImageInfo } from "@/types/toolbox";

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
