import { unitInfo } from "./units.mjs";

const diagnostic = (code, path, claim, message, severity = "warning") => ({ code, severity, path, claimId: claim.id, sourceIds: claim.sourceRefs.map((ref) => ref.sourceId), message });
const sameReference = (a, b) => a.sourceId === b.sourceId && a.locator === b.locator && a.revision === b.revision;

export function claimSourceDiagnostics(spec, claim, path) {
  const diagnostics = [];
  const sources = new Map(spec.sources.map((source) => [source.id, source]));
  const refs = claim.sourceRefs;
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    const source = sources.get(ref.sourceId);
    if (source && source.revision !== ref.revision) diagnostics.push(diagnostic("SOURCE_REVISION_CONFLICT", `${path}/sourceRefs/${i}/revision`, claim, "Claim revision does not match its registered source."));
    for (let j = 0; j < i; j++) {
      const other = refs[j];
      const otherSource = sources.get(other.sourceId);
      if ((ref.locator === other.locator || (source && otherSource && source.locator === otherSource.locator)) && ref.revision !== other.revision) diagnostics.push(diagnostic("SOURCE_REVISION_CONFLICT", `${path}/sourceRefs`, claim, "Conflicting source revisions remain unresolved."));
    }
  }
  return diagnostics;
}

export function claimCriterionMatches(claim, criterion) {
  return criterion.aspect === claim.aspect && criterion.claimIds.includes(claim.id) && claim.checkIds.includes(criterion.id) && claim.sourceRefs.every((ref) => criterion.sourceIds.includes(ref.sourceId));
}

const sameIds = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && new Set(a).size === a.length && new Set(b).size === b.length && a.every((id) => b.includes(id));
const resultMatches = (result, criterion) => result.id === criterion.id && result.aspect === criterion.aspect && sameIds(result.claimIds, criterion.claimIds) && sameIds(result.sourceIds, criterion.sourceIds) && (result.partIds === undefined || sameIds(result.partIds, criterion.partIds));

function levelDiagnostics(claim, criteria, results, sources, assumptions, path, criterionPaths, resultPaths) {
  const diagnostics = [];
  const add = (code, message, fieldPath = path) => diagnostics.push(diagnostic(code, fieldPath, claim, message));
  const canonicalNumber = (value, factor, fieldPath) => {
    if (value === null) return null;
    const converted = value * factor;
    if (!Number.isFinite(value) || !Number.isFinite(converted)) {
      add("NONFINITE_CANONICAL_NUMBER", "The canonical quantity must be finite before evidence comparison.", fieldPath);
      return NaN;
    }
    return converted;
  };
  if (claim.requestedLevel === "F0") {
    if (claim.kind !== "illustrative") add("INSUFFICIENT_LEVEL_EVIDENCE", "F0 approvals are explicitly illustrative claims.");
    if (!claim.conditions.length && !assumptions.length) add("ILLUSTRATIVE_ASSUMPTIONS_REQUIRED", "F0 requires listed illustrative assumptions or conditions.");
    return diagnostics;
  }
  if (claim.requestedLevel === "F3") {
    add("UNSUPPORTED_FIDELITY_LEVEL", "This contract cannot record independent trials and a validated prediction domain; F3 remains unavailable.");
    return diagnostics;
  }
  const construction = claim.requestedLevel === "F1" && claim.aspect === "construction" && claim.kind === "dimensional";
  const kinematic = claim.requestedLevel === "F2" && claim.aspect === "kinematic" && claim.kind === "kinematic";
  if (!construction && !kinematic) {
    add("INSUFFICIENT_LEVEL_EVIDENCE", "Supported non-illustrative levels are scoped F1 dimensional construction and F2 kinematics only.");
    return diagnostics;
  }
  const allowedSources = construction ? ["measurement", "drawing", "cad"] : ["measurement", "drawing", "manual", "cad", "video"];
  if (!sources.length || sources.some((source) => !source || !allowedSources.includes(source.kind))) add("INSUFFICIENT_LEVEL_EVIDENCE", "The selected source kind cannot establish this fidelity level.");
  if (!claim.conditions.length || claim.conditions.some((condition) => !condition.trim())) add("VALIDITY_SCOPE_REQUIRED", "A non-illustrative claim must identify its valid reference configuration or tested states.");
  const claimUnit = unitInfo(claim.unit);
  if (!claimUnit) add("UNCERTAINTY_UNIT_UNRESOLVED", "Claim uncertainty and acceptance require an explicit registered unit.");
  if (claim.uncertainty === null || !Number.isFinite(claim.uncertainty) || claim.uncertainty < 0) add("UNKNOWN_UNCERTAINTY", "Unknown measurement or model uncertainty cannot support a quantitative acceptance decision.");
  const claimAcceptance = claimUnit ? Object.fromEntries(["uncertainty", "manufacturingTolerance", "proposedTolerance", "numericAcceptance"].map((key) => [key, canonicalNumber(claim[key], Math.abs(claimUnit[1]), `${path}/${key}`)])) : {};
  if (!criteria.length) add("INSUFFICIENT_LEVEL_EVIDENCE", "The requested level needs an explicit scoped comparison criterion.");
  for (const criterion of criteria) {
    const criterionUnit = unitInfo(criterion.unit);
    const criterionPath = criterionPaths.get(criterion.id);
    const expected = criterionUnit ? canonicalNumber(criterion.expected, criterionUnit[1], `${criterionPath}/expected`) : null;
    const tolerance = criterionUnit ? Object.fromEntries(["manufacturing", "project", "numeric"].map((key) => [key, canonicalNumber(criterion.tolerance[key], Math.abs(criterionUnit[1]), `${criterionPath}/tolerance/${key}`)])) : {};
    if (criterion.kind !== (construction ? "geometry" : "kinematic")) add("INSUFFICIENT_LEVEL_EVIDENCE", "Criterion method does not match the requested construction or kinematic level.");
    if (!claimUnit || !criterionUnit || claimUnit[0] !== criterionUnit[0]) { add("UNCERTAINTY_DIMENSION_MISMATCH", "Claim uncertainty and the intended criterion must have compatible dimensions."); continue; }
    const fields = construction ? ["manufacturingTolerance", "proposedTolerance"] : ["numericAcceptance"];
    const category = construction ? ["manufacturing", "project"] : ["numeric"];
    const limits = [...fields.map((key) => claimAcceptance[key]), ...category.map((key) => tolerance[key])].filter((value) => Number.isFinite(value) && value >= 0);
    if (!limits.length) add("ACCEPTANCE_UNRESOLVED", "The intended physical or numerical acceptance is unknown.");
    else if (Number.isFinite(claimAcceptance.uncertainty) && claimAcceptance.uncertainty > Math.min(...limits)) add("UNCERTAINTY_EXCEEDS_ACCEPTANCE", "Evidence uncertainty exceeds the compatible intended acceptance; it does not support the decision.");
    const checkResults = results.filter((result) => result.id === criterion.id);
    for (const result of checkResults) {
      const resultUnit = unitInfo(result.unit);
      if (!resultUnit || resultUnit[0] !== criterionUnit[0] || !Number.isFinite(criterion.expected) || !Number.isFinite(result.expected) || !Number.isFinite(result.observed) || !sameIds(result.partIds, criterion.partIds) || !result.evidencePath?.trim() || !result.scope?.trim()) {
        add("COMPARISON_EVIDENCE_REQUIRED", "A non-illustrative approval needs a unit-compatible numeric comparison, physical scope and evidence locator.");
        continue;
      }
      const resultPath = resultPaths.get(result);
      const reportedExpected = canonicalNumber(result.expected, resultUnit[1], `${resultPath}/expected`);
      const observed = canonicalNumber(result.observed, resultUnit[1], `${resultPath}/observed`);
      if (result.tolerance !== undefined) canonicalNumber(result.tolerance, Math.abs(resultUnit[1]), `${resultPath}/tolerance`);
      if (![expected, reportedExpected, observed, claimAcceptance.uncertainty].every(Number.isFinite)) continue;
      const expectationResidual = Math.abs(reportedExpected - expected);
      const observationResidual = Math.abs(observed - expected);
      const uncertaintyBound = observationResidual + claimAcceptance.uncertainty;
      if (![expectationResidual, observationResidual, uncertaintyBound].every(Number.isFinite)) {
        add("NONFINITE_COMPARISON_ARITHMETIC", "Comparison residuals and uncertainty bounds must remain finite before acceptance.", resultPath);
        continue;
      }
      if (!Number.isFinite(tolerance.numeric) || tolerance.numeric < 0 || expectationResidual > tolerance.numeric) add("COMPARISON_EXPECTATION_MISMATCH", "Reported expectation must match the declared canonical criterion within its explicit numerical tolerance.");
      if (limits.length && observationResidual > Math.min(...limits)) add("COMPARISON_OUTSIDE_ACCEPTANCE", "A passed status cannot replace an observed comparison within the declared acceptance.");
      else if (limits.length && uncertaintyBound > Math.min(...limits)) add("UNCERTAINTY_CROSSES_ACCEPTANCE", "The comparison uncertainty crosses the intended acceptance boundary; a definite approval is unsupported.");
      if (kinematic && (!Array.isArray(result.tickRange) || result.tickRange.length !== 2 || result.tickRange.some((tick) => !Number.isInteger(tick) || tick < 0) || result.tickRange[1] < result.tickRange[0])) add("KINEMATIC_TRACE_SCOPE_REQUIRED", "F2 needs an evidence-located trace for an explicit ordered interval of tested states.");
    }
  }
  return diagnostics;
}

export function evaluateClaims(spec, results = []) {
  const sources = new Map(spec.sources.map((source) => [source.id, source]));
  const criteriaById = new Map(spec.criteria.map((criterion) => [criterion.id, criterion]));
  const criterionPaths = new Map(spec.criteria.map((criterion, index) => [criterion.id, `/criteria/${index}`]));
  const resultPaths = new Map(results.map((result, index) => [result, `/results/${index}`]));
  const checks = new Map();
  for (const result of results) checks.set(result.id, [...(checks.get(result.id) ?? []), result]);
  const initial = spec.claims.map((claim, index) => {
    const path = `/claims/${index}`;
    const diagnostics = claimSourceDiagnostics(spec, claim, path);
    const relevant = claim.checkIds.flatMap((id) => checks.get(id) ?? []);
    const criteria = claim.checkIds.map((id) => criteriaById.get(id)).filter(Boolean);
    let verdict = "passed";
    const sourceValues = claim.sourceRefs.map((ref) => sources.get(ref.sourceId));
    const illustrative = claim.kind === "illustrative" && claim.requestedLevel === "F0";
    const supported = sourceValues.length > 0 && sourceValues.every((source) => source && source.id !== "E0" && source.kind !== "assumption" && source.confidence === "verified");
    const criterionMismatch = claim.checkIds.some((id) => !criteriaById.has(id) || !claimCriterionMatches(claim, criteriaById.get(id)));
    const resultMismatch = relevant.some((result) => !criteriaById.has(result.id) || !resultMatches(result, criteriaById.get(result.id)));
    if (criterionMismatch) diagnostics.push(diagnostic("CRITERION_SCOPE_MISMATCH", `${path}/checkIds`, claim, "The manifest criterion must declare this claim, aspect and source scope reciprocally."));
    if (resultMismatch) diagnostics.push(diagnostic("CHECK_SCOPE_MISMATCH", `${path}/checkIds`, claim, "Submitted check identity, aspect, claims, sources and physical scope must match its declared criterion."));
    if (claim.status === "contradicted") verdict = "failed";
    else if (!criterionMismatch && !resultMismatch && relevant.some((check) => check.verdict === "failed")) verdict = "failed";
    else {
      if (claim.status === "unresolved" || diagnostics.length) verdict = "not-evaluated";
      if (!illustrative && !supported) {
        verdict = "not-evaluated";
        diagnostics.push(diagnostic("INSUFFICIENT_EVIDENCE", path, claim, "Real-machine assertions require verified, non-assumption evidence."));
      }
      if (!illustrative && (!claim.review || claim.review.role !== "human" || claim.status !== "verified")) {
        verdict = "not-evaluated";
        diagnostics.push(diagnostic("HUMAN_REVIEW_REQUIRED", path, claim, "Machine fidelity cannot be approved by numerical tests or AI alone."));
      }
      const level = levelDiagnostics(claim, criteria, relevant, sourceValues, spec.model.assumptions, path, criterionPaths, resultPaths);
      diagnostics.push(...level);
      if (level.length) verdict = "not-evaluated";
      if (!claim.checkIds.length || claim.checkIds.some((id) => !checks.has(id)) || relevant.some((check) => check.coverage !== "executed" || check.verdict !== "passed")) {
        verdict = "not-evaluated";
        diagnostics.push(diagnostic("CHECK_NOT_EVALUATED", `${path}/checkIds`, claim, "All scoped checks must execute and pass in the claim's aspect."));
      }
    }
    return { claimId: claim.id, aspect: claim.aspect, verdict, level: verdict === "passed" ? claim.requestedLevel : "F0", diagnostics };
  });
  const byId = new Map(initial.map((value) => [value.claimId, value]));
  const claimMap = new Map(spec.claims.map((claim) => [claim.id, claim]));
  const reachesSelf = (id, current, visited = new Set()) => {
    if (visited.has(current)) return false;
    visited.add(current);
    return (claimMap.get(current)?.dependsOnClaimIds ?? []).some((dependency) => dependency === id || reachesSelf(id, dependency, visited));
  };
  for (let i = 0; i < spec.claims.length; i++) {
    const claim = spec.claims[i];
    if (reachesSelf(claim.id, claim.id)) {
      const value = byId.get(claim.id);
      if (value.verdict !== "failed") value.verdict = "not-evaluated";
      value.level = "F0";
      value.diagnostics.push(diagnostic("CLAIM_DEPENDENCY_CYCLE", `/claims/${i}/dependsOnClaimIds`, claim, "Claims cannot establish evidence by circular approval."));
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < spec.claims.length; i++) {
      const claim = spec.claims[i];
      const value = byId.get(claim.id);
      const dependencies = claim.dependsOnClaimIds.map((id) => byId.get(id));
      const next = dependencies.some((dependency) => dependency?.verdict === "failed") ? "failed" : dependencies.some((dependency) => !dependency || dependency.verdict !== "passed") ? "not-evaluated" : value.verdict;
      if (value.verdict === "passed" && next !== "passed" || value.verdict === "not-evaluated" && next === "failed") {
        value.verdict = next;
        value.level = "F0";
        value.diagnostics.push(diagnostic("DEPENDENT_CLAIM_UNRESOLVED", `/claims/${i}/dependsOnClaimIds`, claim, "A required claim lacks a passing verdict."));
        changed = true;
      }
    }
  }
  return initial;
}

export function auditVisibleText(spec, results = []) {
  const verdicts = new Map(evaluateClaims(spec, results).map((value) => [value.claimId, value]));
  const claims = new Map(spec.claims.map((claim) => [claim.id, claim]));
  return spec.visibleText.map((text, index) => {
    const diagnostics = [];
    const refs = text.claimIds.flatMap((id) => claims.get(id)?.sourceRefs ?? []);
    if (!text.claimIds.length || text.claimIds.some((id) => !claims.has(id)) || !refs.length || refs.some((ref) => !text.sourceRefs.some((value) => sameReference(value, ref))) || text.sourceRefs.some((ref) => !refs.some((value) => sameReference(value, ref)))) diagnostics.push({ code: "VISIBLE_SOURCE_MISMATCH", severity: "error", path: `/visibleText/${index}/sourceRefs`, sourceIds: text.sourceRefs.map((ref) => ref.sourceId), message: "Visible text must identify its claims and their exact source locators." });
    if (text.mode === "assertion" && text.claimIds.some((id) => verdicts.get(id)?.verdict !== "passed" || verdicts.get(id)?.level === "F0")) diagnostics.push({ code: "UNSUPPORTED_VISIBLE_ASSERTION", severity: "error", path: `/visibleText/${index}/text`, sourceIds: text.sourceRefs.map((ref) => ref.sourceId), message: "An unsupported factual assertion cannot be released as visible text. A claim that passes only at hypothesis level F0 supports illustrative text, not an assertion." });
    if (text.mode === "illustrative" && !/\b(illustrative|synthetic|hypothetical|assumed|ilustrativ[oa]|sint[eé]tic[oa]|hipot[eé]tic[oa])\b/i.test(text.text)) diagnostics.push({ code: "UNLABELED_ILLUSTRATION", severity: "error", path: `/visibleText/${index}/text`, sourceIds: text.sourceRefs.map((ref) => ref.sourceId), message: "Illustrative text must explicitly identify its assumed nature." });
    if (text.claimIds.some((id) => ["unresolved", "contradicted"].includes(claims.get(id)?.status) || verdicts.get(id)?.diagnostics.some((entry) => ["SOURCE_REVISION_CONFLICT", "CLAIM_DEPENDENCY_CYCLE"].includes(entry.code)))) diagnostics.push({ code: "UNRESOLVED_VISIBLE_CLAIM", severity: "error", path: `/visibleText/${index}/claimIds`, sourceIds: text.sourceRefs.map((ref) => ref.sourceId), message: "Unresolved or contradicted claims require reconciliation before release." });
    if (/\b(calibrated\s+(?:real\s+)?capacity|real\s+capacity|calibrated\s+discharge|operational\s+prediction|safety\s+certified)\b/i.test(text.text)) diagnostics.push({ code: "UNSUPPORTED_VISIBLE_ASSERTION", severity: "error", path: `/visibleText/${index}/text`, sourceIds: text.sourceRefs.map((ref) => ref.sourceId), message: "An illustrative label cannot substantiate calibrated real-machine assertions." });
    if (text.claimIds.some((id) => ["capacity", "safety", "wear", "operational"].includes(claims.get(id)?.kind) && verdicts.get(id)?.verdict !== "passed")) diagnostics.push({ code: "UNSUPPORTED_VISIBLE_ASSERTION", severity: "error", path: `/visibleText/${index}/text`, sourceIds: text.sourceRefs.map((ref) => ref.sourceId), message: "An illustrative label does not establish real capacity, safety, wear or operational prediction." });
    return { textId: text.id, location: structuredClone(text.location), claimIds: [...text.claimIds], sourceRefs: structuredClone(text.sourceRefs), verdict: diagnostics.length ? "failed" : "passed", diagnostics };
  });
}

export function invalidateClaims(spec, changedSourceIds) {
  const edges = new Map();
  const connect = (from, to) => {
    if (from === null || to === null) return;
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from).add(to);
  };
  const sourceReferences = (value, ids = new Set()) => {
    if (!value || typeof value !== "object") return ids;
    for (const [key, item] of Object.entries(value)) {
      if (["sourceIds", "surfaceEvidenceIds"].includes(key)) item.forEach((id) => ids.add(id));
      else if (key === "sourceId") ids.add(item);
      else sourceReferences(item, ids);
    }
    return ids;
  };
  const geometryAssets = (geometry, owner) => {
    if (!geometry) return;
    if (geometry.kind === "asset") connect(geometry.assetId, owner);
    if (geometry.kind === "compound") geometry.components.forEach((component) => geometryAssets(component.geometry, owner));
  };
  for (const key of ["claims", "visibleText", "definitions", "instances", "parts", "frames", "joints", "constraints", "ports", "connections", "materials", "assets", "criteria", "dependencies"]) for (const record of spec[key]) for (const id of sourceReferences(record)) connect(id, record.id);
  for (const definition of spec.definitions) {
    connect(definition.materialId, definition.id);
    geometryAssets(definition.geometry, definition.id);
  }
  for (const instance of spec.instances) { connect(instance.definitionId, instance.id); connect(instance.id, instance.partId); }
  for (const part of spec.parts) {
    connect(part.parentId, part.id);
    connect(part.definitionId, part.id);
    connect(part.materialId, part.id);
    for (const geometry of [part.geometry, part.auditGeometry, part.contactGeometry]) geometryAssets(geometry, part.id);
  }
  for (const frame of spec.frames) { connect(frame.id, frame.partId); connect(frame.partId, frame.id); }
  for (const joint of spec.joints) { connect(joint.id, joint.child); connect(joint.parent, joint.id); connect(joint.childFrame, joint.id); }
  for (const constraint of spec.constraints) for (const id of [...constraint.jointIds, ...(constraint.partIds ?? [])]) { connect(id, constraint.id); connect(constraint.id, id); }
  for (const port of spec.ports) { connect(port.partId, port.id); connect(port.frameId, port.id); connect(port.id, port.partId); }
  for (const connection of spec.connections) for (const id of [connection.fromPortId, connection.toPortId]) { connect(id, connection.id); connect(connection.id, id); }
  for (const criterion of spec.criteria) {
    for (const id of criterion.partIds) connect(id, criterion.id);
    for (const id of criterion.claimIds) { connect(id, criterion.id); connect(criterion.id, id); }
  }
  for (const claim of spec.claims) {
    for (const id of claim.subjectIds) { connect(id, claim.id); connect(claim.id, id); }
    for (const id of claim.checkIds) { connect(id, claim.id); connect(claim.id, id); }
    for (const id of claim.dependsOnClaimIds) connect(id, claim.id);
  }
  for (const dependency of spec.dependencies) for (const id of [...dependency.claimIds, ...dependency.partIds, ...dependency.checkIds]) connect(dependency.id, id);
  const targets = Object.fromEntries([["claimIds", spec.claims], ["partIds", spec.parts], ["checkIds", spec.criteria]].map(([key, records]) => [key, new Set(records.map((record) => record.id))]));
  for (const sourceId of sourceReferences(spec.parameters)) if (!spec.dependencies.some((dependency) => dependency.sourceIds.includes(sourceId) && Object.entries(targets).some(([key, ids]) => dependency[key].some((id) => ids.has(id))))) for (const record of [...spec.parts, ...spec.criteria]) connect(sourceId, record.id);
  const affected = new Set(changedSourceIds);
  const pending = [...changedSourceIds];
  while (pending.length) {
    const id = pending.pop();
    for (const next of edges.get(id) ?? []) if (!affected.has(next)) { affected.add(next); pending.push(next); }
  }
  const select = (ids) => [...new Set(ids)].filter((id) => affected.has(id)).sort();
  return {
    claimIds: select(spec.claims.map((claim) => claim.id)),
    partIds: select(spec.parts.map((part) => part.id)),
    checkIds: select([...spec.criteria.map((criterion) => criterion.id), ...spec.claims.flatMap((claim) => claim.checkIds)])
  };
}
