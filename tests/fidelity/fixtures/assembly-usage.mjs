import { readFileSync } from "node:fs";
import { validateMachine, compileAssembly, resolvePoses, evaluateGeometry, verifyGeometryIdentity } from "../../../fidelity/index.mjs";

export function assemblyUsageFixture(headAngle_rad = 0.25) {
  const raw = JSON.parse(readFileSync(new URL("minimal-valid.json", import.meta.url)));
  const validated = validateMachine(raw);
  if (!validated.ok) return validated;
  const compiled = compileAssembly(validated.value, {});
  if (!compiled.ok) return compiled;
  const poses = resolvePoses(compiled.value, { "head-shaft": headAngle_rad });
  if (!poses.ok) return poses;
  const geometry = evaluateGeometry(compiled.value, poses.value);
  if (geometry.verdict !== "passed") return { ok: false, diagnostics: geometry.diagnostics };
  const identity = verifyGeometryIdentity(compiled.value, geometry.fragments);
  if (!identity.ok) return identity;
  return { ok: true, value: { spec: validated.value, compiled: compiled.value, posesByPartId: poses.value, geometry }, diagnostics: [...validated.diagnostics, ...compiled.diagnostics, ...poses.diagnostics, ...geometry.diagnostics, ...identity.diagnostics] };
}
