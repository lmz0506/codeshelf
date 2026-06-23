import type { ApiAuthConfig, SessionInject } from "@/types";

interface AuthEditorProps {
  value: ApiAuthConfig;
  onChange: (next: ApiAuthConfig) => void;
  disabled?: boolean;
  /** 允许 "none" 作为"继承组鉴权"含义时，label 文案换成"继承" */
  inheritLabel?: string;
}

const TYPES: Array<{ v: ApiAuthConfig["type"]; label: string }> = [
  { v: "none", label: "None" },
  { v: "bearer", label: "Bearer Token" },
  { v: "basic", label: "Basic" },
  { v: "apiKey", label: "API Key (Header)" },
  { v: "session", label: "Session (登录)" },
];

function buildDefault(type: ApiAuthConfig["type"]): ApiAuthConfig {
  switch (type) {
    case "none":
      return { type: "none" };
    case "bearer":
      return { type: "bearer", token: "" };
    case "basic":
      return { type: "basic", username: "", password: "" };
    case "apiKey":
      return { type: "apiKey", header: "X-API-Key", value: "" };
    case "session":
      return {
        type: "session",
        loginUrl: "/api/auth/login",
        loginMethod: "POST",
        credentialsJson: '{"username":"","password":""}',
        tokenJsonPath: "data.token",
        injectAs: { type: "header", name: "Authorization", format: "Bearer {token}" },
      };
  }
}

export function AuthEditor({ value, onChange, disabled, inheritLabel }: AuthEditorProps) {
  const set = (next: ApiAuthConfig) => onChange(next);

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-gray-600 w-14">类型</span>
        <select
          className="flex-1 px-2 py-1 border border-gray-200 rounded"
          value={value.type}
          onChange={(e) => set(buildDefault(e.target.value as ApiAuthConfig["type"]))}
          disabled={disabled}
        >
          {TYPES.map((t) => (
            <option key={t.v} value={t.v}>
              {t.v === "none" && inheritLabel ? inheritLabel : t.label}
            </option>
          ))}
        </select>
      </div>

      {value.type === "bearer" && (
        <div className="flex items-center gap-2">
          <span className="text-gray-600 w-14">Token</span>
          <input
            className="flex-1 px-2 py-1 border border-gray-200 rounded font-mono"
            placeholder="your access token"
            value={value.token}
            onChange={(e) => set({ ...value, token: e.target.value })}
            disabled={disabled}
          />
        </div>
      )}

      {value.type === "basic" && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-gray-600 w-14">用户名</span>
            <input
              className="flex-1 px-2 py-1 border border-gray-200 rounded"
              value={value.username}
              onChange={(e) => set({ ...value, username: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600 w-14">密码</span>
            <input
              type="password"
              className="flex-1 px-2 py-1 border border-gray-200 rounded"
              value={value.password}
              onChange={(e) => set({ ...value, password: e.target.value })}
              disabled={disabled}
            />
          </div>
        </>
      )}

      {value.type === "apiKey" && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-gray-600 w-14">Header</span>
            <input
              className="flex-1 px-2 py-1 border border-gray-200 rounded font-mono"
              value={value.header}
              onChange={(e) => set({ ...value, header: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600 w-14">值</span>
            <input
              className="flex-1 px-2 py-1 border border-gray-200 rounded font-mono"
              value={value.value}
              onChange={(e) => set({ ...value, value: e.target.value })}
              disabled={disabled}
            />
          </div>
        </>
      )}

      {value.type === "session" && (
        <div className="border border-gray-200 rounded p-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-600 w-20">登录 URL</span>
            <input
              className="flex-1 px-2 py-1 border border-gray-200 rounded font-mono"
              placeholder="/api/auth/login 或完整 URL"
              value={value.loginUrl}
              onChange={(e) => set({ ...value, loginUrl: e.target.value })}
              disabled={disabled}
            />
            <select
              className="px-2 py-1 border border-gray-200 rounded"
              value={value.loginMethod}
              onChange={(e) => set({ ...value, loginMethod: e.target.value })}
              disabled={disabled}
            >
              {["POST", "GET", "PUT"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-gray-600 mb-1">登录 body（JSON）</div>
            <textarea
              rows={3}
              className="w-full px-2 py-1 border border-gray-200 rounded font-mono"
              value={value.credentialsJson}
              onChange={(e) => set({ ...value, credentialsJson: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600 w-20">注入方式</span>
            <select
              className="flex-1 px-2 py-1 border border-gray-200 rounded"
              value={value.injectAs.type}
              onChange={(e) => {
                const t = e.target.value as SessionInject["type"];
                const injectAs: SessionInject =
                  t === "cookie"
                    ? { type: "cookie" }
                    : { type: "header", name: "Authorization", format: "Bearer {token}" };
                set({ ...value, injectAs });
              }}
              disabled={disabled}
            >
              <option value="cookie">Cookie（服务端 Set-Cookie 自动维护）</option>
              <option value="header">Header（从响应提取 token）</option>
            </select>
          </div>

          {value.injectAs.type === "header" && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 w-20">Header 名</span>
                <input
                  className="flex-1 px-2 py-1 border border-gray-200 rounded font-mono"
                  value={value.injectAs.name}
                  onChange={(e) =>
                    set({
                      ...value,
                      injectAs: { ...value.injectAs, type: "header", name: e.target.value } as SessionInject,
                    })
                  }
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 w-20">模板</span>
                <input
                  className="flex-1 px-2 py-1 border border-gray-200 rounded font-mono"
                  placeholder="Bearer {token}"
                  value={(value.injectAs as { format: string }).format}
                  onChange={(e) =>
                    set({
                      ...value,
                      injectAs: { ...value.injectAs, type: "header", format: e.target.value } as SessionInject,
                    })
                  }
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 w-20">Token 路径</span>
                <input
                  className="flex-1 px-2 py-1 border border-gray-200 rounded font-mono"
                  placeholder="data.token"
                  value={value.tokenJsonPath ?? ""}
                  onChange={(e) => set({ ...value, tokenJsonPath: e.target.value })}
                  disabled={disabled}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
