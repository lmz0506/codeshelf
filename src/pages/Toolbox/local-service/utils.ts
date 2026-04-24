import type { ForwardRule, ServerConfig } from "@/types/toolbox";

export function getServerUrl(server: ServerConfig): string {
  const prefix = server.urlPrefix === "/" ? "" : server.urlPrefix;
  const base = `http://127.0.0.1:${server.port}${prefix}`;

  if (server.indexPage) {
    const index = server.indexPage.startsWith("/") ? server.indexPage : `/${server.indexPage}`;
    return `${base}${index}`;
  }

  return `${base}/`;
}

export function getForwardUrl(rule: ForwardRule): string {
  const base = `http://127.0.0.1:${rule.localPort}`;
  if (rule.docPath) {
    const docPath = rule.docPath.startsWith("/") ? rule.docPath : `/${rule.docPath}`;
    return `${base}${docPath}`;
  }
  return base;
}

export function nginxFileName(server: ServerConfig): string {
  const safeName = server.name.trim().replace(/[^\w\u4e00-\u9fa5.-]+/g, "-") || "service";
  return `${safeName}-nginx.conf`;
}
