import { inspectPlainData } from "../contracts/data.mjs";
import { freezeData } from "../assembly/diagnostics.mjs";

export { freezeData };
export const issue = (code, path, message, details = {}, severity = "error") => ({ code, severity, path, sourceIds: ["E0"], ...details, message });
export const failed = (diagnostics) => diagnostics.some((entry) => entry.severity === "error");
export function plain(value, path = "") {
  const diagnostics = [];
  inspectPlainData(value, path, diagnostics);
  if (failed(diagnostics)) throw new ModelError(diagnostics);
}
export class ModelError extends Error {
  constructor(diagnostics) { super(diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join("; ")); this.name = "ModelError"; this.diagnostics = diagnostics; }
}
export function requireModel(condition, code, path, message) {
  if (!condition) throw new ModelError([issue(code, path, message)]);
}
export const compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export const stableStringify = (value) => JSON.stringify(value, (_, entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, entry[key]])) : entry);
export function replayHash(value) {
  const text = stableStringify(value);
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let index = 0; index < text.length; index++) { a = Math.imul(a ^ text.charCodeAt(index), 0x01000193) >>> 0; b = Math.imul(b ^ text.charCodeAt(index), 0x85ebca6b) >>> 0; }
  return `fnv-pair-${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}
