import { createHash } from "node:crypto";
import { normalizeQuantity, unitInfo } from "./units.mjs";
import { claimSourceDiagnostics, claimCriterionMatches } from "./evidence.mjs";
import { inspectPlainData } from "./data.mjs";
import { validateMachineShape } from "./schema.mjs";

const collections = ["sources", "claims", "visibleText", "definitions", "instances", "parts", "frames", "joints", "constraints", "ports", "connections", "materials", "assets", "criteria", "dependencies"];
const dimensions = { headRadius: "length", beltNeutralRadius: "length", attachmentOffset: "length", bucketPitch: "length", beltLength: "length", centerDistance: "length", bucketCount: "dimensionless", speed: "speed", acceleration: "acceleration", deceleration: "acceleration", bucketCapacity: "mass", feedRate: "mass-flow" };
const pointer = (key) => String(key).replaceAll("~", "~0").replaceAll("/", "~1");
const sameReference = (a, b) => a.sourceId === b.sourceId && a.locator === b.locator && a.revision === b.revision;


export function canonicalHash(value) {
  const diagnostics = [];
  inspectPlainData(value, "", diagnostics);
  if (diagnostics.length) throw new TypeError(`Canonical hashes require JSON-compatible plain data: ${diagnostics[0].code} at ${diagnostics[0].path}`);
  const canonical = (entry, path) => {
    if (Array.isArray(entry)) {
      const ordered = path.length === 1 && collections.includes(path[0]) ? [...entry].sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0) : entry;
      return ordered.map((item, index) => canonical(item, [...path, String(index)]));
    }
    if (entry && typeof entry === "object") return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, canonical(entry[key], [...path, key])]));
    return entry;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value, []))).digest("hex");
}

export function validateMachine(raw) {
  const diagnostics = [];
  const add = (code, path, message, severity = "error", sourceIds = []) => diagnostics.push({ code, severity, path, sourceIds, message });
  inspectPlainData(raw, "", diagnostics);
  if (diagnostics.some((entry) => entry.severity === "error")) return { ok: false, diagnostics };
  if (raw?.schemaVersion !== undefined && raw.schemaVersion !== "0.1.0") add("UNKNOWN_SCHEMA_VERSION", "/schemaVersion", "Schema version is not registered; no implicit migration is performed.");
  if (raw?.model?.domain !== undefined && raw.model.domain !== "belt-bucket") add("UNKNOWN_DOMAIN", "/model/domain", "Domain is not registered.");
  if (raw?.model?.recipe !== undefined && raw.model.recipe !== "belt-bucket/kinematic-mass-v1") add("UNKNOWN_RECIPE", "/model/recipe", "Recipe is not registered for this contract.");
  const findGeometryKinds = (entry, path = "") => {
    if (!entry || typeof entry !== "object") return;
    if (entry.kind && ["geometry", "auditGeometry", "contactGeometry"].some((key) => path.endsWith(`/${key}`)) && !["box", "cylinder", "prism", "compound", "asset"].includes(entry.kind)) add("UNSUPPORTED_GEOMETRY", `${path}/kind`, "Geometry must use a registered data-only primitive.");
    for (const [key, value] of Object.entries(entry)) findGeometryKinds(value, `${path}/${pointer(key)}`);
  };
  findGeometryKinds(raw);
  const shapeDiagnostics = validateMachineShape(raw);
  if (shapeDiagnostics.length) {
    diagnostics.push(...shapeDiagnostics);
    return { ok: false, diagnostics };
  }
  const spec = structuredClone(raw);
  const maps = Object.fromEntries(collections.map((key) => [key, new Map(spec[key].map((entry) => [entry.id, entry]))]));
  const allIds = new Map();
  for (const key of collections) for (let i = 0; i < spec[key].length; i++) {
    const entry = spec[key][i];
    if (allIds.has(entry.id)) add("DUPLICATE_ID", `/${key}/${i}/id`, `ID ${entry.id} is already used at ${allIds.get(entry.id)}.`);
    else allIds.set(entry.id, `/${key}/${i}`);
  }
  const reference = (key, id, path, code) => { if (id !== null && !maps[key].has(id)) add(code, path, `Reference ${id} is not registered in ${key}.`); };
  const references = (key, ids, path, code) => ids.forEach((id, index) => reference(key, id, `${path}/${index}`, code));
  const sourceIds = (ids, path) => references("sources", ids, path, "MISSING_SOURCE");
  const quantity = (value, dimension, path) => {
    const result = normalizeQuantity(value, dimension);
    diagnostics.push(...result.diagnostics.map((entry) => ({ ...entry, path: `${path}${entry.path}`, sourceIds: value.sourceIds })));
    sourceIds(value.sourceIds, `${path}/sourceIds`);
    return result.ok ? result.value : value;
  };
  const lengthUnit = (unit, path) => {
    const info = unitInfo(unit);
    if (!info) add("UNKNOWN_UNIT", path, "Length unit is not registered.");
    else if (info[0] !== "length") add("UNIT_DIMENSION_MISMATCH", path, "Frame and geometry units must represent length.");
    return info?.[0] === "length" ? info[1] : 1;
  };
  const scale = lengthUnit(spec.frame.unit, "/frame/unit");
  if (spec.frame.up !== "Z") add("NONCANONICAL_FRAME", "/frame/up", "Machine coordinates must be Z-up; asset source frames may differ explicitly.");
  spec.originalFrame = structuredClone(spec.frame);
  spec.frame.unit = "m";
  const pose = (value, path) => {
    const norm = Math.hypot(...value.rotation_xyzw);
    const accepted = Number.isFinite(norm) && norm > 0 && Math.abs(norm - 1) <= 1e-9;
    if (!accepted) add("INVALID_QUATERNION", `${path}/rotation_xyzw`, "Source quaternion norm error must be at most 1e-9 before canonical normalization.");
    const rotation_xyzw = accepted ? value.rotation_xyzw.map((component) => component / norm) : [...value.rotation_xyzw];
    return { ...value, position: value.position.map((component) => component * scale), rotation_xyzw, original: { ...structuredClone(value), unit: raw.frame.unit } };
  };
  const geometry = (value, path) => {
    if (!value) return value;
    const result = structuredClone(value);
    result.original = structuredClone(value);
    if (value.kind === "asset") reference("assets", value.assetId, `${path}/assetId`, "MISSING_ASSET");
    else if (value.kind === "compound") {
      const ids = new Set();
      result.components = value.components.map((component, index) => {
        if (ids.has(component.id)) add("DUPLICATE_ID", `${path}/components/${index}/id`, "Compound component IDs must be unique within the geometry.");
        ids.add(component.id);
        return { ...component, pose: pose(component.pose, `${path}/components/${index}/pose`), geometry: geometry(component.geometry, `${path}/components/${index}/geometry`) };
      });
    } else {
      const factor = lengthUnit(value.unit, `${path}/unit`);
      result.unit = "m";
      if (value.kind === "box") result.dimensions = value.dimensions.map((component) => component * factor);
      if (value.kind === "cylinder") { result.radius *= factor; result.length *= factor; }
      if (value.kind === "prism") { result.vertices = value.vertices.map((vertex) => vertex.map((component) => component * factor)); result.height *= factor; }
    }
    return result;
  };
  for (let i = 0; i < spec.definitions.length; i++) {
    const definition = spec.definitions[i];
    const path = `/definitions/${i}`;
    reference("materials", definition.materialId, `${path}/materialId`, "MISSING_MATERIAL");
    sourceIds(definition.sourceIds, `${path}/sourceIds`);
    definition.geometry = geometry(definition.geometry, `${path}/geometry`);
  }
  for (let i = 0; i < spec.instances.length; i++) {
    const instance = spec.instances[i];
    const path = `/instances/${i}`;
    reference("definitions", instance.definitionId, `${path}/definitionId`, "MISSING_DEFINITION");
    reference("parts", instance.partId, `${path}/partId`, "MISSING_PART");
    const part = maps.parts.get(instance.partId);
    if (part && (part.instanceId !== instance.id || part.definitionId !== instance.definitionId)) add("INSTANCE_MISMATCH", path, "Instance and physical part must agree on identity and definition.");
  }
  for (let i = 0; i < spec.parts.length; i++) {
    const part = spec.parts[i];
    const path = `/parts/${i}`;
    reference("parts", part.parentId, `${path}/parentId`, "MISSING_PARENT");
    reference("materials", part.materialId, `${path}/materialId`, "MISSING_MATERIAL");
    reference("definitions", part.definitionId, `${path}/definitionId`, "MISSING_DEFINITION");
    reference("instances", part.instanceId, `${path}/instanceId`, "MISSING_INSTANCE");
    const instance = maps.instances.get(part.instanceId);
    if (instance && (instance.partId !== part.id || instance.definitionId !== part.definitionId)) add("INSTANCE_MISMATCH", `${path}/instanceId`, "Each physical part must have its own reciprocal instance and matching definition.");
    if ((part.definitionId === null) === (part.geometry === null)) add("GEOMETRY_DEFINITION_MISMATCH", path, "A part must use exactly one inline geometry or definition.");
    if ((part.definitionId === null) !== (part.instanceId === null)) add("INSTANCE_MISMATCH", `${path}/instanceId`, "Repeated definitions require an explicit instance ID.");
    if (part.scale.some((component) => component <= 0 || component !== part.scale[0])) add("INVALID_SCALE", `${path}/scale`, "Scale must be positive and uniform; normalize other scales before validation.");
    sourceIds(part.sourceIds, `${path}/sourceIds`);
    part.localRest = pose(part.localRest, `${path}/localRest`);
    for (const key of ["geometry", "auditGeometry", "contactGeometry"]) part[key] = geometry(part[key], `${path}/${key}`);
    if (part.mass) part.mass = quantity(part.mass, "mass", `${path}/mass`);
    if (part.approximationError) part.approximationError = quantity(part.approximationError, "length", `${path}/approximationError`);
    const visited = new Set([part.id]);
    let parent = part.parentId;
    while (parent !== null && maps.parts.has(parent)) {
      if (visited.has(parent)) { add("PARENT_CYCLE", `${path}/parentId`, "The transform parent tree cannot contain a cycle."); break; }
      visited.add(parent);
      parent = maps.parts.get(parent).parentId;
    }
  }
  for (let i = 0; i < spec.frames.length; i++) {
    const frame = spec.frames[i];
    const path = `/frames/${i}`;
    reference("parts", frame.partId, `${path}/partId`, "MISSING_PART");
    sourceIds(frame.sourceIds, `${path}/sourceIds`);
    frame.pose = pose(frame.pose, `${path}/pose`);
  }
  for (let i = 0; i < spec.joints.length; i++) {
    const joint = spec.joints[i];
    const path = `/joints/${i}`;
    reference("parts", joint.parent, `${path}/parent`, "MISSING_PARENT");
    reference("parts", joint.child, `${path}/child`, "MISSING_PART");
    reference("frames", joint.childFrame, `${path}/childFrame`, "MISSING_FRAME");
    if (maps.frames.has(joint.childFrame) && maps.frames.get(joint.childFrame).partId !== joint.child) add("FRAME_PART_MISMATCH", `${path}/childFrame`, "The child joint frame must belong to the child part.");
    sourceIds(joint.sourceIds, `${path}/sourceIds`);
    joint.parentFrame = pose(joint.parentFrame, `${path}/parentFrame`);
    if (joint.kind !== "fixed" && joint.axis === null) add("ZERO_AXIS", `${path}/axis`, "Moving joints require a nonzero axis.");
    if (joint.axis) {
      const largest = Math.max(...joint.axis.map((value) => Math.abs(value)));
      if (largest === 0) add("ZERO_AXIS", `${path}/axis`, "Joint axis must be nonzero.");
      else {
        joint.originalAxis = [...joint.axis];
        const scaled = joint.axis.map((value) => value / largest);
        const norm = Math.hypot(...scaled);
        joint.axis = scaled.map((value) => value / norm);
        if (!joint.axis.every(Number.isFinite) || Math.abs(Math.hypot(...joint.axis) - 1) > 1e-12) add("INVALID_AXIS", `${path}/axis`, "Canonical joint axis must remain finite, nonzero and normalized.");
      }
    }
    if (joint.limits && joint.limits.min > joint.limits.max) add("INVALID_JOINT_LIMITS", `${path}/limits`, "Joint minimum cannot exceed maximum.");
    if (joint.kind === "prismatic" && joint.limits) joint.limits = { min: joint.limits.min * scale, max: joint.limits.max * scale };
  }
  for (let i = 0; i < spec.constraints.length; i++) {
    const constraint = spec.constraints[i];
    const path = `/constraints/${i}`;
    references("joints", constraint.jointIds, `${path}/jointIds`, "MISSING_JOINT");
    if (constraint.partIds) references("parts", constraint.partIds, `${path}/partIds`, "MISSING_PART");
    sourceIds(constraint.sourceIds, `${path}/sourceIds`);
    if (constraint.kind === "closure") constraint.tolerance *= scale;
  }
  for (let i = 0; i < spec.ports.length; i++) {
    const port = spec.ports[i];
    const path = `/ports/${i}`;
    reference("parts", port.partId, `${path}/partId`, "MISSING_PART");
    reference("frames", port.frameId, `${path}/frameId`, "MISSING_FRAME");
    if (maps.frames.has(port.frameId) && maps.frames.get(port.frameId).partId !== port.partId) add("FRAME_PART_MISMATCH", `${path}/frameId`, "Port frame must belong to the port's part.");
    sourceIds(port.sourceIds, `${path}/sourceIds`);
  }
  for (let i = 0; i < spec.connections.length; i++) {
    const connection = spec.connections[i];
    const path = `/connections/${i}`;
    reference("ports", connection.fromPortId, `${path}/fromPortId`, "MISSING_PORT");
    reference("ports", connection.toPortId, `${path}/toPortId`, "MISSING_PORT");
    sourceIds(connection.sourceIds, `${path}/sourceIds`);
  }
  for (let i = 0; i < spec.materials.length; i++) {
    const material = spec.materials[i];
    sourceIds(material.surfaceEvidenceIds, `/materials/${i}/surfaceEvidenceIds`);
    if (material.physicalProperties) {
      sourceIds(material.physicalProperties.sourceIds, `/materials/${i}/physicalProperties/sourceIds`);
      if (material.physicalProperties.density) material.physicalProperties.density = quantity(material.physicalProperties.density, "density", `/materials/${i}/physicalProperties/density`);
    }
  }
  for (let i = 0; i < spec.assets.length; i++) {
    const asset = spec.assets[i];
    const path = `/assets/${i}`;
    sourceIds(asset.sourceIds, `${path}/sourceIds`);
    lengthUnit(asset.sourceFrame.unit, `${path}/sourceFrame/unit`);
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(asset.uri) || asset.uri.split(/[\\/]/).includes("..")) add("UNSAFE_ASSET_URI", `${path}/uri`, "Asset references must be bounded relative paths; this validator fetches nothing.");
    asset.usableForRedistribution = !!asset.license && !!asset.author && asset.redistribution === true;
    if (!asset.usableForRedistribution) add("ASSET_RIGHTS_UNRESOLVED", `${path}/license`, "Asset cannot be redistributed until license, author and permission are explicit.", "warning", asset.sourceIds);
  }
  for (const [key, dimension] of Object.entries(dimensions)) spec.parameters.beltBucket[key] = quantity(spec.parameters.beltBucket[key], dimension, `/parameters/beltBucket/${key}`);
  for (const [key, value] of Object.entries(spec.initialState.inventory_kg)) if (value < 0) add("NEGATIVE_MASS", `/initialState/inventory_kg/${pointer(key)}`, "Inventory mass cannot be negative.");
  for (let i = 0; i < spec.claims.length; i++) {
    const claim = spec.claims[i];
    const path = `/claims/${i}`;
    for (let j = 0; j < claim.subjectIds.length; j++) if (!allIds.has(claim.subjectIds[j])) add("MISSING_SUBJECT", `${path}/subjectIds/${j}`, "Claim subject must be a registered physical or semantic ID.");
    references("criteria", claim.checkIds, `${path}/checkIds`, "MISSING_CHECK");
    claim.checkIds.forEach((id, index) => {
      const criterion = maps.criteria.get(id);
      if (criterion && !claimCriterionMatches(claim, criterion)) add("CRITERION_SCOPE_MISMATCH", `${path}/checkIds/${index}`, "Claim and declared criterion must agree on aspect, reciprocal linkage and source scope.");
    });
    if (claim.unit !== null) {
      const info = unitInfo(claim.unit);
      if (!info) add("UNKNOWN_UNIT", `${path}/unit`, "Claim acceptance unit is not registered.");
      else {
        claim.originalAcceptance = Object.fromEntries(["unit", "uncertainty", "manufacturingTolerance", "proposedTolerance", "numericAcceptance"].map((key) => [key, claim[key]]));
        claim.unit = info[2];
        for (const key of ["uncertainty", "manufacturingTolerance", "proposedTolerance", "numericAcceptance"]) if (claim[key] !== null) claim[key] *= Math.abs(info[1]);
      }
    }
    references("claims", claim.dependsOnClaimIds, `${path}/dependsOnClaimIds`, "MISSING_CLAIM");
    claim.sourceRefs.forEach((ref, index) => reference("sources", ref.sourceId, `${path}/sourceRefs/${index}/sourceId`, "MISSING_SOURCE"));
    diagnostics.push(...claimSourceDiagnostics(spec, claim, path));
  }
  for (let i = 0; i < spec.visibleText.length; i++) {
    const text = spec.visibleText[i];
    const path = `/visibleText/${i}`;
    references("claims", text.claimIds, `${path}/claimIds`, "MISSING_CLAIM");
    text.sourceRefs.forEach((ref, index) => reference("sources", ref.sourceId, `${path}/sourceRefs/${index}/sourceId`, "MISSING_SOURCE"));
    const refs = text.claimIds.flatMap((id) => maps.claims.get(id)?.sourceRefs ?? []);
    if (refs.some((ref) => !text.sourceRefs.some((value) => sameReference(value, ref))) || text.sourceRefs.some((ref) => !refs.some((value) => sameReference(value, ref)))) add("VISIBLE_SOURCE_MISMATCH", `${path}/sourceRefs`, "Visible text must match the exact referenced claim source locators.");
  }
  for (let i = 0; i < spec.criteria.length; i++) {
    const criterion = spec.criteria[i];
    const path = `/criteria/${i}`;
    references("parts", criterion.partIds, `${path}/partIds`, "MISSING_PART");
    references("claims", criterion.claimIds, `${path}/claimIds`, "MISSING_CLAIM");
    criterion.claimIds.forEach((id, index) => {
      const claim = maps.claims.get(id);
      if (claim && !claimCriterionMatches(claim, criterion)) add("CRITERION_SCOPE_MISMATCH", `${path}/claimIds/${index}`, "Declared criterion must be reciprocally required by each linked claim in the same aspect and source scope.");
    });
    sourceIds(criterion.sourceIds, `${path}/sourceIds`);
    const info = unitInfo(criterion.unit);
    if (!info) add("UNKNOWN_UNIT", `${path}/unit`, "Criterion unit is not registered.");
    else {
      criterion.original = { expected: criterion.expected, unit: criterion.unit, tolerance: structuredClone(criterion.tolerance) };
      criterion.unit = info[2];
      if (criterion.expected !== null) criterion.expected *= info[1];
      for (const key of ["manufacturing", "project", "numeric"]) if (criterion.tolerance[key] !== null) criterion.tolerance[key] *= Math.abs(info[1]);
    }
  }
  for (let i = 0; i < spec.dependencies.length; i++) {
    const dependency = spec.dependencies[i];
    const path = `/dependencies/${i}`;
    sourceIds(dependency.sourceIds, `${path}/sourceIds`);
    references("claims", dependency.claimIds, `${path}/claimIds`, "MISSING_CLAIM");
    references("parts", dependency.partIds, `${path}/partIds`, "MISSING_PART");
    references("criteria", dependency.checkIds, `${path}/checkIds`, "MISSING_CHECK");
  }
  for (let i = 0; i < spec.commands.length; i++) {
    const command = spec.commands[i];
    const path = `/commands/${i}`;
    if (["set-speed", "set-feed"].includes(command.type)) {
      if (command.value === undefined) add("MISSING_FIELD", `${path}/value`, "Set commands require a value.");
      if (command.unit === undefined) add("MISSING_FIELD", `${path}/unit`, "Set commands require a unit.");
      if (command.value !== undefined && command.unit !== undefined) {
        const value = normalizeQuantity({ value: command.value, unit: command.unit, sourceIds: [], uncertainty: null, manufacturingTolerance: null, proposedTolerance: null, numericAcceptance: null }, command.type === "set-speed" ? "speed" : "mass-flow");
        diagnostics.push(...value.diagnostics.map((entry) => ({ ...entry, path: `${path}${entry.path}` })));
        if (value.ok) { command.original = { value: command.value, unit: command.unit }; command.value = value.value.value; command.unit = value.value.unit; }
      }
    } else if (command.value !== undefined || command.unit !== undefined) add("UNEXPECTED_COMMAND_VALUE", path, "Start and stop commands do not take quantity values.");
  }
  inspectPlainData(spec, "", diagnostics);
  if (diagnostics.some((entry) => entry.severity === "error")) return { ok: false, diagnostics };
  spec.canonicalHash = canonicalHash(spec);
  return { ok: true, value: spec, diagnostics };
}
