import { invoke } from "@tauri-apps/api/core";

interface LlmProxyHeader {
  name: string;
  value: string;
}

interface LlmProxyResponse {
  status: number;
  status_text: string;
  headers: LlmProxyHeader[];
  body: string;
}

function headersToPairs(headers?: HeadersInit): LlmProxyHeader[] {
  if (!headers) return [];
  const h = new Headers(headers);
  return Array.from(h.entries()).map(([name, value]) => ({ name, value }));
}

async function bodyToString(body: BodyInit | null | undefined): Promise<string | undefined> {
  if (body == null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Blob) return await body.text();
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body);
  }
  return String(body);
}

function isDeepSeekUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("deepseek");
  } catch {
    return url.toLowerCase().includes("deepseek");
  }
}

function forceNonStreamJson(body: string, url: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      if (parsed.stream === true) {
        parsed.stream = false;
        delete parsed.stream_options;
      }
      if (isDeepSeekUrl(url)) {
        parsed.thinking = { type: "disabled" };
        delete parsed.enable_thinking;
      } else {
        parsed.enable_thinking = false;
        if ("thinking" in parsed) {
          delete parsed.thinking;
        }
      }
      if ("reasoning" in parsed) {
        delete parsed.reasoning;
      }
      if ("reasoning_effort" in parsed) {
        delete parsed.reasoning_effort;
      }
      if ("reasoning_content" in parsed) {
        delete parsed.reasoning_content;
      }
      parsed.parallel_tool_calls = false;
      const messages = parsed.messages;
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          if (msg && typeof msg === "object") {
            delete (msg as Record<string, unknown>).reasoning_content;
          }
        }
      }
      return JSON.stringify(parsed);
    }
  } catch {
    // 非 JSON body 原样透传
  }
  return body;
}

function stripReasoningContent(body: string): string {
  try {
    const parsed = JSON.parse(body) as unknown;
    const strip = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(strip);
        return;
      }
      const obj = value as Record<string, unknown>;
      delete obj.reasoning_content;
      for (const child of Object.values(obj)) {
        strip(child);
      }
    };
    strip(parsed);
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

function normalizeRequestBody(body: string, url: string): string {
  return forceNonStreamJson(body, url);
}

function normalizeResponseBody(body: string): string {
  return stripReasoningContent(body);
}

function normalizeMethod(method: string): string {
  return method.toUpperCase();
}

function mergeHeaders(
  requestHeaders?: Headers,
  initHeaders?: HeadersInit
): LlmProxyHeader[] {
  const merged = new Headers(requestHeaders);
  for (const { name, value } of headersToPairs(initHeaders)) {
    merged.set(name, value);
  }
  return headersToPairs(merged);
}

async function requestBodyToString(
  request: Request | undefined,
  init: RequestInit | undefined,
  url: string
): Promise<string | undefined> {
  if (init?.body !== undefined) {
    const text = await bodyToString(init.body);
    return text ? normalizeRequestBody(text, url) : text;
  }
  if (request) {
    const text = await request.clone().text();
    return text ? normalizeRequestBody(text, url) : text;
  }
  return undefined;
}

export async function tauriLlmFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const request = input instanceof Request ? input : undefined;
  const url = request?.url ?? String(input);
  const method = normalizeMethod(init?.method ?? request?.method ?? "GET");
  const headers = mergeHeaders(request?.headers, init?.headers);
  const body = await requestBodyToString(request, init, url);

  const response = await invoke<LlmProxyResponse>("llm_proxy_request", {
    request: {
      method,
      url,
      headers,
      body,
    },
  });

  return new Response(normalizeResponseBody(response.body), {
    status: response.status,
    statusText: response.status_text,
    headers: response.headers.map((h) => [h.name, h.value]),
  });
}
