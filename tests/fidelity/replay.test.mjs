import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { createModel, createClock, advanceClock, resetClock, replay } from "../../fidelity/model/index.mjs";
import { beltSpec, initial, command, DT, approx, code, total } from "./model-fixtures.mjs";

const commands = [command("start", "start"), command("feed", "set-feed", 120, 0.4, "kg/s"), command("stop", "stop", 240), command("resume", "start", 400)];
test("replay hashes repeat for same canonical data, seed, commands and dt", () => {
  const spec = beltSpec(), a = replay(spec, initial(spec), 42, DT, commands, 800), b = replay(spec, initial(spec), 42, DT, [...commands].reverse(), 800);
  assert.equal(a.coverage, "executed"); assert.equal(a.verdict, "passed"); assert.equal(a.hash, b.hash); assert.deepEqual(a.state, b.state); assert.deepEqual(a.events, b.events);
  assert.notEqual(a.hash, replay(spec, initial(spec), 43, DT, commands, 800).hash);
});
test("camera, particles, light, material, quality and theme never enter physical replay", () => {
  const spec = beltSpec(), baseline = replay(spec, initial(spec), 42, DT, commands, 800);
  const model = createModel(spec, initial(spec), 42); let state = model.initialState;
  for (let tick = 0; tick < 800; tick++) {
    const presentation = { camera: tick % 5, particles: tick * 13, light: tick % 3, material: "rubber", quality: tick % 2, theme: tick % 2 };
    model.snapshot(state); model.interpolate(state, state, 0.5); assert.ok(presentation.particles >= 0);
    state = model.step(state, commands.filter((entry) => entry.tick === tick), DT).state;
  }
  assert.deepEqual(state, baseline.state);
});
test("eight-step frame recovery retains backlog until all elapsed time is processed", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec, { speed_mps: 0.5 }), 3), clock = createClock({ dt_s: DT });
  let result = advanceClock(clock, 1, model, model.initialState, []);
  assert.equal(result.state.tick, 8); code(result, "CLOCK_BACKLOG"); approx(result.clock.accumulator_s, 1 - 8 * DT);
  while (result.clock.accumulator_s >= DT - 1e-12) result = advanceClock(result.clock, 0, model, result.state, []);
  assert.equal(result.state.tick, 120); approx(result.state.time_s, 1); approx(result.state.beltTravel_m, 0.5); approx(result.clock.accumulator_s, 0, 1e-12);
});
test("paused clock retains backlog and queues commands without advancing physics", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 3), clock = createClock({ dt_s: DT, paused: true });
  const result = advanceClock(clock, 3, model, model.initialState, [command("start", "start")]);
  assert.equal(result.state, model.initialState); assert.equal(result.clock.accumulator_s, 0); assert.equal(result.clock.pendingCommands.length, 1);
  const resumed = advanceClock({ ...result.clock, paused: false }, DT, model, result.state, []);
  assert.equal(resumed.state.tick, 1); assert.ok(resumed.state.speed_mps > 0);
});
test("presentation-speed scales clock input only and reset reconstructs state/seed", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 99), clock = createClock({ dt_s: DT, presentationSpeed: 2 });
  const result = advanceClock(clock, DT, model, model.initialState, [command("start", "start")]);
  assert.equal(result.state.tick, 2);
  const reset = resetClock(result.clock, model); assert.deepEqual(reset.state, model.initialState); assert.equal(reset.clock.accumulator_s, 0); assert.equal(reset.state.processRngState, 99);
  assert.equal(reset.clock.presentationSpeed, 2);
});
test("clock queues future commands, deduplicates retries, rejects conflicts and late commands", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 4), future = command("start", "start", 2);
  let result = advanceClock(createClock(), DT, model, model.initialState, [future, future]);
  assert.equal(result.clock.pendingCommands.length, 1);
  result = advanceClock(result.clock, 2 * DT, model, result.state, []); assert.equal(result.state.tick, 3); assert.ok(result.state.speed_mps > 0);
  const late = advanceClock(result.clock, DT, model, result.state, [command("late", "stop", 0)]); code(late, "LATE_COMMAND"); assert.equal(late.state, result.state);
  const conflict = advanceClock(result.clock, DT, model, result.state, [command("start", "stop", 2)]); code(conflict, "CONFLICTING_COMMAND_ID");
});
test("dt/2 convergence meets predeclared synthetic travel, mass and crossing-time limits", () => {
  const spec = beltSpec((raw) => { raw.parameters.beltBucket.feedRate.value = 0.4; }), a = replay(spec, initial(spec), 22, DT, [command("start", "start")], 2400), b = replay(spec, initial(spec), 22, DT / 2, [command("start", "start")], 4800);
  assert.equal(a.verdict, "passed"); assert.equal(b.verdict, "passed"); approx(a.state.beltTravel_m, b.state.beltTravel_m, 1e-9);
  for (const id of Object.keys(a.state.inventory_kg)) approx(a.state.inventory_kg[id], b.state.inventory_kg[id], 1e-10);
  const aDump = a.events.filter((event) => event.to === "discharge"), bDump = b.events.filter((event) => event.to === "discharge");
  assert.equal(aDump.length, bDump.length); assert.ok(aDump.length > 0);
  aDump.forEach((event, index) => approx(event.tick * DT + event.offset_s, bDump[index].tick * DT / 2 + bDump[index].offset_s, DT / 2));
});
test("fixed-seed parameter sweeps conserve inventory without changing physical IDs", () => {
  let seed = 0x7489fabc;
  for (let index = 0; index < 12; index++) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const speed = 0.1 + (seed / 2 ** 32) * 0.4, spec = beltSpec((raw) => { raw.parameters.beltBucket.feedRate.value = 0.1 + speed; });
    const result = replay(spec, initial(spec, { speed_mps: speed }), seed, DT, [], 1200);
    assert.equal(result.verdict, "passed"); approx(total(result.state.inventory_kg), total(initial(spec).inventory_kg), 1e-10);
    assert.equal(Object.keys(result.snapshot.posesByPartId).filter((id) => /^bucket\d+$/.test(id)).length, 20);
  }
});
test("browser runtime transitive module graph rejects Node, external packages and network paths", () => {
  const entry = fileURLToPath(new URL("../../fidelity/model/index.mjs", import.meta.url)), seen = new Set();
  function visit(file) {
    if (seen.has(file)) return; seen.add(file);
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|require)\s*\(/);
    assert.doesNotMatch(source, /\bimport\s*\(/);
    const imports = [...source.matchAll(/(?:\bimport\s+(?:[^;]*?\s+from\s*)?|\bexport\s+[^;]*?\s+from\s*)["']([^"']+)["']/g)].map((match) => match[1]);
    for (const dependency of imports) { assert.ok(dependency.startsWith("."), `${file}: ${dependency}`); visit(resolve(dirname(file), dependency)); }
  }
  visit(entry); assert.ok(seen.size >= 5); assert.ok(![...seen].some((file) => /\/contracts\/(?:schema|validate)\.mjs$|\/assembly\/(?:compile|geometry|index)\.mjs$/.test(file)));
});
test("public complete-coverage supplement is complete and linked without private identifiers", () => {
  const doc = readFileSync(new URL("../../docs/specs/complete-coverage.md", import.meta.url), "utf8");
  for (const token of ["ISO-01", "STATE-01", "R-10", "16.7", "17.8", "Source-deferred", "Public source register", "Completion and deferral policy"]) assert.ok(doc.includes(token));
  assert.doesNotMatch(doc, /chatgpt\.com\/(?:c|share)\/|library_file_|sediment:|\/workspace\//);
  for (const url of ["../../docs/specs/machine-fidelity.md", "../../docs/superpowers/plans/2026-10-11-machine-fidelity.md"]) assert.ok(readFileSync(new URL(url, import.meta.url), "utf8").includes("complete-coverage.md"));
});
test("clock invalid state and unrepresentable elapsed input return explicit failures", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 2), clock = createClock();
  for (const state of [null, { ...model.initialState, appliedCommandIds: null }]) {
    const result = advanceClock(clock, DT, model, state, []); assert.ok(result.diagnostics.some((entry) => entry.severity === "error")); assert.equal(result.state, state);
  }
  for (const elapsed of [-1, NaN, Infinity]) code(advanceClock(clock, elapsed, model, model.initialState, []), "INVALID_CLOCK");
});
test("replay conflicts and late initial commands cannot produce a passed result", () => {
  const spec = beltSpec();
  const conflict = replay(spec, initial(spec), 1, DT, [command("same", "start"), command("same", "stop")], 10);
  assert.equal(conflict.verdict, "failed"); assert.equal(conflict.completedTicks, 0); code(conflict, "CONFLICTING_COMMAND_ID");
  const late = replay(spec, initial(spec, { tick: 2, time_s: 2 * DT }), 1, DT, [command("late", "start")], 10);
  assert.equal(late.verdict, "failed"); code(late, "LATE_COMMAND");
});
test("pause preserves an existing slow-frame backlog and reset discards it explicitly", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 4);
  const backed = advanceClock(createClock(), 1, model, model.initialState, []);
  const paused = advanceClock({ ...backed.clock, paused: true }, 5, model, backed.state, []);
  assert.equal(paused.state.tick, 8); assert.equal(paused.clock.accumulator_s, backed.clock.accumulator_s);
  const reset = resetClock(paused.clock, model); assert.equal(reset.state.tick, 0); assert.equal(reset.clock.accumulator_s, 0);
});
test("a paused frame reports physical stepping as skipped and not evaluated", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 2);
  const result = advanceClock(createClock({ paused: true }), 1, model, model.initialState, []);
  assert.equal(result.coverage, "skipped"); assert.equal(result.verdict, "not-evaluated");
});
test("public faithful status names implemented model and keeps renderer gates explicit", () => {
  const reference = readFileSync(new URL("../../references/fidelity.md", import.meta.url), "utf8"), readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  assert.match(reference, /model\/README\.md/); assert.match(reference, /complete-coverage\.md/); assert.doesNotMatch(reference, /No domain recipe is implemented yet/);
  assert.match(readme, /model\/README\.md/); assert.doesNotMatch(readme, /No executable domain recipe/);
});
test("a backlog too large for fixed-step subtraction fails without pretending to consume time", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 1), clock = createClock();
  const result = advanceClock(clock, 1e30, model, model.initialState, []);
  assert.equal(result.state, model.initialState); code(result, "UNSUPPORTED_CLOCK_PRECISION"); assert.equal(result.verdict, "failed");
});
