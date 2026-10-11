import { plain, requireModel, freezeData, issue, failed } from "./diagnostics.mjs";
import { collectCommands } from "./commands.mjs";

export function createClock(options = {}) {
  plain(options);
  const clock = { dt_s: options.dt_s ?? 1 / 120, accumulator_s: 0, paused: options.paused ?? false, presentationSpeed: options.presentationSpeed ?? 1, pendingCommands: [] };
  requireModel(Number.isFinite(clock.dt_s) && clock.dt_s > 0 && typeof clock.paused === "boolean" && Number.isFinite(clock.presentationSpeed) && clock.presentationSpeed >= 0, "INVALID_CLOCK", "/clock", "Clock needs a positive fixed step and nonnegative finite presentation speed.");
  return freezeData(clock);
}
export function advanceClock(clock, elapsedSeconds, model, state, commands = []) {
  const reject = (diagnostics) => ({ coverage: "executed", verdict: "failed", clock, state, events: [], diagnostics });
  try { plain(clock); } catch (error) { return reject(error.diagnostics); }
  if (!clock || !Number.isFinite(clock.dt_s) || clock.dt_s <= 0 || !Number.isFinite(clock.accumulator_s) || clock.accumulator_s < 0 || typeof clock.paused !== "boolean" || !Number.isFinite(clock.presentationSpeed) || clock.presentationSpeed < 0 || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return reject([issue("INVALID_CLOCK", "/clock", "Clock and elapsed duration must retain finite supported values.")]);
  const collected = collectCommands(state, commands, clock.pendingCommands, true); if (!collected.ok) return reject(collected.diagnostics);
  const added = clock.paused ? 0 : elapsedSeconds * clock.presentationSpeed;
  const accumulator = clock.accumulator_s + added;
  if (!clock.paused && elapsedSeconds > 0 && clock.presentationSpeed > 0 && added === 0 || !Number.isFinite(accumulator) || added > 0 && accumulator === clock.accumulator_s || !clock.paused && accumulator >= clock.dt_s && accumulator - clock.dt_s === accumulator) return reject([issue("UNSUPPORTED_CLOCK_PRECISION", "/clock/accumulator_s", "Clock backlog cannot overflow or silently lose newly elapsed time.")]);
  let nextClock = { ...clock, accumulator_s: accumulator, pendingCommands: collected.value }, nextState = state, events = [], diagnostics = [];
  if (!clock.paused) for (let step = 0; step < 8 && nextClock.accumulator_s + clock.dt_s * 1e-12 >= clock.dt_s; step++) {
    const due = nextClock.pendingCommands.filter((entry) => entry.tick === nextState.tick);
    const result = model.step(nextState, due, clock.dt_s); diagnostics.push(...result.diagnostics);
    if (failed(result.diagnostics)) break;
    nextState = result.state; events.push(...result.events);
    nextClock.accumulator_s = Math.max(0, nextClock.accumulator_s - clock.dt_s);
    nextClock.pendingCommands = nextClock.pendingCommands.filter((entry) => entry.tick >= nextState.tick);
  }
  if (nextClock.accumulator_s + clock.dt_s * 1e-12 >= clock.dt_s) diagnostics.push(issue("CLOCK_BACKLOG", "/clock/accumulator_s", `${nextClock.accumulator_s} s remains queued after the eight-step frame recovery limit; no backlog is discarded.`, { tick: nextState.tick, backlog_s: nextClock.accumulator_s }, "warning"));
  return { coverage: nextState.tick === state.tick ? "skipped" : "executed", verdict: failed(diagnostics) ? "failed" : nextState.tick === state.tick ? "not-evaluated" : "passed", clock: freezeData(nextClock), state: nextState, events: freezeData(events), diagnostics };
}
export function resetClock(clock, model) {
  return { clock: createClock({ dt_s: clock.dt_s, paused: clock.paused, presentationSpeed: clock.presentationSpeed }), state: model.reset(), events: [], diagnostics: [] };
}
