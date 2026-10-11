import { canonicalHash } from "../contracts/validate.mjs";
import { inspectPlainData } from "../contracts/data.mjs";
import { cleanPose, identityPose, composePose, rotateVector, validPose, finiteVector } from "./frames.mjs";
import { diagnostic, hasErrors, pointer, compareIds, freezeData } from "./diagnostics.mjs";
import { evaluateInterfaces } from "./interfaces.mjs";
import { orientationSign } from "./predicates.mjs";

const onSegment = (a, b, c) => c[0] >= Math.min(a[0], b[0]) && c[0] <= Math.max(a[0], b[0]) && c[1] >= Math.min(a[1], b[1]) && c[1] <= Math.max(a[1], b[1]);
const intersects = (a, b, c, d) => {
  const ac = orientationSign(a, b, c);
  const ad = orientationSign(a, b, d);
  const ca = orientationSign(c, d, a);
  const cb = orientationSign(c, d, b);
  return ac * ad < 0 && ca * cb < 0 || ac === 0 && onSegment(a, b, c) || ad === 0 && onSegment(a, b, d) || ca === 0 && onSegment(c, d, a) || cb === 0 && onSegment(c, d, b);
};
export function prismTopology(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 3) return { valid: false, code: "INVALID_PRISM_TOPOLOGY" };
  if (vertices.length > 1024) return { valid: false, code: "UNSUPPORTED_PRISM_COMPLEXITY" };
  if (!vertices.every((entry) => finiteVector(entry, 2))) return { valid: false, code: "INVALID_PRISM_TOPOLOGY" };
  if (new Set(vertices.map((entry) => JSON.stringify(entry))).size !== vertices.length) return { valid: false, code: "INVALID_PRISM_TOPOLOGY" };
  let scale = 0;
  for (const vertex of vertices) for (const value of vertex) scale = Math.max(scale, Math.abs(value));
  if (scale === 0) return { valid: false, code: "INVALID_PRISM_TOPOLOGY" };
  const points = vertices.map((entry) => entry.map((value) => value / scale));
  if (points.some((entry, i) => entry.some((value, j) => value === 0 && vertices[i][j] !== 0)) || new Set(points.map((entry) => JSON.stringify(entry))).size !== vertices.length) return { valid: false, code: "UNSUPPORTED_PRISM_PRECISION" };
  const turns = vertices.map((entry, index) => orientationSign(entry, vertices[(index + 1) % vertices.length], vertices[(index + 2) % vertices.length])).filter((value) => value !== 0);
  if (!turns.length) return { valid: false, code: "INVALID_PRISM_TOPOLOGY" };
  for (let i = 0; i < vertices.length; i++) for (let j = i + 1; j < vertices.length; j++) {
    if (j === i + 1 || i === 0 && j === vertices.length - 1) continue;
    if (intersects(vertices[i], vertices[(i + 1) % vertices.length], vertices[j], vertices[(j + 1) % vertices.length])) return { valid: false, code: "INVALID_PRISM_TOPOLOGY" };
  }
  return { valid: true, convex: turns.every((value) => value === turns[0]) };
}
export const geometryIdentity = (fragments) => canonicalHash([...fragments].sort(compareIds).map((entry) => ({ id: entry.id, partId: entry.partId, localPose: entry.localPose, geometry: entry.geometry })));

export function compileGeometry(geometry, part, role, diagnostics, sourcePath) {
  const fragments = [];
  const scale = part.scale[0];
  const fail = (code, path, message) => diagnostics.push(diagnostic(code, path, message, { ...part, partId: part.id }));
  const flatten = (entry, localPose, componentIds, path) => {
    if (!entry || typeof entry !== "object") { fail("UNSUPPORTED_GEOMETRY", path, "A supported canonical geometry record is required."); return; }
    if (entry.kind === "asset") { fail("UNSUPPORTED_ASSET_GEOMETRY", path, `Asset ${entry.assetId} has no registered canonical geometry ingestion contract; no bytes are fetched or substitute solid created.`); return; }
    if (entry.kind === "compound") {
      if (!Array.isArray(entry.components) || !entry.components.length) { fail("UNSUPPORTED_GEOMETRY", path, "Compounds require named geometry components."); return; }
      const ids = new Set();
      for (let i = 0; i < entry.components.length; i++) {
        const component = entry.components[i];
        const componentPath = `${path}/components/${i}`;
        if (!component || typeof component.id !== "string" || ids.has(component.id)) { fail("DUPLICATE_FRAGMENT_COMPONENT", `${componentPath}/id`, "Compound components require unique stable IDs within their parent."); continue; }
        ids.add(component.id);
        if (!validPose(component.pose)) { fail("INVALID_POSE", `${componentPath}/pose`, "Compound poses must be canonical finite unit-quaternion poses."); continue; }
        const scaledPose = { position: component.pose.position.map((value) => value * scale), rotation_xyzw: [...component.pose.rotation_xyzw] };
        const nextPose = composePose(localPose, scaledPose);
        if (!validPose(nextPose)) { fail("NONFINITE_GEOMETRY", `${componentPath}/pose`, "Scaled compound placement is not finite."); continue; }
        flatten(component.geometry, nextPose, [...componentIds, component.id], `${componentPath}/geometry`);
      }
      return;
    }
    if (entry.unit !== "m") { fail("NONCANONICAL_GEOMETRY", `${path}/unit`, "Assembly consumes normalized metre geometry; provenance originals are never normalized again."); return; }
    let canonical;
    if (entry.kind === "box") {
      if (!finiteVector(entry.dimensions, 3) || entry.dimensions.some((value) => value <= 0)) { fail("INVALID_GEOMETRY_DIMENSIONS", path, "Boxes require positive finite full dimensions."); return; }
      canonical = { kind: "box", dimensions: entry.dimensions.map((value) => value * scale), unit: "m" };
    } else if (entry.kind === "cylinder") {
      if (![entry.radius, entry.length].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0)) { fail("INVALID_GEOMETRY_DIMENSIONS", path, "Cylinders require positive finite radius and full length."); return; }
      canonical = { kind: "cylinder", radius: entry.radius * scale, length: entry.length * scale, unit: "m" };
    } else if (entry.kind === "prism") {
      const topology = prismTopology(entry.vertices);
      if (!topology.valid) { fail(topology.code, `${path}/vertices`, "Prisms require numerically supported ordered simple nondegenerate polygons without repeated vertices or intersections."); return; }
      if (typeof entry.height !== "number" || !Number.isFinite(entry.height) || entry.height <= 0) { fail("INVALID_GEOMETRY_DIMENSIONS", `${path}/height`, "Prisms require positive finite full extrusion height."); return; }
      canonical = { kind: "prism", vertices: entry.vertices.map((vertex) => vertex.map((value) => value * scale)), height: entry.height * scale, unit: "m" };
    } else { fail("UNSUPPORTED_GEOMETRY", `${path}/kind`, `Geometry kind ${entry.kind} is not supported; no replacement solid is created.`); return; }
    const finite = canonical.kind === "box" ? finiteVector(canonical.dimensions, 3) : canonical.kind === "cylinder" ? Number.isFinite(canonical.radius) && Number.isFinite(canonical.length) : canonical.vertices.every((value) => finiteVector(value, 2)) && Number.isFinite(canonical.height);
    if (!finite) { fail("NONFINITE_GEOMETRY", path, "Uniform scale overflowed the canonical geometry."); return; }
    const positive = canonical.kind === "box" ? canonical.dimensions.every((value) => value > 0) : canonical.kind === "cylinder" ? canonical.radius > 0 && canonical.length > 0 : canonical.height > 0;
    if (!positive) { fail("NONPOSITIVE_GEOMETRY", path, "Uniform scale underflowed a required positive dimension."); return; }
    const halfDimensions = canonical.kind === "box" ? canonical.dimensions.map((value) => value / 2) : [canonical.kind === "cylinder" ? canonical.length / 2 : canonical.height / 2];
    if (halfDimensions.some((value) => value === 0)) { fail("UNSUPPORTED_GEOMETRY_PRECISION", path, "A positive full dimension cannot retain a nonzero centred half extent."); return; }
    if (canonical.kind === "prism" && !prismTopology(canonical.vertices).valid) { fail("UNSUPPORTED_PRISM_PRECISION", path, "Scaled prism topology cannot be retained at numeric precision."); return; }
    const id = JSON.stringify([part.id, ...(role === "render" ? [] : [`@${role}`]), ...componentIds]);
    fragments.push({ id, partId: part.id, definitionId: part.definitionId, instanceId: part.instanceId, componentIds, role, materialId: part.materialId, sourceIds: [...part.sourceIds], localPose: cleanPose(localPose), geometry: canonical });
  };
  flatten(geometry, identityPose(), [], sourcePath);
  return fragments.sort(compareIds);
}

export function fragmentBounds(geometry, pose) {
  if (geometry.kind === "cylinder") {
    const x = rotateVector(pose.rotation_xyzw, [1, 0, 0]);
    const y = rotateVector(pose.rotation_xyzw, [0, 1, 0]);
    const z = rotateVector(pose.rotation_xyzw, [0, 0, 1]);
    const extent = z.map((value, index) => Math.abs(value) * (geometry.length / 2) + geometry.radius * Math.hypot(x[index], y[index]));
    return { min: extent.map((value, index) => pose.position[index] - value), max: extent.map((value, index) => pose.position[index] + value) };
  }
  const points = geometry.kind === "box" ? [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x * geometry.dimensions[0] / 2, y * geometry.dimensions[1] / 2, z * geometry.dimensions[2] / 2]))) : geometry.vertices.flatMap(([x, y]) => [[x, y, -geometry.height / 2], [x, y, geometry.height / 2]]);
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const point of points) {
    const rotated = rotateVector(pose.rotation_xyzw, point);
    for (let index = 0; index < 3; index++) {
      const value = rotated[index] + pose.position[index];
      bounds.min[index] = Math.min(bounds.min[index], value);
      bounds.max[index] = Math.max(bounds.max[index], value);
    }
  }
  return bounds;
}
export const finiteBounds = (bounds) => bounds && finiteVector(bounds.min, 3) && finiteVector(bounds.max, 3);
export const unionBounds = (bounds) => {
  if (!bounds.length) return null;
  const result = { min: [...bounds[0].min], max: [...bounds[0].max] };
  for (const entry of bounds) for (let index = 0; index < 3; index++) {
    result.min[index] = Math.min(result.min[index], entry.min[index]);
    result.max[index] = Math.max(result.max[index], entry.max[index]);
  }
  return result;
};

export function evaluateGeometry(compiled, poses) {
  const diagnostics = [];
  inspectPlainData(poses, "/poses", diagnostics);
  const failed = () => freezeData({ coverage: "executed", verdict: "failed", unit: "m", fragments: [], auditFragments: [], contactFragments: [], bounds: null, boundsByPartId: {}, interfaces: [], intendedContacts: [], requiredCapabilities: structuredClone(compiled.requiredCapabilities), diagnostics });
  if (!poses || typeof poses !== "object" || Array.isArray(poses)) diagnostics.push(diagnostic("INVALID_POSES", "/poses", "World poses must be a canonical part-ID record."));
  if (hasErrors(diagnostics)) return failed();
  const partIds = new Set(compiled.parts.map((entry) => entry.id));
  for (const id of Object.keys(poses)) if (!partIds.has(id)) diagnostics.push(diagnostic("UNKNOWN_PART_POSE", `/poses/${pointer(id)}`, "Pose ID is not a physical assembly part."));
  for (const part of compiled.parts) if (!Object.hasOwn(poses, part.id) || !validPose(poses[part.id])) diagnostics.push(diagnostic("INVALID_POSE", `/poses/${pointer(part.id)}`, "Each physical part requires a finite world pose with a unit xyzw quaternion.", { ...part, partId: part.id }));
  if (hasErrors(diagnostics)) return failed();
  const worldFragments = (fragments, role) => fragments.map((fragment, index) => {
    const pose = composePose(poses[fragment.partId], fragment.localPose);
    const bounds = fragmentBounds(fragment.geometry, pose);
    if (!validPose(pose) || !finiteBounds(bounds)) diagnostics.push(diagnostic("NONFINITE_GEOMETRY", `/${role}/${index}`, "World geometry or bounds overflowed; no partial geometry snapshot is returned.", fragment));
    else if (bounds.min.some((value, axis) => value >= bounds.max[axis])) diagnostics.push(diagnostic("UNSUPPORTED_GEOMETRY_PRECISION", `/${role}/${index}/bounds`, "A positive-volume primitive collapsed in its world bounds at numeric precision; no partial geometry snapshot is returned.", fragment));
    return { ...fragment, localPose: cleanPose(fragment.localPose), geometry: structuredClone(fragment.geometry), pose, bounds };
  });
  const fragments = worldFragments(compiled.restGeometry.fragments, "fragments");
  const auditFragments = worldFragments(compiled.restGeometry.auditFragments, "auditFragments");
  const contactFragments = worldFragments(compiled.restGeometry.contactFragments, "contactFragments");
  if (hasErrors(diagnostics)) return failed();
  const alignment = evaluateInterfaces(compiled, poses);
  diagnostics.push(...alignment.diagnostics);
  if (hasErrors(diagnostics)) return failed();
  const boundsByPartId = Object.fromEntries(compiled.parts.map((part) => [part.id, unionBounds(fragments.filter((entry) => entry.partId === part.id).map((entry) => entry.bounds))]));
  return freezeData({ coverage: "executed", verdict: "passed", unit: "m", fragments, auditFragments, contactFragments, bounds: unionBounds(fragments.map((entry) => entry.bounds)), boundsByPartId, interfaces: alignment.interfaces, intendedContacts: structuredClone(compiled.intendedContacts), requiredCapabilities: structuredClone(compiled.requiredCapabilities), diagnostics });
}

export function verifyGeometryIdentity(compiled, candidates) {
  const diagnostics = [];
  inspectPlainData(candidates, "/fragments", diagnostics);
  if (!Array.isArray(candidates)) diagnostics.push(diagnostic("INVALID_GEOMETRY_FRAGMENTS", "/fragments", "Geometry identity requires a complete canonical render-fragment array."));
  if (hasErrors(diagnostics)) return { ok: false, diagnostics };
  const expected = new Map(compiled.restGeometry.fragments.map((entry) => [entry.id, entry]));
  const seen = new Set();
  for (let i = 0; i < candidates.length; i++) {
    const entry = candidates[i];
    const path = `/fragments/${i}`;
    if (!entry || !expected.has(entry.id) || seen.has(entry.id)) { diagnostics.push(diagnostic("GEOMETRY_IDENTITY_MISMATCH", path, "Fragment IDs must be complete, unique and registered.")); continue; }
    seen.add(entry.id);
    const original = expected.get(entry.id);
    if (!entry.geometry || !validPose(entry.localPose) || entry.partId !== original.partId || geometryIdentity([entry]) !== geometryIdentity([original])) diagnostics.push(diagnostic("GEOMETRY_IDENTITY_MISMATCH", path, "Rendered shape or local placement differs from the canonical scaled metre geometry.", original));
  }
  for (const [id, entry] of expected) if (!seen.has(id)) diagnostics.push(diagnostic("GEOMETRY_IDENTITY_MISMATCH", "/fragments", `Canonical fragment ${id} is missing.`, entry));
  return hasErrors(diagnostics) ? { ok: false, diagnostics } : { ok: true, value: { coverage: "executed", verdict: "passed", geometryIdentity: compiled.geometryIdentity }, diagnostics };
}
