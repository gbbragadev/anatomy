import assert from "node:assert/strict";
import test from "node:test";
import { validateMachine, compileAssembly, evaluateGeometry } from "../../fidelity/index.mjs";
import { prismTopology } from "../../fidelity/assembly/geometry.mjs";
import { pose, box, part, frame, rawMachine, normalized, diagnostic, movingPair, near } from "./assembly-fixtures.mjs";

const polygon = (count) => Array.from({ length: count }, (_, index) => [Math.cos(2 * Math.PI * index / count), Math.sin(2 * Math.PI * index / count)]);
const prism = (vertices, height = 1) => ({ kind: "prism", vertices, height, unit: "m" });
const compileShape = (geometry, placement = pose()) => compileAssembly(normalized(rawMachine([part("body", null, placement, geometry)])), {});

for (const sign of [1, -1]) test(`R1 crossing tiny edges remain invalid with orientation sign ${sign}`, () => {
  const e = 2 ** -700;
  const vertices = [[-2 * e, -e], [e, -e], [0, -2 * e], [-e, 0], [2 * e, 2 * e], [-1, 1]].map(([x, y]) => [sign * x, y]);
  const result = compileShape(prism(vertices));
  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
  diagnostic(result, "INVALID_PRISM_TOPOLOGY");
});

test("R1 exact collinear diagonal vertices remain supported when the polygon is simple", () => {
  const result = compileShape(prism([[0, 0], [1, 1], [2, 2], [2, 0]]));
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(evaluateGeometry(result.value, result.value.restPosesByPartId).verdict, "passed");
});

for (const [name, geometry] of [
  ["box", box([Number.MIN_VALUE, 1, 1])],
  ["cylinder", { kind: "cylinder", radius: 1, length: Number.MIN_VALUE, unit: "m" }],
  ["prism", prism([[0, 0], [1, 0], [0, 1]], Number.MIN_VALUE)]
]) test(`R2 ${name} positive full thickness cannot underflow during extent construction`, () => {
  const result = compileShape(geometry);
  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
  diagnostic(result, "UNSUPPORTED_GEOMETRY_PRECISION");
});

test("R2 positive geometry cannot collapse after a finite world translation", () => {
  const result = compileShape(box(), pose([1e20, 0, 0]));
  assert.equal(result.ok, false);
  diagnostic(result, "UNSUPPORTED_GEOMETRY_PRECISION");
});

test("R2 snapshot evaluation rejects precision collapse at a later world pose", () => {
  const compiled = compileShape(box());
  assert.equal(compiled.ok, true);
  const result = evaluateGeometry(compiled.value, { body: pose([1e20, 0, 0]) });
  assert.equal(result.verdict, "failed");
  assert.deepEqual(result.fragments, []);
  assert.equal(result.bounds, null);
  diagnostic(result, "UNSUPPORTED_GEOMETRY_PRECISION");
});

test("R3 source rounding is normalized once for part, frame, joint and compound poses", () => {
  const raw = movingPair();
  const rotation = [0, 0, 0, 1 + 5e-10];
  raw.parts[0].localRest.rotation_xyzw = [...rotation];
  raw.frames[0].pose.rotation_xyzw = [...rotation];
  raw.joints[0].parentFrame.rotation_xyzw = [...rotation];
  raw.parts[0].geometry = { kind: "compound", components: [{ id: "shell", pose: pose([0, 0, 0], [...rotation]), geometry: box() }] };
  const before = structuredClone(raw);
  const validated = validateMachine(raw);
  assert.equal(validated.ok, true, JSON.stringify(validated.diagnostics));
  const poses = [validated.value.parts[0].localRest, validated.value.frames[0].pose, validated.value.joints[0].parentFrame, validated.value.parts[0].geometry.components[0].pose];
  for (const entry of poses) {
    assert.ok(Math.abs(Math.hypot(...entry.rotation_xyzw) - 1) <= 1e-15);
    assert.deepEqual(entry.original.rotation_xyzw, rotation);
    assert.equal(entry.original.unit, "m");
  }
  assert.deepEqual(raw, before);
  const result = compileAssembly(validated.value, {});
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
});

test("R3 accepted mixed quaternion components produce canonical rotations and retain source units", () => {
  const raw = rawMachine();
  raw.frame.unit = "mm";
  raw.parts[0].localRest.position = [100, 200, 300];
  const source = [0, 0, Math.SQRT1_2 * (1 + 5e-10), Math.SQRT1_2 * (1 + 5e-10)];
  raw.parts[0].localRest.rotation_xyzw = source;
  const validated = validateMachine(raw);
  assert.equal(validated.ok, true);
  const canonical = validated.value.parts[0].localRest;
  near(canonical.rotation_xyzw, [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
  assert.ok(Math.abs(Math.hypot(...canonical.rotation_xyzw) - 1) <= 1e-15);
  assert.deepEqual(canonical.original.rotation_xyzw, source);
  assert.deepEqual(canonical.original.position, [100, 200, 300]);
  assert.equal(canonical.original.unit, "mm");
  near(canonical.position, [0.1, 0.2, 0.3]);
  assert.equal(compileAssembly(validated.value, {}).ok, true);
});

test("R3 source norm errors beyond the producer tolerance still fail", () => {
  for (const rotation of [[0, 0, 0, 1 + 2e-9], [0, 0, 0, 0]]) {
    const raw = rawMachine();
    raw.parts[0].localRest.rotation_xyzw = rotation;
    const result = validateMachine(raw);
    assert.equal(result.ok, false);
    diagnostic(result, "INVALID_QUATERNION");
  }
});

for (const count of [1025, 70000]) test(`R4 ${count}-vertex prism returns controlled unsupported complexity`, () => {
  const vertices = polygon(count);
  let direct;
  assert.doesNotThrow(() => { direct = prismTopology(vertices); });
  assert.deepEqual(direct, { valid: false, code: "UNSUPPORTED_PRISM_COMPLEXITY" });
  let result;
  assert.doesNotThrow(() => { result = compileShape(prism(vertices)); });
  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
  const failure = result.diagnostics.find((entry) => entry.code === "UNSUPPORTED_PRISM_COMPLEXITY");
  assert.equal(failure.path, "/parts/0/geometry/vertices");
  assert.equal(failure.partId, "body");
});

test("R4 documented 1024-vertex work boundary remains supported", () => {
  const result = compileShape(prism(polygon(1024)));
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(evaluateGeometry(result.value, result.value.restPosesByPartId).verdict, "passed");
});

test("R5 failed definition geometry retains definition and part evidence with the exact pointer", () => {
  const raw = rawMachine([part("defined")]);
  raw.sources.push({ id: "shape-evidence", kind: "drawing", locator: "synthetic-shape", revision: "v1", hash: null, confidence: "verified", uncertainty: null });
  raw.definitions = [{ id: "definition", materialId: "painted-steel", sourceIds: ["shape-evidence"], geometry: prism([[0, 0], [1, 0], [2, 0]]) }];
  raw.instances = [{ id: "instance", definitionId: "definition", partId: "defined" }];
  Object.assign(raw.parts[0], { geometry: null, definitionId: "definition", instanceId: "instance" });
  const result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  const failure = result.diagnostics.find((entry) => entry.code === "INVALID_PRISM_TOPOLOGY");
  assert.equal(failure.path, "/definitions/0/geometry/vertices");
  assert.equal(failure.partId, "defined");
  assert.deepEqual(failure.sourceIds, ["E0", "shape-evidence"]);
});

const connectedAt = (base, fromOffset = 0, toOffset = 0, rotation = [0, 0, 0, 1]) => {
  const raw = rawMachine([part("base", null, pose(base, rotation)), part("bearing", "base")]);
  raw.frames = [frame("from-frame", "base", pose([fromOffset, 0, 0])), frame("to-frame", "bearing", pose([toOffset, 0, 0]))];
  raw.ports = [
    { id: "from-port", partId: "base", frameId: "from-frame", kind: "mount", direction: "bidirectional", sourceIds: ["E0"] },
    { id: "to-port", partId: "bearing", frameId: "to-frame", kind: "mount", direction: "bidirectional", sourceIds: ["E0"] }
  ];
  raw.connections = [{ id: "mount", fromPortId: "from-port", toPortId: "to-port", kind: "mechanical", intendedContact: true, sourceIds: ["E0"] }];
  return raw;
};

test("N4 a nanometre interface gap cannot become a passed zero residual at a large base", () => {
  for (const [base, rotation] of [
    [[1e8, 0, 0], [0, 0, 0, 1]],
    [[0, 1e8, 0], [0, 0, Math.SQRT1_2, Math.SQRT1_2]]
  ]) for (const [from, to] of [[0, 1e-9], [0, -1e-9], [1, 1.000000001]]) {
    let result;
    assert.doesNotThrow(() => { result = compileAssembly(normalized(connectedAt(base, from, to, rotation)), {}); });
    assert.equal(result.ok, false);
    assert.equal("value" in result, false);
    const failure = result.diagnostics.find((entry) => entry.code === "UNSUPPORTED_POSE_PRECISION");
    assert.equal(failure.path, "/connections/0");
    assert.equal(failure.partId, "bearing");
    assert.deepEqual(failure.sourceIds, ["E0"]);
  }
});

test("N4 ordinary and representable large-base gaps retain the existing alignment rejection", () => {
  for (const [base, gap] of [[10, 1e-9], [1e8, 0.25]]) {
    const result = compileAssembly(normalized(connectedAt([base, 0, 0], 0, gap)), {});
    assert.equal(result.ok, false);
    diagnostic(result, "INTERFACE_MISALIGNED");
    assert.equal(result.diagnostics.some((entry) => entry.code === "UNSUPPORTED_POSE_PRECISION"), false);
  }
});

test("N4 zero, ordinary and representable rotated interface offsets stay aligned", () => {
  for (const [base, offset, rotation] of [
    [[10, 0, 0], 0.1, [0, 0, 0, 1]],
    [[10, 0, 0], 1e-9, [0, 0, 0, 1]],
    [[1e8, 0, 0], 0, [0, 0, 0, 1]],
    [[1e8, 0, 0], 0.25, [0, 0, 0, 1]],
    [[0, 1e8, 0], 0.25, [0, 0, Math.SQRT1_2, Math.SQRT1_2]]
  ]) {
    const result = compileAssembly(normalized(connectedAt(base, offset, offset, rotation)), {});
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal(result.value.interfaces[0].verdict, "passed");
    assert.equal(result.value.interfaces[0].residual.position_m, 0);
  }
});

test("N4 snapshot evaluation rejects interface offset loss after translation", () => {
  const compiled = compileAssembly(normalized(connectedAt([10, 0, 0], 1e-9, 1e-9)), {});
  assert.equal(compiled.ok, true, JSON.stringify(compiled.diagnostics));
  const poses = { base: pose([1e8, 0, 0]), bearing: pose([1e8, 0, 0]) };
  let result;
  assert.doesNotThrow(() => { result = evaluateGeometry(compiled.value, poses); });
  assert.equal(result.verdict, "failed");
  assert.deepEqual(result.interfaces, []);
  assert.deepEqual(result.fragments, []);
  assert.equal(result.bounds, null);
  diagnostic(result, "UNSUPPORTED_POSE_PRECISION");
});

test("N4 nested compound placement cannot discard a significant local offset", () => {
  const geometry = { kind: "compound", components: [{ id: "outer", pose: pose([1e8, 0, 0]), geometry: { kind: "compound", components: [{ id: "inner", pose: pose([1e-9, 0, 0]), geometry: box() }] } }] };
  let result;
  assert.doesNotThrow(() => { result = compileShape(geometry); });
  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
  const failure = result.diagnostics.find((entry) => entry.code === "UNSUPPORTED_POSE_PRECISION");
  assert.equal(failure.path, "/parts/0/geometry/components/0/geometry/components/0/pose");
  assert.equal(failure.partId, "body");
});

test("N4 compound world placement rejects offset loss at compile and later evaluation", () => {
  const geometry = { kind: "compound", components: [{ id: "detail", pose: pose([1e-9, 0, 0]), geometry: box() }] };
  const initial = compileShape(geometry, pose([1e8, 0, 0]));
  assert.equal(initial.ok, false);
  diagnostic(initial, "UNSUPPORTED_POSE_PRECISION");
  const compiled = compileShape(geometry, pose([10, 0, 0]));
  assert.equal(compiled.ok, true, JSON.stringify(compiled.diagnostics));
  const result = evaluateGeometry(compiled.value, { body: pose([1e8, 0, 0]) });
  assert.equal(result.verdict, "failed");
  assert.deepEqual(result.fragments, []);
  diagnostic(result, "UNSUPPORTED_POSE_PRECISION");
});
