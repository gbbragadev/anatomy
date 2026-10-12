import assert from "node:assert/strict";
import test from "node:test";
import { compileAssembly, resolvePoses } from "../../fidelity/assembly/index.mjs";
import { pose, part, frame, joint, rawMachine, normalized, near, diagnostic, movingPair, ratio } from "./assembly-fixtures.mjs";

const compile = (raw) => {
  const result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.value;
};

test("composes a hand-computed three-frame chain with active xyzw transforms", () => {
  const s = Math.SQRT1_2;
  const raw = rawMachine([part("root", null, pose([1, 2, 3], [0, 0, s, s])), part("middle", "root", pose([2, 0, 1], [0, s, 0, s])), part("tip", "middle", pose([0, 0, 3]))]);
  const result = resolvePoses(compile(raw), {});
  assert.equal(result.ok, true);
  near(result.value.root.position, [1, 2, 3]);
  near(result.value.middle.position, [1, 4, 4]);
  near(result.value.tip.position, [1, 7, 4]);
  near(result.value.tip.rotation_xyzw, [-0.5, 0.5, 0.5, 0.5]);
});

test("the joint equation inverts a nonzero oriented child frame exactly once", () => {
  const s = Math.SQRT1_2;
  const raw = rawMachine([part("root", null, pose([1, 2, 3], [0, 0, s, s])), part("child", "root", pose([2, 0, -1]))]);
  raw.frames = [frame("child-end", "child", pose([0, 0, 1], [0, s, 0, s]))];
  raw.joints = [joint("fixed", "fixed", "root", "child", "child-end", pose([2, 0, 0], [0, s, 0, s]))];
  const result = resolvePoses(compile(raw), {});
  assert.equal(result.ok, true);
  near(result.value.child.position, [1, 4, 2]);
  near(result.value.child.rotation_xyzw, [0, 0, s, s]);
});

test("positive asymmetric-axis rotation has the hand-computed sign and child offset", () => {
  const raw = rawMachine([part("root"), part("child", "root", pose([-1, 0, 0]))]);
  raw.frames = [frame("child-end", "child", pose([1, 0, 0]))];
  raw.joints = [joint("hinge", "revolute", "root", "child", "child-end", pose(), [1, 2, 2])];
  const result = resolvePoses(compile(raw), { hinge: Math.PI / 2 });
  assert.equal(result.ok, true);
  near(result.value.child.position, [-1 / 9, -8 / 9, 4 / 9]);
  near(result.value.child.rotation_xyzw, [Math.SQRT1_2 / 3, 2 * Math.SQRT1_2 / 3, 2 * Math.SQRT1_2 / 3, Math.SQRT1_2]);
  near(resolvePoses(compile(raw), {}).value.child.position, [-1, 0, 0]);
});

test("prismatic coordinates and exact limits are canonical metres", () => {
  const s = Math.SQRT1_2;
  const raw = rawMachine([part("root"), part("slide", "root", pose([200, 0, 0], [0, 0, s, s]))]);
  raw.frame.unit = "mm";
  raw.frames = [frame("slider-origin", "slide", pose([0, 100, 0]))];
  raw.joints = [joint("slide-joint", "prismatic", "root", "slide", "slider-origin", pose([100, 0, 0], [0, 0, s, s]), [1, 0, 0], { min: -200, max: 300 })];
  const compiled = compile(raw);
  near(resolvePoses(compiled, { "slide-joint": 0 }).value.slide.position, [0.2, 0, 0]);
  near(resolvePoses(compiled, { "slide-joint": 0.3 }).value.slide.position, [0.2, 0.3, 0]);
  assert.equal(resolvePoses(compiled, { "slide-joint": -0.2 }).ok, true);
  const failure = resolvePoses(compiled, { "slide-joint": 0.30000000000000004 });
  assert.equal(failure.ok, false);
  assert.equal("value" in failure, false);
  diagnostic(failure, "JOINT_LIMIT_EXCEEDED");
});

test("rejects a zero/rest inconsistency instead of adding localRest twice", () => {
  const raw = movingPair();
  raw.parts[1].localRest.position = [1, 0, 0];
  const result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  diagnostic(result, "JOINT_REST_MISMATCH");
});

test("rejects parent cycles independently of a retained closure graph", () => {
  const spec = normalized(movingPair());
  spec.parts[0].parentId = "a";
  const cycle = compileAssembly(spec, {});
  assert.equal(cycle.ok, false);
  diagnostic(cycle, "PARENT_CYCLE");
  const raw = movingPair();
  raw.constraints = [{ id: "loop", kind: "closure", partIds: ["root", "a", "b", "root"], jointIds: ["a-joint", "b-joint"], tolerance: 1e-9, sourceIds: ["E0"] }];
  const compiled = compile(raw);
  assert.deepEqual(compiled.constraints, normalized(raw).constraints);
  assert.ok(compiled.requiredCapabilities.some((entry) => entry.capability === "constraint-solver" && entry.verdict === "not-evaluated"));
  const result = resolvePoses(compiled, {});
  assert.equal(result.ok, false);
  diagnostic(result, "UNSUPPORTED_CONSTRAINT_SOLVER");
});

test("analytic ratios derive unspecified channels and retain explicit residuals", () => {
  const raw = movingPair();
  raw.parts[2].localRest.rotation_xyzw = [0, 0, Math.sin(0.05), Math.cos(0.05)];
  raw.constraints = [ratio("gear-ratio", "a-joint", "b-joint", -2, 0.1)];
  const compiled = compile(raw);
  const result = resolvePoses(compiled, { "a-joint": 0.3 });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  near(result.value.b.rotation_xyzw, [0, 0, Math.sin(-0.25), Math.cos(-0.25)]);
  diagnostic(result, "CONSTRAINT_RESIDUAL");
  const conflict = resolvePoses(compiled, { "a-joint": 0.3, "b-joint": 0 });
  assert.equal(conflict.ok, false);
  diagnostic(conflict, "CONSTRAINT_VIOLATION");
});

test("consistent cyclic ratios resolve while inconsistent cycles fail by residual", () => {
  const raw = movingPair();
  raw.constraints = [ratio("forward", "a-joint", "b-joint", -2), ratio("backward", "b-joint", "a-joint", -0.5)];
  assert.equal(resolvePoses(compile(raw), { "a-joint": 0.2 }).ok, true);
  raw.constraints[1].ratio = -1;
  const result = resolvePoses(compile(raw), { "a-joint": 0.2 });
  assert.equal(result.ok, false);
  diagnostic(result, "CONSTRAINT_VIOLATION");
});

test("joint limits apply to derived ratio coordinates too", () => {
  const raw = movingPair();
  raw.constraints = [ratio("forward", "a-joint", "b-joint", 2)];
  raw.joints[1].limits = { min: -0.3, max: 0.3 };
  const result = resolvePoses(compile(raw), { "a-joint": 0.2 });
  assert.equal(result.ok, false);
  diagnostic(result, "JOINT_LIMIT_EXCEEDED");
});

test("unknown, nonfinite and nonzero fixed joint coordinates fail explicitly", () => {
  const compiled = compile(movingPair());
  for (const [q, code] of [[{ missing: 0 }, "UNKNOWN_JOINT_CHANNEL"], [{ "a-joint": Infinity }, "NONFINITE_NUMBER"], [{ "a-joint": "1" }, "INVALID_JOINT_COORDINATE"]]) {
    const result = resolvePoses(compiled, q);
    assert.equal(result.ok, false);
    diagnostic(result, code);
  }
  const raw = movingPair();
  raw.joints[0].kind = "fixed";
  raw.joints[0].axis = null;
  const fixed = resolvePoses(compile(raw), { "a-joint": 0.1 });
  assert.equal(fixed.ok, false);
  diagnostic(fixed, "FIXED_JOINT_COORDINATE");
});

test("parent input order does not affect transform order or resolved physical IDs", () => {
  const raw = rawMachine([part("root", null, pose([1, 0, 0])), part("middle", "root", pose([0, 2, 0])), part("tip", "middle", pose([0, 0, 3]))]);
  const first = compile(raw);
  raw.parts.reverse();
  const second = compile(raw);
  assert.deepEqual(second.transformParents, first.transformParents);
  assert.deepEqual(resolvePoses(second, {}), resolvePoses(first, {}));
});

test("revolute limits are exact radians, including both negative and positive boundaries", () => {
  const raw = movingPair();
  raw.joints[0].limits = { min: -0.25, max: 0.5 };
  const compiled = compile(raw);
  assert.equal(resolvePoses(compiled, { "a-joint": -0.25 }).ok, true);
  assert.equal(resolvePoses(compiled, { "a-joint": 0.5 }).ok, true);
  for (const value of [-0.25000000000000006, 0.5000000000000001]) {
    const result = resolvePoses(compiled, { "a-joint": value });
    assert.equal(result.ok, false);
    diagnostic(result, "JOINT_LIMIT_EXCEEDED");
  }
});

test("ratio coordinates propagate from either endpoint, including a zero-ratio target", () => {
  const raw = movingPair();
  raw.constraints = [ratio("forward", "a-joint", "b-joint", -2)];
  let compiled = compile(raw);
  const inverse = resolvePoses(compiled, { "b-joint": 0.4 });
  assert.equal(inverse.ok, true);
  near(inverse.value.a.rotation_xyzw, [0, 0, Math.sin(-0.1), Math.cos(-0.1)]);
  raw.constraints[0].ratio = 0;
  compiled = compile(raw);
  assert.equal(resolvePoses(compiled, { "a-joint": 0.7 }).ok, true);
  const inconsistent = resolvePoses(compiled, { "b-joint": 0.1 });
  assert.equal(inconsistent.ok, false);
  diagnostic(inconsistent, "CONSTRAINT_VIOLATION");
});

test("ratio arithmetic overflow never returns a coordinate or pose partial", () => {
  const raw = movingPair();
  raw.constraints = [ratio("overflow", "a-joint", "b-joint", Number.MAX_VALUE)];
  const result = resolvePoses(compile(raw), { "a-joint": 2 });
  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
  diagnostic(result, "NONFINITE_CONSTRAINT");
});

test("the complete generic fixture exposes its canonical head pose and original radius only as provenance", async () => {
  const { readFileSync } = await import("node:fs");
  const raw = JSON.parse(readFileSync(new URL("fixtures/minimal-valid.json", import.meta.url)));
  const compiled = compile(raw);
  near(compiled.restPosesByPartId["head-pulley"].position, [0, 0, (5 - 2 * Math.PI * 0.2) / 2]);
  assert.equal(compiled.restGeometry.fragments.find((entry) => entry.partId === "head-pulley").geometry.radius, 0.2);
  assert.equal(compiled.parts.find((entry) => entry.id === "head-pulley").scale[0], 1);
});

test("significant local offsets cannot disappear during tree composition", () => {
  for (const [position, rotation] of [
    [[1e8, 0, 0], [0, 0, 0, 1]],
    [[0, 1e8, 0], [0, 0, Math.SQRT1_2, Math.SQRT1_2]]
  ]) for (const offset of [1e-9, -1e-9]) {
    const raw = rawMachine([part("root", null, pose(position, rotation)), part("child", "root", pose([offset, 0, 0])), part("tip", "child")]);
    let result;
    assert.doesNotThrow(() => { result = compileAssembly(normalized(raw), {}); });
    assert.equal(result.ok, false);
    assert.equal("value" in result, false);
    const failure = result.diagnostics.find((entry) => entry.code === "UNSUPPORTED_POSE_PRECISION");
    assert.equal(failure.path, "/poses/child");
    assert.equal(failure.partId, "child");
    assert.deepEqual(failure.sourceIds, ["E0"]);
  }
});

test("ordinary rounding, zero and representable offsets remain valid in large and rotated frames", () => {
  for (const [position, rotation, offset, expected] of [
    [[0.1, 0, 0], [0, 0, 0, 1], [0.2, 0, 0], [0.30000000000000004, 0, 0]],
    [[10, 0, 0], [0, 0, 0, 1], [1e-9, 0, 0], [10.000000001, 0, 0]],
    [[1e8, 0, 0], [0, 0, 0, 1], [0, 0, 0], [1e8, 0, 0]],
    [[1e8, 0, 0], [0, 0, 0, 1], [0.25, 0, 0], [100000000.25, 0, 0]],
    [[0, 1e8, 0], [0.5, 0.5, 0.5, 0.5], [0.25, 0, 0], [0, 100000000.25, 0]]
  ]) {
    const raw = rawMachine([part("root", null, pose(position, rotation)), part("child", "root", pose(offset))]);
    const result = resolvePoses(compile(raw));
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    near(result.value.child.position, expected);
  }
});

test("large rotated offsets do not mistake quaternion roundoff for a lost local feature", () => {
  const raw = rawMachine([part("root", null, pose([1e8, 1e8, 0], [0, 0, Math.SQRT1_2, Math.SQRT1_2])), part("child", "root", pose([1e8, 0, 0]))]);
  const result = resolvePoses(compile(raw));
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  near(result.value.child.position, [1e8, 2e8, 0], 1e-7);
});

test("prismatic motion precision loss returns resolver diagnostics without a partial pose or exception", () => {
  const raw = rawMachine([part("root", null, pose([1e8, 0, 0])), part("slide", "root")]);
  raw.frames = [frame("slide-frame", "slide")];
  raw.joints = [joint("slide-joint", "prismatic", "root", "slide", "slide-frame", pose(), [1, 0, 0])];
  const compiled = compile(raw);
  let result;
  assert.doesNotThrow(() => { result = resolvePoses(compiled, { "slide-joint": 1e-9 }); });
  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
  diagnostic(result, "UNSUPPORTED_POSE_PRECISION");
  near(resolvePoses(compiled, { "slide-joint": 0.25 }).value.slide.position, [100000000.25, 0, 0]);
});

test("joint rest composition rejects a swallowed child-frame offset through compile diagnostics", () => {
  const raw = rawMachine([part("root"), part("child", "root", pose([1e8, 0, 0]))]);
  raw.frames = [frame("child-frame", "child", pose([1e-9, 0, 0]))];
  raw.joints = [joint("fixed-joint", "fixed", "root", "child", "child-frame", pose([1e8, 0, 0]))];
  let result;
  assert.doesNotThrow(() => { result = compileAssembly(normalized(raw), {}); });
  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
  const failure = result.diagnostics.find((entry) => entry.code === "UNSUPPORTED_POSE_PRECISION");
  assert.equal(failure.path, "/joints/0");
  assert.equal(failure.partId, "child");
});

test("a large representable axis cannot mask precision loss on a different local axis", () => {
  const raw = rawMachine([part("root", null, pose([0, 1e8, 0])), part("child", "root", pose([1e8, 1e-9, 0]))]);
  const result = compileAssembly(normalized(raw), {});
  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
  diagnostic(result, "UNSUPPORTED_POSE_PRECISION");
});
