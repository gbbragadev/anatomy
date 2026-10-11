import { createModel } from "./model.mjs";
import { collectCommands } from "./commands.mjs";
import { plain, requireModel, freezeData, replayHash, failed } from "./diagnostics.mjs";

export function replay(spec, initialState, seed, dt, commands, ticks) {
  plain(commands);
  requireModel(Number.isFinite(dt) && dt > 0 && Number.isSafeInteger(ticks) && ticks >= 0, "INVALID_REPLAY", "/replay", "Replay needs a positive fixed dt and an exact nonnegative step count.");
  const model = createModel(spec, initialState, seed), batch = collectCommands(model.initialState, commands, [], true);
  let state = model.initialState, events = [], diagnostics = batch.diagnostics, completedTicks = 0;
  if (batch.ok) for (let index = 0; index < ticks; index++) {
    const result = model.step(state, batch.value.filter((entry) => entry.tick === state.tick), dt);
    diagnostics = [...diagnostics, ...result.diagnostics];
    if (failed(result.diagnostics)) break;
    state = result.state; events.push(...result.events); completedTicks++;
  }
  const verdict = completedTicks === ticks && !failed(diagnostics) ? "passed" : "failed";
  return freezeData({ coverage: completedTicks === ticks ? "executed" : "partial", verdict, completedTicks, state, events, diagnostics, snapshot: model.snapshot(state), hash: replayHash({ canonicalHash: spec.canonicalHash, seed, dt, initialState: model.initialState, commands: batch.value ?? commands, completedTicks, state, events }) });
}
