function compact(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatAgentError(err: unknown): string {
  const seen = new Set<unknown>();
  const lines: string[] = [];

  const visit = (value: unknown, prefix = "") => {
    if (value == null || seen.has(value)) return;
    seen.add(value);

    const message = compact(value);
    if (message) lines.push(prefix ? `${prefix}: ${message}` : message);

    if (typeof value !== "object") return;
    const obj = value as Record<string, unknown>;

    const errors = obj.errors;
    if (Array.isArray(errors)) {
      errors.forEach((e, i) => visit(e, `errors[${i}]`));
    } else if (errors && typeof errors === "object") {
      for (const [key, child] of Object.entries(errors as Record<string, unknown>)) {
        visit(child, `errors.${key}`);
      }
    }

    if (obj.cause) visit(obj.cause, "cause");
    if (obj.response) visit(obj.response, "response");
    if (obj.body) visit(obj.body, "body");
  };

  visit(err);

  const unique = Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean)));
  return unique.join("\n").slice(0, 4000) || String(err);
}
