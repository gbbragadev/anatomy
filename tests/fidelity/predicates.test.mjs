import assert from "node:assert/strict";
import test from "node:test";
import { orientationSign } from "../../fidelity/assembly/predicates.mjs";

test("orientation signs remain exact when determinant products underflow", () => {
  const e = 2 ** -700;
  assert.equal(orientationSign([-2 * e, -e], [e, -e], [0, -2 * e]), -1);
  assert.equal(orientationSign([-2 * e, -e], [e, -e], [-e, 0]), 1);
  assert.equal(orientationSign([0, 0], [1, 0], [0, Number.MIN_VALUE]), 1);
});

test("near-collinear cancellation keeps the sign of one binary ULP", () => {
  const u = 2 ** -52;
  assert.equal(orientationSign([0, 0], [1, 1], [1 + u, 1]), -1);
  assert.equal(orientationSign([0, 0], [1, 1], [1, 1 + u]), 1);
});

test("genuine diagonal and axis-aligned collinearity returns exact zero", () => {
  assert.equal(orientationSign([0, 0], [1, 1], [2, 2]), 0);
  assert.equal(orientationSign([-1, 0], [0, 0], [1, 0]), 0);
  assert.equal(orientationSign([Number.MIN_VALUE, 0], [2 * Number.MIN_VALUE, 0], [3 * Number.MIN_VALUE, 0]), 0);
});

test("orientation fallback handles finite coordinates whose ordinary differences overflow", () => {
  const m = Number.MAX_VALUE;
  assert.equal(orientationSign([m, 0], [0, m], [-m, 0]), 1);
  assert.equal(orientationSign([m, 0], [-m, 0], [0, m]), -1);
});
