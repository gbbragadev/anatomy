# Deterministic belt model 0.1.0

The single runtime implementation is `fidelity/model/index.mjs`. It is browser-pure ESM: no Node built-ins, Ajv, network calls, DOM, camera, particles, renderer or second clock. `fidelity/index.mjs` also re-exports its APIs for Node build callers, but that top-level entry imports Node validation/geometry dependencies and must not be used as the browser runtime entry.

## Build/runtime boundary

Build callers first run `validateMachine(raw)` and `compileAssembly(canonicalSpec)` and reject either failure. Ship the resulting canonical `MachineSpec` as data and import `createModel` from the runtime entry. Runtime preconditions check canonical SI markers, required known parameters, physical IDs, local frames, joints, parent topology and supported analytic constraints; they do not authenticate the canonical hash or repeat JSON Schema, source/evidence, geometry compilation or asset ingestion. A forged marker is not proof of validation. No source unit conversion occurs in the runtime.

The recipe creates a small kinematic table from normalized physical parts and owned frames/joints. It preserves the same physical parent semantics and calls the existing browser-pure `resolvePoses` directly. Bucket path coordinates replace only the recipe-owned bucket local pose. Every mount uses `pathAttachment * inverse(bucketAttachment)` and descendants are resolved through the same canonical tree; drive and ratio coordinates use the existing joint equation. Closure solving is explicitly unsupported.

The transitive-module regression walks the runtime imports and rejects Node built-ins, external packages, dynamic imports and network APIs. This is module-boundary evidence, not executed browser coverage. Actual browser execution and render-readiness capture remain later renderer gates.

## Interfaces

- `createModel(spec, initialState, seed)` returns an immutable Model, or throws `ModelError` with diagnostics for unsupported/invalid construction input.
- `model.step(state, commands, dt)` returns `{coverage, verdict, state, events, diagnostics}`. Rejected steps preserve the exact input state and emit no transfers. The runtime supports finite positive step durations; normal use fixes `dt=1/120 s` through the clock/replay runner.
- `model.snapshot(state)` returns deeply immutable world poses, tick version, unit-bearing readouts, tick-discrete inventory and current tick event references.
- `model.interpolate(previous, next, alpha)` interpolates accumulated travel, time and speed, derives dependent no-slip drive phase from travel, and resolves world poses again. Next-tick inventory and event references stay discrete. Snapshot version is the physical tick, not an interpolation/cache key: renderers must also respond to presentation alpha.
- `createClock({dt_s, paused, presentationSpeed})` and `advanceClock(clock, elapsedSeconds, model, state, commands)` queue future commands, run at most eight fixed steps per frame, and retain all remaining backlog. `CLOCK_BACKLOG` reports queued seconds. Paused wall time is deliberately excluded; already accumulated backlog is retained. A frame with no physical step is skipped/not-evaluated for stepping.
- `resetClock(clock, model)` clears queued commands/backlog and returns the original immutable initial process state and seed. Pause/reset/presentation speed are clock controls, never process commands.
- `replay(spec, initialState, seed, dt, commands, ticks)` applies a canonical command sequence at exact ticks and returns final state/snapshot, the full ordered event log, completion coverage, verdict, diagnostics and a reproducibility checksum. Rejected/incomplete runs are never passed.
- `applyTransfer(ledger, event, capacities)` atomically debits and credits once or returns diagnostics with no partial ledger. `auditLedger(before, after, events, capacities)` separately checks event IDs/history, every compartment and global mass.

Declarations are in `types.d.ts`, re-exported by the package's contract declarations. All additions preserve the previous public APIs.

## Process state and identity

The contract's required `ModelState` fields remain unchanged. Runtime state adds running/setpoint/feed channels, canonical `commandRecords`, unsigned-32-bit `processRngState`, monotonically increasing `eventSequence`, and latest-tick `appliedEventIds`/`lastEvents`. Recipe buckets omitted from an initial contract inventory mean explicitly empty recipe compartments and are initialized to zero; feed, discharge, output, return and losses must already be declared. Unknown quantities are rejected, never filled with zero.

Command types are start, stop, set-speed and set-feed. Values use `m/s` or `kg/s`. Unapplied late commands fail; an identical retransmission of an applied ID is idempotent, and conflicting reuse fails. Same-tick commands run in lexical ID order, including IDs that match inherited JavaScript property names. Set-speed changes the running setpoint; start/stop control motion with explicit acceleration/deceleration.

Transfer IDs include machine ID and an exact monotonically increasing sequence; each event has its source tick, within-step offset, endpoints, amount and physical bucket/source IDs. The standalone ledger retains its complete IDs/records and rejects duplicate IDs. The model retains only latest-tick events plus its lifetime sequence; callers collect the returned events for the full run audit, as replay does. This avoids an ever-growing event history in each immutable physical snapshot without losing returned events.

The recipe presently uses no random process draws and no visual randomness. Seed remains part of reset/replay identity. Future visual random effects need a separate stream and cannot use process RNG or particle count to change inventory. The checksum is a pair of deterministic 32-bit FNV-style accumulators, explicitly not a cryptographic hash or authenticity claim. The validated canonical source hash remains separate.

## Numerical scope

Fixture criteria are synthetic numerical tests, not manufacturing or operational tolerances. Twelve steady steps give `0.05 m` and `0.25 rad` within `1e-12`; dt/2 convergence requires travel `1e-9 m`, each ledger compartment `1e-10 kg`, and matching discharge event time within one fine step. Step and interpolation phase increments must remain nonzero for nonzero travel and agree with `travel / headRadius` within `1e-12 * max(1, |increment|)` radians; unsupported accumulated phase precision fails explicitly. Ledger internal arithmetic checks use `1e-12 * max(1, |expected|, |observed|)` kilograms. Positive unblocked feed that underflows to zero, or a positive transfer that cannot change both stored masses, fails explicitly.

Ramp endpoints and analytically located crossing times within `dt*1e-12` of a tick boundary snap to that boundary to prevent fictitious sub-ULP feed intervals. Clock step eligibility permits the same relative accumulator rounding bound and clamps only a subtraction residual below that bound. Positive elapsed time multiplied by positive presentation speed must remain representable; intentional zero speed and paused wall-time exclusion remain supported. No complete physical step or clock backlog is discarded. Nonrepresentable motion/time/event identity and unsupported huge crossing ranges fail explicitly. Runtime hydration supports at most 1,024 physical bucket attachments, rejecting larger counts before allocation. The path supports at most 100,001 crossings per supplied zone in one request; this is a computational bound.

Run `node --test tests/fidelity/{belt-path,model,ledger,replay,model-review-regressions}.test.mjs` and then `npm --prefix fidelity test`.

## Limits

All recipe dimensions, motion and process policies are E0 assumptions. Passing internal consistency tests does not establish real-machine dimensions, calibrated capacity/discharge, fit, wear, safety or operational behavior. See the [recipe assumptions](../../recipes/belt-bucket/README.md) and [complete requirements supplement](../../docs/specs/complete-coverage.md). No renderer, browser demonstration, image comparison, qualified mechanical review or actual-device performance is supplied by this task. Native CAD/STEP, DEM/FEA, generic constraints, calibrated discharge, offline rendering and WebGPU stay deferred.
