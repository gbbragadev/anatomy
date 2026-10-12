# Interactive equipment demo

Use this when the deliverable is a live technical demo of a machine: a drawing driven by a model, controls, indicators, a guided tour and checks. It is longer work than a single figure, so it needs a contract and a way to prove each step.

It works with creative mode. In faithful mode, keep the evidence rules in [`fidelity.md`](fidelity.md) and use this file only for the build and verification workflow.

Two such demos were built with this workflow. One is a vertical bucket elevator drawn as an isometric SVG page with a deterministic video export. The other is a continuous slicing line drawn in WebGL, with a rigid-body engine for the last transfer only. The numbers below come from their build logs.

## 1. Choose the render stack first

| Choice | Pick it when | Cost |
|---|---|---|
| Isometric SVG with the kit | The reader must read parts, cutaways and lines. Zero dependencies. | A moving part that passes in front of and behind others needs its draw order solved per frame. |
| WebGL scene | Free camera, many parts, or a rigid body that falls or slides. | Pinned library versions, a content-security policy, a fallback for no WebGL, a frame-time budget. |

A rigid-body engine is an actuator for one segment. It is never the source of inventory truth. The model owns counts and mass. The engine moves bodies only where the model hands over a pose and a velocity. If the engine fails to load, show a clear message and a static view. Never show a simulation that is not running.

## 2. Write the contract before any agent starts

One file, written by the integrator, read by every slice:

- Units, handedness and axes. Name the axis that carries the product.
- Pinned versions. State "do not upgrade".
- A table of files with exactly one owner each. A slice that needs another slice's file sends a message to the owner. It never edits that file.
- Public APIs as signatures with return shapes.
- Test naming: the test name starts with the identifier of the requirement. A test with no requirement starts with `X-`.
- The language of interface text and comments, and the words the demo must never use (see section 5).

## 3. Keep the model pure

- No DOM and no `Math.random`. Use a seeded generator.
- A fixed step, with an accumulator and a clamp on the frame time. `stepTo(tick)` replays from the start.
- A conservation identity with a tolerance, checked every step.
- One snapshot type. The scene and the interface read the snapshot and nothing else.
- Commands carry an `id`, are idempotent by `id`, and return `{ ok, reason }` with a readable reason.
- Detect crossings as "ahead of the point, and within one step of travel". Then no event falls between two frames.

## 4. Falsify the written numbers before building on them

Numbers copied from a specification are hypotheses. Run a clearance sweep on them first.

1. Write a test that sweeps the whole circuit and reports the minimum clearance for each pair of parts that can meet.
2. When a number fails, keep the failing case as an `X-` test that proves the original value penetrates.
3. Change the value. Add a record to a hypothesis-change log: decision, old value, new value, reason, evidence (the test names), impacts (the functions and files that use it) and nature (a correction of the demo, or an assumption).

In the slicing build, three starting values failed: a finger profile penetrated the carrier by 16.97 mm, a transfer crest 22 mm high let the product hit the carrier lip by 6.0 mm (48 mm cleared it by 18.1 mm), and a chute plate that started right after the crest cut the swept envelope by 71.5 mm. Each became an `X-` test and a log entry. None was visible in a still render.

Keep limits that you could not remove as their own entries (`L-01`, `L-02`). A known limit written down is cheaper than one a reviewer finds.

## 5. Say what the demo is

Label the page: simulated, illustrative, hypothesis. List the assumptions in a panel the reader can open. Do not write certified, compliant, rated capacity or validated digital twin. Keep a provenance table for every asset and say which numbers come from a primary source. A dimension with no source is a hypothesis, and the page says so.

## 6. Orchestrate in slices

- Run independent slices in parallel: mechanism, product, scene, domain and physics, interface. The integrator owns the shared files, the build and the publishing.
- Correct a live agent with a message. It keeps its context. A new agent starts from nothing.
- Verify every result yourself before you merge it. A pool's output is evidence, not truth.
- When a slice asks for a profile number to change, the integrator decides, the mechanism owner logs it, and the evidence is a test.

## 7. Make each step checkable

A smaller model can follow a workflow whose every step ends with a command that proves it.

- Give a starter that already works and a script that assembles the page from it. The script asserts that each anchor exists before it replaces anything, so a wrong template fails at once.
- End each step with one command and the exit code or text that means it passed. Write the command in the contract, not in prose.
- Put the checklist in a file that a script reads. A checklist the model holds in its head is skipped.
- A failing `X-` test names the exact defect. Prefer that to a request to "review the geometry".

## 8. Prove it in a real browser

Serve the page over HTTP with the same content-security policy as the publication. Run each suite against that server and fail on any external request, any policy violation, any console error and any blank capture. Suites that found real faults:

- the policy and zero external requests over a full cycle
- captures at fixed seed and fixed cycle instants
- interaction: pause, slow mode, hidden tab, double click, single loop, restart
- the guided tour: autostart on the first visit, interruption by any gesture, resume, hand-back of control
- phone, portrait and landscape: touch-target size, and gestures that do not take over scrolling
- reduced motion: nothing runs alone, and the steps come from the same model
- keyboard: focus order, visible focus, Space and Enter, Esc, no trap
- no WebGL: a static view and the flow in text, not a white page
- physics engine unavailable: a clear message, not a fake simulation
- lost and restored WebGL context: the model survives and there is one render loop
- a ten-minute session: memory and frame time

Write one raw log per suite. Write a summary with the build identifier, the page hash, the browser version and the GPU renderer. Without real GPU rendering, say so.

## 9. Faults found on the first pass

Moving parts clipping the housing floor. Inner walls hiding the lit mechanism after it opens. One drawn item for a whole mechanism, which causes depth cycles with walls. A tour that waits for a click, so a first visit looks idle. Cut-away discs that hide the cut. A heap that sits off centre in its box. A work-in-progress reserve that was too small, so a short variant lost its tip at slow speed. A holding force that the model used but the page did not declare. Rule: derive heights from geometry constants and assert clearances at build time.

## 10. Publishing

The integrator publishes, not the slices. When a new page is added beside an existing one, check the bytes of the existing page before and after (a hash) and show that they match.

## What this does not give

It does not give a calibrated process prediction. A demo built this way is a coherent model with declared assumptions.
