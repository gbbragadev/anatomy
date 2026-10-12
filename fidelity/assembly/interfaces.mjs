import { composePose, rotateVector, poseResidual } from "./frames.mjs";
import { diagnostic } from "./diagnostics.mjs";

export function evaluateInterfaces(compiled, poses) {
  const ports = new Map(compiled.ports.map((entry) => [entry.id, entry]));
  const frames = new Map(compiled.frames.map((entry) => [entry.id, entry]));
  const interfaces = [];
  const diagnostics = [];
  for (const connection of compiled.connections) {
    const a = ports.get(connection.fromPortId);
    const b = ports.get(connection.toPortId);
    const path = compiled.sourcePaths.connections[connection.id];
    const compatible = a.kind === b.kind && (connection.kind === "material" ? a.kind === "flow" : ["mount", "shaft"].includes(a.kind));
    if (!compatible) diagnostics.push(diagnostic("INCOMPATIBLE_PORTS", path, "Mechanical endpoints must share shaft or mount kind; material endpoints must both be flow ports.", connection));
    if (!["output", "bidirectional"].includes(a.direction) || !["input", "bidirectional"].includes(b.direction)) diagnostics.push(diagnostic("INCOMPATIBLE_PORT_DIRECTION", path, "Connection must run from an output/bidirectional port to an input/bidirectional port.", connection));
    let representable = true;
    const precisionLoss = (partId) => (axis) => {
      representable = false;
      diagnostics.push(diagnostic("UNSUPPORTED_POSE_PRECISION", path, `Interface composition cannot retain the local offset on axis ${axis} at numerical alignment precision.`, { ...connection, partId }));
    };
    const fromPose = composePose(poses[a.partId], frames.get(a.frameId).pose, precisionLoss(a.partId));
    const toPose = composePose(poses[b.partId], frames.get(b.frameId).pose, precisionLoss(b.partId));
    const residual = poseResidual(fromPose, toPose);
    if (a.kind !== "mount") {
      const axisA = rotateVector(fromPose.rotation_xyzw, [0, 0, 1]);
      const axisB = rotateVector(toPose.rotation_xyzw, [0, 0, 1]);
      const cross = [axisA[1] * axisB[2] - axisA[2] * axisB[1], axisA[2] * axisB[0] - axisA[0] * axisB[2], axisA[0] * axisB[1] - axisA[1] * axisB[0]];
      const dot = axisA.reduce((sum, value, index) => sum + value * axisB[index], 0);
      residual.angle_rad = Math.atan2(Math.hypot(...cross), Math.abs(dot));
    }
    const tolerance = { position_m: 1e-12, angle_rad: 1e-12 };
    const aligned = representable && Number.isFinite(residual.position_m) && Number.isFinite(residual.angle_rad) && residual.position_m <= tolerance.position_m && residual.angle_rad <= tolerance.angle_rad;
    if (representable && !aligned) diagnostics.push(diagnostic("INTERFACE_MISALIGNED", path, `Frame residuals ${residual.position_m} m and ${residual.angle_rad} rad exceed numerical alignment limits ${tolerance.position_m} m and ${tolerance.angle_rad} rad. These are not approved mechanical tolerances.`, connection));
    interfaces.push({ connectionId: connection.id, fromPortId: a.id, toPortId: b.id, partIds: [a.partId, b.partId], kind: connection.kind, intendedContact: connection.intendedContact, residual, tolerance, coverage: "executed", verdict: compatible && aligned && ["output", "bidirectional"].includes(a.direction) && ["input", "bidirectional"].includes(b.direction) ? "passed" : "failed", sourceIds: [...connection.sourceIds] });
  }
  return { interfaces, diagnostics };
}
