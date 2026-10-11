import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateMachine, evaluateClaims, invalidateClaims, auditVisibleText } from "../../fidelity/index.mjs";

const fixture = JSON.parse(readFileSync(new URL("fixtures/minimal-valid.json", import.meta.url)));
const copy = () => structuredClone(fixture);
const green = [{ id: "head-radius-check", coverage: "executed", verdict: "passed", aspect: "construction", claimIds: ["dimension-head"], sourceIds: ["E0"] }];

test("E0 dimensional claim never promotes to F1 even when numerical checks pass", () => {
  const verdict = evaluateClaims(copy(), green)[0];
  assert.equal(verdict.verdict, "not-evaluated");
  assert.equal(verdict.level, "F0");
  assert.equal(verdict.aspect, "construction");
  assert.ok(verdict.diagnostics.some((entry) => entry.code === "INSUFFICIENT_EVIDENCE"));
});

test("missing, skipped and partial checks remain not evaluated and a failed check fails", () => {
  const spec = copy();
  spec.claims[0].kind = "illustrative";
  spec.claims[0].requestedLevel = "F0";
  for (const results of [[], [{ ...green[0], coverage: "skipped" }], [{ ...green[0], coverage: "partial" }]]) assert.equal(evaluateClaims(spec, results)[0].verdict, "not-evaluated");
  assert.equal(evaluateClaims(spec, [{ ...green[0], verdict: "failed" }])[0].verdict, "failed");
  assert.equal(evaluateClaims(spec, green)[0].verdict, "passed");
});

test("source revision conflict is unresolved rather than averaging or approving", () => {
  const spec = copy();
  spec.sources.push({ ...spec.sources[0], id: "E1", revision: "synthetic-v2" });
  spec.claims[0].sourceRefs.push({ sourceId: "E1", locator: "worked-example/headRadius", revision: "synthetic-v2" });
  spec.visibleText[0].sourceRefs = structuredClone(spec.claims[0].sourceRefs);
  spec.criteria[0].sourceIds = ["E0", "E1"];
  const result = validateMachine(spec);
  assert.equal(result.ok, true);
  assert.ok(result.diagnostics.some((entry) => entry.code === "SOURCE_REVISION_CONFLICT" && entry.path === "/claims/0/sourceRefs"));
  const verdict = evaluateClaims(result.value, green)[0];
  assert.equal(verdict.verdict, "not-evaluated");
  assert.ok(verdict.diagnostics.some((entry) => entry.code === "SOURCE_REVISION_CONFLICT"));
  assert.equal(result.value.parameters.beltBucket.headRadius.value, 0.2);
});

test("source replacement invalidates only linked claims, parts and checks transitively", () => {
  const spec = copy();
  spec.sources.push({ ...spec.sources[0], id: "E1", locator: "other" });
  spec.claims.push({ ...spec.claims[0], id: "dependent", sourceRefs: [], dependsOnClaimIds: ["dimension-head"], checkIds: ["dependent-check"], subjectIds: ["head-pulley"] });
  spec.claims.push({ ...spec.claims[0], id: "unrelated", sourceRefs: [{ sourceId: "E1", locator: "other", revision: "synthetic-v1" }], checkIds: ["other-check"], subjectIds: ["other-part"] });
  assert.deepEqual(invalidateClaims(spec, ["E0"]), { claimIds: ["dependent", "dimension-head"], partIds: ["frame", "head-pulley"], checkIds: ["dependent-check", "head-radius-check"] });
  assert.deepEqual(invalidateClaims(spec, ["absent"]), { claimIds: [], partIds: [], checkIds: [] });
});

test("independent fidelity aspects retain their own verdicts", () => {
  const spec = copy();
  spec.claims = ["construction", "kinematic", "process", "appearance"].map((aspect) => ({ ...spec.claims[0], id: aspect, aspect, kind: "illustrative", requestedLevel: "F0", checkIds: [`${aspect}-check`] }));
  spec.criteria = spec.claims.map((claim) => ({ ...fixture.criteria[0], id: claim.checkIds[0], aspect: claim.aspect, claimIds: [claim.id] }));
  spec.visibleText = [];
  spec.dependencies = [];
  const results = spec.claims.map((claim) => ({ id: claim.checkIds[0], coverage: "executed", verdict: claim.aspect === "appearance" ? "failed" : "passed", aspect: claim.aspect, claimIds: [claim.id], sourceIds: ["E0"] }));
  const valid = validateMachine(spec);
  assert.equal(valid.ok, true, JSON.stringify(valid.diagnostics));
  const verdicts = evaluateClaims(valid.value, results);
  assert.deepEqual(verdicts.map((entry) => entry.verdict), ["passed", "passed", "passed", "failed"]);
});

test("E0 calibrated capacity caption fails visible-text audit despite green model checks", () => {
  const spec = copy();
  spec.claims[0].kind = "capacity";
  spec.claims[0].aspect = "process";
  spec.claims[0].statement = "Calibrated real capacity is 100 kg/h.";
  spec.visibleText[0].text = spec.claims[0].statement;
  spec.visibleText[0].mode = "assertion";
  const result = auditVisibleText(spec, green);
  assert.equal(result[0].verdict, "failed");
  assert.ok(result[0].diagnostics.some((entry) => entry.code === "UNSUPPORTED_VISIBLE_ASSERTION"));
});

test("clearly labeled illustrative descriptions preserve exact claims and source locators", () => {
  const result = auditVisibleText(copy(), green)[0];
  assert.equal(result.verdict, "passed");
  assert.deepEqual(result.claimIds, ["dimension-head"]);
  assert.deepEqual(result.sourceRefs, fixture.visibleText[0].sourceRefs);
});

test("visible text rejects unknown claims and imprecise or inconsistent locators", () => {
  for (const [edit, code, path] of [
    [(spec) => spec.visibleText[0].claimIds = ["absent"], "MISSING_CLAIM", "/visibleText/0/claimIds/0"],
    [(spec) => spec.visibleText[0].sourceRefs[0].locator = "", "INVALID_LOCATOR", "/visibleText/0/sourceRefs/0/locator"],
    [(spec) => spec.visibleText[0].sourceRefs[0].locator = "different", "VISIBLE_SOURCE_MISMATCH", "/visibleText/0/sourceRefs"]
  ]) {
    const spec = copy();
    edit(spec);
    const result = validateMachine(spec);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((entry) => entry.code === code && entry.path === path), JSON.stringify(result.diagnostics));
  }
});

test("verified source and human review cannot borrow a check from another claim", () => {
  const spec = copy();
  spec.sources.push({ ...spec.sources[0], id: "measurement", kind: "measurement", confidence: "verified" });
  spec.claims[0].sourceRefs[0].sourceId = "measurement";
  spec.visibleText[0].sourceRefs[0].sourceId = "measurement";
  spec.criteria[0].sourceIds = ["measurement"];
  spec.claims[0].uncertainty = 0.0005;
  spec.claims[0].extractionMethod = "recorded measurement comparison";
  spec.claims[0].status = "verified";
  spec.claims[0].review = { reviewerId: "responsible-reviewer", role: "human", locator: "review/001" };
  const result = { ...green[0], sourceIds: ["measurement"], expected: 0.2, observed: 0.2, unit: "m", partIds: ["head-pulley"], evidencePath: "comparisons/head-radius.json", scope: "head radius in reference configuration" };
  const valid = validateMachine(spec);
  assert.equal(valid.ok, true, JSON.stringify(valid.diagnostics));
  assert.equal(evaluateClaims(valid.value, [{ ...result, claimIds: ["different"] }])[0].verdict, "not-evaluated");
  assert.equal(evaluateClaims(valid.value, [result])[0].verdict, "passed");
});

test("cyclic claim dependencies cannot approve each other", () => {
  const spec = copy();
  spec.claims[0].kind = "illustrative";
  spec.claims[0].requestedLevel = "F0";
  spec.claims[0].dependsOnClaimIds = ["second"];
  spec.claims.push({ ...spec.claims[0], id: "second", checkIds: ["second-check"], dependsOnClaimIds: ["dimension-head"] });
  const results = [...green, { ...green[0], id: "second-check", claimIds: ["second"] }];
  assert.ok(evaluateClaims(spec, results).every((entry) => entry.verdict === "not-evaluated"));
});

test("an illustrative label cannot hide unsupported calibrated-capacity prose", () => {
  const spec = copy();
  spec.claims[0].kind = "illustrative";
  spec.claims[0].requestedLevel = "F0";
  spec.claims[0].statement = "Illustrative calibrated real capacity is 100 kg/h.";
  spec.visibleText[0].text = spec.claims[0].statement;
  assert.equal(auditVisibleText(spec, green)[0].verdict, "failed");
});

test("unresolved and contradicted source-backed descriptions fail the visible audit", () => {
  for (const status of ["unresolved", "contradicted"]) {
    const spec = copy();
    spec.claims[0].status = status;
    assert.equal(auditVisibleText(spec, green)[0].verdict, "failed");
  }
});
