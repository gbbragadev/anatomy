import { inspectPlainData } from "../contracts/data.mjs";
import { validateMachineShape } from "../contracts/schema.mjs";
import { cleanPose, composePose, inversePose, jointMotion, poseResidual, validPose, finiteVector } from "./frames.mjs";
import { compileGeometry, evaluateGeometry, geometryIdentity, prismTopology } from "./geometry.mjs";
import { resolveCoordinates } from "./constraints.mjs";
import { resolvePoses } from "./resolve.mjs";
import { diagnostic, hasErrors, compareIds, freezeData } from "./diagnostics.mjs";

const normalizedFields = new Set(["original", "originalFrame", "canonicalHash", "originalAxis", "originalAcceptance", "usableForRedistribution", "dimension"]);
const schemaShape = (value) => Array.isArray(value) ? value.map(schemaShape) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => !normalizedFields.has(key)).map(([key, entry]) => [key, schemaShape(entry)])) : value;
const capability = (name, partIds, coverage, verdict, code = null) => ({ capability: name, partIds, coverage, verdict, code });

export function compileAssembly(spec, assets = {}) {
  const diagnostics = [];
  inspectPlainData(spec, "", diagnostics);
  inspectPlainData(assets, "/assets", diagnostics);
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };
  if (!spec || spec.schemaVersion !== "0.1.0" || spec.frame?.handedness !== "right" || spec.frame?.up !== "Z" || spec.frame?.unit !== "m" || !spec.originalFrame || typeof spec.canonicalHash !== "string") diagnostics.push(diagnostic("NONCANONICAL_MACHINE", "", "Compile only the complete canonical SI MachineSpec returned by validateMachine; original metadata is provenance."));
  if (!assets || typeof assets !== "object" || Array.isArray(assets)) diagnostics.push(diagnostic("INVALID_ASSET_MAP", "/assets", "Assets must be a data-only ID map; ingestion is a deferred capability."));
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };
  diagnostics.push(...validateMachineShape(schemaShape(spec)));
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };
  const maps = Object.fromEntries(["parts", "definitions", "instances", "frames", "joints", "constraints", "ports", "connections"].map((key) => [key, new Map(spec[key].map((entry) => [entry.id, entry]))]));
  const sourcePaths = Object.fromEntries(Object.keys(maps).map((key) => [key, Object.fromEntries(spec[key].map((entry, index) => [entry.id, `/${key}/${index}`]))]));
  const allIds = new Set();
  for (const key of Object.keys(maps)) for (const entry of spec[key]) {
    if (allIds.has(entry.id)) diagnostics.push(diagnostic("DUPLICATE_ID", sourcePaths[key][entry.id], "Assembly identities must be globally unique.", entry));
    allIds.add(entry.id);
  }
  const fail = (code, path, message, entry = {}) => diagnostics.push(diagnostic(code, path, message, entry));
  const reference = (collection, id, path, code = "MISSING_REFERENCE") => { if (!maps[collection].has(id)) fail(code, path, `Reference ${id} is not registered in ${collection}.`); };
  for (const part of spec.parts) {
    const path = sourcePaths.parts[part.id];
    if (part.parentId !== null) reference("parts", part.parentId, `${path}/parentId`, "MISSING_PARENT");
    if (!validPose(part.localRest)) fail("INVALID_POSE", `${path}/localRest`, "Rest transforms require finite canonical poses.", part);
    if (!finiteVector(part.scale, 3) || part.scale.some((value) => value <= 0 || value !== part.scale[0])) fail("INVALID_SCALE", `${path}/scale`, "Scale must be finite, positive and uniform.", part);
    if ((part.geometry === null) === (part.definitionId === null)) fail("GEOMETRY_DEFINITION_MISMATCH", path, "Each physical part requires exactly one inline geometry or definition.", part);
    if (part.definitionId !== null) reference("definitions", part.definitionId, `${path}/definitionId`, "MISSING_DEFINITION");
    if (part.instanceId !== null) reference("instances", part.instanceId, `${path}/instanceId`, "MISSING_INSTANCE");
    const instance = maps.instances.get(part.instanceId);
    if ((part.definitionId === null) !== (part.instanceId === null) || instance && (instance.partId !== part.id || instance.definitionId !== part.definitionId)) fail("INSTANCE_MISMATCH", `${path}/instanceId`, "Definition-bearing parts require their own reciprocal instance.", part);
    if (part.scale[0] !== 1 && (spec.frames.some((entry) => entry.partId === part.id) || spec.joints.some((entry) => entry.parent === part.id || entry.child === part.id))) fail("UNSUPPORTED_FRAME_SCALE", `${path}/scale`, "Non-unit scale on a frame/joint-bearing part is unsupported because frame scale semantics are not encoded.", { ...part, partId: part.id });
    if (part.approximationError && (part.approximationError.unit !== "m" || part.approximationError.dimension !== "length" || part.approximationError.value !== null && part.approximationError.value < 0)) fail("INVALID_APPROXIMATION_ERROR", `${path}/approximationError`, "Approximation errors must be canonical metre quantities or explicit unknowns.", part);
  }
  for (const instance of spec.instances) {
    const part = maps.parts.get(instance.partId);
    if (!part || part.instanceId !== instance.id || part.definitionId !== instance.definitionId) fail("INSTANCE_MISMATCH", sourcePaths.instances[instance.id], "Instances must point back to their exact physical part.", instance);
  }
  for (const frame of spec.frames) {
    reference("parts", frame.partId, `${sourcePaths.frames[frame.id]}/partId`, "MISSING_PART");
    if (!validPose(frame.pose)) fail("INVALID_POSE", `${sourcePaths.frames[frame.id]}/pose`, "Named frames must be finite canonical poses.", frame);
  }
  const childJoints = new Map();
  for (const joint of spec.joints) {
    const path = sourcePaths.joints[joint.id];
    reference("parts", joint.parent, `${path}/parent`, "MISSING_PARENT");
    reference("parts", joint.child, `${path}/child`, "MISSING_PART");
    reference("frames", joint.childFrame, `${path}/childFrame`, "MISSING_FRAME");
    if (maps.parts.has(joint.child) && maps.parts.get(joint.child).parentId !== joint.parent) fail("JOINT_PARENT_MISMATCH", path, "A tree joint parent must match its child's transform parent; closure edges belong to constraints.", joint);
    if (maps.frames.has(joint.childFrame) && maps.frames.get(joint.childFrame).partId !== joint.child) fail("FRAME_PART_MISMATCH", `${path}/childFrame`, "Child joint frame must belong to the named child.", joint);
    if (!validPose(joint.parentFrame)) fail("INVALID_POSE", `${path}/parentFrame`, "Parent joint frame must be a finite canonical pose.", joint);
    if (joint.kind !== "fixed" && (!finiteVector(joint.axis, 3) || Math.hypot(...joint.axis) === 0)) fail("ZERO_AXIS", `${path}/axis`, "Moving joints require a finite nonzero axis.", joint);
    else if (joint.kind !== "fixed" && Math.abs(Math.hypot(...joint.axis) - 1) > 1e-12) fail("NONCANONICAL_AXIS", `${path}/axis`, "Assembly expects an already normalized joint-frame axis.", joint);
    if (joint.limits && joint.limits.min > joint.limits.max) fail("INVALID_JOINT_LIMITS", `${path}/limits`, "Joint limits are inclusive and ordered.", joint);
    if (childJoints.has(joint.child)) fail("MULTIPLE_CHILD_JOINTS", path, "A transform child may have only one tree joint; extra mechanical relations require explicit constraints.", joint);
    childJoints.set(joint.child, joint.id);
  }
  for (const constraint of spec.constraints) {
    const path = sourcePaths.constraints[constraint.id];
    for (const id of constraint.jointIds) reference("joints", id, `${path}/jointIds`, "MISSING_JOINT");
    if (constraint.kind === "closure") for (const id of constraint.partIds) reference("parts", id, `${path}/partIds`, "MISSING_PART");
    else {
      const a = maps.joints.get(constraint.jointIds[0]);
      const b = maps.joints.get(constraint.jointIds[1]);
      if (a && b && (a.kind !== b.kind || a.kind === "fixed")) fail("UNSUPPORTED_RATIO_UNITS", path, "Registered analytic ratios require two same-kind moving joints and canonical offset units.", constraint);
      if (a?.kind === "prismatic" && b?.kind === "prismatic" && constraint.offset !== 0 && spec.originalFrame.unit !== "m") fail("UNSUPPORTED_RATIO_OFFSET_UNIT", `${path}/offset`, "Nonzero prismatic ratio offsets from a non-metre source frame lack an authoritative normalized unit field; no conversion is guessed.", constraint);
    }
  }
  for (const port of spec.ports) {
    const path = sourcePaths.ports[port.id];
    reference("parts", port.partId, `${path}/partId`, "MISSING_PART");
    reference("frames", port.frameId, `${path}/frameId`, "MISSING_FRAME");
    if (maps.frames.has(port.frameId) && maps.frames.get(port.frameId).partId !== port.partId) fail("FRAME_PART_MISMATCH", `${path}/frameId`, "Port frames must belong to their physical part.", port);
  }
  for (const connection of spec.connections) {
    const path = sourcePaths.connections[connection.id];
    reference("ports", connection.fromPortId, `${path}/fromPortId`, "MISSING_PORT");
    reference("ports", connection.toPortId, `${path}/toPortId`, "MISSING_PORT");
    const a = maps.ports.get(connection.fromPortId);
    const b = maps.ports.get(connection.toPortId);
    if (connection.intendedContact && a && b && a.partId === b.partId) fail("INVALID_INTENDED_CONTACT", path, "Intended contact must name two distinct physical parts.", connection);
  }
  const ordered = [];
  const visited = new Set();
  let remaining = [...spec.parts].sort(compareIds);
  while (remaining.length) {
    const ready = remaining.filter((part) => part.parentId === null || visited.has(part.parentId));
    if (!ready.length) { fail("PARENT_CYCLE", "/parts", "Transform parents must be acyclic and resolvable independently of the constraint graph."); break; }
    for (const part of ready) { ordered.push(part); visited.add(part.id); }
    remaining = remaining.filter((part) => !visited.has(part.id));
  }
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };
  const compiled = {
    schemaVersion: spec.schemaVersion,
    machineId: spec.machineId,
    canonicalHash: spec.canonicalHash,
    frame: { handedness: "right", up: "Z", unit: "m" },
    metersPerLegacyUnit: spec.metersPerLegacyUnit,
    parts: structuredClone(ordered),
    materials: structuredClone([...spec.materials].sort(compareIds)),
    assets: structuredClone([...spec.assets].sort(compareIds)),
    frames: structuredClone([...spec.frames].sort(compareIds)),
    joints: structuredClone([...spec.joints].sort(compareIds)),
    constraints: structuredClone([...spec.constraints].sort(compareIds)),
    ports: structuredClone([...spec.ports].sort(compareIds)),
    connections: structuredClone([...spec.connections].sort(compareIds)),
    sourcePaths,
    transformParents: ordered.map((part) => ({ partId: part.id, parentId: part.parentId, jointId: childJoints.get(part.id) ?? null })),
    restGeometry: { fragments: [], auditFragments: [], contactFragments: [] },
    restPosesByPartId: {},
    partToFragmentIds: {},
    fragmentToPartId: {},
    bounds: null,
    boundsByPartId: {},
    approximationErrorsByPartId: {},
    interfaces: [],
    intendedContacts: [],
    requiredCapabilities: [],
    constraintResiduals: [],
    geometryIdentity: ""
  };
  const analytic = { ...compiled, constraints: compiled.constraints.filter((entry) => entry.kind === "ratio") };
  const coordinates = resolveCoordinates(analytic, {});
  diagnostics.push(...coordinates.diagnostics);
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };
  compiled.constraintResiduals = coordinates.residuals;
  for (const joint of compiled.joints) {
    const child = maps.parts.get(joint.child);
    const relative = composePose(composePose(joint.parentFrame, jointMotion(joint, coordinates.value[joint.id])), inversePose(maps.frames.get(joint.childFrame).pose));
    const residual = poseResidual(relative, child.localRest);
    if (!validPose(relative) || !Number.isFinite(residual.position_m) || !Number.isFinite(residual.angle_rad) || residual.position_m > 1e-12 || residual.angle_rad > 1e-12) fail("JOINT_REST_MISMATCH", sourcePaths.joints[joint.id], `Declared localRest differs from the canonical default joint equation by ${residual.position_m} m and ${residual.angle_rad} rad.`, { ...joint, partId: child.id });
  }
  for (const part of compiled.parts) {
    const definition = part.definitionId === null ? null : maps.definitions.get(part.definitionId);
    const geometryPart = definition ? { ...part, sourceIds: [...new Set([...part.sourceIds, ...definition.sourceIds])].sort() } : part;
    const render = compileGeometry(part.geometry ?? definition.geometry, geometryPart, "render", diagnostics, definition ? `${sourcePaths.definitions[part.definitionId]}/geometry` : `${sourcePaths.parts[part.id]}/geometry`);
    const audit = part.auditGeometry === null ? [] : compileGeometry(part.auditGeometry, part, "audit", diagnostics, `${sourcePaths.parts[part.id]}/auditGeometry`);
    const contact = part.contactGeometry === null ? [] : compileGeometry(part.contactGeometry, part, "contact", diagnostics, `${sourcePaths.parts[part.id]}/contactGeometry`);
    compiled.restGeometry.fragments.push(...render);
    compiled.restGeometry.auditFragments.push(...audit);
    compiled.restGeometry.contactFragments.push(...contact);
    compiled.partToFragmentIds[part.id] = render.map((entry) => entry.id);
    for (const fragment of render) compiled.fragmentToPartId[fragment.id] = part.id;
    const error = part.approximationError?.value ?? null;
    const scaledError = error === null ? null : error * part.scale[0];
    if (error !== null && error > 0 && scaledError === 0) fail("APPROXIMATION_ERROR_UNDERFLOW", `${sourcePaths.parts[part.id]}/approximationError`, "A declared positive proxy bound cannot become zero through uniform-scale underflow.", { ...part, partId: part.id });
    if (scaledError !== null && !Number.isFinite(scaledError)) fail("NONFINITE_GEOMETRY", `${sourcePaths.parts[part.id]}/approximationError`, "Approximation error overflowed uniform scale.", part);
    compiled.approximationErrorsByPartId[part.id] = { render_m: 0, audit_m: audit.length ? scaledError : null, contact_m: contact.length ? scaledError : null };
    compiled.requiredCapabilities.push(capability("canonical-geometry", [part.id], "executed", render.length ? "passed" : "failed"));
    if ([...render, ...audit, ...contact].some((entry) => entry.geometry.kind === "prism" && !prismTopology(entry.geometry.vertices).convex)) compiled.requiredCapabilities.push(capability("concave-prism", [part.id], "executed", "passed"));
    compiled.requiredCapabilities.push(capability("audit-geometry", [part.id], audit.length ? "executed" : "skipped", audit.length ? "passed" : "not-evaluated", audit.length ? null : "AUDIT_GEOMETRY_UNAVAILABLE"));
    compiled.requiredCapabilities.push(capability("contact-geometry", [part.id], contact.length ? "executed" : "skipped", contact.length ? "passed" : "not-evaluated", contact.length ? null : "CONTACT_GEOMETRY_UNAVAILABLE"));
  }
  for (const list of Object.values(compiled.restGeometry)) list.sort(compareIds);
  for (const constraint of compiled.constraints) if (constraint.kind === "closure") {
    compiled.requiredCapabilities.push(capability("constraint-solver", [...new Set(constraint.partIds)].sort(), "skipped", "not-evaluated", "UNSUPPORTED_CONSTRAINT_SOLVER"));
    diagnostics.push(diagnostic("UNSUPPORTED_CONSTRAINT_SOLVER", sourcePaths.constraints[constraint.id], "Constraint graph is retained; generic closure solving remains unavailable.", constraint, "warning"));
  } else compiled.requiredCapabilities.push(capability("analytic-ratio", constraint.jointIds.map((id) => maps.joints.get(id).child), "executed", "passed"));
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };
  const resolved = resolvePoses(analytic, {});
  diagnostics.push(...resolved.diagnostics);
  if (!resolved.ok) return { ok: false, diagnostics };
  compiled.restPosesByPartId = resolved.value;
  compiled.intendedContacts = compiled.connections.filter((entry) => entry.intendedContact).map((entry) => ({ connectionId: entry.id, partIds: [maps.ports.get(entry.fromPortId).partId, maps.ports.get(entry.toPortId).partId].sort(), sourceIds: [...entry.sourceIds] }));
  const evaluated = evaluateGeometry(compiled, compiled.restPosesByPartId);
  diagnostics.push(...evaluated.diagnostics);
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };
  compiled.bounds = evaluated.bounds;
  compiled.boundsByPartId = evaluated.boundsByPartId;
  compiled.interfaces = evaluated.interfaces;
  compiled.geometryIdentity = geometryIdentity(compiled.restGeometry.fragments);
  return { ok: true, value: freezeData(compiled), diagnostics };
}
