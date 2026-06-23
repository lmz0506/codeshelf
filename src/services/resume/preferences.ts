// 简历生成器的 AI 模型偏好。
//
// 用户可以在简历页直接挑某个供应商/模型,不必每次都跑系统默认。选择写到 localStorage,
// 跨会话保留;当选中的 provider/model 被删除或禁用时自动回落到系统默认。
//
// 不放进 _persistence.ts 的 saveAppSettings,因为那条路要改 Rust schema;
// 这里是纯 UI 偏好,本机即可,localStorage 足够。

import type { AiProviderConfig } from "@/types";

const STORAGE_KEY = "resume.generator.preference.v1";

export interface ResumePreference {
  providerId: string;
  modelId: string;
}

export function loadResumePreference(): ResumePreference | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.providerId === "string" &&
      typeof parsed.modelId === "string"
    ) {
      return { providerId: parsed.providerId, modelId: parsed.modelId };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveResumePreference(pref: ResumePreference | null): void {
  try {
    if (pref) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.error("写入简历偏好失败:", err);
  }
}

/// 解析用户选择 + 系统默认,产出实际要传给 Rust agent 的 provider 对象。
/// 当用户选了某个 model 时,克隆 provider 并把对应 model 的 isDefault 改成 true,
/// 这样 Rust 侧 pick_model 会优先取它(不需要改 IPC schema)。
///
/// 失败回落:
/// 1. 用户选的 provider 不存在或被禁用 → 用系统默认
/// 2. 用户选的 model 在选中的 provider 里不存在或被禁用 → 用 provider 里第一个
///    enabled 的 model 当默认
/// 3. 系统也没有可用默认 → 返回 null
export interface ResolvedResumeProvider {
  provider: AiProviderConfig;
  /** 标记是 explicit (用户选过) 还是 fallback (系统默认) */
  source: "user" | "system";
  /** 实际生效的 model id 与名称,用于 UI 展示 */
  modelId: string;
  modelName: string;
}

export function resolveResumeProvider(
  providers: AiProviderConfig[],
  preference: ResumePreference | null,
): ResolvedResumeProvider | null {
  // 1. 试用户选择
  if (preference) {
    const picked = providers.find(
      (p) => p.id === preference.providerId && p.enabled,
    );
    if (picked) {
      const wantModel = picked.models.find(
        (m) => m.id === preference.modelId && m.enabled,
      );
      const fallbackModel =
        wantModel ?? picked.models.find((m) => m.enabled);
      if (fallbackModel) {
        return {
          provider: cloneWithDefaultModel(picked, fallbackModel.id),
          source: "user",
          modelId: fallbackModel.id,
          modelName: fallbackModel.model,
        };
      }
    }
  }

  // 2. 回落系统默认 provider
  const systemDefault =
    providers.find((p) => p.isDefaultProvider && p.enabled) ?? null;
  if (!systemDefault) return null;
  const defaultModel =
    systemDefault.models.find((m) => m.isDefault && m.enabled) ??
    systemDefault.models.find((m) => m.enabled);
  if (!defaultModel) return null;

  return {
    provider: systemDefault,
    source: "system",
    modelId: defaultModel.id,
    modelName: defaultModel.model,
  };
}

function cloneWithDefaultModel(
  provider: AiProviderConfig,
  defaultModelId: string,
): AiProviderConfig {
  return {
    ...provider,
    models: provider.models.map((m) => ({
      ...m,
      isDefault: m.id === defaultModelId,
    })),
  };
}
