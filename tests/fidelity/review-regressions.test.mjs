import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateMachineShape } from "../../fidelity/contracts/schema.mjs";
import { validateMachine, normalizeQuantity, canonicalHash, evaluateClaims, auditVisibleText, invalidateClaims } from "../../fidelity/index.mjs";

const fixture = JSON.parse(readFileSync(new URL("fixtures/minimal-valid.json", import.meta.url)));
const copy = () => structuredClone(fixture);
const green = { id: "head-radius-check", coverage: "executed", verdict: "passed", aspect: "construction", claimIds: ["dimension-head"], sourceIds: ["E0"] };
const has = (diagnostics, code, path) => assert.ok(diagnostics.some((value) => value.code === code && (!path || value.path === path)), JSON.stringify(diagnostics));
const validated = (spec) => {
  const result = validateMachine(spec);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  return result.value;
};
const reference = () => {
  const spec = copy();
  const replace = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (["sourceIds", "surfaceEvidenceIds"].includes(key)) value[key] = item.map((id) => id === "E0" ? "E1" : id);
      else if (key === "sourceId" && item === "E0") value[key] = "E1";
      else replace(item);
    }
  };
  replace(spec);
  Object.assign(spec.sources[0], { id: "E1", kind: "measurement", confidence: "verified" });
  Object.assign(spec.claims[0], { unit: "m", uncertainty: 0.0005, extractionMethod: "recorded reference comparison", status: "verified", conditions: ["selected reference configuration"], review: { reviewerId: "recorded-human", role: "human", locator: "review/1" } });
  return spec;
};
const comparison = () => ({ ...green, sourceIds: ["E1"], expected: 0.2, observed: 0.2, unit: "m", partIds: ["head-pulley"], tickRange: [0,0], evidencePath: "comparisons/head-radius.json", scope: "selected reference configuration/head radius" });
const addSource = (spec, id, locator = id) => spec.sources.push({ ...spec.sources[0], id, locator });
const independentBranch = (spec) => {
  addSource(spec, "E2");
  spec.materials.push({ ...structuredClone(spec.materials[0]), id: "independent-material", surfaceEvidenceIds: ["E2"] });
  spec.parts.push({ ...structuredClone(spec.parts[0]), id: "independent-part", materialId: "independent-material", sourceIds: ["E2"] });
  spec.claims.push({ ...structuredClone(spec.claims[0]), id: "independent-claim", kind: "illustrative", requestedLevel: "F0", subjectIds: ["independent-part"], sourceRefs: [{ sourceId: "E2", locator: "E2", revision: "synthetic-v1" }], checkIds: ["independent-check"] });
  spec.criteria.push({ ...structuredClone(spec.criteria[0]), id: "independent-check", partIds: ["independent-part"], claimIds: ["independent-claim"], sourceIds: ["E2"] });
};

test("R1 F3 stays not evaluated without an independent trial contract", () => {
  const spec = reference();
  Object.assign(spec.claims[0], { requestedLevel: "F3", uncertainty: null, conditions: [] });
  const result = evaluateClaims(spec, [comparison()])[0];
  assert.equal(result.verdict, "not-evaluated");
  assert.equal(result.level, "F0");
  has(result.diagnostics, "UNSUPPORTED_FIDELITY_LEVEL");
});

test("R1 null uncertainty and missing validity scope do not establish F1", () => {
  for (const field of ["uncertainty", "unit", "conditions"]) {
    const spec = reference();
    spec.claims[0][field] = field === "conditions" ? [] : null;
    assert.equal(evaluateClaims(spec, [comparison()])[0].verdict, "not-evaluated", field);
  }
});

test("R1 uncertainty above compatible physical acceptance cannot establish F1", () => {
  const spec = reference();
  spec.claims[0].uncertainty = 1;
  const result = evaluateClaims(spec, [comparison()])[0];
  assert.equal(result.verdict, "not-evaluated");
  has(result.diagnostics, "UNCERTAINTY_EXCEEDS_ACCEPTANCE");
});

test("R1 referenced dimensional comparison passes F1 with bounded unit-bearing uncertainty", () => {
  const spec = reference();
  const result = evaluateClaims(validated(spec), [comparison()])[0];
  assert.equal(result.verdict, "passed", JSON.stringify(result.diagnostics));
  assert.equal(result.level, "F1");
});

test("R1 compatible millimetre uncertainty converts before comparison and incompatible units block", () => {
  const spec = reference();
  Object.assign(spec.claims[0], { unit: "mm", uncertainty: 0.5, proposedTolerance: 2 });
  assert.equal(evaluateClaims(validated(spec), [comparison()])[0].verdict, "passed");
  spec.claims[0].unit = "kg";
  const result = evaluateClaims(spec, [comparison()])[0];
  assert.equal(result.verdict, "not-evaluated");
  has(result.diagnostics, "UNCERTAINTY_DIMENSION_MISMATCH");
});

test("R1 F2 requires scoped trace evidence in defined states and passes only its kinematic aspect", () => {
  const spec = reference();
  Object.assign(spec.claims[0], { aspect: "kinematic", kind: "kinematic", requestedLevel: "F2", unit: "rad", uncertainty: 1e-13, proposedTolerance: null, numericAcceptance: 1e-12, conditions: ["ticks 0 through 12, ideal no slip"] });
  Object.assign(spec.criteria[0], { aspect: "kinematic", kind: "kinematic", expected: 0.25, unit: "rad", tolerance: { manufacturing: null, project: null, numeric: 1e-12 } });
  const result = { ...comparison(), aspect: "kinematic", expected: 0.25, observed: 0.25, unit: "rad", tickRange: [0,12], evidencePath: "traces/kinematic.csv", scope: "ticks 0 through 12, ideal no slip" };
  assert.equal(evaluateClaims(validated(spec), [result])[0].level, "F2");
  for (const field of ["tickRange", "evidencePath", "scope", "observed"]) {
    const incomplete = structuredClone(result);
    delete incomplete[field];
    assert.equal(evaluateClaims(spec, [incomplete])[0].verdict, "not-evaluated", field);
  }
  spec.claims[0].aspect = "process";
  spec.criteria[0].aspect = "process";
  assert.equal(evaluateClaims(spec, [{ ...result, aspect: "process" }])[0].verdict, "not-evaluated");
});

test("R1 photographs alone and absent numerical comparisons cannot establish dimensional F1", () => {
  const spec = reference();
  spec.sources[0].kind = "photograph";
  assert.equal(evaluateClaims(spec, [comparison()])[0].verdict, "not-evaluated");
  spec.sources[0].kind = "measurement";
  assert.equal(evaluateClaims(spec, [{ ...green, sourceIds: ["E1"] }])[0].verdict, "not-evaluated");
});

test("R2 assertion mode cannot release E0 calibrated-capacity prose through an illustrative F0 claim", () => {
  const spec = copy();
  Object.assign(spec.claims[0], { kind: "illustrative", requestedLevel: "F0", statement: "Illustrative calibrated real capacity is 100 kg/h." });
  Object.assign(spec.visibleText[0], { mode: "assertion", text: spec.claims[0].statement });
  const result = auditVisibleText(spec, [green])[0];
  assert.equal(result.verdict, "failed");
  has(result.diagnostics, "UNSUPPORTED_VISIBLE_ASSERTION");
});

test("R3 nested material density sources invalidate dependent claims, parts and checks only", () => {
  const spec = copy();
  addSource(spec, "E1");
  independentBranch(spec);
  spec.materials[0].physicalProperties = { sourceIds: [], density: { ...structuredClone(spec.parameters.beltBucket.headRadius), value: 1000, unit: "kg/m3", sourceIds: ["E1"] } };
  assert.deepEqual(invalidateClaims(validated(spec), ["E1"]), { claimIds: ["dimension-head"], partIds: ["frame", "head-pulley"], checkIds: ["head-radius-check"] });
});

test("R3 required criterion sources propagate through claims and their transitive dependents", () => {
  const spec = copy();
  addSource(spec, "E1");
  independentBranch(spec);
  spec.criteria[0].sourceIds.push("E1");
  spec.claims.push({ ...structuredClone(spec.claims[0]), id: "dependent", checkIds: ["dependent-check"], dependsOnClaimIds: ["dimension-head"] });
  spec.criteria.push({ ...structuredClone(spec.criteria[0]), id: "dependent-check", claimIds: ["dependent"], sourceIds: ["E0"] });
  const result = invalidateClaims(validated(spec), ["E1"]);
  assert.deepEqual(result.claimIds, ["dependent", "dimension-head"]);
  assert.deepEqual(result.checkIds, ["dependent-check", "head-radius-check"]);
  assert.ok(!result.partIds.includes("independent-part"));
});

test("R3 changed frame, part mass, port and constraint evidence reaches dependent claims", () => {
  for (const target of ["frame", "mass", "port", "constraint"]) {
    const spec = copy();
    addSource(spec, "E1");
    if (target === "frame") spec.frames[0].sourceIds = ["E1"];
    if (target === "mass") spec.parts[1].mass.sourceIds = ["E1"];
    if (target === "port") spec.ports[0].sourceIds = ["E1"];
    if (target === "constraint") spec.constraints = [{ id: "coupling", kind: "closure", partIds: ["frame", "head-pulley"], jointIds: ["head-shaft"], tolerance: 1e-9, sourceIds: ["E1"] }];
    const result = invalidateClaims(validated(spec), ["E1"]);
    assert.ok(result.claimIds.includes("dimension-head"), target);
    assert.ok(result.checkIds.includes("head-radius-check"), target);
  }
});

test("R3 explicitly scoped parameter sources use their dependency links", () => {
  const spec = copy();
  addSource(spec, "E1");
  independentBranch(spec);
  spec.parameters.beltBucket.headRadius.sourceIds = ["E1"];
  spec.dependencies.push({ id: "parameter-evidence", sourceIds: ["E1"], claimIds: ["dimension-head"], partIds: ["head-pulley"], checkIds: ["head-radius-check"] });
  const result = invalidateClaims(validated(spec), ["E1"]);
  assert.deepEqual(result.claimIds, ["dimension-head"]);
  assert.ok(!result.partIds.includes("independent-part"));
});

test("R4 repeated definitions require unique reciprocal physical instances", () => {
  const spec = copy();
  spec.parts.push({ ...structuredClone(spec.parts[1]), id: "second-head" });
  const invalid = validateMachine(spec);
  assert.equal(invalid.ok, false);
  has(invalid.diagnostics, "INSTANCE_MISMATCH", "/parts/2/instanceId");
  spec.parts[2].instanceId = "second-instance";
  spec.instances.push({ id: "second-instance", definitionId: "head-definition", partId: "second-head" });
  const a = validated(spec);
  spec.parts.reverse();
  spec.instances.reverse();
  const b = validated(spec);
  assert.equal(a.canonicalHash, b.canonicalHash);
  assert.equal(new Set(b.parts.filter((part) => part.instanceId).map((part) => part.instanceId)).size, 2);
  [spec.parts[0].instanceId, spec.parts[1].instanceId] = [spec.parts[1].instanceId, spec.parts[0].instanceId];
  assert.equal(validateMachine(spec).ok, false);
});

test("R4 orphan instances cannot alias existing physical parts", () => {
  const spec = copy();
  spec.instances.push({ id: "orphan", definitionId: "head-definition", partId: "absent" });
  const result = validateMachine(spec);
  assert.equal(result.ok, false);
  has(result.diagnostics, "MISSING_PART", "/instances/1/partId");
});

test("R5 custom array prototypes are rejected before inherited callbacks execute", () => {
  let calls = 0;
  class CallbackArray extends Array {
    map() { calls++; throw new Error("Input callback executed"); }
  }
  const subclass = new CallbackArray();
  subclass.push(1);
  assert.throws(() => canonicalHash({ ordered: subclass }), TypeError);
  assert.equal(calls, 0);
  const custom = [1];
  Object.setPrototypeOf(custom, { [Symbol.iterator]() { calls++; throw new Error("Input iterator executed"); } });
  assert.throws(() => canonicalHash({ parts: custom }), TypeError);
  assert.equal(calls, 0);
});

test("R6 large and subnormal finite axes remain nonzero normalized directions", () => {
  for (const axis of [[Number.MAX_VALUE, Number.MAX_VALUE, 0], [Number.MIN_VALUE, Number.MIN_VALUE, 0], [1e-300, 2e-300, 0]]) {
    const spec = copy();
    spec.joints[0].axis = axis;
    const result = validated(spec).joints[0];
    assert.ok(Math.abs(Math.hypot(...result.axis) - 1) <= 1e-15, JSON.stringify(result.axis));
    assert.ok(result.axis[0] > 0 && result.axis[1] > 0);
    assert.deepEqual(result.originalAxis, axis);
  }
});

test("R7 standalone normalization enforces all required explicit Quantity fields", () => {
  const quantity = structuredClone(fixture.parameters.beltBucket.headRadius);
  for (const field of Object.keys(quantity)) {
    const incomplete = structuredClone(quantity);
    delete incomplete[field];
    const result = normalizeQuantity(incomplete, "length");
    assert.equal(result.ok, false, field);
    has(result.diagnostics, "MISSING_FIELD", `/${field}`);
  }
  const extra = normalizeQuantity({ ...quantity, unexpected: 7 }, "length");
  assert.equal(extra.ok, false);
  has(extra.diagnostics, "UNKNOWN_FIELD", "/unexpected");
});

test("R7 standalone normalization rejects source arrays inconsistent with the machine schema", () => {
  for (const sourceIds of ["E0", [7], ["invalid source"], null]) {
    const result = normalizeQuantity({ ...structuredClone(fixture.parameters.beltBucket.headRadius), sourceIds }, "length");
    assert.equal(result.ok, false, JSON.stringify(sourceIds));
    has(result.diagnostics, "INVALID_SOURCE_IDS");
  }
});

test("R8 claim and criterion aspect/claim links must agree in both directions", () => {
  for (const edit of [(spec) => spec.criteria[0].aspect = "appearance", (spec) => spec.criteria[0].claimIds = [], (spec) => spec.claims[0].checkIds = []]) {
    const spec = copy();
    edit(spec);
    const result = validateMachine(spec);
    assert.equal(result.ok, false);
    has(result.diagnostics, "CRITERION_SCOPE_MISMATCH");
  }
});

test("R8 submitted results cannot override declared criterion aspect, claims or sources", () => {
  const spec = reference();
  for (const patch of [{ aspect: "appearance" }, { claimIds: ["other"] }, { sourceIds: ["E1", "unregistered"] }, { partIds: ["frame"] }]) {
    const result = evaluateClaims(spec, [{ ...comparison(), ...patch }])[0];
    assert.equal(result.verdict, "not-evaluated");
    has(result.diagnostics, "CHECK_SCOPE_MISMATCH");
  }
  spec.criteria[0].aspect = "appearance";
  spec.criteria[0].claimIds = [];
  const result = evaluateClaims(spec, [comparison()])[0];
  assert.equal(result.verdict, "not-evaluated");
  has(result.diagnostics, "CRITERION_SCOPE_MISMATCH");
});

test("R8 one declared criterion may support multiple explicitly linked claims", () => {
  const spec = reference();
  spec.claims.push({ ...structuredClone(spec.claims[0]), id: "second-dimension" });
  spec.criteria[0].claimIds.push("second-dimension");
  const result = { ...comparison(), claimIds: ["second-dimension", "dimension-head"] };
  assert.ok(evaluateClaims(validated(spec), [result]).every((claim) => claim.verdict === "passed"));
});

test("R3 unscoped domain parameter evidence conservatively invalidates the machine contract", () => {
  const spec = copy();
  addSource(spec, "E1");
  spec.parameters.beltBucket.bucketCapacity.sourceIds = ["E1"];
  const result = invalidateClaims(validated(spec), ["E1"]);
  assert.deepEqual(result, { claimIds: ["dimension-head"], partIds: ["frame", "head-pulley"], checkIds: ["head-radius-check"] });
});

test("R1 F0 coherence requires explicit illustrative assumptions", () => {
  const spec = copy();
  Object.assign(spec.claims[0], { kind: "illustrative", requestedLevel: "F0" });
  assert.equal(evaluateClaims(validated(spec), [green])[0].verdict, "passed");
  spec.claims[0].conditions = [];
  spec.model.assumptions = [];
  assert.equal(evaluateClaims(spec, [green])[0].verdict, "not-evaluated");
});

test("R1 comparison uncertainty cannot cross the acceptance boundary despite a green status", () => {
  const spec = reference();
  const result = evaluateClaims(spec, [{ ...comparison(), observed: 0.2019 }])[0];
  assert.equal(result.verdict, "not-evaluated");
  has(result.diagnostics, "UNCERTAINTY_CROSSES_ACCEPTANCE");
});

test("N1 empty parameter dependencies cannot suppress conservative invalidation", () => {
  const spec = copy();
  addSource(spec, "E1");
  spec.parameters.beltBucket.bucketCapacity.sourceIds = ["E1"];
  const expected = invalidateClaims(validated(spec), ["E1"]);
  assert.ok(expected.claimIds.length && expected.partIds.length && expected.checkIds.length);
  spec.dependencies.push({ id: "empty-parameter-link", sourceIds: ["E1"], claimIds: [], partIds: [], checkIds: [] });
  assert.deepEqual(invalidateClaims(validated(spec), ["E1"]), expected);
  spec.dependencies[1].partIds = ["not-a-part"];
  assert.deepEqual(invalidateClaims(spec, ["E1"]), expected);
});

test("N2 finite raw kilometre comparisons that overflow SI cannot approve F1", () => {
  const spec = reference();
  Object.assign(spec.claims[0], { unit: "km", uncertainty: 0, proposedTolerance: 0.002, numericAcceptance: 1e-12 });
  Object.assign(spec.criteria[0], { unit: "km", expected: Number.MAX_VALUE, tolerance: { manufacturing: null, project: 0.002, numeric: 1e-12 } });
  assert.deepEqual(validateMachineShape(spec), []);
  assert.equal(validateMachine(spec).ok, false);
  const result = evaluateClaims(spec, [{ ...comparison(), unit: "km", expected: Number.MAX_VALUE, observed: Number.MAX_VALUE }])[0];
  assert.equal(result.verdict, "not-evaluated");
  has(result.diagnostics, "NONFINITE_CANONICAL_NUMBER", "/criteria/0/expected");
});

for (const field of ["uncertainty", "manufacturingTolerance", "proposedTolerance", "numericAcceptance"]) {
  test(`N2 claim ${field} conversion must remain finite`, () => {
    const spec = reference();
    Object.assign(spec.claims[0], { unit: "km", uncertainty: 0, proposedTolerance: 0.000002 });
    spec.claims[0][field] = Number.MAX_VALUE;
    assert.deepEqual(validateMachineShape(spec), []);
    const result = evaluateClaims(spec, [comparison()])[0];
    assert.equal(result.verdict, "not-evaluated");
    has(result.diagnostics, "NONFINITE_CANONICAL_NUMBER", `/claims/0/${field}`);
  });
}

for (const field of ["manufacturing", "project", "numeric"]) {
  test(`N2 criterion ${field} tolerance conversion cannot be silently discarded`, () => {
    const spec = reference();
    Object.assign(spec.criteria[0], { unit: "km", expected: 0.0002, tolerance: { manufacturing: null, project: 0.000002, numeric: 1e-15 } });
    spec.criteria[0].tolerance[field] = Number.MAX_VALUE;
    assert.deepEqual(validateMachineShape(spec), []);
    const result = evaluateClaims(spec, [comparison()])[0];
    assert.equal(result.verdict, "not-evaluated");
    has(result.diagnostics, "NONFINITE_CANONICAL_NUMBER", `/criteria/0/tolerance/${field}`);
  });
}

for (const field of ["expected", "observed"]) {
  test(`N2 result ${field} conversion must remain finite`, () => {
    const spec = reference();
    const comparisonResult = { ...comparison(), unit: "km", expected: 0.0002, observed: 0.0002, [field]: Number.MAX_VALUE };
    const result = evaluateClaims(spec, [comparisonResult])[0];
    assert.equal(result.verdict, "not-evaluated");
    has(result.diagnostics, "NONFINITE_CANONICAL_NUMBER", `/results/0/${field}`);
  });
}

test("N2 finite canonical inputs cannot hide overflowed comparison residuals", () => {
  const spec = reference();
  spec.criteria[0].expected = Number.MAX_VALUE;
  const result = evaluateClaims(spec, [{ ...comparison(), expected: Number.MAX_VALUE, observed: -Number.MAX_VALUE }])[0];
  assert.equal(result.verdict, "not-evaluated");
  has(result.diagnostics, "NONFINITE_COMPARISON_ARITHMETIC");
  const expectation = evaluateClaims(spec, [{ ...comparison(), expected: -Number.MAX_VALUE, observed: Number.MAX_VALUE }])[0];
  assert.equal(expectation.verdict, "not-evaluated");
  has(expectation.diagnostics, "NONFINITE_COMPARISON_ARITHMETIC");
});

test("N2 finite residual and uncertainty cannot hide overflowed acceptance arithmetic", () => {
  const spec = reference();
  Object.assign(spec.claims[0], { uncertainty: 1e308, proposedTolerance: Number.MAX_VALUE });
  Object.assign(spec.criteria[0], { expected: 0, tolerance: { manufacturing: null, project: Number.MAX_VALUE, numeric: 1e-12 } });
  const result = evaluateClaims(spec, [{ ...comparison(), expected: 0, observed: 1e308 }])[0];
  assert.equal(result.verdict, "not-evaluated");
  has(result.diagnostics, "NONFINITE_COMPARISON_ARITHMETIC");
});

test("N2 ordinary raw and normalized unit-compatible comparisons remain positive", () => {
  const spec = reference();
  Object.assign(spec.claims[0], { unit: "mm", uncertainty: 0.5, proposedTolerance: 2 });
  Object.assign(spec.criteria[0], { unit: "mm", expected: 200, tolerance: { manufacturing: null, project: 2, numeric: 1e-9 } });
  const result = { ...comparison(), unit: "mm", expected: 200, observed: 200 };
  assert.equal(evaluateClaims(spec, [result])[0].level, "F1");
  assert.equal(evaluateClaims(validated(spec), [result])[0].level, "F1");
});

test("N2 optional reported tolerance must remain finite after conversion", () => {
  const result = evaluateClaims(reference(), [{ ...comparison(), unit: "km", expected: 0.0002, observed: 0.0002, tolerance: Number.MAX_VALUE }])[0];
  assert.equal(result.verdict, "not-evaluated");
  has(result.diagnostics, "NONFINITE_CANONICAL_NUMBER", "/results/0/tolerance");
});

test("R6 assertion mode cannot release a factual statement backed only by a passed F0 illustrative claim", () => {
  const spec = copy();
  Object.assign(spec.claims[0], { kind: "illustrative", requestedLevel: "F0" });
  Object.assign(spec.visibleText[0], { mode: "assertion", text: "The head radius is 0.20 m." });
  assert.equal(evaluateClaims(spec, [green])[0].verdict, "passed");
  assert.equal(evaluateClaims(spec, [green])[0].level, "F0");
  const result = auditVisibleText(spec, [green])[0];
  assert.equal(result.verdict, "failed");
  has(result.diagnostics, "UNSUPPORTED_VISIBLE_ASSERTION");
  Object.assign(spec.visibleText[0], { mode: "illustrative", text: "Illustrative head radius is 0.20 m." });
  assert.equal(auditVisibleText(spec, [green])[0].verdict, "passed");
});
