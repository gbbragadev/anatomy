import { inspectPlainData } from "../contracts/data.mjs";
import { diagnostic, hasErrors, pointer, compareIds } from "./diagnostics.mjs";

export function resolveCoordinates(compiled, input) {
  const diagnostics = [];
  inspectPlainData(input, "/q", diagnostics);
  if (!input || typeof input !== "object" || Array.isArray(input)) diagnostics.push(diagnostic("INVALID_JOINT_COORDINATES", "/q", "Joint coordinates must be a plain ID-to-number record."));
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };
  const joints = new Map(compiled.joints.map((entry) => [entry.id, entry]));
  const coordinates = new Map();
  for (const [id, value] of Object.entries(input)) {
    if (!joints.has(id)) diagnostics.push(diagnostic("UNKNOWN_JOINT_CHANNEL", `/q/${pointer(id)}`, `Joint channel ${id} is not registered.`));
    if (typeof value !== "number" || !Number.isFinite(value)) diagnostics.push(diagnostic(typeof value === "number" ? "NONFINITE_NUMBER" : "INVALID_JOINT_COORDINATE", `/q/${pointer(id)}`, "Joint coordinates must be finite canonical numbers."));
    else coordinates.set(id, value);
  }
  const closures = compiled.constraints.filter((entry) => entry.kind === "closure");
  for (const entry of closures) diagnostics.push(diagnostic("UNSUPPORTED_CONSTRAINT_SOLVER", compiled.sourcePaths.constraints[entry.id], "Closure targets and an analytic closure solver are unavailable; the constraint graph is retained without executable poses.", entry));
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };
  const ratios = compiled.constraints.filter((entry) => entry.kind === "ratio").sort(compareIds);
  const propagate = () => {
    let changed;
    do {
      changed = false;
      for (const entry of ratios) {
        const [a, b] = entry.jointIds;
        if (coordinates.has(a) && !coordinates.has(b)) {
          coordinates.set(b, entry.ratio * coordinates.get(a) + entry.offset);
          changed = true;
        } else if (!coordinates.has(a) && coordinates.has(b) && entry.ratio !== 0) {
          coordinates.set(a, (coordinates.get(b) - entry.offset) / entry.ratio);
          changed = true;
        } else if (!coordinates.has(b) && entry.ratio === 0) {
          coordinates.set(b, entry.offset);
          changed = true;
        }
      }
    } while (changed);
  };
  propagate();
  for (const joint of [...compiled.joints].sort(compareIds)) if (!coordinates.has(joint.id)) { coordinates.set(joint.id, 0); propagate(); }
  const residuals = [];
  for (const entry of ratios) {
    const expected = entry.ratio * coordinates.get(entry.jointIds[0]) + entry.offset;
    const observed = coordinates.get(entry.jointIds[1]);
    const residual = observed - expected;
    const tolerance = 1e-12 * Math.max(1, Math.abs(expected), Math.abs(observed));
    const unit = joints.get(entry.jointIds[0]).kind === "prismatic" ? "m" : "rad";
    const valid = Number.isFinite(expected) && Number.isFinite(observed) && Number.isFinite(residual) && Number.isFinite(tolerance);
    residuals.push({ constraintId: entry.id, residual: valid ? residual : null, tolerance: valid ? tolerance : null, unit, coverage: "executed", verdict: valid && Math.abs(residual) <= tolerance ? "passed" : "failed" });
    diagnostics.push(diagnostic(!valid ? "NONFINITE_CONSTRAINT" : Math.abs(residual) > tolerance ? "CONSTRAINT_VIOLATION" : "CONSTRAINT_RESIDUAL", compiled.sourcePaths.constraints[entry.id], valid ? `Analytic ratio residual ${residual} ${unit}; numerical tolerance ${tolerance} ${unit}.` : "Ratio evaluation overflowed; no executable coordinates are returned.", entry, valid && Math.abs(residual) <= tolerance ? "info" : "error"));
  }
  for (const joint of compiled.joints) {
    const value = coordinates.get(joint.id);
    if (!Number.isFinite(value)) diagnostics.push(diagnostic("NONFINITE_CONSTRAINT", `/q/${pointer(joint.id)}`, "A derived coordinate is not finite.", joint));
    else if (joint.kind === "fixed" && value !== 0) diagnostics.push(diagnostic("FIXED_JOINT_COORDINATE", `/q/${pointer(joint.id)}`, "Fixed joints permit only coordinate zero.", joint));
    else if (joint.limits && (value < joint.limits.min || value > joint.limits.max)) diagnostics.push(diagnostic("JOINT_LIMIT_EXCEEDED", `/q/${pointer(joint.id)}`, `Coordinate ${value} exceeds inclusive limits [${joint.limits.min}, ${joint.limits.max}].`, joint));
  }
  return hasErrors(diagnostics) ? { ok: false, diagnostics } : { ok: true, value: Object.fromEntries(coordinates), residuals, diagnostics };
}
