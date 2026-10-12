import test from "node:test";
import assert from "node:assert/strict";
import { createModel, createClock, advanceClock, auditLedger, applyTransfer } from "../../fidelity/model/index.mjs";
import { beltSpec, initial, command, DT, code, approx } from "./model-fixtures.mjs";

for (const phase of [1e15, 1e14, -1e15]) {
  test(`R1 rejects lost or distorted no-slip phase increment at ${phase}`, () => {
    const spec = beltSpec((raw) => { raw.initialState.speed_mps = 0.5; raw.initialState.drivePhase_rad = phase; }), model = createModel(spec, initial(spec), 1);
    const result = model.step(model.initialState, [command("set-feed", "set-feed", 0, 0.4, "kg/s")], DT);
    assert.equal(result.verdict, "failed"); code(result, "UNSUPPORTED_DRIVE_PHASE_PRECISION");
    assert.equal(result.state, model.initialState); assert.deepEqual(result.events, []); assert.deepEqual(result.state.appliedCommandIds, []);
  });
  test(`R1 interpolation uses the same no-slip phase precision policy at ${phase}`, () => {
    const spec = beltSpec((raw) => { raw.initialState.speed_mps = 0.5; raw.initialState.drivePhase_rad = phase; }), model = createModel(spec, initial(spec), 1);
    const next = { ...model.initialState, tick: 1, time_s: DT, beltTravel_m: 0.5 * DT };
    assert.throws(() => model.interpolate(model.initialState, next, 0.5), (error) => error.name === "ModelError" && error.diagnostics.some((entry) => entry.code === "UNSUPPORTED_DRIVE_PHASE_PRECISION"));
  });
}
test("R1 ordinary fifteen-minute-scale phase remains supported", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec, { speed_mps: 0.5, drivePhase_rad: 2250 }), 1);
  const result = model.step(model.initialState, [], DT);
  assert.equal(result.verdict, "passed"); approx(result.state.drivePhase_rad - model.initialState.drivePhase_rad, 0.5 * DT / 0.2);
  const interpolated = model.interpolate(model.initialState, result.state, 0.25);
  approx(interpolated.drivePhase_rad - model.initialState.drivePhase_rad, 0.5 * DT * 0.25 / 0.2);
});
test("R2 positive parameter feed underflow fails rather than creating a zero event", () => {
  const spec = beltSpec((raw) => { raw.parameters.beltBucket.feedRate.value = Number.MIN_VALUE; }), model = createModel(spec, initial(spec), 1);
  const result = model.step(model.initialState, [], DT);
  assert.equal(result.verdict, "failed"); code(result, "NONREPRESENTABLE_TRANSFER"); assert.equal(result.state, model.initialState); assert.deepEqual(result.events, []);
});
test("R2 positive command feed underflow rolls back command and retains prior events", () => {
  const spec = beltSpec((raw) => { raw.parameters.beltBucket.feedRate.value = 0.4; }), model = createModel(spec, initial(spec), 1);
  const previous = model.step(model.initialState, [], DT).state;
  assert.ok(previous.lastEvents.length > 0);
  const result = model.step(previous, [command("tiny-feed", "set-feed", previous.tick, Number.MIN_VALUE, "kg/s")], DT);
  assert.equal(result.verdict, "failed"); code(result, "NONREPRESENTABLE_TRANSFER"); assert.equal(result.state, previous); assert.deepEqual(result.events, []);
  assert.ok(result.state.lastEvents.length > 0); assert.equal(result.state.commandRecords["tiny-feed"], undefined);
});
for (const inventory_kg of [{ feed: 0 }, { bucket001: 1 }]) {
  test(`R2 blocked tiny feed stays supported for ${JSON.stringify(inventory_kg)}`, () => {
    const spec = beltSpec((raw) => { raw.parameters.beltBucket.feedRate.value = Number.MIN_VALUE; }), model = createModel(spec, initial(spec, { inventory_kg }), 1);
    const result = model.step(model.initialState, [], DT);
    assert.equal(result.verdict, "passed"); assert.deepEqual(result.events, []); assert.deepEqual(result.state.inventory_kg, model.initialState.inventory_kg);
  });
}
test("R3 positive scaled elapsed underflow rejects without changing clock or state", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 1), clock = createClock({ presentationSpeed: 0.5 });
  const result = advanceClock(clock, Number.MIN_VALUE, model, model.initialState, [command("future", "start", 5)]);
  assert.equal(result.verdict, "failed"); code(result, "UNSUPPORTED_CLOCK_PRECISION"); assert.equal(result.clock, clock); assert.equal(result.state, model.initialState); assert.deepEqual(result.events, []);
});
for (const options of [{ presentationSpeed: 0 }, { presentationSpeed: 0.5, paused: true }]) {
  test(`R3 intentional time exclusion stays supported for ${JSON.stringify(options)}`, () => {
    const spec = beltSpec(), model = createModel(spec, initial(spec), 1), clock = createClock(options);
    const result = advanceClock(clock, Number.MIN_VALUE, model, model.initialState, []);
    assert.equal(result.verdict, "not-evaluated"); assert.deepEqual(result.diagnostics, []); assert.equal(result.state, model.initialState); assert.equal(result.clock.accumulator_s, 0);
  });
}
test("R3 representable substep scaled time is retained", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 1), clock = createClock({ presentationSpeed: 1 });
  const result = advanceClock(clock, Number.MIN_VALUE, model, model.initialState, []);
  assert.equal(result.clock.accumulator_s, Number.MIN_VALUE); assert.deepEqual(result.diagnostics, []); assert.equal(result.verdict, "not-evaluated");
});
for (const event of [null, {}, { id: "invalid" }]) {
  test(`R4 malformed event audit returns controlled failure for ${JSON.stringify(event)}`, () => {
    const ledger = { inventory_kg: { feed: 1, discharge: 0 }, appliedEventIds: [], eventRecords: [] }, capacities = { feed: 1, discharge: 1 }, original = structuredClone(ledger);
    const primitive = applyTransfer(ledger, event, capacities);
    assert.equal(primitive.ok, false);
    const result = auditLedger(ledger, ledger, [event], capacities);
    assert.equal(result.coverage, "executed"); assert.equal(result.verdict, "failed"); assert.deepEqual(result.diagnostics, primitive.diagnostics); assert.deepEqual(ledger, original);
    if (event?.id) assert.deepEqual(result.eventChecks, [{ id: event.id, coverage: "executed", verdict: "failed" }]);
    else assert.deepEqual(result.eventChecks, []);
  });
}

test("R5 published event order keeps causal order on exact timestamp ties, so the ledger audit accepts the published log", () => {
  // One bucket: the feed that fills it and the discharge that empties it share a timestamp in the tenth step.
  // Ordering ties by the textual event ID put "transfer:10" before "transfer:9" and the discharge before its credit.
  const spec = beltSpec((raw) => {
    const p = raw.parameters.beltBucket;
    p.bucketCount.value = 1; p.bucketPitch.value = 5; p.beltLength.value = 5; p.feedRate.value = 0.125;
    raw.parts = raw.parts.filter((entry) => !/^bucket\d+$/.test(entry.id) || entry.id === "bucket001");
    raw.frames = raw.frames.filter((entry) => !/^bucket\d+-attachment$/.test(entry.id) || entry.id === "bucket001-attachment");
    for (const key of Object.keys(raw.initialState.inventory_kg)) if (/^bucket\d+$/.test(key) && key !== "bucket001") delete raw.initialState.inventory_kg[key];
    raw.initialState.inventory_kg.feed = 10;
  });
  const start = (5 - 0.2 * Math.PI) / 2 - 1 - 9 * 0.5 / 120;
  const model = createModel(spec, initial(spec, { speed_mps: 0.5, beltTravel_m: start }), 1);
  let state = model.initialState;
  for (let step = 0; step < 9; step++) { const result = model.step(state, [], DT); assert.equal(result.verdict, "passed"); state = result.state; }
  const last = model.step(state, [], 2 + 1e-9);
  assert.equal(last.verdict, "passed");
  const tied = last.events.filter((event, index, all) => all.some((other, other_index) => other_index !== index && other.offset_s === event.offset_s && other.partId === event.partId));
  assert.ok(tied.length >= 2, "scenario must contain an exact timestamp tie");
  const sequence = (event) => Number(event.id.split(":").at(-1));
  assert.deepEqual(last.events.map(sequence), [...last.events.map(sequence)].sort((a, b) => a - b), "events are published in the order they were applied");
  const before = { inventory_kg: state.inventory_kg, appliedEventIds: [], eventRecords: [] };
  const after = { inventory_kg: last.state.inventory_kg, appliedEventIds: last.events.map((event) => event.id), eventRecords: last.events };
  const audit = auditLedger(before, after, last.events, model.recipe.capacities);
  assert.equal(audit.verdict, "passed", JSON.stringify(audit.diagnostics));
});
