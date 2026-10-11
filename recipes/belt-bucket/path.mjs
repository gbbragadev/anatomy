import { freezeData } from "../../fidelity/assembly/diagnostics.mjs";

export function createBeltPath(parameters) {
  const { neutralRadius_m: radius, centerDistance_m: center, length_m: length, pitch_m: pitch, count, allowReverse } = parameters;
  if (![radius, center, length, pitch].every((value) => Number.isFinite(value) && value > 0) || !Number.isSafeInteger(count) || count < 1 || allowReverse !== false) throw new RangeError("The forward-only loop needs finite positive dimensions and an integer bucket count.");
  if (Math.abs(2 * center + 2 * Math.PI * radius - length) > 1e-12 * length || Math.abs(length / pitch - count) > 1e-12 * count) throw new RangeError("Loop length, center distance and integral bucket pitch must agree.");
  const arc = Math.PI * radius;
  const wrap = (s) => ((s % length) + length) % length;
  function sample(s, attachmentOffset_m = 0) {
    if (!Number.isFinite(s) || !Number.isFinite(attachmentOffset_m) || radius + attachmentOffset_m <= 0) throw new RangeError("Path coordinates and supported mounting offset must be finite.");
    const coordinate_m = wrap(s);
    let position, angle;
    if (coordinate_m < center) { position = [radius, 0, coordinate_m]; angle = 0; }
    else if (coordinate_m < center + arc) { angle = (coordinate_m - center) / radius; position = [radius * Math.cos(angle), 0, center + radius * Math.sin(angle)]; }
    else if (coordinate_m < 2 * center + arc) { angle = Math.PI; position = [-radius, 0, 2 * center + arc - coordinate_m]; }
    else { angle = Math.PI + (coordinate_m - 2 * center - arc) / radius; position = [radius * Math.cos(angle), 0, radius * Math.sin(angle)]; }
    const outward = [Math.cos(angle), 0, Math.sin(angle)];
    position = position.map((value, index) => value + outward[index] * attachmentOffset_m);
    return freezeData({ coordinate_m, position, tangent: [-Math.sin(angle), 0, Math.cos(angle)], outward, rotation_xyzw: [0, -Math.sin(angle / 2), 0, Math.cos(angle / 2)] });
  }
  function crossings(start, end, positions) {
    if (![start, end].every(Number.isFinite) || end < start || !Array.isArray(positions) || positions.some((s) => !Number.isFinite(s) || s < 0 || s >= length) || new Set(positions).size !== positions.length) throw new RangeError("Crossings need forward finite travel and unique zone coordinates on the loop.");
    const result = [];
    for (const coordinate_m of positions) {
      const first = Math.floor((start - coordinate_m) / length) + 1, last = Math.floor((end - coordinate_m) / length);
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first > 100000) throw new RangeError("The requested crossing range exceeds supported numerical/work bounds.");
      for (let lap = first; lap <= last; lap++) {
        const distance_m = lap * length + coordinate_m;
        if (distance_m > start && distance_m <= end) result.push({ coordinate_m, distance_m, lap });
      }
    }
    return freezeData(result.sort((a, b) => a.distance_m - b.distance_m || a.coordinate_m - b.coordinate_m));
  }
  return Object.freeze({ length_m: length, centerDistance_m: center, neutralRadius_m: radius, pitch_m: pitch, count, sample, crossings });
}
