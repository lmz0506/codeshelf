# CodeShelf MCP Gateway

CodeShelf can expose the API library from the "assistant - API" feature as MCP tools. External clients can call the same `ApiGroup` / `ApiEndpoint` definitions used by the in-app API chat panel.

## What It Exposes

- Each saved API endpoint becomes one MCP tool.
- Tool names are readable and stable, for example `api_get_api_assets_18a7fb87`.
- Legacy endpoint-id names such as `ep_18a7fb8742e76640` are still accepted for compatibility.
- The endpoint JSON schema becomes the MCP `inputSchema`.
- Tool calls reuse the existing CodeShelf executor, including base URL handling, path/query/body splitting, fixed headers, Bearer/Basic/API key auth, and session login auth.
- Results include both text content and structured response data.

## Transports

### stdio

Use stdio when the MCP client can launch a local command.

```bash
codeshelf-mcp --transport stdio
```

Development build:

```bash
cd src-tauri
cargo build --bin codeshelf-mcp
./target/debug/codeshelf-mcp --transport stdio
```

Example MCP config:

```json
{
  "mcpServers": {
    "codeshelf-api": {
      "command": "/absolute/path/to/codeshelf-mcp",
      "args": ["--transport", "stdio"]
    }
  }
}
```

This is the recommended mode for Claude Code, Kimi, Codex, and other clients that support command-based MCP servers.

### HTTP

Use HTTP when the MCP client can connect to a local gateway URL, or when you want to keep CodeShelf running as the gateway host.

Manual command:

```bash
codeshelf-mcp --transport http --host 127.0.0.1 --port 8787
```

In-app:

1. Open `Settings`.
2. Open `MCP Gateway`.
3. Start the HTTP gateway.
4. Use `http://127.0.0.1:8787/mcp` as the MCP endpoint.

Example MCP config:

```json
{
  "mcpServers": {
    "codeshelf-api": {
      "url": "http://127.0.0.1:8787/mcp"
    }
  }
}
```

## Client Notes

- Claude Code: use the stdio config unless your environment specifically supports HTTP MCP endpoints.
- Kimi: use the same stdio config shape if its MCP settings accept command-based servers.
- Codex: use stdio or HTTP depending on the environment.
- GitHub Copilot / IDE MCP integrations: use stdio when the IDE asks for `command` + `args`; use HTTP when it asks for a URL.

## Smoke Tests

Initialize over stdio:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' \
  | ./target/debug/codeshelf-mcp --transport stdio
```

List tools over HTTP:

```bash
curl -s -X POST http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Health check:

```bash
curl -s http://127.0.0.1:8787/health
```
