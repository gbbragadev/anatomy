import { plain, issue, failed, stableStringify, compareId } from "./diagnostics.mjs";

export function collectCommands(state, incoming, pending = [], allowFuture = false) {
  try { plain(incoming, "/commands"); plain(pending, "/pendingCommands"); } catch (error) { return { ok: false, diagnostics: error.diagnostics }; }
  if (!state || !Number.isSafeInteger(state.tick) || state.tick < 0 || !state.commandRecords || typeof state.commandRecords !== "object" || !Array.isArray(state.appliedCommandIds)) return { ok: false, diagnostics: [issue("INVALID_MODEL_STATE", "/state", "Command routing requires a valid tick and explicit command history.")] };
  const diagnostics = [], records = state.commandRecords, collected = new Map();
  if (!Array.isArray(incoming) || !Array.isArray(pending)) return { ok: false, diagnostics: [issue("INVALID_COMMANDS", "/commands", "Commands must be plain arrays.")] };
  for (const entry of [...pending, ...incoming]) {
    const valid = entry && typeof entry.id === "string" && entry.id.length > 0 && ["start", "stop", "set-speed", "set-feed"].includes(entry.type) && Number.isSafeInteger(entry.tick) && entry.tick >= 0;
    if (!valid) { diagnostics.push(issue("INVALID_COMMAND", "/commands", "Only stable, tick-addressed process commands are accepted.")); continue; }
    const adjusted = { id: entry.id, type: entry.type, tick: entry.tick };
    if (["set-speed", "set-feed"].includes(entry.type)) {
      const unit = entry.type === "set-speed" ? "m/s" : "kg/s";
      if (!Number.isFinite(entry.value) || entry.value < 0 || entry.unit !== unit || entry.type === "set-speed" && entry.value > 0.5) { diagnostics.push(issue("INVALID_COMMAND_VALUE", `/commands/${entry.id}`, "Command values require known canonical units and a supported nonnegative operating range.")); continue; }
      adjusted.value = entry.value; adjusted.unit = entry.unit;
    } else if (entry.value !== undefined || entry.unit !== undefined) { diagnostics.push(issue("INVALID_COMMAND_VALUE", `/commands/${entry.id}`, "Start and stop carry no independent numeric value.")); continue; }
    if (Object.keys(entry).some((key) => !["id", "type", "tick", "value", "unit", "original"].includes(key))) { diagnostics.push(issue("INVALID_COMMAND", `/commands/${entry.id}`, "Undeclared process/presentation command fields are unsupported.")); continue; }
    const known = Object.hasOwn(records, entry.id) ? records[entry.id] : collected.get(entry.id);
    if (known) {
      if (stableStringify(known) !== stableStringify(adjusted)) diagnostics.push(issue("CONFLICTING_COMMAND_ID", `/commands/${entry.id}`, "A command ID cannot be reused with different process content."));
      continue;
    }
    if (entry.tick < state.tick) diagnostics.push(issue("LATE_COMMAND", `/commands/${entry.id}`, "An unapplied command cannot change an already simulated tick.", { tick: state.tick }));
    else if (entry.tick > state.tick && !allowFuture) diagnostics.push(issue("FUTURE_COMMAND", `/commands/${entry.id}`, "Queue future commands in the clock or replay runner.", { tick: state.tick }));
    else collected.set(entry.id, adjusted);
  }
  return failed(diagnostics) ? { ok: false, diagnostics } : { ok: true, value: [...collected.values()].sort((a, b) => a.tick - b.tick || compareId(a, b)), diagnostics };
}
