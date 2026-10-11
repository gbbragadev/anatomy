import { createBeltPath } from "./path.mjs";
import { plain, requireModel, freezeData, ModelError } from "../../fidelity/model/diagnostics.mjs";
import { validPose } from "../../fidelity/assembly/frames.mjs";
import { resolvePoses } from "../../fidelity/assembly/resolve.mjs";

export function createBeltRecipe(spec) {
  plain(spec);
  requireModel(spec?.schemaVersion === "0.1.0" && spec.frame?.handedness === "right" && spec.frame?.up === "Z" && spec.frame?.unit === "m" && typeof spec.canonicalHash === "string" && spec.originalFrame, "NONCANONICAL_MACHINE", "", "Run validateMachine and compileAssembly before supplying canonical SI data to the runtime.");
  requireModel(spec.model?.recipe === "belt-bucket/kinematic-mass-v1" && spec.model.domain === "belt-bucket" && spec.model.version === "0.1.0", "UNSUPPORTED_MODEL", "/model", "Only the declared generic belt-bucket recipe is supported.");
  const input = structuredClone(spec), p = input.parameters?.beltBucket;
  const units = { headRadius: "m", beltNeutralRadius: "m", attachmentOffset: "m", bucketPitch: "m", beltLength: "m", centerDistance: "m", bucketCount: "1", speed: "m/s", acceleration: "m/s2", deceleration: "m/s2", bucketCapacity: "kg", feedRate: "kg/s" };
  for (const [name, unit] of Object.entries(units)) requireModel(p?.[name]?.unit === unit && Number.isFinite(p[name].value), "UNKNOWN_OR_NONCANONICAL_PARAMETER", `/parameters/beltBucket/${name}`, "Every required process parameter must be a known finite canonical quantity; unknowns are not zero.");
  for (const name of ["headRadius", "beltNeutralRadius", "bucketPitch", "beltLength", "centerDistance", "bucketCount", "speed", "acceleration", "deceleration", "bucketCapacity"]) requireModel(p[name].value > 0, "INVALID_MODEL_PARAMETER", `/parameters/beltBucket/${name}`, "This recipe requires a positive value.");
  requireModel(p.speed.value <= 0.5 && p.feedRate.value >= 0 && p.allowReverse === false, "UNSUPPORTED_OPERATING_DOMAIN", "/parameters/beltBucket", "The E0 recipe supports nonnegative feed and forward speed no greater than 0.5 m/s.");
  requireModel(Number.isSafeInteger(p.bucketCount.value) && p.bucketCount.value <= 1024, "UNSUPPORTED_BUCKET_COMPLEXITY", "/parameters/beltBucket/bucketCount", "Runtime hydration supports at most 1,024 physical bucket attachments.");
  const path = createBeltPath({ neutralRadius_m: p.beltNeutralRadius.value, centerDistance_m: p.centerDistance.value, length_m: p.beltLength.value, pitch_m: p.bucketPitch.value, count: p.bucketCount.value, allowReverse: p.allowReverse });
  path.sample(0, p.attachmentOffset.value);
  requireModel(Array.isArray(input.parts) && Array.isArray(input.frames) && Array.isArray(input.joints) && Array.isArray(input.constraints), "INVALID_RUNTIME_ASSEMBLY", "", "Canonical part, frame, joint and constraint tables are required.");
  const ids = new Set();
  for (const entries of [input.parts, input.frames, input.joints, input.constraints]) for (const entry of entries) { requireModel(entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.id === "string" && entry.id.length > 0 && !ids.has(entry.id), "DUPLICATE_RUNTIME_ID", "", "Runtime physical and kinematic identities must be distinct."); ids.add(entry.id); }
  const parts = new Map(input.parts.map((entry) => [entry.id, entry])), frames = new Map(input.frames.map((entry) => [entry.id, entry]));
  for (const part of input.parts) requireModel(validPose(part.localRest) && Array.isArray(part.scale) && part.scale.every((v) => v === 1) && (part.parentId === null || parts.has(part.parentId)), "INVALID_RUNTIME_PART", `/parts/${part.id}`, "Runtime parts need unit scale, canonical poses and registered parents.");
  for (const frame of input.frames) requireModel(parts.has(frame.partId) && validPose(frame.pose), "INVALID_RUNTIME_FRAME", `/frames/${frame.id}`, "Frames must retain canonical local poses and their physical owner.");
  const childJoints = new Map();
  for (const joint of input.joints) {
    requireModel(parts.has(joint.parent) && parts.has(joint.child) && parts.get(joint.child).parentId === joint.parent && frames.get(joint.childFrame)?.partId === joint.child && validPose(joint.parentFrame) && !childJoints.has(joint.child), "INVALID_RUNTIME_JOINT", `/joints/${joint.id}`, "Joint parent, child, owned frame and canonical transform must match the physical tree.");
    requireModel(joint.axisIn === "joint" && ["fixed", "revolute", "prismatic"].includes(joint.kind) && (joint.kind === "fixed" ? joint.axis === null : Array.isArray(joint.axis) && joint.axis.length === 3 && joint.axis.every(Number.isFinite) && Math.abs(Math.hypot(...joint.axis) - 1) <= 1e-12), "INVALID_RUNTIME_JOINT", `/joints/${joint.id}`, "Joint axes must be normalized canonical vectors.");
    childJoints.set(joint.child, joint);
  }
  const transformParents = [], visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    requireModel(!visiting.has(id), "PARENT_CYCLE", `/parts/${id}`, "The physical transform parent tree must be acyclic."); visiting.add(id);
    const part = parts.get(id); if (part.parentId !== null) visit(part.parentId);
    visiting.delete(id); visited.add(id); transformParents.push({ partId: id, parentId: part.parentId, jointId: childJoints.get(id)?.id ?? null });
  }
  [...parts.keys()].sort().forEach(visit);
  const jointById = new Map(input.joints.map((joint) => [joint.id, joint]));
  for (const entry of input.constraints) {
    requireModel(entry.kind === "ratio", "UNSUPPORTED_CONSTRAINT_SOLVER", `/constraints/${entry.id}`, "The runtime supports existing analytic ratios; generic closure solving is deferred.");
    requireModel(Array.isArray(entry.jointIds) && entry.jointIds.length === 2 && entry.jointIds.every((id) => typeof id === "string"), "INVALID_RUNTIME_CONSTRAINT", `/constraints/${entry.id}`, "Ratio members must name exactly two registered joints.");
    const [a, b] = entry.jointIds.map((id) => jointById.get(id));
    requireModel(a && b && a.kind !== "fixed" && a.kind === b.kind && Number.isFinite(entry.ratio) && Number.isFinite(entry.offset) && (a.kind !== "prismatic" || entry.offset === 0 || input.originalFrame.unit === "m"), "UNSUPPORTED_RATIO_UNITS", `/constraints/${entry.id}`, "Use canonical same-kind analytic ratios with unambiguous offset units.");
  }
  const drive = jointById.get("head-shaft");
  requireModel(parts.has("frame") && parts.has("head-pulley") && drive?.kind === "revolute" && drive.parent === "frame" && drive.child === "head-pulley" && Math.abs(drive.axis[1]) === 1 && drive.axis[0] === 0 && drive.axis[2] === 0 && Math.abs(drive.parentFrame.rotation_xyzw[3]) === 1 && drive.parentFrame.rotation_xyzw.slice(0, 3).every((value) => value === 0), "UNSUPPORTED_DRIVE_BINDING", "/joints/head-shaft", "The recipe binds head-shaft in the machine frame around either local Y direction.");
  const buckets = Array.from({ length: path.count }, (_, index) => ({ id: `bucket${String(index + 1).padStart(3, "0")}`, phase_m: index * path.pitch_m }));
  for (const bucket of buckets) {
    const part = parts.get(bucket.id), mount = frames.get(`${bucket.id}-attachment`);
    requireModel(part?.parentId === "frame" && !childJoints.has(bucket.id) && mount?.partId === bucket.id, "MISSING_BUCKET_BINDING", `/parts/${bucket.id}`, "Each stable physical bucket is owned by frame and needs its own local attachment frame; the recipe owns its path coordinate.");
    bucket.mount = mount.pose;
  }
  const sourcePaths = { constraints: Object.fromEntries(input.constraints.map((entry, index) => [entry.id, `/constraints/${index}`])) };
  const kinematics = { parts: input.parts, frames: input.frames, joints: input.joints, constraints: input.constraints, transformParents, sourcePaths };
  const checked = resolvePoses(kinematics, {});
  if (!checked.ok) throw new ModelError(checked.diagnostics);
  const capacities = { feed: 20, discharge: 2, output: 20, return: 20, losses: 20, ...Object.fromEntries(buckets.map((entry) => [entry.id, p.bucketCapacity.value])) };
  return freezeData({ machineId: input.machineId, canonicalHash: input.canonicalHash, parameters: p, path, buckets, kinematics, driveSign: -drive.axis[1], capacities, zones: { feedStart_m: 0, feedEnd_m: path.pitch_m / 2, discharge_m: path.centerDistance_m + Math.PI * path.neutralRadius_m / 2 }, sourceIds: ["E0"] });
}
