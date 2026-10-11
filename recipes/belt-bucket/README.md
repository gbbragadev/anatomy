# Generic belt-and-bucket recipe

This is an executable E0 kinematic/mass demonstration, not a reconstruction of an identified manufacturer/model. Its public recipe name is `belt-bucket/kinematic-mass-v1`, version `0.1.0`. Every dimension and process choice is assumed. It cannot establish calibrated throughput, discharge, capacity, safety, wear or operational predictions.

## Canonical mechanism

The machine uses right-handed Z-up metres and active xyzw rotations. The loop lies in local XZ, with bottom center `[0,0,0]`, top center `[0,0,C]`, ascending right straight, top semicircle, descending left straight and bottom semicircle. Its length is `2C+2πr`, parameterized by accumulated neutral-axis travel. Tangents are analytic and continuous at all four boundaries and the seam.

The generic fixture has neutral radius `0.20 m`, length `5.00 m`, pitch `0.25 m`, 20 buckets and computed `C=(5-2*Math.PI*0.20)/2 = 1.8716814692820414 m`. Steady speed is `0.50 m/s`; the ideal no-slip drive speed is `2.50 rad/s`. Start and stop use assumed acceleration/deceleration `0.5 m/s²`. Forward speed is constrained to `[0,0.5] m/s`; reverse is unsupported. Nonintegral length/pitch or inconsistent loop geometry is rejected. Runtime hydration is computationally bounded at 1,024 physical bucket attachments; larger counts fail before allocation. This is not a machine-capacity limit.

Pulley radius, belt neutral radius and attachment offset are separate canonical parameters. Equality of pulley and neutral radii and zero attachment offset in the generic fixture are documented approximations. Drive phase increments by travel divided by pulley radius, while the path arcs use neutral radius; an outward attachment offset alters mounting placement, not belt length or drive ratio.

## Authoring and physical IDs

The local machine carrier is part `frame`. `head-shaft` connects `frame` to `head-pulley`, rotating about either local Y direction; drive coordinate sign makes the right-hand belt ascend. Other shaft channels derive through the existing analytic ratio constraints. No slip, compliance, belt stretch, collision or arbitrary loop solver is added.

Each bucket has a stable physical ID `bucket001` through `bucket020` in the generic fixture and its own frame `<bucketId>-attachment`. The bucket's phase is `(index-1)*pitch`, independent of input array order or render fragmentation. Every bucket is an unjointed direct child of the carrier; the recipe owns that path coordinate. Its world attachment is the path pose plus outward offset, composed with the inverse declared bucket attachment frame. Other physical descendants follow the canonical parent/joint equation exactly once. Bucket primitive/open-mouth construction remains the canonical scene/adapter author's responsibility; this task does not invent a filled cavity or change render geometry.

Subassemblies can contain drive/frame, independent shaft transmission and repeated bucket parts/descendants. Keep geometry/material/source records in the normalized machine contract. Geometry, frames and parameters must describe the same declared construction and remain subject to separate assembly/audit checks. A canonical marker is not permission to skip build validation/compilation.

## Prescribed process and compartments

The closed ledger covers feed, every physical bucket, discharge, output, return and losses. The fixture declares `20 kg` capacities for feed/output/return/losses, `2 kg` for discharge, and the explicit canonical bucketCapacity for each bucket (`1 kg` in the generic fixture). These are demonstration backpressure limits, not approved machine ratings. Missing recipe bucket inventory starts explicitly empty; the five non-bucket compartments must be initialized.

Feed acts at the declared `kg/s` rate while an attachment is in the half-open zone `[0,pitch/2)` on the loop, including a stationary bucket in that zone. When no bucket is in the zone, feed remains in its compartment. Empty stock or full buckets stop transfer. Zone boundaries are located analytically within each step, including during acceleration/deceleration, and transfer amounts use actual within-zone duration. The fixture's full bucket/receiver prevents overfill.

At the prescribed top checkpoint `C+πr/2`, an ideal instantaneous event transfers available bucket mass to the discharge compartment, limited by receiver free capacity. A full receiver leaves material in that same bucket for later circulation. This is a prescribed synthetic dumping rule, not a gravity/material discharge law. Output, return and losses are explicit conserved compartments reserved for later recipe policies; this version does not automatically drain a receiver or invent losses. A `0.20 kg` ledger stimulus used by tests is independent of the user-facing discharge policy.

Every applied transfer is an indivisible debit/credit with one unique event ID. Lost debit/credit, duplicate atomic IDs and duplicate credit hidden by a compensating unrelated error fail independently of a globally balanced total. Event references and all readouts derive from the same physical state.

## Reproduction and presentation boundary

Build: validate the complete raw machine contract and compile its canonical assembly, then pass canonical data and initial state to `createModel`. Browser runtime imports `../../fidelity/model/index.mjs`, not the top-level Node build entry. Tests contain the complete executable generic assembly fixture in `tests/fidelity/model-fixtures.mjs`; no faithful HTML build is available until the scene/adapter tasks are completed.

Run `node --test tests/fidelity/{belt-path,model,ledger,replay}.test.mjs`. Normal fixed dt is `1/120 s`; compare `1/240 s`. Use replay/snapshots for exact-state capture; a future renderer must also await its render-readiness barrier. Direct time assignment, renderer-local clocks or visual particle counts cannot reconstruct inventory/event history.

Camera, theme, quality, selection, housing visibility, cut/explode and presentation speed belong to the renderer/inspection/clock layers. Future labels/static facts must consume canonical parameters and snapshot unit-bearing readouts. Theme changes cannot remount/reset the loaded model; mounting/disposal must preserve each scene's independent state. No housing-removal maintenance sequence or renderer/material behavior is implemented by this recipe. [Complete-coverage requirements](../../docs/specs/complete-coverage.md) retain those later obligations and their explicit deferrals.
