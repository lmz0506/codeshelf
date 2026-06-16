import readline from "node:readline";
import type { RpcEvent, RpcRequest, RpcResponse } from "./types.js";

export type RpcHandler = (request: RpcRequest) => Promise<unknown>;

export function sendResponse(response: RpcResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

export function sendEvent(event: RpcEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

export function startRpc(handler: RpcHandler): void {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    void (async () => {
      if (!line.trim()) return;
      let request: RpcRequest;
      try {
        request = JSON.parse(line) as RpcRequest;
      } catch (err) {
        sendResponse({
          id: "unknown",
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      try {
        const result = await handler(request);
        sendResponse({ id: request.id, ok: true, result });
      } catch (err) {
        sendResponse({
          id: request.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  });
}
