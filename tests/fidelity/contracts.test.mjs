import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateMachine, normalizeQuantity, canonicalHash } from "../../fidelity/index.mjs";

const fixture = JSON.parse(readFileSync(new URL("fixtures/minimal-valid.json", import.meta.url)));
const invalidCases = JSON.parse(readFileSync(new URL("fixtures/invalid-cases.json", import.meta.url)));
const copy = () => structuredClone(fixture);
const set = (object, path, value) => {
  const keys = path.slice(1).split("/");
  const last = keys.pop();
  keys.reduce((target, key) => target[key], object)[last] = value;
};
const hasDiagnostic = (result, code, path) => assert.ok(result.diagnostics.some((entry) => entry.code === code && entry.path === path), JSON.stringify(result.diagnostics));

test("normalizes 200 mm to 0.20 m without replacing unknown uncertainty", () => {
  const input = { value: 200, unit: "mm", sourceIds: ["E0"], uncertainty: null, manufacturingTolerance: null, proposedTolerance: 2, numericAcceptance: 0.001 };
  const result = normalizeQuantity(input, "length");
  assert.equal(result.ok, true);
  assert.equal(result.value.value, 0.20);
  assert.equal(result.value.unit, "m");
  assert.equal(result.value.uncertainty, null);
  assert.equal(result.value.proposedTolerance, 0.002);
  assert.deepEqual(result.value.original, input);
  assert.deepEqual(input, result.value.original);
});

test("rejects unknown units and incompatible dimensions explicitly", () => {
  hasDiagnostic(normalizeQuantity({ ...copy().parameters.beltBucket.headRadius, value: 1, unit: "wat" }, "length"), "UNKNOWN_UNIT", "/unit");
  hasDiagnostic(normalizeQuantity({ ...copy().parameters.beltBucket.headRadius, value: 1, unit: "kg" }, "length"), "UNIT_DIMENSION_MISMATCH", "/unit");
  hasDiagnostic(normalizeQuantity({ ...copy().parameters.beltBucket.headRadius, value: Infinity, unit: "m" }, "length"), "NONFINITE_NUMBER", "/value");
});

test("validates complete fixture and normalizes geometry while retaining provenance", () => {
  const input = copy();
  const original = structuredClone(input);
  const result = validateMachine(input);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.value.definitions[0].geometry.radius, 0.2);
  assert.equal(result.value.definitions[0].geometry.unit, "m");
  assert.equal(result.value.definitions[0].geometry.original.unit, "mm");
  assert.equal(result.value.parameters.beltBucket.headRadius.uncertainty, null);
  assert.equal(result.value.parameters.beltBucket.centerDistance.value, (5 - 2 * Math.PI * 0.2) / 2);
  assert.deepEqual(input, original);
});

for (const entry of invalidCases) {
  test(`rejects ${entry.name} with exact diagnostic code and path`, () => {
    const spec = copy();
    set(spec, entry.path, entry.value);
    const result = validateMachine(spec);
    assert.equal(result.ok, false);
    assert.equal("value" in result, false);
    hasDiagnostic(result, entry.code, entry.diagnosticPath);
  });
}

test("rejects executable values, extra fields and nonfinite numbers before JSON coercion", () => {
  for (const [path, value, code] of [["/parts/0/geometry/build", () => 1, "EXECUTABLE_DATA"], ["/parts/0/html", "harmless", "UNKNOWN_FIELD"], ["/parameters/beltBucket/headRadius/value", NaN, "NONFINITE_NUMBER"]]) {
    const spec = copy();
    set(spec, path, value);
    hasDiagnostic(validateMachine(spec), code, path);
  }
});

test("rejects missing required fields and the deliberately abbreviated spec example", () => {
  const spec = copy();
  delete spec.initialState;
  hasDiagnostic(validateMachine(spec), "MISSING_FIELD", "/initialState");
  const document = readFileSync(new URL("../../docs/specs/machine-fidelity.md", import.meta.url), "utf8");
  const excerpt = JSON.parse(document.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.equal(validateMachine(excerpt).ok, false);
  hasDiagnostic(validateMachine(excerpt), "MISSING_FIELD", "/initialState");
});

test("canonical hash ignores ID collection order and preserves ordered geometry and commands", () => {
  const a = copy();
  const b = copy();
  for (const key of ["parts", "definitions", "instances", "sources", "claims", "frames", "joints", "ports", "connections", "materials", "assets", "criteria", "dependencies", "visibleText", "constraints"]) b[key].reverse();
  assert.equal(canonicalHash(a), canonicalHash(b));
  assert.equal(validateMachine(a).value.canonicalHash, validateMachine(b).value.canonicalHash);
  assert.deepEqual(validateMachine(a).value.parts.map((part) => part.id).sort(), validateMachine(b).value.parts.map((part) => part.id).sort());
  a.parts[0].geometry = { kind: "prism", vertices: [[0,0],[1,0],[0,1]], height: 1, unit: "m" };
  b.parts[0].geometry = { kind: "prism", vertices: [[1,0],[0,0],[0,1]], height: 1, unit: "m" };
  assert.notEqual(canonicalHash(a), canonicalHash(b));
  const c = copy();
  c.commands = [{ id: "a", type: "start", tick: 0 }, { id: "b", type: "stop", tick: 1 }];
  const d = structuredClone(c);
  d.commands.reverse();
  assert.notEqual(canonicalHash(c), canonicalHash(d));
  assert.notEqual(canonicalHash({ ordered: [{ id: "a" }, { id: "b" }] }), canonicalHash({ ordered: [{ id: "b" }, { id: "a" }] }));
});

test("normalizes local rest and frame positions from machine units once", () => {
  const spec = copy();
  spec.frame.unit = "mm";
  spec.parts[1].localRest.position = [0,0,200];
  spec.frames[0].pose.position = [0,100,0];
  const result = validateMachine(spec);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.parts[1].localRest.position, [0,0,0.2]);
  assert.deepEqual(result.value.frames[0].pose.position, [0,0.1,0]);
  assert.equal(result.value.originalFrame.unit, "mm");
  assert.equal(result.value.frame.unit, "m");
});

test("allows closed constraint graphs separately from an acyclic transform tree", () => {
  const spec = copy();
  spec.constraints = [{ id: "loop", kind: "closure", partIds: ["frame", "head-pulley", "frame"], jointIds: ["head-shaft"], tolerance: 1e-9, sourceIds: ["E0"] }];
  assert.equal(validateMachine(spec).ok, true);
});

test("marks an asset without license unusable for redistribution without fetching it", () => {
  const spec = copy();
  spec.assets = [{ id: "unlicensed", uri: "assets/head.glb", hash: "a".repeat(64), format: "glb", sourceIds: ["E0"], sourceFrame: { handedness: "right", up: "Y", unit: "mm" }, license: null, author: null, attribution: null, redistribution: null }];
  const result = validateMachine(spec);
  assert.equal(result.ok, true);
  assert.equal(result.value.assets[0].usableForRedistribution, false);
  hasDiagnostic(result, "ASSET_RIGHTS_UNRESOLVED", "/assets/0/license");
});

test("validates each closed geometry kind and rejects unsupported substitutes", () => {
  const geometries = [
    { kind: "box", dimensions: [1,2,3], unit: "cm" },
    { kind: "cylinder", radius: 2, length: 3, unit: "cm" },
    { kind: "prism", vertices: [[0,0],[2,0],[0,2]], height: 3, unit: "cm" },
    { kind: "compound", components: [{ id: "shell", pose: { position: [0,0,0], rotation_xyzw: [0,0,0,1] }, geometry: { kind: "box", dimensions: [1,2,3], unit: "m" } }] }
  ];
  for (const geometry of geometries) {
    const spec = copy();
    spec.parts[0].geometry = geometry;
    assert.equal(validateMachine(spec).ok, true, JSON.stringify(validateMachine(spec).diagnostics));
  }
  const spec = copy();
  spec.parts[0].geometry = { kind: "callback", callback: "build()" };
  hasDiagnostic(validateMachine(spec), "UNSUPPORTED_GEOMETRY", "/parts/0/geometry/kind");
});

test("validates definition, instance, frame, port and criterion references", () => {
  for (const [path, code] of [["/parts/1/definitionId", "MISSING_DEFINITION"], ["/parts/1/instanceId", "MISSING_INSTANCE"], ["/frames/0/partId", "MISSING_PART"], ["/joints/0/childFrame", "MISSING_FRAME"], ["/ports/0/frameId", "MISSING_FRAME"], ["/claims/0/checkIds/0", "MISSING_CHECK"]]) {
    const spec = copy();
    set(spec, path, "absent");
    hasDiagnostic(validateMachine(spec), code, path);
  }
});

test("rejects data accessors, nonplain objects, cycles and invalid tolerances", () => {
  const accessor = copy();
  Object.defineProperty(accessor, "evil", { get: () => { throw new Error("Must not execute"); }, enumerable: true });
  hasDiagnostic(validateMachine(accessor), "EXECUTABLE_DATA", "/evil");
  const cyclic = copy();
  cyclic.extra = cyclic;
  hasDiagnostic(validateMachine(cyclic), "CYCLIC_DATA", "/extra");
  const date = copy();
  date.extra = new Date();
  hasDiagnostic(validateMachine(date), "NONPLAIN_DATA", "/extra");
  hasDiagnostic(normalizeQuantity({ ...copy().parameters.beltBucket.headRadius, value: 1, unit: "m", uncertainty: -1 }, "length"), "INVALID_TOLERANCE", "/uncertainty");
});

test("normalizes criterion units and keeps acceptance categories separate", () => {
  const spec = copy();
  spec.criteria[0].expected = 200;
  spec.criteria[0].unit = "mm";
  spec.criteria[0].tolerance = { manufacturing: null, project: 2, numeric: 0.001 };
  const result = validateMachine(spec);
  assert.equal(result.ok, true);
  assert.equal(result.value.criteria[0].expected, 0.2);
  assert.equal(result.value.criteria[0].unit, "m");
  assert.deepEqual(result.value.criteria[0].tolerance, { manufacturing: null, project: 0.002, numeric: 0.000001 });
  assert.equal(result.value.criteria[0].original.unit, "mm");
});

test("standalone quantity normalization rejects accessors and conversion overflow", () => {
  const accessor = { unit: "m" };
  Object.defineProperty(accessor, "value", { get: () => { throw new Error("Must not execute"); }, enumerable: true });
  hasDiagnostic(normalizeQuantity(accessor, "length"), "EXECUTABLE_DATA", "/value");
  hasDiagnostic(normalizeQuantity({ ...copy().parameters.beltBucket.headRadius, value: 1, unit: "km", numericAcceptance: Number.MAX_VALUE }, "length"), "NONFINITE_NUMBER", "/numericAcceptance");
});

test("canonical hashes reject non-JSON data rather than coerce it into a valid hash", () => {
  assert.throws(() => canonicalHash({ value: Infinity }), TypeError);
  assert.throws(() => canonicalHash({ value: () => 1 }), TypeError);
});

test("rejects sparse arrays and hidden properties that JSON serialization would omit", () => {
  const sparse = copy();
  sparse.commands = new Array(1);
  hasDiagnostic(validateMachine(sparse), "NONPLAIN_DATA", "/commands/0");
  const extended = copy();
  extended.commands.extra = 1;
  hasDiagnostic(validateMachine(extended), "NONPLAIN_DATA", "/commands/extra");
  const hidden = copy();
  Object.defineProperty(hidden, "hidden", { value: 1, enumerable: false });
  hasDiagnostic(validateMachine(hidden), "NONPLAIN_DATA", "/hidden");
});
