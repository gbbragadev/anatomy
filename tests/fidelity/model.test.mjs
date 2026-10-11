import test from "node:test";
import assert from "node:assert/strict";
import { createModel } from "../../fidelity/model/index.mjs";
import { beltSpec, rawBelt, initial, command, DT, C, approx, code, bucketIds, total } from "./model-fixtures.mjs";
import { composePose } from "../../fidelity/assembly/frames.mjs";

function run(model, ticks, commands = []) {
  let state = model.initialState, events = [];
  for (let tick = 0; tick < ticks; tick++) {
    const result = model.step(state, commands.filter((entry) => entry.tick === state.tick), DT);
    assert.equal(result.diagnostics.some((entry) => entry.severity === "error"), false, JSON.stringify(result.diagnostics));
    state = result.state; events.push(...result.events);
  }
  return { state, events };
}
test("twelve steady steps give 0.05 m travel and 0.25 rad no-slip phase", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec, { speed_mps: 0.5 }), 7);
  const result = run(model, 12); approx(result.state.beltTravel_m, 0.05); approx(result.state.drivePhase_rad, 0.25);
  approx(result.state.time_s, 0.1); assert.equal(result.state.tick, 12); assert.equal(result.events.length, 0);
});
test("20 physical IDs including bucket007 persist over ten laps and input reorder", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec, { speed_mps: 0.5 }), 7);
  for (let lap = 0; lap <= 10; lap++) {
    const snapshot = model.snapshot({ ...model.initialState, beltTravel_m: lap * 5, drivePhase_rad: lap * 25 });
    assert.equal(bucketIds.filter((id) => Object.hasOwn(snapshot.posesByPartId, id)).length, 20);
    assert.deepEqual(snapshot.posesByPartId.bucket007, model.snapshot(model.initialState).posesByPartId.bucket007);
  }
  const reordered = structuredClone(spec); reordered.parts.reverse(); reordered.frames.reverse(); reordered.joints.reverse();
  assert.deepEqual(createModel(reordered, initial(spec, { speed_mps: 0.5 }), 7).snapshot(model.initialState), model.snapshot(model.initialState));
});
test("mounting offset and descendants are derived once from path attachment", () => {
  const spec = beltSpec((raw) => { raw.parts.push({ ...structuredClone(raw.parts.find((part) => part.id === "bucket007")), id: "bucket007-label", parentId: "bucket007", localRest: { position: [0.03, 0, 0], rotation_xyzw: [0, 0, 0, 1] } }); });
  const model = createModel(spec, initial(spec), 9), snapshot = model.snapshot(model.initialState);
  approx(snapshot.posesByPartId.bucket007.position[0], 0.2); approx(snapshot.posesByPartId.bucket007.position[1], -0.02); approx(snapshot.posesByPartId.bucket007.position[2], 1.5);
  assert.deepEqual(snapshot.posesByPartId["bucket007-label"], composePose(snapshot.posesByPartId.bucket007, { position: [0.03, 0, 0], rotation_xyzw: [0, 0, 0, 1] }));
  const mount = spec.frames.find((frame) => frame.id === "bucket007-attachment");
  approx(composePose(snapshot.posesByPartId.bucket007, mount.pose).position[1], 0);
});
test("snapshot is immutable, world-unit readouts and derived joint poses share one state", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec, { speed_mps: 0.5 }), 7), state = run(model, 12).state, snapshot = model.snapshot(state);
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.posesByPartId.bucket007));
  assert.throws(() => { snapshot.inventory_kg.bucket007 = 99; });
  assert.equal(snapshot.version, 12); assert.equal(snapshot.readouts.speed.unit, "m/s"); approx(snapshot.readouts.driveSpeed.value, 2.5);
  const head = snapshot.posesByPartId["head-pulley"].rotation_xyzw; approx(head[1], -Math.sin(0.125));
  assert.deepEqual(snapshot.posesByPartId["tail-pulley"].rotation_xyzw, head);
});
test("start acceleration and stop deceleration integrate exact ramp then hold", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 7);
  const started = run(model, 120, [command("start", "start")]); approx(started.state.speed_mps, 0.5); approx(started.state.beltTravel_m, 0.25);
  let state = started.state;
  for (let index = 0; index < 120; index++) state = model.step(state, index === 0 ? [command("stop", "stop", state.tick)] : [], DT).state;
  approx(state.speed_mps, 0); approx(state.beltTravel_m, 0.5);
  const held = model.step(state, [], DT).state; assert.equal(held.beltTravel_m, state.beltTravel_m);
});
test("same-tick command order is stable ID; duplicate IDs are idempotent; conflicting reuse fails", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 1), start = command("a", "start"), stop = command("z", "stop");
  const a = model.step(model.initialState, [stop, start, start], DT), b = model.step(model.initialState, [start, stop], DT);
  assert.deepEqual(a.state, b.state); assert.deepEqual(a.state.appliedCommandIds, ["a", "z"]); assert.equal(a.state.speed_mps, 0);
  const duplicate = model.step(a.state, [start], DT); assert.equal(duplicate.state.tick, 2);
  const conflict = model.step(a.state, [command("a", "stop")], DT); code(conflict, "CONFLICTING_COMMAND_ID"); assert.equal(conflict.state, a.state);
});
test("late, future, reverse, excessive speed, wrong units and presentation commands fail atomically", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 1), state = model.step(model.initialState, [], DT).state;
  for (const entry of [command("late", "start", 0), command("future", "start", 2), command("reverse", "set-speed", 1, -0.1, "m/s"), command("fast", "set-speed", 1, 0.51, "m/s"), command("unit", "set-feed", 1, 1, "g/s"), command("pause", "pause", 1)]) {
    const result = model.step(state, [entry], DT); assert.equal(result.state, state); assert.ok(result.diagnostics.some((d) => d.severity === "error"));
  }
});
test("canonical prerequisites, missing binding and unknown quantities fail clearly", () => {
  assert.throws(() => createModel(rawBelt(), rawBelt().initialState, 1));
  const spec = beltSpec();
  for (const mutate of [(s) => { s.parameters.beltBucket.speed.value = null; }, (s) => { s.parts = s.parts.filter((p) => p.id !== "bucket007"); }, (s) => { s.frame.unit = "mm"; }]) {
    const broken = structuredClone(spec); mutate(broken); assert.throws(() => createModel(broken, initial(spec), 1));
  }
  assert.throws(() => createModel(spec, initial(spec, { speed_mps: -0.1 }), 1));
});
test("all analytic crossings are ordered by time then physical ID, including seam", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec, { speed_mps: 0.5, beltTravel_m: 4.999, inventory_kg: { bucket001: 0.8, bucket007: 0.8 } }), 3);
  const result = model.step(model.initialState, [], 20);
  assert.ok(result.events.length > 0); assert.equal(new Set(result.events.map((event) => event.id)).size, result.events.length);
  for (let i = 1; i < result.events.length; i++) assert.ok(result.events[i].offset_s >= result.events[i - 1].offset_s);
  approx(total(result.state.inventory_kg), total(model.initialState.inventory_kg), 1e-10);
  const repeat = model.step(result.state, [], DT); assert.ok(repeat.events.every((event) => !result.state.appliedEventIds.includes(event.id)));
});
test("feed interruption, bucket capacity and full-receiver backpressure preserve material", () => {
  const spec = beltSpec((raw) => { raw.parameters.beltBucket.feedRate.value = 0.8; }), model = createModel(spec, initial(spec, { speed_mps: 0.5, inventory_kg: { discharge: 2, bucket007: 0.8 } }), 4);
  const a = run(model, 12); assert.ok(a.state.inventory_kg.bucket001 > 0);
  const interrupted = model.step(a.state, [command("feed-off", "set-feed", 12, 0, "kg/s")], DT);
  approx(interrupted.state.inventory_kg.feed, a.state.inventory_kg.feed);
  const resumed = model.step(interrupted.state, [command("feed-on", "set-feed", 13, 0.8, "kg/s")], DT);
  assert.ok(resumed.state.inventory_kg.feed < interrupted.state.inventory_kg.feed);
  let state = resumed.state;
  for (let i = 0; i < 200; i++) state = model.step(state, [], DT).state;
  assert.equal(state.inventory_kg.discharge, 2); assert.equal(state.inventory_kg.bucket007, 0.8);
  assert.ok(bucketIds.every((id) => state.inventory_kg[id] <= 1)); approx(total(state.inventory_kg), total(model.initialState.inventory_kg), 1e-10);
});
test("loaded stop/resume retains inventory and command history", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec, { speed_mps: 0.5, inventory_kg: { bucket007: 0.8 } }), 4);
  let state = model.step(model.initialState, [command("stop", "stop")], DT).state;
  for (let i = 0; i < 150; i++) state = model.step(state, [], DT).state;
  assert.equal(state.speed_mps, 0); approx(state.inventory_kg.bucket007, 0.8);
  const resumed = model.step(state, [command("resume", "start", state.tick)], DT).state;
  assert.ok(resumed.speed_mps > 0); assert.deepEqual(resumed.appliedCommandIds, ["stop", "resume"]);
});
test("interpolation follows accumulated travel across seam and keeps next inventory discrete", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec, { speed_mps: 0.5, beltTravel_m: 4.999 }), 4), previous = model.initialState;
  const next = model.step(previous, [], DT).state, snapshot = model.interpolate(previous, next, 0.5);
  approx(snapshot.beltTravel_m, (previous.beltTravel_m + next.beltTravel_m) / 2);
  assert.deepEqual(snapshot.inventory_kg, next.inventory_kg); assert.equal(snapshot.tick, next.tick);
  const direct = model.snapshot({ ...next, beltTravel_m: snapshot.beltTravel_m, drivePhase_rad: snapshot.drivePhase_rad, speed_mps: snapshot.speed_mps, time_s: snapshot.time_s });
  assert.deepEqual(snapshot.posesByPartId, direct.posesByPartId);
  for (const alpha of [-0.1, 1.1, NaN]) assert.throws(() => model.interpolate(previous, next, alpha));
});
for (const [name, mutate] of [["axis-frame", (s) => { s.joints[0].axisIn = "world"; }], ["limits", (s) => { s.joints[0].limits = { min: 1, max: 0 }; }], ["constraint-members", (s) => { s.constraints[0].jointIds = null; }]]) {
  test(`unvalidated ${name} fails with controlled ModelError diagnostics`, () => {
    const spec = beltSpec(), broken = structuredClone(spec); mutate(broken);
    assert.throws(() => createModel(broken, initial(spec), 1), (error) => error.name === "ModelError" && Array.isArray(error.diagnostics));
  });
}
test("missing initial inventory fails with controlled ModelError diagnostics", () => {
  const spec = beltSpec();
  assert.throws(() => createModel(spec, { ...initial(spec), inventory_kg: null }, 1), (error) => error.name === "ModelError");
});
test("arbitrary safe command IDs cannot collide with inherited object keys", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 5);
  const result = model.step(model.initialState, [command("constructor", "start"), command("__proto__", "set-feed", 0, 0.2, "kg/s")], DT);
  assert.equal(result.state.tick, 1, JSON.stringify(result.diagnostics)); assert.deepEqual(result.state.appliedCommandIds, ["__proto__", "constructor"]);
  assert.equal(Object.hasOwn(result.state.commandRecords, "__proto__"), true);
});
test("interpolation derives dependent drive phase from travel rather than an independent angle lerp", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec, { speed_mps: 0.5 }), 3), previous = model.initialState, next = model.step(previous, [], DT).state;
  const snapshot = model.interpolate(previous, { ...next, drivePhase_rad: 2 }, 0.5);
  approx(snapshot.drivePhase_rad, snapshot.beltTravel_m / 0.2);
});
test("pulley radius, neutral radius and nonzero mount rotation remain distinct", () => {
  const spec = beltSpec((raw) => {
    raw.parameters.beltBucket.headRadius.value = 0.25; raw.parameters.beltBucket.attachmentOffset.value = 0.03;
    raw.frames.find((frame) => frame.id === "bucket001-attachment").pose.rotation_xyzw = [0, 0, Math.sin(0.2), Math.cos(0.2)];
  });
  const model = createModel(spec, initial(spec, { speed_mps: 0.5 }), 2), state = run(model, 12).state;
  approx(state.beltTravel_m, 0.05); approx(state.drivePhase_rad, 0.2);
  const snapshot = model.snapshot(model.initialState), mount = spec.frames.find((frame) => frame.id === "bucket001-attachment").pose;
  const attachment = composePose(snapshot.posesByPartId.bucket001, mount); approx(attachment.position[0], 0.23); approx(attachment.position[1], 0); approx(attachment.rotation_xyzw[3], 1);
});
test("filled bucket and exhausted feed block transfers without overfill", () => {
  const spec = beltSpec((raw) => { raw.parameters.beltBucket.feedRate.value = 1; });
  for (const inventory_kg of [{ bucket001: 1 }, { feed: 0 }]) {
    const model = createModel(spec, initial(spec, { inventory_kg }), 3), result = model.step(model.initialState, [], DT);
    assert.equal(result.state.tick, 1); assert.equal(result.events.length, 0); assert.deepEqual(result.state.inventory_kg, model.initialState.inventory_kg);
  }
});
test("step results distinguish executed validation coverage from verdict", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 2);
  const passed = model.step(model.initialState, [], DT), rejected = model.step(model.initialState, [command("bad", "set-speed", 0, -1, "m/s")], DT);
  assert.equal(passed.coverage, "executed"); assert.equal(passed.verdict, "passed"); assert.equal(rejected.coverage, "executed"); assert.equal(rejected.verdict, "failed");
});
for (const name of ["lastEvents", "appliedEventIds"]) {
  test(`invalid ${name} snapshot metadata fails with controlled diagnostics`, () => {
    const spec = beltSpec(), model = createModel(spec, initial(spec), 7);
    assert.throws(() => model.snapshot({ ...model.initialState, [name]: null }), (error) => error.name === "ModelError");
  });
}
test("a step checks canonical joint limits before publishing transferred state", () => {
  const spec = beltSpec((raw) => { raw.joints.find((entry) => entry.id === "head-shaft").limits = { min: -0.1, max: 0.1 }; }), model = createModel(spec, initial(spec, { speed_mps: 0.5 }), 1);
  let state = model.initialState;
  for (let index = 0; index < 4; index++) state = model.step(state, [], DT).state;
  const result = model.step(state, [], DT); assert.equal(result.state, state); code(result, "JOINT_LIMIT_EXCEEDED"); assert.equal(result.events.length, 0);
});
for (const collection of ["parts", "frames", "joints", "constraints"]) {
  test(`malformed ${collection} runtime entries fail before executable hydration`, () => {
    const spec = beltSpec(), broken = structuredClone(spec); broken[collection].push(null);
    assert.throws(() => createModel(broken, initial(spec), 1), (error) => error.name === "ModelError");
  });
}
test("enormous bucket count fails a declared hydration work bound", () => {
  const spec = beltSpec(), broken = structuredClone(spec), parameters = broken.parameters.beltBucket;
  parameters.bucketCount.value = 1e9; parameters.beltLength.value = 1e9 * 0.25; parameters.centerDistance.value = (parameters.beltLength.value - 2 * Math.PI * 0.2) / 2;
  assert.throws(() => createModel(broken, initial(spec), 1), (error) => error.name === "ModelError");
});
test("a rounded quaternion with nonzero tilt cannot masquerade as a drive-aligned frame", () => {
  const spec = beltSpec((raw) => {
    const rotation = [5e-9, 0, 0, 1];
    raw.joints.find((entry) => entry.id === "head-shaft").parentFrame.rotation_xyzw = rotation;
    raw.parts.find((entry) => entry.id === "head-pulley").localRest.rotation_xyzw = rotation;
  });
  assert.throws(() => createModel(spec, initial(spec), 1), (error) => error.name === "ModelError");
});
test("initial drive coordinate must satisfy canonical joint limits", () => {
  const spec = beltSpec((raw) => { raw.joints.find((entry) => entry.id === "head-shaft").limits = { min: -0.1, max: 0.1 }; });
  assert.throws(() => createModel(spec, initial(spec, { drivePhase_rad: 1 }), 1), (error) => error.name === "ModelError" && error.diagnostics.some((entry) => entry.code === "JOINT_LIMIT_EXCEEDED"));
});
test("atomic transfer failure preserves prior inventory, events and command history", () => {
  const spec = beltSpec((raw) => { raw.parameters.beltBucket.feedRate.value = 0.4; }), model = createModel(spec, initial(spec, { speed_mps: 0.5 }), 4), previous = run(model, 12).state;
  assert.ok(previous.lastEvents.length > 0);
  const result = model.step(previous, [command("tiny-feed", "set-feed", previous.tick, 1e-300, "kg/s")], DT);
  assert.equal(result.state, previous); code(result, "NONREPRESENTABLE_TRANSFER"); assert.equal(result.events.length, 0); assert.ok(result.state.lastEvents.length > 0); assert.equal(result.state.appliedCommandIds.includes("tiny-feed"), false);
});
test("a positive motion that underflows cannot silently publish a zero-travel step", () => {
  const spec = beltSpec(), model = createModel(spec, initial(spec), 1);
  const result = model.step(model.initialState, [command("start", "start")], Number.MIN_VALUE);
  assert.equal(result.state, model.initialState); assert.equal(result.verdict, "failed"); code(result, "UNSUPPORTED_MOTION_PRECISION");
});
