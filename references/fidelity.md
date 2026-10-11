# Faithful mode

Use this workflow only when faithful mode is requested. The creative workflow remains the default. Faithful mode follows identified evidence rather than inventing the object. Invention, ornament density and minimum-part rules do not apply here. Add a part because its function and evidence justify it, never to fill a quiet region.

## What is available now

The foundation provides this route, the [architecture specification](../docs/specs/machine-fidelity.md), an isolated Node/Ajv dependency package and the pinned legacy byte/API test. No domain recipe is implemented yet. The specification describes future contracts, validators, assembly compilation, models, renderers and checks; those names are not existing toolkit APIs. Do not issue a faithful build command or claim a supported recipe until its implementation and tests exist.

The first planned fixture is a generic belt-and-bucket elevator. No manufacturer, model, manual, CAD or measured real-machine evidence is available. Its source E0 means assumption, not measurement. E0 cannot support F1 dimensions. Do not claim dimensional parity, capacity, safety, wear or operational predictions from the fixture.

## Start with evidence

1. Identify the machine, configuration, requested details and purpose. List each source with a stable ID, revision, locator, rights and extraction method. Keep source uncertainty separate from numerical tolerances and proposed acceptance criteria.
2. Record what the evidence supports and what is unknown. Keep missing values `null`; never silently replace them with zero. Resolve conflicting source revisions explicitly. A photograph alone cannot establish hidden geometry, absolute scale, friction or capacity.
3. Select an implemented recipe and its declared validity range. If none covers the mechanism, stop that behaviour and identify the missing capability. A plausible animation is not a validated physical model.
4. Define separate construction, kinematic, process and appearance claims. F0 explains a principle with declared assumptions; F1 requires referenced construction details; F2 requires verified kinematic traces; F3 requires independent quantitative validation within a stated domain. These labels do not promote every axis together.

Reference gathering must be safe. Do not request removal of guards or approach to moving equipment for photographs. Private or third-party assets require authorized processing and redistribution; Anatomy's MIT license does not grant those rights.

## Preserve one machine model

- Use `schemaVersion: "0.1.0"`, stable physical IDs and SI internally: right-handed, Z-up, metres, radians, column vectors, active transforms and quaternions xyzw.
- Keep local rest transforms in the assembly and resolved world poses in snapshots. Use `T_WC = T_WP × T_PJ × M(q) × inverse(T_CJ)` for joints. The transform tree is acyclic; the separate constraint graph may contain legitimate cycles that need a declared solution and residual.
- Separate display, audit and contact geometry while retaining the same part IDs and declared approximations. Repeated instances and multiple render fragments must not create new physical identities.
- Declare `metersPerLegacyUnit` at the legacy boundary. `pack3 = 0.001`, `touch = 0.15` and `sunk = 0.5` are drawing-unit implementation facts, not approved mechanical tolerances. Convert degrees only at the upstream turn/hinge boundary; do not double-apply child offsets.
- Keep the model independent of DOM, SVG, GPU, camera and frame rate. Commands have IDs and application ticks; events are ordered and transfers conserve inventory atomically. Presentation reads immutable snapshots and cannot change dt, inventory, joint relations or event timing.
- The illustrative path uses `r = 0.20 m`, `v = 0.50 m/s`, `N = 20`, `p = 0.25 m`, `L = 5.00 m`, `C = (5 - 2π × 0.20) / 2 m` and ideal `ω = 2.50 rad/s`. Store computed C, not the rounded display. Start the model study at fixed `dt = 1/120 s` and compare with `dt/2`; this is not a validated granular-contact timestep.

## Build and inspect only supported representations

First compare silhouette, dimensions, supports and interfaces in neutral materials. Add observable materials, inspection lighting and documented surface details afterward. PBR quality cannot establish construction fidelity.

SVG and optional future mesh rendering consume the same IDs, commands, events and snapshots. Picking must return the physical part even when it has many fragments. Camera, theme, particles, isolation, sections and explosion belong to presentation state. They must not change physical state or reset the experiment when the backend changes. Declare unsupported cuts, cavities or inspection views rather than altering reference geometry to fit the renderer.

Browser rendering is interactive. The following capabilities are deferred: offline high-quality rendering, native STEP/CAD conversion, DEM/FEA, generic constraint solvers, calibrated discharge and WebGPU. An optional mesh/PBR backend requires its own measured pilot and capability tests; upstream WebGL effects do not provide that backend.

## Evaluate and report

Run only tools that exist, and report their actual outputs. Every result distinguishes coverage `executed`, `skipped` or `partial` from verdict `passed`, `failed` or `not-evaluated`. An audit that was not enabled is not a pass. Describe sampled checks, exceptions, unsupported capabilities and missing evidence. Do not use AI-only fidelity approval or an aggregate percent-realistic score.

Replay the same commands at fixed ticks; compare numerical invariants before images. Include unit, identity, seam, offset, duplicate-command, late-command, mass-loss and renderer-independence failure injections as their corresponding tools become available. Capture general and critical-detail views in both themes and at transition states. Geometry and visual checks complement one another; neither establishes real capacity or safety.

Record source revisions, code commit, model version, seed, dt, environment, trace, events and captures. Compare dt and dt/2. Measure browser bytes, frame times, command latency and memory on identified devices; unavailable measurements remain `null`. Reduce presentation work before altering a physical model. Separate production cost, interactive execution cost and any future offline rendering cost.

Human technical review decides evidence-dependent claims, tolerances and scope. A reviewer needs expected and observed values, a part ID or tick interval, the criterion and supporting evidence. Correct the smallest responsible data or code change and rerun the affected checks and regressions. Never rewrite a reference, tolerance or baseline to hide a failure.

## Protect legacy use

Legacy imports, signatures and example HTML stay unchanged and installation-free. Run:

```sh
node --test tests/upstream/legacy.test.mjs
```

The test rebuilds all six framework-free examples in both themes, plus the turning-dial light verification page and light stress page, in a disposable directory. It compares every emitted HTML byte and sorted public ESM kit export list against the untouched upstream pin `dbf697a527bbf7d358668e1557cb1e35ff725d46` rebuilt in the recorded environment. It separately guards the original committed HTML hashes. The baseline stores reversible gzip/base64 bytes, committed and generated hashes, the source tree/archive hashes and the generating Node/V8 version, OS and architecture. Compression is storage only; no output bytes are normalized. Do not regenerate it from a modified checkout or replace it to conceal a regression.

The captured Linux/x64 environment has preexisting Raptor camera-metadata and turning-stress packed separating-plane discrepancies against the committed upstream pages. Official Node 22.11 and Node 24.19 reproduce the same generated bytes for these pages, and independent Node 24 repeats are identical. The original HTML stays unchanged and the discrepancies remain recorded. This checks code regressions in the recorded environment; it does not claim cross-platform byte reproducibility. Investigate differences on another platform rather than rewriting the baseline automatically.

Only faithful development installs the isolated package with `npm --prefix fidelity ci`. Its test command is `npm --prefix fidelity test`. Neither command is required to use or verify legacy examples.
