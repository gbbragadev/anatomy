import assert from "node:assert/strict";
import test from "node:test";
import { compileAssembly, resolvePoses, evaluateGeometry, verifyGeometryIdentity } from "../../fidelity/assembly/index.mjs";
import { pose, box, part, frame, joint, rawMachine, normalized, near, diagnostic, movingPair, ratio } from "./assembly-fixtures.mjs";

const compile = (raw, assets = {}) => {
  const result = compileAssembly(normalized(raw), assets);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.value;
};
const snapshot = (compiled) => evaluateGeometry(compiled, compiled.restPosesByPartId);
const port = (id, partId, frameId, kind = "mount", direction = "bidirectional") => ({ id, partId, frameId, kind, direction, sourceIds: ["E0"] });
const connected = () => {
  const raw = rawMachine([part("base"), part("bearing", "base"), part("unrelated")]);
  raw.frames = [frame("base-port-frame", "base"), frame("bearing-port-frame", "bearing")];
  raw.ports = [port("base-port", "base", "base-port-frame"), port("bearing-port", "bearing", "bearing-port-frame")];
  raw.connections = [{ id: "named-mount", fromPortId: "base-port", toPortId: "bearing-port", kind: "mechanical", intendedContact: true, sourceIds: ["E0"] }];
  return raw;
};

test("normalizes unequal geometry units once and keeps a local-Z cylinder with full length", () => {
  const raw = rawMachine([part("box", null, pose([10, 0, 0]), box([100, 200, 300], "mm")), part("cylinder", null, pose(), { kind: "cylinder", radius: 20, length: 50, unit: "cm" })]);
  raw.frame.unit = "cm";
  const spec = normalized(raw);
  const before = structuredClone(spec);
  const compiled = compileAssembly(spec, {}).value;
  const geometry = snapshot(compiled);
  assert.equal(geometry.coverage, "executed");
  assert.equal(geometry.verdict, "passed");
  const cylinder = geometry.fragments.find((entry) => entry.partId === "cylinder");
  assert.equal(cylinder.geometry.radius, 0.2);
  assert.equal(cylinder.geometry.length, 0.5);
  near(cylinder.bounds.min, [-0.2, -0.2, -0.25]);
  near(cylinder.bounds.max, [0.2, 0.2, 0.25]);
  const block = geometry.fragments.find((entry) => entry.partId === "box");
  near(block.geometry.dimensions, [0.1, 0.2, 0.3]);
  near(block.bounds.min, [0.05, -0.1, -0.15]);
  assert.deepEqual(spec, before);
});

test("applies uniform geometry and compound-offset scale once without scaling world translations", () => {
  const raw = rawMachine([part("compound", null, pose([10, 0, 0]), { kind: "compound", components: [{ id: "shell", pose: pose([1, 0, 0]), geometry: box([2, 4, 6]) }] })]);
  raw.parts[0].scale = [2, 2, 2];
  const compiled = compile(raw);
  const geometry = snapshot(compiled);
  near(geometry.fragments[0].geometry.dimensions, [4, 8, 12]);
  near(geometry.fragments[0].pose.position, [12, 0, 0]);
  near(geometry.bounds.min, [10, -4, -6]);
  near(geometry.bounds.max, [14, 4, 6]);
});

test("preserves ordered asymmetric prism vertices and centred extrusion", () => {
  const raw = rawMachine([part("prism", null, pose(), { kind: "prism", vertices: [[0, 0], [3, 0], [1, 2]], height: 0.4, unit: "m" })]);
  const geometry = snapshot(compile(raw));
  assert.deepEqual(geometry.fragments[0].geometry.vertices, [[0, 0], [3, 0], [1, 2]]);
  near(geometry.bounds.min, [0, 0, -0.2]);
  near(geometry.bounds.max, [3, 2, 0.2]);
});

test("compound fragmentation and repeated definitions preserve stable physical identities", () => {
  const raw = rawMachine([part("one"), part("two", null, pose([4, 0, 0]))]);
  raw.definitions = [{ id: "shared", geometry: { kind: "compound", components: [{ id: "left", pose: pose([-1, 0, 0]), geometry: box() }, { id: "right", pose: pose([1, 0, 0]), geometry: box() }] }, materialId: "painted-steel", sourceIds: ["E0"] }];
  raw.parts.forEach((entry) => { entry.geometry = null; entry.definitionId = "shared"; entry.instanceId = `${entry.id}-instance`; });
  raw.instances = raw.parts.map((entry) => ({ id: entry.instanceId, definitionId: "shared", partId: entry.id }));
  const first = compile(raw);
  assert.equal(first.partToFragmentIds.one.length, 2);
  assert.equal(first.partToFragmentIds.two.length, 2);
  assert.equal(new Set(Object.values(first.partToFragmentIds).flat()).size, 4);
  const geometry = snapshot(first);
  for (const entry of geometry.fragments) assert.equal(first.fragmentToPartId[entry.id], entry.partId);
  raw.parts.reverse();
  raw.instances.reverse();
  raw.definitions[0].geometry.components.reverse();
  const second = compile(raw);
  assert.deepEqual(second.partToFragmentIds, first.partToFragmentIds);
  assert.deepEqual(snapshot(second).fragments, geometry.fragments);
});

test("world cylinder bounds use the rotated analytic radius rather than a rotated box proxy", () => {
  const s = Math.SQRT1_2;
  const raw = rawMachine([part("cylinder", null, pose([1, 2, 3], [0, s, 0, s]), { kind: "cylinder", radius: 0.2, length: 0.1, unit: "m" })]);
  const geometry = snapshot(compile(raw));
  near(geometry.bounds.min, [0.95, 1.8, 2.8]);
  near(geometry.bounds.max, [1.05, 2.2, 3.2]);
});

test("render, audit and contact proxies retain separate geometry and unknown error bounds", () => {
  const raw = rawMachine([part("body", null, pose(), { kind: "cylinder", radius: 0.2, length: 0.1, unit: "m" })]);
  raw.parts[0].auditGeometry = box([0.4, 0.4, 0.1]);
  raw.parts[0].contactGeometry = { kind: "cylinder", radius: 0.19, length: 0.1, unit: "m" };
  let compiled = compile(raw);
  assert.equal(compiled.approximationErrorsByPartId.body.render_m, 0);
  assert.equal(compiled.approximationErrorsByPartId.body.audit_m, null);
  assert.equal(compiled.approximationErrorsByPartId.body.contact_m, null);
  let geometry = snapshot(compiled);
  assert.equal(geometry.auditFragments[0].geometry.kind, "box");
  assert.equal(geometry.contactFragments[0].geometry.radius, 0.19);
  raw.parts[0].approximationError = { value: 10, unit: "mm", sourceIds: ["E0"], uncertainty: null, manufacturingTolerance: null, proposedTolerance: null, numericAcceptance: null };
  raw.parts[0].scale = [2, 2, 2];
  compiled = compile(raw);
  assert.equal(compiled.approximationErrorsByPartId.body.audit_m, 0.02);
  assert.equal(compiled.approximationErrorsByPartId.body.contact_m, 0.02);
  geometry = snapshot(compiled);
  assert.equal(geometry.contactFragments[0].geometry.radius, 0.38);
});

test("missing audit/contact geometry stays missing with explicit unevaluated capability", () => {
  const compiled = compile(rawMachine());
  assert.deepEqual(snapshot(compiled).auditFragments, []);
  assert.deepEqual(snapshot(compiled).contactFragments, []);
  assert.ok(compiled.requiredCapabilities.some((entry) => entry.capability === "audit-geometry" && entry.verdict === "not-evaluated"));
  assert.equal(compiled.approximationErrorsByPartId.root.audit_m, null);
});

test("a renderer-only 0.20 to 0.22 radius mismatch fails canonical geometry identity", () => {
  const compiled = compile(rawMachine([part("pulley", null, pose(), { kind: "cylinder", radius: 0.2, length: 0.1, unit: "m" })]));
  const geometry = snapshot(compiled);
  assert.equal(verifyGeometryIdentity(compiled, geometry.fragments).ok, true);
  const changed = structuredClone(geometry.fragments);
  changed[0].geometry.radius = 0.22;
  const result = verifyGeometryIdentity(compiled, changed);
  assert.equal(result.ok, false);
  diagnostic(result, "GEOMETRY_IDENTITY_MISMATCH");
});

test("intended contact exemptions contain only the explicitly named physical pair", () => {
  const compiled = compile(connected());
  assert.deepEqual(compiled.intendedContacts, [{ connectionId: "named-mount", partIds: ["base", "bearing"], sourceIds: ["E0"] }]);
  assert.ok(!snapshot(compiled).intendedContacts.some((entry) => entry.partIds.includes("unrelated")));
  assert.ok(!compiled.intendedContacts.some((entry) => entry.partIds.includes("unrelated")));
});

test("ports reject incompatible kinds and directed material endpoints", () => {
  let raw = connected();
  raw.ports[1].kind = "shaft";
  let result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  diagnostic(result, "INCOMPATIBLE_PORTS");
  raw = connected();
  raw.ports.forEach((entry) => { entry.kind = "flow"; entry.direction = "input"; });
  raw.connections[0].kind = "material";
  result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  diagnostic(result, "INCOMPATIBLE_PORT_DIRECTION");
});

test("rest interface alignment fails with residuals, and moving mounts are checked again", () => {
  const raw = connected();
  raw.frames[1].pose.position = [0, 0, 0.001];
  const result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  diagnostic(result, "INTERFACE_MISALIGNED");
  const compiled = compile(connected());
  assert.ok(compiled.interfaces[0].residual.position_m === 0);
  assert.equal(compiled.interfaces[0].tolerance.position_m, 1e-12);
  assert.equal(compiled.interfaces[0].tolerance.angle_rad, 1e-12);
  const poses = structuredClone(compiled.restPosesByPartId);
  poses.bearing.position = [0.001, 0, 0];
  const moved = evaluateGeometry(compiled, poses);
  assert.equal(moved.verdict, "failed");
  diagnostic(moved, "INTERFACE_MISALIGNED");
});

test("unsupported and unresolved assets do not substitute a visually similar primitive", () => {
  const raw = rawMachine([part("imported", null, pose(), { kind: "asset", assetId: "asset" })]);
  raw.assets = [{ id: "asset", uri: "assets/local.glb", hash: "a".repeat(64), format: "glb", sourceIds: ["E0"], sourceFrame: { handedness: "right", up: "Y", unit: "mm" }, license: "MIT", author: "Fixture author", attribution: "Fixture", redistribution: true }];
  const result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
  diagnostic(result, "UNSUPPORTED_ASSET_GEOMETRY");
});

test("invalid and self-intersecting prism topology fails rather than filling a different solid", () => {
  for (const vertices of [[[0, 0], [1, 1], [0, 1], [1, 0]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [1, 0], [1, 0], [0, 1]]]) {
    const raw = rawMachine([part("bad-prism", null, pose(), { kind: "prism", vertices, height: 1, unit: "m" })]);
    const result = compileAssembly(normalized(raw), {});
    assert.equal(result.ok, false);
    diagnostic(result, "INVALID_PRISM_TOPOLOGY");
  }
});

test("unsupported mixed ratios and ambiguous linked-frame scaling are diagnosed", () => {
  const raw = movingPair();
  raw.joints[1].kind = "prismatic";
  raw.constraints = [ratio("mixed", "a-joint", "b-joint", 2)];
  const result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  diagnostic(result, "UNSUPPORTED_RATIO_UNITS");
  const scaled = movingPair();
  scaled.parts[1].scale = [2, 2, 2];
  const scaling = compileAssembly(normalized(scaled), {});
  assert.equal(scaling.ok, false);
  diagnostic(scaling, "UNSUPPORTED_FRAME_SCALE");
});

test("malformed normalized inputs, joint linkage, axes and overflow never emit executable partials", () => {
  const raw = movingPair();
  const spec = normalized(raw);
  spec.joints[0].axis = [0, 0, 0];
  let result = compileAssembly(spec, {});
  assert.equal(result.ok, false);
  diagnostic(result, "ZERO_AXIS");
  const mismatch = normalized(raw);
  mismatch.joints[0].parent = "b";
  result = compileAssembly(mismatch, {});
  assert.equal(result.ok, false);
  diagnostic(result, "JOINT_PARENT_MISMATCH");
  const overflow = normalized(rawMachine());
  overflow.parts[0].geometry.dimensions = [Number.MAX_VALUE, 2, 3];
  overflow.parts[0].scale = [2, 2, 2];
  result = compileAssembly(overflow, {});
  assert.equal(result.ok, false);
  diagnostic(result, "NONFINITE_GEOMETRY");
  assert.equal(compileAssembly(rawMachine(), {}).ok, false);
});

test("invalid snapshot poses and geometry identity fragments return explicit failures", () => {
  const compiled = compile(rawMachine());
  for (const poses of [{}, { root: pose([Infinity, 0, 0]) }, { root: pose([0, 0, 0], [0, 0, 0, 0]) }, { root: pose(), extra: pose() }]) {
    const geometry = evaluateGeometry(compiled, poses);
    assert.equal(geometry.verdict, "failed");
    assert.equal(geometry.fragments.length, 0);
  }
  assert.equal(verifyGeometryIdentity(compiled, []).ok, false);
  const geometry = snapshot(compiled);
  assert.equal(verifyGeometryIdentity(compiled, [geometry.fragments[0], geometry.fragments[0]]).ok, false);
});

test("underflowed dimensions fail safely", () => {
  const underflow = normalized(rawMachine());
  underflow.parts[0].geometry.dimensions = [Number.MIN_VALUE, 1, 1];
  underflow.parts[0].scale = [0.5, 0.5, 0.5];
  let result = compileAssembly(underflow, {});
  assert.equal(result.ok, false);
  diagnostic(result, "NONPOSITIVE_GEOMETRY");
});

test("prism topology precision loss is diagnosed as unsupported", () => {
  const thin = rawMachine([part("thin", null, pose(), { kind: "prism", vertices: [[0, 0], [1e200, 0], [1e200, 1e-200], [0, 1e-200]], height: 1, unit: "m" })]);
  const result = compileAssembly(normalized(thin), {});
  assert.equal(result.ok, false);
  diagnostic(result, "UNSUPPORTED_PRISM_PRECISION");
});

test("finite local values that overflow world geometry never emit a partial", () => {
  const world = normalized(rawMachine([part("root", null, pose([Number.MAX_VALUE, 0, 0]), box([Number.MAX_VALUE, 1, 1]))]));
  const result = compileAssembly(world, {});
  assert.equal(result.ok, false);
  diagnostic(result, "NONFINITE_GEOMETRY");
});

test("explicit capabilities identify concave prisms without decomposing or filling them", () => {
  const vertices = [[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]];
  const compiled = compile(rawMachine([part("open-profile", null, pose(), { kind: "prism", vertices, height: 0.1, unit: "m" })]));
  assert.deepEqual(snapshot(compiled).fragments[0].geometry.vertices, vertices);
  assert.ok(compiled.requiredCapabilities.some((entry) => entry.capability === "concave-prism" && entry.verdict === "passed"));
  assert.equal(snapshot(compiled).requiredCapabilities.find((entry) => entry.capability === "concave-prism").verdict, "passed");
});

test("compiler and runtime reject accessors without invoking them", () => {
  let calls = 0;
  const spec = normalized(rawMachine());
  Object.defineProperty(spec.parts[0].localRest, "position", { enumerable: true, get() { calls++; return [0, 0, 0]; } });
  const result = compileAssembly(spec, {});
  assert.equal(result.ok, false);
  diagnostic(result, "EXECUTABLE_DATA");
  const compiled = compile(rawMachine());
  const q = {};
  Object.defineProperty(q, "value", { enumerable: true, get() { calls++; return 1; } });
  assert.equal(resolvePoses(compiled, q).ok, false);
  const poses = {};
  Object.defineProperty(poses, "root", { enumerable: true, get() { calls++; return pose(); } });
  assert.equal(evaluateGeometry(compiled, poses).verdict, "failed");
  assert.equal(calls, 0);
});

test("all canonical compiled outputs and geometry snapshots are immutable", () => {
  const compiled = compile(rawMachine());
  assert.ok(Object.isFrozen(compiled.restGeometry.fragments[0].geometry.dimensions));
  assert.throws(() => { compiled.parts[0].localRest.position[0] = 7; }, TypeError);
  const geometry = snapshot(compiled);
  assert.throws(() => { geometry.fragments[0].geometry.dimensions[0] = 7; }, TypeError);
  assert.equal(verifyGeometryIdentity(compiled, geometry.fragments).ok, true);
});

test("a small real interface gap is retained as a residual instead of an upstream audit exemption", () => {
  const raw = connected();
  raw.frames[1].pose.position = [0, 0, 0.0001];
  const result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  diagnostic(result, "INTERFACE_MISALIGNED");
  assert.ok(result.diagnostics.find((entry) => entry.code === "INTERFACE_MISALIGNED").message.includes("0.0001"));
});

test("collinear edge backtracking is invalid prism topology", () => {
  const raw = rawMachine([part("backtracking", null, pose(), { kind: "prism", vertices: [[0, 0], [2, 0], [1, 0], [1, 1], [0, 1]], height: 1, unit: "m" })]);
  const result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  diagnostic(result, "INVALID_PRISM_TOPOLOGY");
});

test("prismatic ratio offsets from non-metre source frames are diagnosed unsupported", () => {
  const raw = movingPair();
  raw.frame.unit = "mm";
  raw.joints.forEach((entry) => { entry.kind = "prismatic"; });
  raw.constraints = [ratio("offset-ratio", "a-joint", "b-joint", 2, 0.1)];
  const result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  diagnostic(result, "UNSUPPORTED_RATIO_OFFSET_UNIT");
});

test("linked frame scale errors identify the owning physical part", () => {
  const raw = connected();
  raw.parts[0].scale = [2, 2, 2];
  const result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.find((entry) => entry.code === "UNSUPPORTED_FRAME_SCALE").partId, "base");
});

test("public assembly usage fixture exposes the exact SI handoff for model and adapters", async () => {
  const { assemblyUsageFixture } = await import("./fixtures/assembly-usage.mjs");
  const result = assemblyUsageFixture(0.25);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const { compiled, posesByPartId, geometry } = result.value;
  assert.equal(compiled.metersPerLegacyUnit, 0.001);
  assert.deepEqual(compiled.transformParents.map((entry) => entry.partId), ["frame", "head-pulley"]);
  near(posesByPartId["head-pulley"].rotation_xyzw, [0, Math.sin(0.125), 0, Math.cos(0.125)]);
  assert.equal(geometry.fragments.find((entry) => entry.partId === "head-pulley").geometry.radius, 0.2);
  assert.equal(verifyGeometryIdentity(compiled, geometry.fragments).ok, true);
});

test("metre and zero-offset non-metre prismatic ratios use hand-computed SI coordinates", () => {
  let raw = movingPair();
  raw.joints.forEach((entry) => { entry.kind = "prismatic"; });
  raw.constraints = [ratio("linear", "a-joint", "b-joint", 2, 0.1)];
  raw.parts[2].localRest.position = [0, 0, 0.1];
  let compiled = compile(raw);
  let poses = resolvePoses(compiled, { "a-joint": 0.2 });
  assert.equal(poses.ok, true);
  near(poses.value.b.position, [0, 0, 0.5]);
  raw = movingPair();
  raw.frame.unit = "mm";
  raw.joints.forEach((entry) => { entry.kind = "prismatic"; });
  raw.constraints = [ratio("linear", "a-joint", "b-joint", -2)];
  compiled = compile(raw);
  poses = resolvePoses(compiled, { "a-joint": 0.2 });
  assert.equal(poses.ok, true);
  near(poses.value.b.position, [0, 0, -0.4]);
});

test("compiler diagnostics use actual manifest JSON-pointer indexes and physical part IDs", () => {
  const raw = rawMachine([part("body", null, pose(), { kind: "prism", vertices: [[0, 0], [1, 0], [2, 0]], height: 1, unit: "m" })]);
  const result = compileAssembly(normalized(raw), {});
  const failure = result.diagnostics.find((entry) => entry.code === "INVALID_PRISM_TOPOLOGY");
  assert.equal(failure.path, "/parts/0/geometry/vertices");
  assert.equal(failure.partId, "body");
});

test("named proxy component IDs cannot collide with root proxy-role identities", () => {
  const raw = rawMachine([part("body", null, pose(), { kind: "compound", components: [{ id: "audit", pose: pose(), geometry: box() }] })]);
  raw.parts[0].auditGeometry = box();
  const compiled = compile(raw);
  const renderId = compiled.restGeometry.fragments[0].id;
  const auditId = compiled.restGeometry.auditFragments[0].id;
  assert.notEqual(renderId, auditId);
});

test("compiled assembly retains material metadata and definition geometry provenance for adapters", () => {
  const raw = rawMachine([part("defined")]);
  raw.sources.push({ id: "drawing-shape", kind: "drawing", locator: "synthetic-drawing", revision: "v1", hash: null, confidence: "verified", uncertainty: null });
  raw.definitions = [{ id: "shared", geometry: box(), materialId: "painted-steel", sourceIds: ["drawing-shape"] }];
  raw.instances = [{ id: "physical-instance", definitionId: "shared", partId: "defined" }];
  raw.parts[0].geometry = null;
  raw.parts[0].definitionId = "shared";
  raw.parts[0].instanceId = "physical-instance";
  const compiled = compile(raw);
  assert.deepEqual(compiled.materials, normalized(raw).materials);
  assert.deepEqual(compiled.assets, []);
  assert.deepEqual(compiled.restGeometry.fragments[0].sourceIds, ["E0", "drawing-shape"]);
});

test("a positive proxy approximation bound cannot silently underflow to zero", () => {
  const raw = rawMachine();
  raw.parts[0].scale = [0.5, 0.5, 0.5];
  raw.parts[0].auditGeometry = box();
  raw.parts[0].approximationError = { value: Number.MIN_VALUE, unit: "m", sourceIds: ["E0"], uncertainty: null, manufacturingTolerance: null, proposedTolerance: null, numericAcceptance: null };
  const result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  diagnostic(result, "APPROXIMATION_ERROR_UNDERFLOW");
});
