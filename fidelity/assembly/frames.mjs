export const identityPose = () => ({ position: [0, 0, 0], rotation_xyzw: [0, 0, 0, 1] });
export const cleanPose = (pose) => ({ position: [...pose.position], rotation_xyzw: [...pose.rotation_xyzw] });
export const finiteVector = (value, length) => Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
export const validPose = (pose) => pose && finiteVector(pose.position, 3) && finiteVector(pose.rotation_xyzw, 4) && Math.abs(Math.hypot(...pose.rotation_xyzw) - 1) <= 1e-12;
export const normalizeQuaternion = (rotation) => {
  const norm = Math.hypot(...rotation);
  return rotation.map((value) => value / norm);
};
export const multiplyQuaternion = (a, b) => normalizeQuaternion([
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
]);
export const rotateVector = (rotation, vector) => {
  const [x, y, z, w] = rotation;
  const [a, b, c] = vector;
  return [
    (1 - 2 * (y * y + z * z)) * a + 2 * (x * y - z * w) * b + 2 * (x * z + y * w) * c,
    2 * (x * y + z * w) * a + (1 - 2 * (x * x + z * z)) * b + 2 * (y * z - x * w) * c,
    2 * (x * z - y * w) * a + 2 * (y * z + x * w) * b + (1 - 2 * (x * x + y * y)) * c
  ];
};
export const composePose = (parent, local, onPrecisionLoss) => {
  const offset = rotateVector(parent.rotation_xyzw, local.position);
  const position = offset.map((value, index) => value + parent.position[index]);
  if (onPrecisionLoss && offset.some((value, index) => Math.abs(position[index] - parent.position[index] - value) > 1e-12)) {
    const [x, y, z, w] = parent.rotation_xyzw.map(Math.abs);
    const [a, b, c] = local.position.map((value) => Math.abs(value) * (8 * Number.EPSILON));
    const roundoff = [
      (1 + 2 * (y * y + z * z)) * a + 2 * (x * y + z * w) * b + 2 * (x * z + y * w) * c,
      2 * (x * y + z * w) * a + (1 + 2 * (x * x + z * z)) * b + 2 * (y * z + x * w) * c,
      2 * (x * z + y * w) * a + 2 * (y * z + x * w) * b + (1 + 2 * (x * x + y * y)) * c
    ];
    const axis = offset.findIndex((value, index) => Math.abs(position[index] - parent.position[index] - value) > Math.max(1e-12, roundoff[index]));
    if (axis !== -1) onPrecisionLoss(axis);
  }
  return { position, rotation_xyzw: multiplyQuaternion(parent.rotation_xyzw, local.rotation_xyzw) };
};
export const inversePose = (pose) => {
  const rotation_xyzw = [-pose.rotation_xyzw[0], -pose.rotation_xyzw[1], -pose.rotation_xyzw[2], pose.rotation_xyzw[3]];
  return { position: rotateVector(rotation_xyzw, pose.position.map((value) => -value)), rotation_xyzw };
};
export const jointMotion = (joint, coordinate) => {
  if (joint.kind === "prismatic") return { position: joint.axis.map((value) => value * coordinate), rotation_xyzw: [0, 0, 0, 1] };
  if (joint.kind === "revolute") return { position: [0, 0, 0], rotation_xyzw: [...joint.axis.map((value) => value * Math.sin(coordinate / 2)), Math.cos(coordinate / 2)] };
  return identityPose();
};
export const poseResidual = (a, b) => {
  const relative = multiplyQuaternion([-a.rotation_xyzw[0], -a.rotation_xyzw[1], -a.rotation_xyzw[2], a.rotation_xyzw[3]], b.rotation_xyzw);
  return { position_m: Math.hypot(...a.position.map((value, index) => value - b.position[index])), angle_rad: 2 * Math.atan2(Math.hypot(...relative.slice(0, 3)), Math.abs(relative[3])) };
};
