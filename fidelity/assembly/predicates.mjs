const buffer = new DataView(new ArrayBuffer(8));
const normalMinimum = 2 ** -1022;
const integerUnit = 1n << 52n;
const fractionMask = integerUnit - 1n;

const dyadic = (value) => {
  buffer.setFloat64(0, value, false);
  const bits = buffer.getBigUint64(0, false);
  const exponent = Number((bits >> 52n) & 2047n);
  const fraction = bits & fractionMask;
  return { integer: (bits >> 63n ? -1n : 1n) * (exponent === 0 ? fraction : integerUnit + fraction), exponent: exponent === 0 ? -1074 : exponent - 1075 };
};
const subtract = (a, b) => {
  if (a.integer === 0n) return { integer: -b.integer, exponent: b.exponent };
  if (b.integer === 0n) return a;
  const exponent = Math.min(a.exponent, b.exponent);
  return { integer: (a.integer << BigInt(a.exponent - exponent)) - (b.integer << BigInt(b.exponent - exponent)), exponent };
};
const multiply = (a, b) => ({ integer: a.integer * b.integer, exponent: a.exponent + b.exponent });
const exactOrientation = (a, b, c) => {
  const acx = subtract(dyadic(a[0]), dyadic(c[0]));
  const acy = subtract(dyadic(a[1]), dyadic(c[1]));
  const bcx = subtract(dyadic(b[0]), dyadic(c[0]));
  const bcy = subtract(dyadic(b[1]), dyadic(c[1]));
  const determinant = subtract(multiply(acx, bcy), multiply(acy, bcx)).integer;
  return determinant === 0n ? 0 : determinant > 0n ? 1 : -1;
};

export function orientationSign(a, b, c) {
  const acx = a[0] - c[0];
  const acy = a[1] - c[1];
  const bcx = b[0] - c[0];
  const bcy = b[1] - c[1];
  const left = acx * bcy;
  const right = acy * bcx;
  const determinant = left - right;
  const safeLeft = left === 0 ? acx === 0 || bcy === 0 : Math.abs(left) >= normalMinimum;
  const safeRight = right === 0 ? acy === 0 || bcx === 0 : Math.abs(right) >= normalMinimum;
  const errorBound = 4 * Number.EPSILON * (Math.abs(left) + Math.abs(right));
  if (Number.isFinite(determinant) && safeLeft && safeRight && Math.abs(determinant) > errorBound) return Math.sign(determinant);
  return exactOrientation(a, b, c);
}
