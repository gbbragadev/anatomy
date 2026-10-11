import test from "node:test";
import assert from "node:assert/strict";
import { applyTransfer, auditLedger } from "../../fidelity/model/ledger.mjs";
import { approx, code, total } from "./model-fixtures.mjs";

const before = () => ({ inventory_kg: { feed: 5, bucket007: 0.8, discharge: 1.2, output: 0, return: 0, losses: 0 }, appliedEventIds: [], eventRecords: [] });
const transfer = (id = "stimulus007") => ({ id, tick: 12, offset_s: 0.002, from: "bucket007", to: "discharge", amount_kg: 0.2, partId: "bucket007", sourceIds: ["E0"] });
const capacities = { feed: 20, bucket007: 1, discharge: 2, output: 20, return: 20, losses: 20 };
test("one atomic 0.20 kg stimulus debits 0.80 to 0.60 and credits 1.20 to 1.40", () => {
  const initial = before(), event = transfer(), applied = applyTransfer(initial, event, capacities);
  assert.equal(applied.ok, true); approx(applied.value.inventory_kg.bucket007, 0.6); approx(applied.value.inventory_kg.discharge, 1.4);
  assert.deepEqual(initial, before()); assert.deepEqual(applied.value.appliedEventIds, [event.id]);
  assert.equal(auditLedger(initial, applied.value, [event], capacities).verdict, "passed");
});
test("lost debit or credit fails at the named event", () => {
  for (const compartment of ["bucket007", "discharge"]) {
    const applied = applyTransfer(before(), transfer(), capacities).value;
    const broken = structuredClone(applied); broken.inventory_kg[compartment] = before().inventory_kg[compartment];
    const check = auditLedger(before(), broken, [transfer()], capacities);
    assert.equal(check.verdict, "failed"); code(check, "LEDGER_COMPARTMENT_MISMATCH");
    assert.ok(check.diagnostics.some((entry) => entry.eventId === "stimulus007"));
  }
});
test("duplicate atomic ID fails with no second debit or credit", () => {
  const once = applyTransfer(before(), transfer(), capacities).value;
  const repeated = applyTransfer(once, transfer(), capacities);
  assert.equal(repeated.ok, false); code(repeated, "DUPLICATE_TRANSFER_ID"); assert.equal(repeated.value, undefined);
  assert.equal(auditLedger(before(), once, [transfer(), transfer()], capacities).verdict, "failed");
});
test("duplicate credit hidden by compensating loss still fails compartment audit", () => {
  const once = applyTransfer(before(), transfer(), capacities).value;
  const broken = structuredClone(once); broken.inventory_kg.discharge += 0.2; broken.inventory_kg.feed -= 0.2;
  approx(total(broken.inventory_kg), total(before().inventory_kg));
  assert.equal(auditLedger(before(), broken, [transfer()], capacities).verdict, "failed");
});
test("overdraw, overfill, same endpoint, unknown endpoint and invalid amount are atomic failures", () => {
  for (const patch of [{ amount_kg: 0.9 }, { amount_kg: -0.1 }, { amount_kg: NaN }, { amount_kg: 0 }, { to: "bucket007" }, { to: "absent" }, { from: "absent" }]) assert.equal(applyTransfer(before(), { ...transfer(), ...patch }, capacities).ok, false);
  assert.equal(applyTransfer(before(), transfer(), { ...capacities, discharge: 1.3 }).ok, false);
});
test("event record uniqueness remains independent of globally balanced totals", () => {
  const once = applyTransfer(before(), transfer(), capacities).value;
  const broken = structuredClone(once); broken.appliedEventIds.push(transfer().id); broken.eventRecords.push(transfer());
  const check = auditLedger(before(), broken, [transfer()], capacities);
  assert.equal(check.coverage, "executed"); assert.equal(check.verdict, "failed"); code(check, "DUPLICATE_TRANSFER_ID");
});
