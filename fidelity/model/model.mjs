import { createBeltRecipe } from "../../recipes/belt-bucket/recipe.mjs";
import { resolvePoses } from "../assembly/resolve.mjs";
import { resolveCoordinates } from "../assembly/constraints.mjs";
import { composePose, inversePose } from "../assembly/frames.mjs";
import { plain, requireModel, ModelError, freezeData, issue, failed } from "./diagnostics.mjs";
import { validateInventory, applyTransfer } from "./ledger.mjs";
import { collectCommands } from "./commands.mjs";
import { motionForStep } from "./motion.mjs";

function phaseAfterTravel(phase, distance, radius) {
  const increment = distance / radius, next = phase + increment, observed = next - phase;
  requireModel(Number.isFinite(increment) && Number.isFinite(next) && Number.isFinite(observed) && (distance === 0 || increment !== 0 && observed !== 0) && Math.abs(observed - increment) <= 1e-12 * Math.max(1, Math.abs(increment)), "UNSUPPORTED_DRIVE_PHASE_PRECISION", "/drivePhase_rad", "Nonzero no-slip phase increments must advance representably within the synthetic increment precision criterion.");
  return next;
}

function stateDiagnostics(state, recipe) {
  try { plain(state, "/state"); } catch (error) { return error.diagnostics; }
  const diagnostics = validateInventory(state?.inventory_kg, recipe.capacities);
  if (!state || !Number.isSafeInteger(state.tick) || state.tick < 0 || ![state.time_s, state.beltTravel_m, state.speed_mps, state.drivePhase_rad, state.targetSpeed_mps, state.feedRate_kgps].every(Number.isFinite) || state.time_s < 0 || state.beltTravel_m < 0 || state.speed_mps < 0 || state.speed_mps > 0.5 || state.targetSpeed_mps < 0 || state.targetSpeed_mps > 0.5 || state.feedRate_kgps < 0 || typeof state.running !== "boolean" || !Number.isSafeInteger(state.eventSequence) || state.eventSequence < 0 || !Number.isSafeInteger(state.processRngState) || state.processRngState < 0 || state.processRngState > 0xffffffff) diagnostics.push(issue("INVALID_MODEL_STATE", "/state", "Runtime state requires finite supported process channels, tick, event sequence and process seed."));
  if (!Array.isArray(state?.appliedCommandIds) || !state.commandRecords || new Set(state.appliedCommandIds).size !== state.appliedCommandIds.length || Object.keys(state.commandRecords).length !== state.appliedCommandIds.length || state.appliedCommandIds.some((id) => state.commandRecords[id]?.id !== id)) diagnostics.push(issue("INVALID_COMMAND_HISTORY", "/appliedCommandIds", "Applied command IDs require unique matching canonical command records."));
  if (!Array.isArray(state?.appliedEventIds) || !Array.isArray(state?.lastEvents) || new Set(state.appliedEventIds).size !== state.appliedEventIds.length || state.appliedEventIds.length !== state.lastEvents.length || state.lastEvents.some((event, index) => event?.id !== state.appliedEventIds[index])) diagnostics.push(issue("INVALID_EVENT_HISTORY", "/lastEvents", "Snapshot event references require unique matching latest-tick transfer records."));
  return diagnostics;
}
export function createModel(spec, initialState, seed) {
  const recipe = createBeltRecipe(spec);
  plain(initialState, "/initialState");
  requireModel(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff, "INVALID_SEED", "/seed", "Process seed must be an unsigned 32-bit integer.");
  requireModel(Array.isArray(initialState?.appliedCommandIds) && initialState.appliedCommandIds.length === 0, "INITIAL_COMMAND_HISTORY", "/initialState/appliedCommandIds", "Reconstruct a fresh run from initial state/seed and replay commands, rather than inventing missing command history.");
  const start = structuredClone(initialState);
  for (const id of Object.keys(recipe.capacities)) if (!Object.hasOwn(start.inventory_kg ?? {}, id)) {
    requireModel(recipe.buckets.some((bucket) => bucket.id === id), "MISSING_COMPARTMENT", `/initialState/inventory_kg/${id}`, "Non-bucket ledger compartments must be explicitly initialized."); start.inventory_kg[id] = 0;
  }
  const original = freezeData({ ...start, running: start.speed_mps > 0, targetSpeed_mps: recipe.parameters.speed.value, feedRate_kgps: recipe.parameters.feedRate.value, processRngState: seed, eventSequence: 0, appliedEventIds: [], lastEvents: [], commandRecords: {} });
  const diagnostics = stateDiagnostics(original, recipe); if (failed(diagnostics)) throw new ModelError(diagnostics);
  const initialCoordinates = resolveCoordinates(recipe.kinematics, { "head-shaft": original.drivePhase_rad * recipe.driveSign });
  if (!initialCoordinates.ok) throw new ModelError(initialCoordinates.diagnostics);
  function step(state, commands, dt) {
    const diagnostics = stateDiagnostics(state, recipe);
    if (!Number.isFinite(dt) || dt <= 0) diagnostics.push(issue("INVALID_TIMESTEP", "/dt", "The step duration must be finite and strictly positive."));
    if (failed(diagnostics)) return { coverage: "executed", verdict: "failed", state, events: [], diagnostics };
    const batch = collectCommands(state, commands); if (!batch.ok) return { coverage: "executed", verdict: "failed", state, events: [], diagnostics: batch.diagnostics };
    let next = { ...state, commandRecords: { ...state.commandRecords }, appliedCommandIds: [...state.appliedCommandIds] };
    for (const entry of batch.value) {
      if (entry.type === "start") next.running = true;
      if (entry.type === "stop") next.running = false;
      if (entry.type === "set-speed") next.targetSpeed_mps = entry.value;
      if (entry.type === "set-feed") next.feedRate_kgps = entry.value;
      next.commandRecords = { ...next.commandRecords, [entry.id]: entry }; next.appliedCommandIds.push(entry.id);
    }
    try {
      const motion = motionForStep(state.speed_mps, next.running ? next.targetSpeed_mps : 0, recipe.parameters.acceleration.value, recipe.parameters.deceleration.value, dt);
      const endTravel = state.beltTravel_m + motion.distance_m;
      const nextPhase = phaseAfterTravel(state.drivePhase_rad, motion.distance_m, recipe.parameters.headRadius.value);
      const coordinates = resolveCoordinates(recipe.kinematics, { "head-shaft": nextPhase * recipe.driveSign });
      if (!coordinates.ok) throw new ModelError(coordinates.diagnostics);
      requireModel(Number.isFinite(endTravel) && (motion.distance_m === 0 || endTravel > state.beltTravel_m) && Number.isSafeInteger(state.tick + 1) && state.time_s + dt > state.time_s, "UNSUPPORTED_STATE_PRECISION", "/state", "Travel/time/tick must advance representably without dropping motion.");
      const crossings = [];
      for (const bucket of recipe.buckets) for (const entry of recipe.path.crossings(state.beltTravel_m + bucket.phase_m, endTravel + bucket.phase_m, [recipe.zones.feedStart_m, recipe.zones.feedEnd_m, recipe.zones.discharge_m])) {
        const located = motion.timeAtDistance(entry.distance_m - bucket.phase_m - state.beltTravel_m);
        const offset_s = located <= dt * 1e-12 ? 0 : dt - located <= dt * 1e-12 ? dt : located;
        crossings.push({ ...entry, offset_s, partId: bucket.id });
      }
      crossings.sort((a, b) => a.offset_s - b.offset_s || (a.partId < b.partId ? -1 : a.partId > b.partId ? 1 : a.coordinate_m - b.coordinate_m));
      let ledger = { inventory_kg: state.inventory_kg, appliedEventIds: [], eventRecords: [] }, events = [], sequence = state.eventSequence;
      const transfer = (from, to, amount, offset_s, partId) => {
        if (amount <= 0) return;
        const event = { id: `${recipe.machineId}:transfer:${sequence}`, tick: state.tick, offset_s, from, to, amount_kg: amount, partId, sourceIds: recipe.sourceIds };
        requireModel(Number.isSafeInteger(sequence + 1), "EVENT_SEQUENCE_OVERFLOW", "/eventSequence", "Event identities must remain exact.");
        const applied = applyTransfer(ledger, event, recipe.capacities); if (!applied.ok) throw new ModelError(applied.diagnostics);
        ledger = applied.value; events.push(event); sequence++;
      };
      const dischargeAt = (offset) => {
        for (const crossing of crossings.filter((entry) => entry.offset_s === offset && entry.coordinate_m === recipe.zones.discharge_m)) {
          const amount = Math.min(ledger.inventory_kg[crossing.partId], recipe.capacities.discharge - ledger.inventory_kg.discharge);
          transfer(crossing.partId, "discharge", amount, offset, crossing.partId);
        }
      };
      dischargeAt(0);
      const boundaries = [...new Set([0, ...crossings.map((entry) => entry.offset_s), dt])].sort((a, b) => a - b);
      for (let index = 1; index < boundaries.length; index++) {
        const begin = boundaries[index - 1], end = boundaries[index], midTravel = state.beltTravel_m + motion.distanceAt((begin + end) / 2);
        const feeders = recipe.buckets.filter((bucket) => { const s = recipe.path.sample(midTravel + bucket.phase_m).coordinate_m; return s >= recipe.zones.feedStart_m && s < recipe.zones.feedEnd_m; });
        if (next.feedRate_kgps > 0 && feeders.length) {
          const rate = next.feedRate_kgps / feeders.length;
          for (const bucket of feeders) {
            const available = Math.min(ledger.inventory_kg.feed, recipe.capacities[bucket.id] - ledger.inventory_kg[bucket.id]);
            const prescribed = rate * (end - begin);
            requireModel(available === 0 || rate > 0 && prescribed > 0, "NONREPRESENTABLE_TRANSFER", "/feedRate_kgps", "Positive unblocked prescribed feed cannot underflow to zero transferred mass.");
            const amount = Math.min(prescribed, available);
            transfer("feed", bucket.id, amount, begin + amount / rate, bucket.id);
          }
        }
        dischargeAt(end);
      }
      events.sort((a, b) => a.offset_s - b.offset_s || (a.partId < b.partId ? -1 : a.partId > b.partId ? 1 : a.id < b.id ? -1 : 1));
      next = { ...next, tick: state.tick + 1, time_s: state.time_s + dt, beltTravel_m: endTravel, speed_mps: motion.speed_mps, drivePhase_rad: nextPhase, inventory_kg: ledger.inventory_kg, eventSequence: sequence, appliedEventIds: events.map((event) => event.id), lastEvents: events };
      const checked = stateDiagnostics(next, recipe); if (failed(checked)) throw new ModelError(checked);
      return { coverage: "executed", verdict: "passed", state: freezeData(next), events: freezeData(events), diagnostics };
    } catch (error) { if (!(error instanceof ModelError) && !(error instanceof RangeError)) throw error; return { coverage: "executed", verdict: "failed", state, events: [], diagnostics: error.diagnostics ?? [issue("UNSUPPORTED_PATH_RANGE", "/beltTravel_m", error.message)] }; }
  }
  function snapshot(state) {
    const diagnostics = stateDiagnostics(state, recipe); if (failed(diagnostics)) throw new ModelError(diagnostics);
    const bucketLocal = new Map(recipe.buckets.map((bucket) => {
      const attachment = recipe.path.sample(state.beltTravel_m + bucket.phase_m, recipe.parameters.attachmentOffset.value);
      return [bucket.id, composePose({ position: attachment.position, rotation_xyzw: attachment.rotation_xyzw }, inversePose(bucket.mount))];
    }));
    const kinematics = { ...recipe.kinematics, parts: recipe.kinematics.parts.map((part) => bucketLocal.has(part.id) ? { ...part, localRest: bucketLocal.get(part.id) } : part) };
    const poses = resolvePoses(kinematics, { "head-shaft": state.drivePhase_rad * recipe.driveSign }); if (!poses.ok) throw new ModelError(poses.diagnostics);
    return freezeData({ version: state.tick, tick: state.tick, time_s: state.time_s, beltTravel_m: state.beltTravel_m, speed_mps: state.speed_mps, drivePhase_rad: state.drivePhase_rad, inventory_kg: { ...state.inventory_kg }, posesByPartId: poses.value, readouts: { time: { value: state.time_s, unit: "s" }, travel: { value: state.beltTravel_m, unit: "m" }, speed: { value: state.speed_mps, unit: "m/s" }, driveSpeed: { value: state.speed_mps / recipe.parameters.headRadius.value, unit: "rad/s" }, totalMass: { value: Object.values(state.inventory_kg).reduce((a, b) => a + b, 0), unit: "kg" }, feedRate: { value: state.feedRate_kgps, unit: "kg/s" } }, eventRefs: [...state.appliedEventIds], events: structuredClone(state.lastEvents), sourceIds: recipe.sourceIds });
  }
  function interpolate(previous, next, alpha) {
    requireModel(Number.isFinite(alpha) && alpha >= 0 && alpha <= 1, "INVALID_INTERPOLATION", "/alpha", "Presentation interpolation must be within [0,1].");
    for (const state of [previous, next]) { const errors = stateDiagnostics(state, recipe); if (failed(errors)) throw new ModelError(errors); }
    const interpolated = { ...next };
    for (const key of ["time_s", "beltTravel_m", "speed_mps"]) interpolated[key] = previous[key] + (next[key] - previous[key]) * alpha;
    interpolated.drivePhase_rad = phaseAfterTravel(previous.drivePhase_rad, interpolated.beltTravel_m - previous.beltTravel_m, recipe.parameters.headRadius.value);
    return snapshot(interpolated);
  }
  return Object.freeze({ initialState: original, seed, recipe, step, snapshot, interpolate, reset: () => original });
}
