# Faithful mode

Use this workflow only when faithful mode is requested. The creative workflow remains the default. Faithful mode follows identified evidence rather than inventing the object. Invention, ornament density and minimum-part rules do not apply here. Add a part because its function and evidence justify it, never to fill a quiet region.

## What is available now

The opt-in foundation provides this route, the [architecture specification](../docs/specs/machine-fidelity.md), [complete-coverage requirements](../docs/specs/complete-coverage.md), an isolated Node/Ajv package and the pinned legacy byte/API test. Strict SI/evidence contracts and canonical assembly/analytic-joint APIs are available through `fidelity/index.mjs`; see the [contract](../fidelity/contracts/README.md) and [assembly](../fidelity/assembly/README.md) interfaces. The [deterministic model](../fidelity/model/README.md) and [generic belt recipe](../recipes/belt-bucket/README.md) now provide an executable E0 numerical demonstration, conserved inventory and replay. Faithful renderers, a runnable browser demonstration and integrated domain reports remain future work. Do not issue a faithful HTML build command until its renderer/scene implementation and browser tests exist. Browser callers must use the pure model runtime entry, rather than the top-level Node build entry.

The first model fixture is a generic belt-and-bucket elevator. No manufacturer, model, manual, CAD or measured real-machine evidence is available. Its source E0 means assumption, not measurement. E0 cannot support F1 dimensions. Do not claim dimensional parity, capacity, safety, wear or operational predictions from the fixture.

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

The test rebuilds all six framework-free examples in both themes, plus the turning-dial light verification page and light stress page, in a disposable directory. It compares every emitted HTML byte and sorted public ESM kit export list against the untouched upstream pin `240a9bf7c50cc6226148762a1017466fcbc08523` rebuilt in the recorded environment. It separately guards the original committed HTML hashes. The baseline stores reversible gzip/base64 bytes, committed and generated hashes, the source tree/archive hashes and the generating Node/V8 version, OS and architecture. Compression is storage only; no output bytes are normalized. Do not regenerate it from a modified checkout or replace it to conceal a regression.

The pin moved from `dbf697a527bbf7d358668e1557cb1e35ff725d46` when the fork took the upstream regression fixes to `scripts/drive.mjs`, `scripts/capture.mjs`, `kit/audit.mjs`, `kit/turn-build.mjs`, the arcade cabinet and the turning dial. Regenerate only with `node tests/upstream/generate-baseline.mjs --commit <approved 40-hex upstream commit> --out <explicit output>`. `tests/upstream/upstream-policy.json` permits only those two reviewed upstream commits; a local ref or fork commit is not upstream authentication. Build commands and the full HTML coverage come from the immutable `baseline.json` blob in published commit `15cd4fcfde78298f6de17c619d466aad56dea0f9`, never from the working-tree helper. Fetch that commit and the requested upstream object before using the generator. Changing the policy or reference requires separate review. Ordinary legacy testing remains installation-free and needs no Git history, including in shallow CI checkouts. Keep prototype output outside the committed baseline until approved; this correction does not replace it.

Before building, the generator compares both the extracted file set and every file's Git blob identity against the approved source tree. It hashes bytes without Git filters, so local `export-subst`, `ident`, `eol`, filters or ignored files cannot silently redefine the reference. The approval policy itself is maintained source, not proof against someone authorized to edit that policy; its changes require the same separate review as a new pin.

Both pins record the same committed-versus-generated differences: the two Raptor pages and the turning-stress light page (`committedMatchesGenerated` is `false` in the baseline). They stay unnormalized. Their cause was characterized at `dbf697a` as Raptor camera metadata and packed turning-stress separating planes; it was not characterized again at `240a9bf`. At `dbf697a`, Node 22.11 and Node 24.19 on Linux/x64 reproduced the same generated bytes, independent Node 24 repeats were identical, and a Windows/x64 Node 24.14 run reproduced the Linux-recorded baseline. The `240a9bf` baseline was recorded on Windows/x64 with Node 24.14.0. The first PR #2 macOS/Node 22 run passed 275 canonical/generator tests but failed byte identity for `raptor-engine-light.html`: actual 1,610,583 bytes versus the recorded 1,610,584. CI therefore keeps macOS numerical, script and committed-example checks, and runs the byte baseline on Windows/x64/Node 24.14.0. It does not replace or normalize the reference, or claim cross-platform byte reproducibility. This evidence does not isolate OS, architecture and Node version as individual causes.

The audit corrections in this fork intentionally differ from upstream `240a9bf` in `scripts/line-ends.mjs` and `scripts/turn-fidelity.mjs`; they reject missing selectors and missing expected contour segments after subtracting declared cuts. They do not change kit exports, builders or committed example HTML. A selected SVG keeps the same opaque-fill occlusion policy as a selected container. The frozen original implementation plan retains its historical `dbf697a` context; it is not authority to overwrite the current reference.

The prism edge oracle preserves physical segment transitions, including collinear vertices at a declared cut. `T.build` serializes frames at `pack3` precision (`1e-3` legacy drawing units): cut-prism face-tone and edge-topology references use that declared serialized geometry, independently through the kit builders, not the emitted paths under test. Filled silhouette and top checks retain the original world geometry as their reference. Exact crossfade poses may have no opaque faces to compare; they do not become proof of face coverage. Missing/partial-contour negative cases still fail in the real CLI.

Only faithful development installs the isolated package with `npm --prefix fidelity ci`. Its test command is `npm --prefix fidelity test`. Neither command is required to use or verify legacy examples.
