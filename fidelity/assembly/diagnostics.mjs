export const diagnostic = (code, path, message, record = {}, severity = "error") => ({ code, severity, path, sourceIds: [...(record.sourceIds ?? [])], ...(record.partId ? { partId: record.partId } : {}), message });
export const hasErrors = (diagnostics) => diagnostics.some((entry) => entry.severity === "error");
export const pointer = (value) => String(value).replaceAll("~", "~0").replaceAll("/", "~1");
export const compareIds = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export const freezeData = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) freezeData(entry);
    Object.freeze(value);
  }
  return value;
};
