import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { validateMachine } from "../../fidelity/index.mjs";

const fixture = JSON.parse(readFileSync(new URL("fixtures/minimal-valid.json", import.meta.url)));
export const pose = (position = [0, 0, 0], rotation_xyzw = [0, 0, 0, 1]) => ({ position, rotation_xyzw });
export const box = (dimensions = [1, 1, 1], unit = "m") => ({ kind: "box", dimensions, unit });
export const part = (id, parentId = null, localRest = pose(), geometry = box()) => ({ id, parentId, localRest, geometry, definitionId: null, instanceId: null, scale: [1, 1, 1], materialId: "painted-steel", sourceIds: ["E0"], mass: null, auditGeometry: null, contactGeometry: null, approximationError: null });
export const frame = (id, partId, localPose = pose()) => ({ id, partId, pose: localPose, sourceIds: ["E0"] });
export const joint = (id, kind, parent, child, childFrame, parentFrame = pose(), axis = [0, 0, 1], limits = null) => ({ id, kind, parent, child, childFrame, parentFrame, axisIn: "joint", axis: kind === "fixed" ? null : axis, limits, sourceIds: ["E0"] });
export const rawMachine = (parts = [part("root")]) => ({ ...structuredClone(fixture), parts, definitions: [], instances: [], frames: [], joints: [], constraints: [], ports: [], connections: [], assets: [], claims: [], visibleText: [], criteria: [], dependencies: [] });
export const normalized = (raw) => {
  const result = validateMachine(raw);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.value;
};
export const near = (actual, expected, epsilon = 1e-12) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= epsilon, `${actual} differs from ${expected} at ${index}`));
};
export const diagnostic = (result, code) => assert.ok(result.diagnostics.some((entry) => entry.code === code), JSON.stringify(result.diagnostics));
export const ratio = (id, a, b, multiplier, offset = 0) => ({ id, kind: "ratio", jointIds: [a, b], ratio: multiplier, offset, sourceIds: ["E0"] });
export const movingPair = () => {
  const raw = rawMachine([part("root"), part("a", "root"), part("b", "root")]);
  raw.frames = [frame("a-frame", "a"), frame("b-frame", "b")];
  raw.joints = [joint("a-joint", "revolute", "root", "a", "a-frame"), joint("b-joint", "revolute", "root", "b", "b-frame")];
  return raw;
};
