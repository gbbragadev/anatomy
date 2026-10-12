# Changelog

All notable changes to Anatomy are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The skill has no version numbers yet, so entries are dated.

## [Unreleased]

### Added

- Browser-pure deterministic belt transport, analytic bucket mounting/zone crossings, fixed-step backlog-preserving clock, conserved atomic inventory and replay. The complete two-session requirements supplement is published; faithful renderers and calibrated process prediction remain unavailable.

- Opt-in canonical assembly compilation with fixed/revolute/prismatic joints, limited analytic ratio couplings, stable physical fragment identities, separate audit/contact proxies, interface residuals and explicit unsupported asset/closure capabilities. Faithful renderers remain planned.

- Strict opt-in machine contracts, SI normalization with original metadata, conservative evidence-level and unit-bearing uncertainty gates, declared check scopes, complete dependency invalidation and a visible-text claim audit. F3 quantitative validation remains unavailable in this contract. The generic belt-bucket contract underpins the opt-in E0 model.

- An opt-in faithful-mode workflow, a normalized machine-fidelity specification, an isolated Node/Ajv package and pinned byte/API regression coverage for all framework-free legacy builds. Faithful renderer integration remains planned work.
- `examples/arcade-cabinet/`, an upright arcade cabinet with its side panel off. A quarter rolls down the coin chute past the coin-switch wire into the cash box, the switch's pulse runs along its cable to the board, and the CRT warms up, self-tests and runs an attract mode drawn in the plane of the tilted monitor; the stick closes a microswitch under the panel. It draws in the light and dark themes and passes `--audit`.
- `examples/spot-plate/`, a second React figure from the same site as `test-rig`: six pairs of glass drops that run together into one piece of glass as a fan of feeler blades sets `merge`. It draws in the light and dark themes.
- A first workflow step, **Size it before you start**: every request is sized as a Figure (about 30–90 minutes), a Hero (2–4 hours) or an Epic (6 hours or more), and the estimate is told to the user first. An Epic is not started until the user chooses it over a proposed Hero version. Every size has a working page within the first hour, and Claude reports when a step runs past twice its share of the estimate.
- `tests/upstream/generate-baseline.mjs` regenerates the legacy byte and export baseline from `git archive` of a reviewed 40-hex upstream commit and has no default output path. The legacy test uses `legacy-builds.mjs`; the generator reads coverage from the approved immutable reference blob.
- `references/equipment-demo.md`, the workflow for a live technical demo of a machine: choose the stack, write a contract with one owner per file, keep the model pure, falsify the written numbers with a clearance sweep and log each change, label the demo as simulated, and prove it in a real browser with suites that fail on any external request or console error. Taken from two demos built with the skill.
- `references/glow.md`: the thumbnail test for a lit state, a starter plus an assembler script for short jobs, how a travelling pulse works in `examples/arcade-cabinet/live.js`, and cleaning a user's own mesh. Habits borrowed from iso-glow (MIT, April Zhu; built on iso-figure, MIT, Tolga Cohce); no code is copied.
- CI now runs canonical fidelity/generator checks alongside the existing script/example gates on macOS/Node 22, and the complete fidelity package plus byte baseline on Windows/x64/Node 24.14.0. The initial macOS comparison against the Windows baseline found a Raptor light output difference; the baseline remains unchanged and both environments retain their own gates.

### Fixed

- `scripts/drive.mjs` now fails when a browser evaluation throws or rejects, rather than reporting a clean successful session.
- The arcade cabinet now accepts coins with reduced motion enabled, preserving the meter, credit and power-on events when the coin animation is skipped.
- The turning dial stops its idle tour when reduced motion is enabled while the page is open and cancels its pending automatic restart while preserving keyboard and pointer input.
- `scripts/drive.mjs` now exits with status 1 and stops subsequent actions when an `until` condition times out.
- `scripts/capture.mjs` now creates the output directory for screenshots, including nested paths under `shots/`.
- The line-end check now includes the selected element when `--select` names an SVG, rather than checking only SVGs inside it.
- `scripts/drive.mjs` now rejects unknown actions before running the session, so a misspelled verification step cannot report success.
- Browser checks now fail promptly and remove their temporary profiles when Chrome exits before its debugging port is ready.
- The line-end check now uses ellipse boundaries and transformed circle boundaries, and treats hollow interiors as empty instead of solid dots.
- The line-end check now follows SVG arc curves instead of treating each arc as a straight chord.
- Capture and drive now fail when Chrome cannot load the requested page, instead of reporting a clean browser error page.
- Orbit checks reject invalid sampling steps and empty pose lists before a zero-state sweep can pass.
- Solid clearance audits rebuild cached surface grids when sampling spacing or cell size changes.
- Tube geometry audits use tapered radii instead of replacing every segment with an averaged cylinder.
- The line verifier reflects smooth Bezier controls only after the matching curve family.
- Capture and drive send native Enter activation so button and form checks perform their default action.
- Fixed-part and coverage bounds restore a closed SVG subpath origin before relative moves.
- Audit ray casts now refresh body camera coefficients when the projection direction changes, so repeated builds retain the correct depth order.
- Audit profile tracing now checks quarter-span deviations, preserving inflected analytic and smooth profiles whose midpoint lies on their chord.
- Depth-key solving now allows large acyclic figures to converge beyond 400 rounds and avoids choosing a cycle victim from an empty set of violated rules.
- Splitting now accepts default fixed rounds and preserves explicit prism/round ownership, so a pipe fitting can be split without inventing collisions with its own pipe.
- Turning builders now reject missing named part/parent groups and duplicate group names before authored motions silently become static or alias one value.
- Native fidelity checks now compare complete filled silhouettes for cut parts and honor open round ends in the kit reference, preserving deliberately unstroked cut edges.
- Tube fidelity checks path coverage in both directions when vertex counts differ, rejecting empty or truncated live silhouettes while preserving equivalent resampling.
- Solid clearances check sliding rods whose drawn reach changes, even when their stretching geometry leaves no relative translation to a stationary obstacle.
- Belt transport rejects lost or distorted drive-phase increments, positive feed underflow and scaled clock-time underflow while preserving prior state. Ledger audits return controlled diagnostics for malformed transfer records.
- Canonical pose output now normalizes accepted source quaternion rounding while preserving original poses. Assembly topology uses robust orientation signs and a documented 1,024-vertex work limit, rejects collapsed positive bounds, and preserves definition evidence in failure diagnostics.
- Empty parameter dependencies no longer suppress conservative evidence invalidation. Raw machine comparisons cannot approve claims after canonical conversion or residual/uncertainty arithmetic overflows.
- `examples/test-rig/` drew its glass button dark in the light theme. `stretch.css` now has light values for its own colours.
- The legacy regression test compared HTML paths with the platform separator and failed on Windows before it compared any bytes. Paths now use `/` on every platform.
- Belt model events that share a timestamp and a bucket are published in the order they were applied. Ties were ordered by the textual event ID, which put `transfer:10` before `transfer:9`, so the ledger audit rejected the log the model had just published.
- Visible text in assertion mode can no longer be released from a claim that passes only at hypothesis level F0. Such a claim supports illustrative text with its label, not a factual assertion.
- A selected SVG now preserves opaque-fill occlusion for line endpoints, and a selector that matches nothing fails instead of auditing unrelated clean content.
- Capture and every drive action that resolves an explicit CSS target now reject a missing element instead of silently cropping or interacting with the page fallback. Failed captures do not create or overwrite PNGs. Omitted/null targets retain the documented defaults, keyboard focus remains `[tabindex="0"]`, and `turn` still takes a 3D group name rather than CSS.
- Native fidelity checks require continuous coverage of expected contour segments after excluding only declared cuts. Missing cut-part edges no longer pass or remove the round-band comparison; missing uncut edges fail normally rather than throwing a path-access exception.
- Unit conversion rejects nonzero value, uncertainty and acceptance fields that underflow to canonical zero. Assembly composition rejects local offsets lost at a large world base with controlled `UNSUPPORTED_POSE_PRECISION` diagnostics, preserving the existing numerical tolerances.
- The baseline generator accepts only explicitly approved upstream commits and reads its build/page coverage from the immutable published reference blob, not a mutable local helper. Existing atomic writes, temporary cleanup, replacement-object protection and environment isolation remain.

### Changed

- The workflow steps are renumbered 1–10.
- The 4× detail sweep scales with the size: the subject and mechanism for a Figure, the whole drawing for a Hero or an Epic. The density rule itself still holds for every figure.
- The legacy regression baseline is pinned to upstream `240a9bf` instead of `dbf697a`, so its byte-identity guarantee covers the upstream regression fixes this fork now contains.
- The README now says this is a fork and its install and download commands fetch this fork. The website, the CI badge and the issue forms still point at the original project.
- The baseline itself remains pinned to `240a9bf`, unchanged. The original `dbf697a` plan is explicitly labeled historical. Later audit corrections intentionally diverge only in checker code, not kit builders, example bytes or baseline expectations.
- Removed three source-wording routing checks. They asserted documentation strings rather than consumer behavior; context/skill access is checked by real consuming sessions instead. The package keeps the contract, model, assembly, generator and byte-identity tests.

## 2026-10-08

### Changed

- The skill is now called Anatomy: `name: anatomy` in `SKILL.md`, invoked as `/anatomy`. It was developed privately as `isometric-objects` before this date, without releases.
- The CSS tokens are now `--anatomy-*` (for example `--anatomy-card`, `--anatomy-face`, `--anatomy-shade-0`); they were `--iso-*`. Every example is rebuilt with the new names.
- The figure card (`.iso-plate`) is square and flat: no rounded corners and no floating shadow, just a 1 px rule in the drawing's mid tone.
- `SKILL.md` makes high detail a standing rule for every figure, raises the parts list to at least 40 parts (60–150 for a hero figure), and adds a 4× detail pass to the final check.

### Added

- The public repository: a README with screenshots of the examples, the MIT license, a contributing guide, a code of conduct, a security policy, issue forms, a pull request template, and a CI workflow that rebuilds every example and fails if a committed page changes.
- What the skill contains at this point: the workflow and craft rules in `SKILL.md`; the kit (SVG core, round parts, pipes, the geometry audit, the WebGL layer, React components, and the 3D mode in beta); eight references; the headless Chrome checks in `scripts/`; six examples (`dial-indicator`, `desk-computer`, `raptor-engine`, `ripple-tank`, `test-rig`, `turning-dial`); and five evals.
