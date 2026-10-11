import type { MachineSpec, ModelState, Command, Diagnostic, Pose, Coverage, Verdict, Result } from "../contracts/types.d.ts";
export interface TransferEvent {
  id: string;
  tick: number;
  offset_s: number;
  from: string;
  to: string;
  amount_kg: number;
  partId?: string;
  sourceIds: string[];
}
export interface RuntimeModelState extends ModelState {
  running: boolean;
  targetSpeed_mps: number;
  feedRate_kgps: number;
  processRngState: number;
  eventSequence: number;
  commandRecords: Record<string, Command>;
  appliedEventIds: string[];
  lastEvents: TransferEvent[];
}
export interface Readout { value: number; unit: "m" | "s" | "kg" | "m/s" | "rad/s" | "kg/s" }
export interface Snapshot {
  version: number;
  tick: number;
  time_s: number;
  beltTravel_m: number;
  speed_mps: number;
  drivePhase_rad: number;
  inventory_kg: Record<string, number>;
  posesByPartId: Record<string, Pose>;
  readouts: Record<string, Readout>;
  eventRefs: string[];
  events: TransferEvent[];
  sourceIds: string[];
}
export interface StepResult {
  coverage: Coverage;
  verdict: Verdict;
  state: RuntimeModelState;
  events: TransferEvent[];
  diagnostics: Diagnostic[];
}
export interface Model {
  readonly initialState: RuntimeModelState;
  readonly seed: number;
  step(state: RuntimeModelState, commands: Command[], dt: number): StepResult;
  snapshot(state: RuntimeModelState): Snapshot;
  interpolate(previous: RuntimeModelState, next: RuntimeModelState, alpha: number): Snapshot;
  reset(): RuntimeModelState;
}
export interface Clock {
  dt_s: number;
  accumulator_s: number;
  paused: boolean;
  presentationSpeed: number;
  pendingCommands: Command[];
}
export interface ClockOptions { dt_s?: number; paused?: boolean; presentationSpeed?: number }
export interface ClockResult extends StepResult { clock: Clock }
export interface ReplayResult extends StepResult {
  completedTicks: number;
  snapshot: Snapshot;
  hash: string;
}
export interface Ledger {
  inventory_kg: Record<string, number>;
  appliedEventIds: string[];
  eventRecords: TransferEvent[];
}
export interface LedgerCheck {
  coverage: "executed";
  verdict: "passed" | "failed";
  diagnostics: Diagnostic[];
  eventChecks: { id: string; coverage: "executed"; verdict: "passed" | "failed" }[];
}
export declare class ModelError extends Error { constructor(diagnostics: Diagnostic[]); diagnostics: Diagnostic[] }
export declare function createModel(spec: MachineSpec, initialState: ModelState, seed: number): Model;
export declare function createClock(options?: ClockOptions): Clock;
export declare function advanceClock(clock: Clock, elapsedSeconds: number, model: Model, state: RuntimeModelState, commands?: Command[]): ClockResult;
export declare function resetClock(clock: Clock, model: Model): { clock: Clock; state: RuntimeModelState; events: TransferEvent[]; diagnostics: Diagnostic[] };
export declare function replay(spec: MachineSpec, initialState: ModelState, seed: number, dt: number, commands: Command[], ticks: number): ReplayResult;
export declare function applyTransfer(ledger: Ledger, event: TransferEvent, capacities: Record<string, number>): Result<Ledger>;
export declare function auditLedger(before: Ledger, after: Ledger, events: TransferEvent[], capacities: Record<string, number>): LedgerCheck;
