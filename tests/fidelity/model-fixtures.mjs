import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { validateMachine, compileAssembly } from "../../fidelity/index.mjs";
import { part, frame, joint, pose } from "./assembly-fixtures.mjs";

export const DT = 1 / 120;
export const C = (5 - 2 * Math.PI * 0.2) / 2;
export const bucketIds = Array.from({ length: 20 }, (_, index) => `bucket${String(index + 1).padStart(3, "0")}`);
export function rawBelt() {
  const raw = JSON.parse(readFileSync(new URL("fixtures/minimal-valid.json", import.meta.url)));
  raw.claims = []; raw.visibleText = []; raw.criteria = []; raw.dependencies = []; raw.ports = [];
  raw.parts.push(part("tail-pulley", "frame", pose(), { kind: "cylinder", radius: 0.2, length: 0.1, unit: "m" }));
  raw.frames.push(frame("tail-center", "tail-pulley"));
  raw.joints.push(joint("tail-shaft", "revolute", "frame", "tail-pulley", "tail-center", pose(), [0, 1, 0]));
  raw.constraints.push({ id: "tail-drive", kind: "ratio", jointIds: ["head-shaft", "tail-shaft"], ratio: 1, offset: 0, sourceIds: ["E0"] });
  bucketIds.forEach((id, index) => {
    raw.parts.push(part(id, "frame", pose([0, 0, index * 0.25]), { kind: "box", dimensions: [0.1, 0.12, 0.08], unit: "m" }));
    raw.frames.push(frame(`${id}-attachment`, id, pose([0, 0.02, 0])));
  });
  raw.initialState.inventory_kg.feed = 10;
  return raw;
}
export function beltSpec(change = () => {}) {
  const raw = rawBelt(); change(raw);
  const checked = validateMachine(raw);
  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
  const assembled = compileAssembly(checked.value);
  assert.equal(assembled.ok, true, JSON.stringify(assembled.diagnostics));
  return checked.value;
}
export function initial(spec, changes = {}) {
  return { ...structuredClone(spec.initialState), ...changes, inventory_kg: { ...spec.initialState.inventory_kg, ...changes.inventory_kg } };
}
export const command = (id, type, tick = 0, value, unit) => ({ id, type, tick, ...(value === undefined ? {} : { value, unit }) });
export const approx = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}, tolerance ${tolerance}`);
export const code = (result, name) => assert.ok(result.diagnostics.some((entry) => entry.code === name), JSON.stringify(result.diagnostics));
export const total = (inventory) => Object.values(inventory).reduce((sum, value) => sum + value, 0);
