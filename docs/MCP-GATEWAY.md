# CodeShelf MCP Gateway

CodeShelf 的 MCP Gateway 是应用面板的一部分，不需要单独启动第二个服务。你在 `设置 -> MCP Gateway` 里配置监听地址和端口，CodeShelf 会把接口库暴露为 MCP tools，外部工具通过这个本地 HTTP 地址调用。

## 能力

- 每个已保存的 API 接口会变成一个 MCP tool。
- Tool 名可读且稳定，例如 `api_get_api_assets_18a7fb87`。
- 旧的 endpoint-id 名称，例如 `ep_18a7fb8742e76640`，仍可作为兼容调用入口。
- 接口的 JSON Schema 会映射为 MCP `inputSchema`。
- 调用复用 CodeShelf 现有执行器，包括 baseUrl、path/query/body、headers、Bearer/Basic/API Key/Session 鉴权。
- 返回内容同时包含文本结果和结构化结果。

## 启动方式

1. 打开 CodeShelf。
2. 进入 `设置 -> MCP Gateway`。
3. 设置监听地址和端口，例如 `127.0.0.1` + `8787`。
4. 点击启动。
5. 外部 MCP 客户端连接 `http://127.0.0.1:8787/mcp`。

启用状态、host、port 会保存到应用设置里。下次 CodeShelf 启动时，如果 MCP Gateway 是启用状态，会自动按保存的端口恢复。

## MCP 客户端配置

HTTP 配置示例：

```json
{
  "mcpServers": {
    "codeshelf-api": {
      "url": "http://127.0.0.1:8787/mcp"
    }
  }
}
```

Codex TOML 示例：

```toml
[mcp_servers.codeshelf-api]
url = "http://127.0.0.1:8787/mcp"
```

Claude Code、Kimi、GitHub Copilot 和 IDE 集成如果支持 HTTP MCP endpoint，就填上面的 URL。这个实现刻意不再提供独立 stdio sidecar，避免出现面板和外部进程两套网关。

## 冒烟测试

健康检查：

```bash
curl -s http://127.0.0.1:8787/health
```

列出 tools：

```bash
curl -s -X POST http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
