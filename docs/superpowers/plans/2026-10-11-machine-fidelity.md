# Anatomy: plano de implementação da fidelidade técnica

> Implementação por tarefas verificáveis, com revisão independente e preservação da compatibilidade com o upstream.

**Goal:** Entregar um toolkit de máquinas com modo fiel opt-in, evidências rastreáveis e um elevador genérico utilizável; primeiro em SVG e depois com malhas/PBR opcionais.

**Architecture:** Preservar o fluxo criativo da Anatomy e acrescentar uma entrada separada para o modo fiel. Um contrato em SI produz geometria canônica e snapshots imutáveis, consumidos pelos adaptadores SVG e de malhas. Evidência, coerência numérica, apresentação e custo recebem resultados independentes.

**Tech Stack:** JavaScript ESM, Node >=22 (ambiente disponível: v24.19.0), `node:test`/`node:assert/strict`, JSON Schema 2020-12 with Ajv, existing Anatomy SVG/turn/audit modules, Chrome DevTools Protocol browser checks; optional Three.js WebGLRenderer evaluated in Phase B.

**Spec:** `docs/specs/machine-fidelity.md`, versão normalizada para o repositório da arquitetura aprovada v0.2 (2026-10-11). Criar esse documento preservando decisões e fontes públicas, removendo links privados, referências à conversa/Library, equipamentos não relacionados e texto de solicitação de aprovação. O upstream está fixado em `dbf697a527bbf7d358668e1557cb1e35ff725d46`.

## Global Constraints

- Upstream pin: `dbf697a527bbf7d358668e1557cb1e35ff725d46`. Preserve legacy signatures and all existing example HTML byte-for-byte; no baseline replacement to conceal a regression.
- Faithful mode is opt-in. Legacy use needs neither `machine.json`, GPU, CAD import nor installation of the new faithful dependencies.
- Canonical conventions: right-handed, Z-up, metres, radians, column vectors, active transforms, quaternions xyzw; local rest transforms, world snapshot poses.
- Joint equation: `T_WC = T_WP × T_PJ × M(q) × inverse(T_CJ)`. Transform tree and constraint graph are distinct.
- `schemaVersion: "0.1.0"`; stable physical IDs survive array reordering, repeated instances and render fragmentation. Unknown information remains `null`, never zero by default.
- Evidence fixture `E0` means assumption, not measurement. No manufacturer, model, manual, CAD or measured real-machine evidence is available; no dimensional parity, capacity, safety, wear or operational prediction claim is permitted.
- Generic fixture: `r=0.20 m`, `v=0.50 m/s`, `N=20`, `p=0.25 m`, `L=5.00 m`, `C=(5−2π·0.20)/2 m`, ideal `ω=2.50 rad/s`. Store the computed C, not its rounded printed value.
- Initial model study uses fixed `dt=1/120 s`; compare with `dt/2`. Rendering never changes dt, inventory, joint relations or event timing.
- `metersPerLegacyUnit` is explicit. Upstream `pack3` step `0.001` and audit defaults `touch=0.15`, `sunk=0.5` are drawing-unit implementation facts, not approved mechanical tolerances.
- Every result distinguishes executed/skipped/partial coverage and passed/failed/not-evaluated verdict. No AI-only fidelity approval or aggregate “percent realistic” score.
- Browser rendering is interactive. Offline high-quality rendering, native STEP/CAD conversion, DEM/FEA, generic constraint solvers, calibrated discharge and WebGPU are deferred and must be described as deferred.
- Execute through ordinary permitted tools/native agents only; the user explicitly excluded the Codex executor and cloud task creation. This document authorizes no implementation before its review confirmation.

## Review Focus

- Duplicate/reordered IDs, conflicting revisions and explicit unknowns must not silently change identity or promote claims (Task 2).
- Nonzero child offsets, unequal units and cyclic constraint graphs must not double-transform geometry or reject valid topology as a parent cycle (Task 3).
- Duplicate/late commands, events at a path seam and a slow browser must not double-transfer material or drop simulation time (Task 4).
- Tiny gaps, open bucket mouths and multiple render fragments must retain semantics or receive an explicit unsupported capability (Tasks 5–6).
- Untrusted asset URIs, missing rights, context loss and repeated backend switching must not fetch arbitrary data, leak resources or reset the experiment (Tasks 8–9).

---

## Entregas e responsabilidade

A Fase A (tarefas 1–7) entrega um toolkit SVG executável localmente, com exemplo genérico completo, relatório de evidências e validação real no navegador. A Fase B (tarefas 8–10), explicitamente posterior, acrescenta malhas/PBR, assets validados e um pequeno fixture de engrenagens para provar reutilização. A primeira entrega funciona sozinha; a escolha do renderer posterior depende do piloto medido.

The parent owns coordination and approval; one implementer owns each task, with independent review of its changes and final whole-branch review. Do not promise a completion date or API cost before the first measured implementation slice. Record actual research, authoring, tests, browser work, review, API/tool usage and unavailable cost fields separately.

Stop the dependent task for contradictory evidence, failed negative controls, unsupported critical geometry, unexplained legacy differences or unavailable required browser coverage. Finish independent work; never turn skipped checks into passes. Real-machine promotion remains blocked until authorized sources, intended observables, tolerances and a responsible reviewer exist.

## Accepted source-pattern refinements

Three validation refinements preserve the approved scope. They add no renderer, recipe, external service or runtime dependency.

1. **Evidence-consistent visible and static text (Tasks 2/6/7):** captions, tooltips, static alternatives and report prose identify claim IDs and exact source locators. Dimensions and assumptions come from canonical data. A changed dimension or source revision must update both visible and static/report output. An E0-backed calibrated-capacity assertion fails release even when numerical model checks pass; explicitly illustrative descriptions remain distinct from real-machine assertions. Unresolved and contradicted claims remain visible failures.
2. **Causal controls and readouts (Tasks 6/7):** record a control-to-command-to-snapshot-to-observable matrix. Pointer and keyboard routes produce the same commands and outcomes. Inject a stale or independent speed/mass indicator while the model snapshot remains correct; the UI-to-snapshot criterion must fail independently of passing conservation checks.
3. **Mobile interaction-state QA (Task 7):** capture a scrolled page and open inspector at the mobile viewport, record visual findings by reproducible defect category, and recapture after fixes. A narrow viewport establishes layout coverage only. No real-phone performance or improvement percentage follows without a comparable measured baseline.

The following immutable files were inspected as sources of limited design patterns. They were not executed or copied. All four repositories' cited license files are MIT; future code reuse would require preserving their notices. No interoperability, speed, cost saving or engineering-fidelity result is implied. Cost for these patterns is unmeasured.

| Source, pinned revision and license | Observed pattern and accepted use | Validation, phase and limit |
| --- | --- | --- |
| [explain-this fact-checking explainer](https://github.com/analyticalmonk/explain-this/blob/f64dab456ca23a351fe4d932c4e73bc91d3f2c52/skills/fact-checking-explainers/SKILL.md), revision f64dab456ca23a351fe4d932c4e73bc91d3f2c52; [MIT](https://github.com/analyticalmonk/explain-this/blob/f64dab456ca23a351fe4d932c4e73bc91d3f2c52/LICENSE) | Source-linked factual statements and caption locations inform the existing claim mapping. | Accepted for Phase A, Tasks 2/7; unsupported-caption negative test. Editorial guidance does not verify mechanics. |
| [system-atlas builder](https://github.com/inkboard/system-atlas/blob/f7005f275861f5aa2faa8e7416b3d73d52d07338/skills/system-atlas/assets/build.mjs), revision f7005f275861f5aa2faa8e7416b3d73d52d07338; [MIT](https://github.com/inkboard/system-atlas/blob/f7005f275861f5aa2faa8e7416b3d73d52d07338/LICENSE) | Shared records feed explanatory HTML and static facts; canonical machine fields must likewise generate both. | Accepted for Phase A, Tasks 6/7; mutate a dimension/revision and compare both outputs. Its executable input modules and HTML fields are not adopted. |
| [ai-iso-skill figure workflow](https://github.com/MrBongoC/ai-iso-skill/blob/44b4da7714148eef547cc1b102e433472dfe3531/skills/iso-figure/SKILL.md), revision 44b4da7714148eef547cc1b102e433472dfe3531; [MIT](https://github.com/MrBongoC/ai-iso-skill/blob/44b4da7714148eef547cc1b102e433472dfe3531/LICENSE) | Named interaction outcomes and shared keyboard/pointer behavior inform causal control/readout checks. | Accepted for Phase A, Tasks 6/7; control matrix and detached-indicator failure. Painter order, global state and styling are not adopted. |
| [html-explainer capture script](https://github.com/ds-vibe/html-explainer/blob/9b5bb05649701d0147e88def63d9ec67c8e60cea/scripts/shoot.mjs), revision 9b5bb05649701d0147e88def63d9ec67c8e60cea; [MIT](https://github.com/ds-vibe/html-explainer/blob/9b5bb05649701d0147e88def63d9ec67c8e60cea/LICENSE) | Desktop/mobile and interior scrolling captures inform inspection-state coverage. | Accepted for Phase A, Task 7; scrolled/open-inspector captures and reviewed recaptures. Its Playwright setup and layout heuristics are not adopted. |

Guided chapters, CAD conversion and video delivery remain deferred. This reference note does not add their dependencies or promise integration.

## File and interface map

All following paths are relative to the existing authorized clone on branch `feat/machine-fidelity`, pinned to the upstream commit above. Do not refactor `kit/` in Phase A. Chromium is available; browser validation remains an execution requirement, not an inferred pass.

- `SKILL.md` routes modes; `references/fidelity.md` holds faithful workflow and limits. `recipes/*/README.md` contains domain assumptions and reproducible steps.
- `fidelity/package.json`, `package-lock.json`: isolated new dependency boundary; `fidelity/index.mjs` is the new public entry point. Pin exact resolved dependencies in the lockfile.
- `fidelity/contracts/{machine.schema.json,types.d.ts,validate.mjs,units.mjs,evidence.mjs}`: schema, public types, SI normalization and claim decisions.
- `fidelity/assembly/{frames.mjs,compile.mjs,geometry.mjs}`: frame composition, semantic assembly, canonical geometry and separate audit/contact representations.
- `fidelity/model/{model.mjs,clock.mjs,ledger.mjs,replay.mjs}` and `recipes/belt-bucket/{recipe.mjs,path.mjs}`: pure state, events and domain mechanics.
- `fidelity/adapters/svg/{compile.mjs,runtime.mjs,audit.mjs}`; `fidelity/adapters/mesh/{compile.mjs,runtime.mjs,materials.mjs}`: independent presentation adapters.
- `fidelity/inspect/{view.mjs,controls.mjs}`, `fidelity/verify/{checks.mjs,report.mjs}`, `fidelity/assets/{manifest.mjs,gltf.mjs}`: shared inspection, assessment and controlled asset intake.
- `scenes/fluxo-vivo/{machine.json,commands.json,cameras.json,criteria.json,README.md}`: generic scene data, explicitly not a real Fluxo Vivo reconstruction.
- `examples/faithful-bucket/{build.mjs,live.mjs,style.css}`: generated runnable HTML and static alternative; `tools/fidelity/{build.mjs,verify.mjs,browser.mjs,assets.mjs}`: CLIs.
- `tests/fidelity/*.test.mjs`, `tests/fidelity/fixtures/`, `tests/upstream/legacy.test.mjs`, `tests/upstream/baseline.json`: built-in Node tests and immutable reference hashes.

Shared types are defined by Task 2 in `types.d.ts` and used by name below. `Diagnostic={code,severity,path,partId?,claimId?,tick?,sourceIds,message}`. `Result<T>={ok:true,value:T,diagnostics:Diagnostic[]}|{ok:false,diagnostics:Diagnostic[]}`. Errors never yield a partially executable machine.

## Fase A: toolkit SVG utilizável

### Task 1: Protect the upstream and route faithful mode

**Files:** Create `docs/specs/machine-fidelity.md`, `references/fidelity.md`, `tests/upstream/{legacy.test.mjs,baseline.json}`, `fidelity/package.json`; modify `SKILL.md`, `README.md`; leave all old builders unchanged.
**Interfaces:** Produces `node --test tests/upstream/legacy.test.mjs` and the documented opt-in faithful workflow; no new runtime import enters the legacy path.
- [ ] **Step 1:** Write test `legacy-builds-are-byte-identical`: build dark/light dial-indicator, desk-computer, arcade-cabinet, ripple-tank, turning-dial and raptor-engine, plus turning-dial light `--verify` and stress light, in disposable copies. Assert `assert.deepEqual(actualBytes, baselineBytes)` for every emitted legacy HTML; record sorted export names for the public kit modules and compare them too.
- [ ] **Step 2:** Run `node --test tests/upstream/legacy.test.mjs`; first fail on missing baseline, then generate the baseline solely from the pinned untouched source. Record source hash and Node version; investigate any nondeterministic bytes instead of normalizing them away.
- [ ] **Step 3:** Add an early explicit mode branch to `SKILL.md`: creative retains existing instructions; faithful bypasses invention, ornament density and minimum-part rules, loading `references/fidelity.md`. Add the isolated Node test/Ajv package and create the repository-safe normalized spec companion described above. Check it contains no private links or unrelated project references. Do not claim unsupported domain recipes exist.
- [ ] **Step 4:** Run the legacy test twice without installing faithful dependencies; expect all byte and API checks PASS. Check faithful routing text explicitly states evidence gaps and that E0 cannot support F1 dimensions.
- [ ] **Step 5:** Commit `test: preserve pinned Anatomy output and add faithful mode routing`.

### Task 2: Validate contracts, units and evidence claims

**Files:** Create all `fidelity/contracts/*`, `fidelity/index.mjs`, `tests/fidelity/{contracts,evidence}.test.mjs`, `tests/fidelity/fixtures/{minimal-valid.json,invalid-cases.json}`.
**Interfaces:** `validateMachine(raw:unknown):Result<MachineSpec>`; `normalizeQuantity(q:Quantity,dimension:string):Result<SIQuantity>`; `evaluateClaims(spec,results:CheckResult[]):ClaimVerdict[]`; `invalidateClaims(spec,changedSourceIds:string[]):{claimIds,partIds,checkIds}`.
- [x] **Step 1:** Write tests: `200 mm→0.20 m`; duplicate ID, missing parent/material/source, unknown unit/domain/schema version, zero axis, nonfinite number, invalid quaternion, negative mass and executable/raw-markup fields all fail with exact code/path. Reordering unordered ID-keyed collections preserves IDs and canonical hash; ordered geometry vertices, command sequences and other semantically ordered arrays retain their order. `uncertainty:null` stays null; E0 dimensional claim yields `not-evaluated`, never F1. Conflicting source revisions yield an unresolved diagnostic rather than averaged values. Add exact claim/source-location mappings for visible text and reject an E0-backed calibrated-capacity caption despite green model checks.
- [x] **Step 2:** Run `node --test tests/fidelity/contracts.test.mjs tests/fidelity/evidence.test.mjs`; expect missing-export/module failures before implementation.
- [x] **Step 3:** Implement strict schemas and cross-reference validation. Define `MachineSpec` with sources/claims, definitions/instances, parts/frames/joints/ports/connections, materials/assets, domain parameters, initial state, local criteria and dependency links. Geometry is a closed data union (`box`, `cylinder`, `prism`, `compound`, `asset`), never callbacks. Register only known recipes explicitly. Store original unit/frame metadata alongside normalized SI, positive uniform scales only; reject unnormalized negative/nonuniform scales. Unknown versions fail; no silent migration. Define separate construction/kinematic/process/appearance verdicts, source uncertainty, manufacturing tolerance and project/numeric acceptance fields.
- [x] **Step 4:** Run both tests; expect PASS including source replacement invalidating only dependent claims/checks and absent licenses marking assets unusable for redistribution. Validate the spec’s abbreviated JSON fails as incomplete rather than pretending it is executable.
- [x] **Step 5:** Commit `feat: add SI machine contracts and evidence-scoped verdicts`.

**Implementation note:** The initial focused contract/evidence suite executed 44 passing tests; independent review found contract gaps and required corrections. The first correction round expanded focused coverage to 68 tests, including conservative level evidence, unit-bearing uncertainty, strict standalone quantities, declared check scopes and complete invalidation. The second correction round covers empty/unknown parameter dependency targets and nonfinite canonical comparison arithmetic on raw inputs. The current focused suite passes 83 tests; the aggregate suite passes 87 tests, including unchanged legacy bytes/API and routing coverage. It covers exact diagnostics, SI/original metadata, ordered-array preservation, E0 limits, source conflicts, dependency invalidation and visible-text negative controls. Assembly and model execution remain outside Task 2. A recorded human review is checked as data; its authenticity and the reviewer’s qualification require external review.

### Task 3: Compile canonical assemblies and analytic joints

**Files:** Create `fidelity/assembly/*`, `tests/fidelity/{frames,assembly}.test.mjs`.
**Interfaces:** `compileAssembly(spec:MachineSpec,assets:AssetMap):Result<CompiledAssembly>`; `resolvePoses(compiled,q:Record<string,number>):Result<Record<string,Pose>>`; `evaluateGeometry(compiled,poses):GeometrySnapshot`. `Pose={position:[number,number,number],rotation_xyzw:[number,number,number,number]}`. `CompiledAssembly` holds rest geometry, ordered transform parents, separate constraints, interfaces, part→fragment IDs, bounds, approximation errors and required capabilities.
- [ ] **Step 1:** Write tests for a hand-computed three-frame chain, nonzero child joint offset, positive rotation around an asymmetric axis, prismatic translation and exact joint limits. Assert `resolvePoses(...outsideLimit).ok===false`; parent cycles fail, a cyclic constraint graph is retained and reports `UNSUPPORTED_CONSTRAINT_SOLVER` if evaluation needs an unavailable solver. Test zero/rest poses against the canonical definition, not adapter output.
- [ ] **Step 2:** Run `node --test tests/fidelity/frames.test.mjs tests/fidelity/assembly.test.mjs`; expect missing-module failures.
- [ ] **Step 3:** Implement the stated matrix equation for fixed/revolute/prismatic joints, analytic registered couplings and explicit residuals for supported constraints. Produce metre geometry once for all adapters; preserve separate collision/audit proxy error bounds. Validate compatible port endpoints, named intended-contact pairs and interface alignment. Reject unsupported geometry without substituting a visually similar solid.
- [ ] **Step 4:** Run tests; add assertions that a 0.20→0.22 m renderer-only radius mismatch fails geometry identity, unrelated sunk parts are not exempted by an intended contact, and parent array order has no effect.
- [ ] **Step 5:** Commit `feat: compile canonical frames and constrained assembly geometry`.

### Task 4: Implement the belt mechanism, clock and atomic mass ledger

**Files:** Create `fidelity/model/*`, `recipes/belt-bucket/{recipe.mjs,path.mjs,README.md}`, `tests/fidelity/{belt-path,model,ledger,replay}.test.mjs`.
**Interfaces:** `createModel(spec,initialState,seed):Model`; `Model.step(state:ModelState,commands:Command[],dt:number):{state,events,diagnostics}`; `Model.snapshot(state):Snapshot`; `Model.interpolate(previous,next,alpha):Snapshot`; `advanceClock(clock,elapsedSeconds,model,state,commands):{clock,state,events,diagnostics}`; `replay(spec,initialState,seed,dt,commands,ticks):ReplayResult`.
**Types:** `Command={id,type,tick,value?,unit?}`; types `start`, `stop`, `set-speed`, `set-feed`. `ModelState={tick,time_s,beltTravel_m,speed_mps,drivePhase_rad,inventory_kg,appliedCommandIds}`; `TransferEvent={id,tick,offset_s,from,to,amount_kg,partId?,sourceIds}`. Snapshot adds immutable `version`, world `posesByPartId`, unit-bearing `readouts` and event references. Pause/reset/presentation-speed belong to clock controls; reset reconstructs the initial state and seed.
- [ ] **Step 1:** Write tests for the exact generic loop, analytic tangent continuity on both arcs/seam, 20 stable IDs including `bucket007` over ten laps, nonintegral `L/p` rejection and prohibited reverse. Twelve steady 1/120 s steps give Δs=0.05 m and Δangle=0.25 rad within `1e-12` (synthetic numerical criterion only). `0.80→0.60 kg` in bucket007 and `1.20→1.40 kg` discharge share one 0.20 kg event; removing without credit fails at that event.
- [ ] **Step 2:** Run `node --test tests/fidelity/{belt-path,model,ledger,replay}.test.mjs`; expect missing-module failures.
- [ ] **Step 3:** Implement a length-parameterized two-straight/two-semicircle path and mounting-derived bucket orientation. Use explicit fixture acceleration/deceleration `0.5 m/s²`, speed `[0,0.5] m/s`, ideal no-slip drive and prescribed feed/discharge zones. Separate pulley radius, belt neutral radius and attachment offset; fixture equality is a documented approximation. Ledger compartments cover feed, each bucket, discharge, output, return and losses; capacities/backpressure prevent overfill. Locate all zone crossings analytically within a step, order by time then stable ID, and transfer atomically. Synthetic 0.20 kg test transfer is a fixture stimulus, not a user-facing discharge prediction.
- [ ] **Step 4:** Implement fixed-step accumulator with eight-step frame recovery limit and retained backlog diagnostic; no lost time. Reject late commands, deduplicate identical IDs, reject conflicting reuse, order same-tick commands by ID. Interpolate only accumulated travel/independent continuous channels and rederive poses; inventory remains tick-discrete. Test start, feed interruption, loaded stop/resume, full receiver, pause, reset/seed, same replay hash, slow frame backlog and dt/2 convergence (travel `1e-9 m`, ledger `1e-10 kg`, event time at most one fine step).
- [ ] **Step 5:** Run all four tests including camera/particle-independent replay and seeded parameter sweeps with a fixed seed; expect PASS. Commit `feat: add deterministic belt transport and conserved inventory`.

### Task 5: Adapt the canonical scene to Anatomy SVG

**Files:** Create `fidelity/adapters/svg/*`, `tests/fidelity/{svg-adapter,svg-audit}.test.mjs`.
**Interfaces:** `compileSvg(compiled,{metersPerLegacyUnit,camera,criteria}):Result<SvgBundle>`; `mountRenderer(target,bundle,options):Renderer`. Shared `Renderer={render(snapshot,viewState):void,pick({x,y}):string|null,capture():Promise<Blob>,dispose():void}`; SVG capture is `image/svg+xml`. `SvgBundle` preserves semantic fragment maps, capability outcomes, versioned packed data and private upstream controller mappings.
- [ ] **Step 1:** Write tests with `metersPerLegacyUnit=0.001`: 0.20 m radius becomes 200 drawing units; radians convert to degrees only at `TURN` boundary; rest-world builder input avoids double offsets. A synthetic 0.0001 m gap roundtrips within `2e-6 m` after packing. Two fragments pick one part ID. Unknown channels, overflow beyond upstream uint16 indexing and unsupported critical concavity yield structured failures.
- [ ] **Step 2:** Run `node --test tests/fidelity/svg-adapter.test.mjs tests/fidelity/svg-audit.test.mjs`; expect missing-module failures.
- [ ] **Step 3:** Lower canonical compounds to supported convex `turning` primitives; use free groups for pre-resolved bucket poses and rotational groups for shafts. Use `TURN.mount`/controller `.set` only after model limits/couplings resolve; no upstream controller becomes machine state. Scale every audit threshold explicitly, integrate recorder/settle/auditOrExit with explicit audit flags, preserve fragment→part errors. Critical clearance checks use canonical swept interfaces independently of upstream skip heuristics.
- [ ] **Step 4:** Run tests plus legacy suite; expect PASS. Assert omitted audit flag yields `not-evaluated`, not pass; both arcs/seam undergo an operational sweep, and fake solid bucket-mouth geometry fails a ray/section openness check. If faithful cavities cannot lower correctly, report capability failure and advance the mesh experiment without distorting geometry.
- [ ] **Step 5:** Commit `feat: lower canonical machine snapshots into Anatomy SVG`.

### Task 6: Ship the interactive generic elevator and inspection controls

**Files:** Create `fidelity/inspect/*`, `scenes/fluxo-vivo/*`, `examples/faithful-bucket/*`, `tools/fidelity/build.mjs`, `tests/fidelity/{scene,inspection}.test.mjs`.
**Interfaces:** `createViewState():ViewState`; `setView(state,patch):ViewState`; `mountControls(target,{model,renderer,getState,dispatch}):{dispose()}`. `ViewState={camera,selection,isolatedPartIds,sectionPlane,explosion,motionPreference,particleCount,theme}`. CLI: `node tools/fidelity/build.mjs scenes/fluxo-vivo/machine.json --backend svg --out artifacts/bucket-svg`.
- [ ] **Step 1:** Write scene tests for frame/supports, two pulleys, belt, twenty open buckets with explicit attachment instances, inlet, discharge and return. Assert selecting `bucket007` returns its E0 evidence and mass; exploded view pauses clock without editing poses/inventory; unsupported sections yield a visible capability explanation.
- [ ] **Step 2:** Run `node --test tests/fidelity/scene.test.mjs tests/fidelity/inspection.test.mjs`; expect missing files/modules.
- [ ] **Step 3:** Build complete valid scene JSON (not the spec excerpt), general and attachment-close-up cameras, start/stop/feed/pause/reset controls, readouts derived from snapshots and keyboard/touch semantic selection. Provide light/dark focus styles, reduced-motion/offscreen pause, static description and an always-visible generic/illustrative limitation. E0 backs every invented dimension/feature. Generate visible/static facts from the same canonical fields and evidence IDs. Record each control, dispatched command, snapshot change and observable readout; test keyboard/pointer equivalence and a detached-indicator negative control. Explode/isolating views never change the physical model; no unsafe-operation inference from open views.
- [ ] **Step 4:** Run tests and build command; expect PASS and loadable `index.html` plus manifest. Test particles 200 versus 2,000, camera/theme changes and inspection roundtrips against identical physical replay hashes. Ensure scene opens without GPU or network dependencies.
- [ ] **Step 5:** Commit `feat: deliver inspectable generic elevator SVG example`.

### Task 7: Produce evidence reports and verify in a real browser

**Files:** Create `fidelity/verify/*`, `tools/fidelity/{verify.mjs,browser.mjs}`, `tests/fidelity/{verification,negative-controls}.test.mjs`; modify `.github/workflows/ci.yml`, `README.md`.
**Interfaces:** `runChecks({spec,compiled,replay,captures,environment}):CheckResult[]`; `writeReport(directory,run):Promise<void>`; CLI `node tools/fidelity/verify.mjs scenes/fluxo-vivo/machine.json --out artifacts/verification`; browser CLI `node tools/fidelity/browser.mjs artifacts/bucket-svg/index.html --out artifacts/browser --required`.
- [ ] **Step 1:** Write failure-injection tests for ACC-01..06: wrong sign/radius, dropped transfer, changed bucket ID, particle-linked flow, E0→F1 promotion and seam discontinuity must fail their own criterion. Additional controls mutate asset hash, units ×1000, joint limit, section inventory and bucket-mouth proxy. Test report never treats missing capture or skipped audit as pass.
- [ ] **Step 2:** Run `node --test tests/fidelity/verification.test.mjs tests/fidelity/negative-controls.test.mjs`; expect missing-module failures.
- [ ] **Step 3:** Emit `validation.json`, `trace.csv`, `events.json`, `captures/`, `report.json`, `report.html`, source/asset/model hashes, upstream/model versions, seed/dt/commands, numerical tolerances, environment and independent claim verdicts. Each check includes expected/observed/unit/tolerance, IDs, tick range, evidence path and scope; report measured effort/cost separately from estimates. Emit the visible-text claim audit and fail unsupported, unresolved or contradicted explanatory assertions independently of numerical checks. Critic recommendations cannot alter tool results or promote claims.
- [ ] **Step 4:** Run full Node suite and real Chromium CLI through CDP with an explicitly recorded executable/version, 1440×1000 and 390×844 viewports, DPR 1, light/dark/reduced-motion. Drive exact ticks for start, regime, loaded stop, resume and ten laps; capture general and attachment views, plus mobile scrolled/open-inspector states; inspect screenshots, log reproducible defect categories and recapture fixes. Compare canonical dimensions/source revisions against visible and static/report facts. Include the detached-indicator negative control; passing model conservation cannot hide its UI failure. Assert keyboard/touch picking, focus, readable limitations, no overflow, two independent mounted scenes, no errors and no-WebGL SVG fallback. Check occlusion against independent depth/reference oracle where supported; never label a screenshot-only check as geometry verification.
- [ ] **Step 5:** Measure cold/warm startup, bytes, frame p50/p95/p99, long tasks, command latency, available memory and build/audit time over the same 120 s script; mark unavailable GPU/memory counters unavailable. Add separate CI Node/legacy and required browser jobs with retained artifacts, plus scheduled/manual full operational audits and 15 min soak. Missing browser is a blocked release, not success; SwiftShader results are not hardware performance. Commit `test: add fidelity evidence harness and browser release gates`.

**Phase A gate:** Parent reviews artifacts and all deliberate-fault detections, verifies old HTML byte identity and browser screenshots, and labels the deliverable F0 construction/process with tested ideal kinematics only. No device performance claim without an approved profile. Obtain decision before expanding scope if SVG’s critical geometry fails.

## Fase B: malhas/PBR opcionais e assets controlados

### Task 8: Validate assets and prove the mesh backend candidate

**Files:** Create `fidelity/assets/*`, `fidelity/adapters/mesh/compile.mjs`, `tools/fidelity/assets.mjs`, `tests/fidelity/{assets,mesh-compile}.test.mjs`, `tests/fidelity/fixtures/assets/`, `docs/mesh-pilot.md`.
**Interfaces:** `validateAssets(spec,root):Promise<Result<AssetMap>>`; `compileMesh(compiled,assets):Result<MeshBundle>`; CLI `node tools/fidelity/assets.mjs validate <manifest.json>`. Asset entries include original/derived hashes, tool/version/parameters, source unit/frame, license/author/attribution/redistribution permission, instance→node/primitive map, bounds, interfaces and approximation tolerances.
- [ ] **Step 1:** Write tests for changed bytes, missing rights, duplicate node names, instanced bucket IDs, ×1000 scale error, flipped normals and lost thin walls. Reject absolute/network/path-traversal URIs and embedded scripts; allow only bounded local buffers/textures with declared hashes. Assert machine→glTF `(x,y,z)→(x,z,−y)` and inverse each apply once, including normals/joint axes/cameras but scaling lengths only.
- [ ] **Step 2:** Run `node --test tests/fidelity/assets.test.mjs tests/fidelity/mesh-compile.test.mjs`; expect missing modules.
- [ ] **Step 3:** Implement provenance and bounds/interface checks, semantic sidecars authoritative over node names, format validation using pinned Khronos validator, and primitive/instance preservation. Compile canonical procedural geometry directly to indexed mesh data; import pre-tessellated GLB/glTF through validated sidecars. Original CAD stays untouched; accept recorded external conversion metadata but do not implement or advertise native STEP import. Unsupported extensions/normalization requirements stop import explicitly.
- [ ] **Step 4:** Run a neutral-material Three.js WebGLRenderer candidate against the same bucket snapshots and a hollow/concave stress fixture. Record exact resolved package version, topology/selection parity, browser/device context, depth, cost and maintenance implications in `docs/mesh-pilot.md`. Run tests; expect PASS including physical mouth/through-bore openness. If critical parity fails, stop promotion and report the specific gap.
- [ ] **Step 5:** Commit `feat: validate semantic assets and evaluate optional mesh compilation`.

### Task 9: Deliver shared-state mesh inspection and minimal PBR

**Files:** Create `fidelity/adapters/mesh/{runtime.mjs,materials.mjs}`, `tests/fidelity/{mesh-runtime,backend-parity}.test.mjs`; modify example build/live, browser runner and `references/fidelity.md`.
**Interfaces:** Mesh `mountRenderer(target,bundle,options):Renderer` implements Task 5’s contract (capture `image/png`); `switchRenderer(current,nextFactory,snapshot,viewState):Renderer` preserves snapshot/selection and disposes current only after next mount succeeds. Record renderer version, camera, exposure, tone mapping, environment, output color space and material profile in captures.
- [ ] **Step 1:** Write tests that both backends resolve `bucket007`, events, readouts and replay hashes identically. Failed GPU creation keeps SVG/static access; failed switch does not reset tick or selection. Assert 25 mount/switch/dispose cycles leave no owned listeners, geometries, textures, buffers or animation callbacks outstanding.
- [ ] **Step 2:** Run `node --test tests/fidelity/mesh-runtime.test.mjs tests/fidelity/backend-parity.test.mjs`; expect missing modules.
- [ ] **Step 3:** Implement optional dynamic imports only after Phase B pilot accepts the candidate. Use one shared-depth scene, semantic instancing, neutral inspection light first, then simple paint/rubber/exposed-metal presets; color textures use sRGB and data maps linear, with linear lighting and explicit output conversion. Keep camera/particle LOD separate from state. Provide coherent capped cuts only for supported geometry; otherwise mark section unsupported rather than imply solid volume. No undocumented wear, HDRI rights assumptions or material accuracy claims.
- [ ] **Step 4:** Run Node/browser suites for SVG and mesh at identical ticks, general/detail captures, context loss/restoration, no-WebGL fallback and repeated swaps. Compare state/semantic parity, not identical pixels. Re-run the 120 s/15 min measurement scripts; propose measured device budgets and fallbacks for user approval. Unmeasured phones remain not evaluated; retain small critical features through local inspection rather than silently removing them.
- [ ] **Step 5:** Commit `feat: add optional mesh PBR rendering with preserved machine state`.

### Task 10: Prove reuse and package the verified toolkit

**Files:** Create `recipes/gear-pair/{recipe.mjs,README.md,fixture.json}`, `tests/fidelity/reuse.test.mjs`, `docs/fidelity-release.md`; update mode routing, CLI docs and CI release matrix.
**Interfaces:** Register `gear-pair/ideal-v1` through the same recipe registry used by `createModel`; output the same Snapshot/CompiledAssembly/CheckResult types. This is a tiny toolkit test fixture, not another user equipment project.
- [ ] **Step 1:** Write tests for external gears with 20 and 40 teeth: `thetaB=−0.5*thetaA`, module `0.002 m`, centre distance `0.06 m`. Wrong sign and wrong centre distance fail. Compare SVG/mesh picks and snapshots without new clocks, ledger implementations, selection systems or report writers.
- [ ] **Step 2:** Run `node --test tests/fidelity/reuse.test.mjs`; expect unregistered-recipe failure.
- [ ] **Step 3:** Implement only the analytic ideal gear recipe and documented assumptions; keep backlash, efficiency, wear and force response unmodeled. Update concise skill routing to the two implemented recipes and exact CLI/report workflows; document missing CAD/offline/WebGPU/calibrated-physics features as deferred.
- [ ] **Step 4:** Run `node --test tests/upstream/*.test.mjs tests/fidelity/*.test.mjs`, both example builds, required browser parity/negative controls and release audit suite. Publish a release report listing actual executed checks, skipped device profiles, captures, measured cost, unresolved claims and review scope. An independent reviewer checks spec coverage and source/code/report consistency; only a qualified human with evidence can sign real-machine fidelity.
- [ ] **Step 5:** Commit `docs: package verified faithful toolkit and modular recipe example`.

## Self-review and handoff

Coverage: contracts/evidence (2), frames/geometry (3), mechanics/clock/mass (4), SVG/precision/audits (5), inspection/example (6), verification/negative controls/browser/cost (7), assets/mesh decision (8), PBR/parity/device degradation (9), modularity/packaging (10). Deferred capabilities are explicit, not claimed as implemented. All five Review Focus conditions have owning negative tests.

Task 1 baseline/routing and Task 2 contracts have been implemented through the approved non-Codex route. Later tasks remain planned and require their own execution and independent review gates. Continue in the existing authorized clone on `feat/machine-fidelity`; preserve the approved scope and execution constraints.
