import { requireModel } from "./diagnostics.mjs";

export function motionForStep(speed, target, acceleration, deceleration, dt) {
  const a = speed === target ? 0 : target > speed ? acceleration : -deceleration;
  const ramp_s = a === 0 ? 0 : Math.min(dt, Math.abs((target - speed) / a));
  const terminal = a === 0 ? speed : Math.abs((target - speed) / a) <= dt * (1 + 1e-12) ? target : speed + a * ramp_s;
  const rampDistance = speed * ramp_s + 0.5 * a * ramp_s * ramp_s;
  const distanceAt = (t) => t <= ramp_s ? speed * t + 0.5 * a * t * t : rampDistance + terminal * (t - ramp_s);
  const distance_m = distanceAt(dt);
  requireModel((distance_m > 0 || speed === 0 && a <= 0) && (a === 0 || ramp_s === 0 || terminal !== speed) && !(ramp_s > 0 && speed === 0 && a > 0 && rampDistance === 0), "UNSUPPORTED_MOTION_PRECISION", "/dt", "Positive motion and speed changes must not underflow or collapse during integration.");
  requireModel(Number.isFinite(distance_m) && distance_m >= 0 && Number.isFinite(terminal), "NONFINITE_MOTION", "/beltTravel_m", "Integrated forward motion must be finite.");
  const timeAtDistance = (distance) => {
    if (distance <= 0) return 0;
    if (distance <= rampDistance && a !== 0) {
      const discriminant = Math.max(0, speed * speed + 2 * a * distance);
      return Math.min(ramp_s, 2 * distance / (speed + Math.sqrt(discriminant)));
    }
    return Math.min(dt, ramp_s + (distance - rampDistance) / terminal);
  };
  return { distance_m, speed_mps: terminal, distanceAt, timeAtDistance };
}
