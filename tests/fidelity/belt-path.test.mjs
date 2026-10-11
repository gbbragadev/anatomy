import test from "node:test";
import assert from "node:assert/strict";
import { createBeltPath } from "../../recipes/belt-bucket/path.mjs";
import { C, approx } from "./model-fixtures.mjs";

const parameters = { neutralRadius_m: 0.2, centerDistance_m: C, length_m: 5, pitch_m: 0.25, count: 20, allowReverse: false };
const nearVector = (a, b, tolerance = 1e-12) => a.forEach((value, index) => approx(value, b[index], tolerance));
test("exact generic loop retains computed C and analytic length", () => {
  const path = createBeltPath(parameters);
  assert.equal(path.length_m, 5); assert.equal(path.centerDistance_m, C);
  nearVector(path.sample(0).position, [0.2, 0, 0]);
  nearVector(path.sample(C).position, [0.2, 0, C]);
  nearVector(path.sample(C + Math.PI * 0.2).position, [-0.2, 0, C]);
  nearVector(path.sample(2 * C + Math.PI * 0.2).position, [-0.2, 0, 0]);
});
for (const seam of [0, C, C + Math.PI * 0.2, 2 * C + Math.PI * 0.2, 5]) {
  test(`position/tangent are continuous at ${seam}`, () => {
    const path = createBeltPath(parameters), epsilon = 1e-9;
    nearVector(path.sample(seam - epsilon).position, path.sample(seam + epsilon).position, 3e-9);
    nearVector(path.sample(seam - epsilon).tangent, path.sample(seam + epsilon).tangent, 2e-8);
    approx(Math.hypot(...path.sample(seam).tangent), 1);
  });
}
test("path derivative independently matches tangent through both arcs", () => {
  const path = createBeltPath(parameters);
  for (const s of [C + 0.1, C + 0.4, 2 * C + Math.PI * 0.2 + 0.1, 4.9]) {
    const h = 1e-6, a = path.sample(s - h), b = path.sample(s + h);
    nearVector(b.position.map((v, i) => (v - a.position[i]) / (2 * h)), path.sample(s).tangent, 1e-9);
  }
});
test("path wraps exactly for ten laps and supports outward mounting offset", () => {
  const path = createBeltPath(parameters);
  for (let lap = 0; lap <= 10; lap++) nearVector(path.sample(1.5 + lap * 5).position, path.sample(1.5).position);
  nearVector(path.sample(0, 0.03).position, [0.23, 0, 0]);
  nearVector(path.sample(C + Math.PI * 0.1, 0.03).position, [0, 0, C + 0.23]);
});
test("crossings are half-open and enumerate every seam in a long step", () => {
  const path = createBeltPath(parameters);
  assert.deepEqual(path.crossings(0, 10, [0]).map((entry) => entry.distance_m), [5, 10]);
  assert.deepEqual(path.crossings(4.99, 5.01, [0]).map((entry) => entry.distance_m), [5]);
  assert.deepEqual(path.crossings(5, 5.01, [0]), []);
});
test("nonintegral count, inconsistent loop, reverse and nonfinite path fail", () => {
  for (const patch of [{ pitch_m: 0.3 }, { count: 19 }, { length_m: 5.01 }, { neutralRadius_m: 0 }, { allowReverse: true }, { centerDistance_m: NaN }]) assert.throws(() => createBeltPath({ ...parameters, ...patch }));
  const path = createBeltPath(parameters);
  assert.throws(() => path.crossings(1, 0, [0]));
  assert.throws(() => path.sample(Infinity));
});
