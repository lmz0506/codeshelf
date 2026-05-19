import { ChatOpenAI } from "@langchain/openai";
import type { AiProviderConfig, AiModelConfig } from "@/types";
import { tauriLlmFetch } from "./llmProxyFetch";

export function pickModel(provider: AiProviderConfig): AiModelConfig {
  const model =
    provider.models.find((m) => m.isDefault && m.enabled) ??
    provider.models.find((m) => m.enabled);
  if (!model) {
    throw new Error("当前 AI 供应商没有可用的模型");
  }
  return model;
}

export interface BuildChatModelOptions {
  temperature?: number;
  maxTokens?: number;
}

function isDeepSeekProvider(provider: AiProviderConfig): boolean {
  return (
    provider.presetKey === "deepseek" ||
    provider.baseUrl.toLowerCase().includes("deepseek")
  );
}

export function buildChatModel(
  provider: AiProviderConfig,
  opts: BuildChatModelOptions = {}
): ChatOpenAI {
  if (!provider.apiKey) {
    throw new Error(`供应商 ${provider.name} 未配置 apiKey`);
  }
  const model = pickModel(provider);
  return new ChatOpenAI({
    model: model.model,
    apiKey: provider.apiKey,
    configuration: {
      baseURL: provider.baseUrl,
      fetch: tauriLlmFetch,
    },
    temperature: opts.temperature ?? 0.3,
    maxTokens: opts.maxTokens,
    modelKwargs: isDeepSeekProvider(provider)
      ? {
          thinking: { type: "disabled" },
          parallel_tool_calls: false,
        }
      : {
          enable_thinking: false,
          parallel_tool_calls: false,
        },
    streaming: false,
    streamUsage: false,
    disableStreaming: true,
  } as ConstructorParameters<typeof ChatOpenAI>[0] & { disableStreaming: boolean });
}
