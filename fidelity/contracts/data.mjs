const pointer = (key) => String(key).replaceAll("~", "~0").replaceAll("/", "~1");

export function inspectPlainData(value, path, diagnostics, ancestors = new Set()) {
  const add = (code, message) => diagnostics.push({ code, severity: "error", path, sourceIds: [], message });
  if (typeof value === "number" && !Number.isFinite(value)) add("NONFINITE_NUMBER", "Numbers must be finite before JSON serialization.");
  if (["function", "symbol", "bigint", "undefined"].includes(typeof value)) add("EXECUTABLE_DATA", "Only JSON-compatible plain data is accepted.");
  if (typeof value === "string" && (/<\s*[a-z!/?][^>]*>/i.test(value) || /^\s*(javascript:|data:text\/html)/i.test(value))) add("UNSAFE_TEXT", "Raw markup and executable URIs are not accepted.");
  if (!value || typeof value !== "object") return;
  if (ancestors.has(value)) { add("CYCLIC_DATA", "JSON data cannot contain object cycles."); return; }
  if (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(value))) { add("NONPLAIN_DATA", "Only plain objects and arrays are accepted."); return; }
  if (Array.isArray(value)) for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) diagnostics.push({ code: "NONPLAIN_DATA", severity: "error", path: `${path}/${i}`, sourceIds: [], message: "Sparse arrays are not JSON data." });
  ancestors.add(value);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (Array.isArray(value) && key === "length") continue;
    const next = `${path}/${pointer(key)}`;
    if (!descriptor.enumerable || Array.isArray(value) && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) diagnostics.push({ code: "NONPLAIN_DATA", severity: "error", path: next, sourceIds: [], message: "Properties that JSON serialization omits are not accepted." });
    if (descriptor.get || descriptor.set) diagnostics.push({ code: "EXECUTABLE_DATA", severity: "error", path: next, sourceIds: [], message: "Accessors must not execute while validating data." });
    else inspectPlainData(descriptor.value, next, diagnostics, ancestors);
  }
  if (Object.getOwnPropertySymbols(value).length) add("NONPLAIN_DATA", "JSON data cannot carry symbol fields.");
  ancestors.delete(value);
}
