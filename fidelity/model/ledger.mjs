import { plain, issue, failed, freezeData, stableStringify } from "./diagnostics.mjs";

const finiteMass = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const tolerance = (a, b) => 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
export function validateInventory(inventory, capacities) {
  const diagnostics = [];
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory) || !capacities || typeof capacities !== "object") return [issue("INVALID_INVENTORY", "/inventory_kg", "Inventory and declared compartment capacities must be records.")];
  for (const [id, mass] of Object.entries(inventory)) {
    if (!finiteMass(mass) || !Object.hasOwn(capacities, id) || !finiteMass(capacities[id]) || mass > capacities[id]) diagnostics.push(issue("INVALID_INVENTORY", `/inventory_kg/${id}`, "Mass must be finite, nonnegative and within its declared compartment capacity."));
  }
  for (const id of Object.keys(capacities)) if (!Object.hasOwn(inventory, id)) diagnostics.push(issue("MISSING_COMPARTMENT", `/inventory_kg/${id}`, "Every declared compartment must have explicit inventory."));
  const total = Object.values(inventory).reduce((sum, mass) => sum + mass, 0);
  if (!Number.isFinite(total)) diagnostics.push(issue("NONFINITE_INVENTORY_TOTAL", "/inventory_kg", "Total inventory must be representable."));
  return diagnostics;
}
function validateRecords(ledger) {
  const diagnostics = [], ids = ledger.appliedEventIds, records = ledger.eventRecords;
  if (!Array.isArray(ids) || !Array.isArray(records) || ids.length !== records.length) return [issue("INVALID_EVENT_HISTORY", "/eventRecords", "Ledger IDs and event records must correspond one-to-one.")];
  const seen = new Set();
  ids.forEach((id, index) => {
    if (typeof id !== "string" || records[index]?.id !== id) diagnostics.push(issue("INVALID_EVENT_HISTORY", `/eventRecords/${index}`, "The recorded event must match its immutable registered ID.", { eventId: id }));
    if (seen.has(id)) diagnostics.push(issue("DUPLICATE_TRANSFER_ID", `/eventRecords/${index}`, "A transfer ID may occur only once.", { eventId: id }));
    seen.add(id);
  });
  return diagnostics;
}
export function applyTransfer(ledger, event, capacities) {
  try { plain(ledger); plain(event); plain(capacities); } catch (error) { return { ok: false, diagnostics: error.diagnostics }; }
  const diagnostics = [...validateInventory(ledger?.inventory_kg, capacities), ...validateRecords(ledger ?? {})];
  const details = { eventId: event?.id, ...(event?.partId ? { partId: event.partId } : {}), sourceIds: event?.sourceIds ?? [] };
  const invalid = (code, message) => diagnostics.push(issue(code, "/event", message, details));
  if (!event || typeof event.id !== "string" || event.id.length === 0 || !Number.isSafeInteger(event.tick) || event.tick < 0 || !Number.isFinite(event.offset_s) || event.offset_s < 0 || !Array.isArray(event.sourceIds) || event.sourceIds.some((id) => typeof id !== "string")) invalid("INVALID_TRANSFER", "Transfers require a stable ID, tick, finite offset and source IDs.");
  if (ledger?.appliedEventIds?.includes(event?.id)) invalid("DUPLICATE_TRANSFER_ID", "This atomic transfer ID was already applied.");
  if (!finiteMass(event?.amount_kg) || event.amount_kg === 0) invalid("INVALID_TRANSFER_AMOUNT", "Transferred mass must be finite and strictly positive.");
  if (event?.from === event?.to || !Object.hasOwn(ledger?.inventory_kg ?? {}, event?.from) || !Object.hasOwn(ledger?.inventory_kg ?? {}, event?.to)) invalid("INVALID_TRANSFER_ENDPOINT", "Transfer endpoints must be two distinct registered compartments.");
  if (failed(diagnostics)) return { ok: false, diagnostics };
  const from = ledger.inventory_kg[event.from] - event.amount_kg, to = ledger.inventory_kg[event.to] + event.amount_kg;
  if (from < 0) invalid("TRANSFER_OVERDRAW", "The source has insufficient inventory.");
  if (!Number.isFinite(to) || to > capacities[event.to]) invalid("TRANSFER_OVERFILL", "The destination has insufficient declared capacity.");
  if (from === ledger.inventory_kg[event.from] || to === ledger.inventory_kg[event.to]) invalid("NONREPRESENTABLE_TRANSFER", "A positive transfer must change both stored compartment values.");
  const debit = ledger.inventory_kg[event.from] - from, credit = to - ledger.inventory_kg[event.to];
  if (Math.abs(debit - credit) > tolerance(debit, credit)) invalid("TRANSFER_CONSERVATION", "Atomic debit and credit must agree within the synthetic numerical criterion.");
  if (failed(diagnostics)) return { ok: false, diagnostics };
  return { ok: true, value: freezeData({ inventory_kg: { ...ledger.inventory_kg, [event.from]: from, [event.to]: to }, appliedEventIds: [...ledger.appliedEventIds, event.id], eventRecords: [...ledger.eventRecords, structuredClone(event)] }), diagnostics };
}
export function auditLedger(before, after, events, capacities) {
  const diagnostics = [];
  try { plain(before); plain(after); plain(events); plain(capacities); } catch (error) { return { coverage: "executed", verdict: "failed", diagnostics: error.diagnostics, eventChecks: [] }; }
  diagnostics.push(...validateInventory(before?.inventory_kg, capacities), ...validateInventory(after?.inventory_kg, capacities), ...validateRecords(before ?? {}), ...validateRecords(after ?? {}));
  const eventChecks = [];
  let expected = before;
  if (!Array.isArray(events)) diagnostics.push(issue("INVALID_TRANSFER_HISTORY", "/events", "Audit requires the actual ordered atomic events."));
  if (!failed(diagnostics)) for (const event of events) {
    const result = applyTransfer(expected, event, capacities);
    if (typeof event?.id === "string" && event.id.length > 0) eventChecks.push({ id: event.id, coverage: "executed", verdict: result.ok ? "passed" : "failed" });
    diagnostics.push(...result.diagnostics);
    if (!result.ok) break;
    expected = result.value;
  }
  if (!failed(diagnostics)) {
    for (const [id, mass] of Object.entries(expected.inventory_kg)) if (Math.abs(after.inventory_kg[id] - mass) > tolerance(after.inventory_kg[id], mass)) diagnostics.push(issue("LEDGER_COMPARTMENT_MISMATCH", `/inventory_kg/${id}`, "Recorded atomic transfers do not explain this compartment's debit/credit.", { eventId: [...events].reverse().find((event) => event.from === id || event.to === id)?.id ?? events.at(-1)?.id }));
    if (stableStringify(after.appliedEventIds) !== stableStringify(expected.appliedEventIds) || stableStringify(after.eventRecords) !== stableStringify(expected.eventRecords)) diagnostics.push(issue("LEDGER_EVENT_HISTORY_MISMATCH", "/eventRecords", "Event IDs and complete records must match the applied atomic sequence."));
    const totalBefore = Object.values(before.inventory_kg).reduce((a, b) => a + b, 0), totalAfter = Object.values(after.inventory_kg).reduce((a, b) => a + b, 0);
    if (Math.abs(totalAfter - totalBefore) > tolerance(totalAfter, totalBefore)) diagnostics.push(issue("LEDGER_MASS_MISMATCH", "/inventory_kg", "Closed ledger total mass is not conserved."));
  }
  return freezeData({ coverage: "executed", verdict: failed(diagnostics) ? "failed" : "passed", diagnostics, eventChecks });
}
