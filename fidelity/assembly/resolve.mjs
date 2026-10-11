import { cleanPose, composePose, inversePose, jointMotion, validPose } from "./frames.mjs";
import { resolveCoordinates } from "./constraints.mjs";
import { diagnostic, hasErrors, pointer, freezeData } from "./diagnostics.mjs";

export function resolvePoses(compiled, input = {}) {
  const coordinates = resolveCoordinates(compiled, input);
  if (!coordinates.ok) return { ok: false, diagnostics: coordinates.diagnostics };
  const diagnostics = [...coordinates.diagnostics];
  const parts = new Map(compiled.parts.map((entry) => [entry.id, entry]));
  const joints = new Map(compiled.joints.map((entry) => [entry.id, entry]));
  const frames = new Map(compiled.frames.map((entry) => [entry.id, entry]));
  const poses = new Map();
  for (const transform of compiled.transformParents) {
    const part = parts.get(transform.partId);
    let pose;
    if (transform.parentId === null) pose = cleanPose(part.localRest);
    else if (transform.jointId === null) pose = composePose(poses.get(transform.parentId), part.localRest);
    else {
      const joint = joints.get(transform.jointId);
      pose = composePose(composePose(composePose(poses.get(transform.parentId), joint.parentFrame), jointMotion(joint, coordinates.value[joint.id])), inversePose(frames.get(joint.childFrame).pose));
    }
    if (!validPose(pose)) diagnostics.push(diagnostic("NONFINITE_POSE", `/poses/${pointer(part.id)}`, "Joint/tree composition must produce finite canonical world poses.", { ...part, partId: part.id }));
    poses.set(part.id, pose);
  }
  return hasErrors(diagnostics) ? { ok: false, diagnostics } : { ok: true, value: freezeData(Object.fromEntries(poses)), diagnostics };
}
