import { inspectPlainData } from "./data.mjs";
import { validateQuantityShape } from "./schema.mjs";

const units = new Map([
  ["m", ["length", 1, "m"]], ["mm", ["length", 0.001, "m"]], ["cm", ["length", 0.01, "m"]], ["km", ["length", 1000, "m"]],
  ["rad", ["angle", 1, "rad"]], ["deg", ["angle", Math.PI / 180, "rad"]],
  ["kg", ["mass", 1, "kg"]], ["g", ["mass", 0.001, "kg"]],
  ["s", ["time", 1, "s"]], ["ms", ["time", 0.001, "s"]],
  ["m/s", ["speed", 1, "m/s"]], ["mm/s", ["speed", 0.001, "m/s"]],
  ["m/s2", ["acceleration", 1, "m/s2"]], ["mm/s2", ["acceleration", 0.001, "m/s2"]],
  ["rad/s", ["angular-speed", 1, "rad/s"]], ["deg/s", ["angular-speed", Math.PI / 180, "rad/s"]],
  ["kg/s", ["mass-flow", 1, "kg/s"]], ["g/s", ["mass-flow", 0.001, "kg/s"]],
  ["kg/m3", ["density", 1, "kg/m3"]], ["m3", ["volume", 1, "m3"]], ["L", ["volume", 0.001, "m3"]],
  ["1", ["dimensionless", 1, "1"]]
]);

export function unitInfo(unit) {
  return units.get(unit);
}

export function normalizeQuantity(quantity, dimension) {
  const diagnostics = [];
  inspectPlainData(quantity, "", diagnostics);
  if (diagnostics.length) return { ok: false, diagnostics };
  const error = (code, path, message) => diagnostics.push({ code, severity: "error", path, sourceIds: [], message });
  if (!quantity || typeof quantity !== "object" || Array.isArray(quantity)) return { ok: false, diagnostics: [{ code: "INVALID_QUANTITY", severity: "error", path: "", sourceIds: [], message: "Quantity must be plain data." }] };
  diagnostics.push(...validateQuantityShape(quantity));
  const info = unitInfo(quantity.unit);
  if (!info) error("UNKNOWN_UNIT", "/unit", "Unit is not registered.");
  else if (info[0] !== dimension) error("UNIT_DIMENSION_MISMATCH", "/unit", `Expected ${dimension}, received ${info[0]}.`);
  if (quantity.value !== null && (typeof quantity.value !== "number" || !Number.isFinite(quantity.value))) error("NONFINITE_NUMBER", "/value", "Quantity value must be finite or explicitly unknown.");
  for (const key of ["uncertainty", "manufacturingTolerance", "proposedTolerance", "numericAcceptance"]) {
    if (quantity[key] !== undefined && quantity[key] !== null && (typeof quantity[key] !== "number" || !Number.isFinite(quantity[key]) || quantity[key] < 0)) error("INVALID_TOLERANCE", `/${key}`, "Uncertainty and acceptance fields must be nonnegative or null.");
  }
  if (dimension === "mass" && quantity.value < 0) error("NEGATIVE_MASS", "/value", "Mass cannot be negative.");
  if (diagnostics.length) return { ok: false, diagnostics };
  const value = structuredClone(quantity);
  value.original = structuredClone(quantity);
  value.dimension = dimension;
  value.unit = info[2];
  value.value = quantity.value === null ? null : quantity.value * info[1];
  for (const key of ["uncertainty", "manufacturingTolerance", "proposedTolerance", "numericAcceptance"]) if (typeof value[key] === "number") value[key] *= Math.abs(info[1]);
  for (const key of ["value", "uncertainty", "manufacturingTolerance", "proposedTolerance", "numericAcceptance"]) {
    if (typeof quantity[key] === "number" && quantity[key] !== 0 && value[key] === 0) error("QUANTITY_UNDERFLOW", `/${key}`, "A nonzero quantity field cannot become zero during canonical unit conversion.");
  }
  inspectPlainData(value, "", diagnostics);
  if (diagnostics.length) return { ok: false, diagnostics };
  return { ok: true, value, diagnostics };
}
