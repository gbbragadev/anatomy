# Canonical assemblies 0.1.0

The opt-in entry point `fidelity/index.mjs` exports `compileAssembly`, `resolvePoses`, `evaluateGeometry` and `verifyGeometryIdentity`. The first three implement the assembly interfaces in the public plan. The fourth checks an adapter's complete canonical render-fragment description against the compiled geometry. Declaration types are in `types.d.ts`, re-exported through the package contract types.

```js
import { readFileSync } from "node:fs";
import { validateMachine, compileAssembly, resolvePoses, evaluateGeometry, verifyGeometryIdentity } from "./fidelity/index.mjs";

const raw = JSON.parse(readFileSync("tests/fidelity/fixtures/minimal-valid.json", "utf8"));
const validated = validateMachine(raw);
if (!validated.ok) throw new Error(JSON.stringify(validated.diagnostics));
const assembly = compileAssembly(validated.value, {});
if (!assembly.ok) throw new Error(JSON.stringify(assembly.diagnostics));
const poses = resolvePoses(assembly.value, { "head-shaft": 0.25 });
if (!poses.ok) throw new Error(JSON.stringify(poses.diagnostics));
const geometry = evaluateGeometry(assembly.value, poses.value);
if (geometry.verdict !== "passed") throw new Error(JSON.stringify(geometry.diagnostics));
const identity = verifyGeometryIdentity(assembly.value, geometry.fragments);
if (!identity.ok) throw new Error(JSON.stringify(identity.diagnostics));
```

This fixture is entirely E0 assumptions. Passing assembly checks establishes internal mathematical consistency of the declared geometry, not measured machine fidelity, approved tolerances, process capacity or safety.

## Frames and coordinates

Input must be the canonical `MachineSpec` returned by `validateMachine`. The validator accepts source quaternion norm error up to `1e-9`, normalizes it once to a unit quaternion, and retains the exact source pose/unit in `.original`; assembly guards still require canonical unit rotation error at most `1e-12`. Positions are metres, rotations are active right-handed Z-up xyzw quaternions and moving-joint coordinates are radians or metres. `.original`, `originalAxis` and `originalFrame` are retained provenance; the compiler never uses them as another geometry/unit conversion input. `originalFrame.unit` is consulted only to diagnose an ambiguous prismatic ratio offset, never to convert it.

`transformParents` is a deterministic parent-before-child list of `{partId,parentId,jointId}`. Parents come from physical `parts[].parentId`. `sourcePaths` retains the original manifest JSON-pointer indexes for diagnostics even when compilation sorts IDs. A child has at most one tree joint, whose parent must match that physical parent. Frames belong to physical parts. A separate `constraints` array preserves ratio and closure records without treating constraint cycles as parent cycles.

For a tree joint, pose resolution applies exactly:

`T_WC = T_WP × T_PJ × M(q) × inverse(T_CJ)`.

`parentFrame` is a local pose in the parent. `childFrame` names a frame owned by the child. Fixed joints permit only zero; revolute motion rotates positively around the normalized joint-frame axis; prismatic motion translates along it. Limits are inclusive, enforced on commanded and derived coordinates without expanding them by the numerical residual tolerance. Unknown channels, invalid numbers, zero axes, mismatched frames, default-rest inconsistencies and finite-arithmetic overflow fail with diagnostics and no executable partial result.

Unspecified independent coordinates default to zero in stable joint-ID order. Analytic ratio records define `q[b] = ratio*q[a] + offset`. A known endpoint determines the other when possible. Zero ratios constrain the target to the offset while leaving the source independent. Multiple supplied endpoints and cyclic ratios must satisfy all residuals. The numerical residual tolerance is `1e-12 * max(1, abs(expected), abs(observed))` in radians or metres. Numeric residual records for the default coordinates are in `constraintResiduals`; every resolution reports constraint residuals in diagnostics. These are implementation checks, not mechanical tolerances or a generic constraint solver.

Ratios currently require two same-kind moving joints. Mixed revolute/prismatic ratios and ratios involving fixed joints are unsupported. Nonzero prismatic offsets are supported only for metre-source manifests because the current contract does not normalize or label that field. A non-metre-source nonzero prismatic offset returns `UNSUPPORTED_RATIO_OFFSET_UNIT`; zero offsets remain valid. Revolute offsets are radians.

Closure records lack an analytic closure type or target transform. Compilation retains their graph and produces a `constraint-solver` capability with skipped coverage and a not-evaluated verdict. `resolvePoses` returns `UNSUPPORTED_CONSTRAINT_SOLVER` instead of pretending to solve it. Rest geometry is still compiled from the declared/default tree for inspection, with the solver limitation retained in `requiredCapabilities`. A geometry snapshot's verdict is scoped to evaluating its supplied world poses and interfaces, not to proving closure satisfaction.

## Geometry and identity

Primitive geometry is analytic, with boxes centred at their origin and full dimensions, cylinders centred on local Z with full length, and ordered XY prism polygons extruded symmetrically along Z with full height. Simple concave prisms retain their exact ordered polygon and announce the `concave-prism` capability; no convex hull, filler solid or decomposition is substituted. Repeated vertices, degenerate polygons, edge intersections/backtracking and unsupported floating-point topology precision fail explicitly. Orientation signs use a floating-point filter with a narrowly scoped exact binary-dyadic fallback when the sign is uncertain, including intermediate underflow, cancellation or overflow. The fallback establishes only a 2D predicate sign; it is not a geometry solver or a new decomposition representation.

Prism topology supports at most 1,024 vertices per primitive. Larger schema-valid polygons return `UNSUPPORTED_PRISM_COMPLEXITY` before the quadratic edge-pair checks. At the boundary there are at most 522,752 nonadjacent edge pairs per topology call. This is a computational support limit, not a physical-detail tolerance, tessellation target or permission to simplify geometry. Array reductions for topology and bounds are iterative and do not spread unbounded geometry arrays into function arguments.

Uniform part scale is applied once to primitive dimensions and every compound component offset. It does not scale world translations, descendants' SI rest placements, or joint coordinates. Scaling a frame/joint-bearing physical part is currently unsupported because frame scaling semantics are absent from the manifest. This restriction prevents inconsistent scaling between geometry and interfaces. Nonfinite or underflowed required dimensions fail. A positive full dimension whose centred half extent becomes zero, or a positive-volume primitive whose transformed world bounds collapse on an axis, returns `UNSUPPORTED_GEOMETRY_PRECISION`. No zero-thickness bound or implied physical approximation is accepted.

`restGeometry.fragments` contains scaled metre primitives and `localPose` relative to their physical part. Compound leaves have IDs encoded from `[partId,...componentIds]`, independent of array order and shared definitions. Render mapping is `partToFragmentIds` and `fragmentToPartId`; repeated definitions never share physical fragment IDs. Proxy fragment IDs additionally encode their audit/contact role. Every fragment carries its own `partId`, definition/instance IDs, component path, material and source IDs. Definition-derived render fragments and geometry failure diagnostics retain both the physical part and definition sources; failures keep the exact definition-field pointer and physical part ID. Compiled `materials` and `assets` preserve their sorted normalized metadata for downstream consumers; copying asset metadata does not ingest or fetch assets.

`evaluateGeometry(compiled, poses)` consumes complete world poses by physical part ID and returns frozen world fragments, analytic bounds, independent audit/contact fragments, interface checks and capabilities. Cylinder bounds use the analytic circular cross-section, not a rotated bounding-box proxy. A failed evaluation returns no partial fragments or bounds. Compiled outputs and successful resolved/snapshot poses are deeply frozen; input manifests are not mutated.

`geometryIdentity` hashes the complete render-fragment set, including physical IDs, exact scaled primitive dimensions and local placement. `verifyGeometryIdentity` recomputes it from actual candidate descriptions instead of trusting a candidate's claimed hash. It rejects missing/duplicate/extra IDs and a renderer-only change from 0.20 m to 0.22 m radius. World poses are intentionally outside this static geometry identity so animation does not change it. Adapters must preserve a canonical description even if they tessellate it, and must separately verify their lowering/tessellation errors; this helper does not inspect pixels or GPU buffers.

## Interfaces, contact and approximation

Connections must link ports of compatible kind and direction: mechanical connections use matching shaft or mount kinds; material connections use flow kinds. The from port must be output or bidirectional, and the to port input or bidirectional. Named frame ownership and endpoint references are checked.

Alignment is checked at compiled rest and again for each geometry snapshot. Mounts require coincident position and full orientation. Shaft/flow frames require coincident position and parallel local-Z axes; either axis direction and arbitrary twist are accepted because the manifest does not encode a handed interface orientation or port cross-section. Residuals and the purely numerical limits of `1e-12 m` and `1e-12 rad` are explicit. These checks do not establish shaft fit, a flow aperture, approved clearance or operational contact.

Assembly compositions check whether each rotated local offset can be recovered after adding the world base. Loss above the existing `1e-12 m` numerical floor and per-axis rotation roundoff returns `UNSUPPORTED_POSE_PRECISION`, not an aligned zero residual. The policy applies to tree/joint poses, interface endpoints and compound placements; failed public calls return diagnostics without executable partial geometry or poses. Ordinary rounding and representable large offsets remain supported. This guard is not arbitrary-precision geometry and does not widen mechanical or numerical acceptance limits.

`intendedContacts` lists only the exact named physical pairs from compatible aligned connections with `intendedContact:true`. It does not exempt descendants, other fragments or unrelated overlapping parts. No collision/clearance audit or dynamic contact solver is executed by this module. Later audits must use the exact pair scope and report their own coverage.

Render, audit and contact geometry remain separate. Missing proxies remain missing and report skipped/not-evaluated capabilities instead of using an invented proxy. `approximationErrorsByPartId` exposes separate render/audit/contact error bounds in metres: analytic declared render primitives have zero construction approximation; proxy bounds use the explicitly declared normalized `approximationError`, scaled once, or remain null. A positive declared bound that underflows to zero is rejected. A single declared proxy bound is retained separately for each supplied proxy and is not measured or authenticated by compilation. This zero does not imply error-free correspondence with a real machine.

## Deferred capabilities

`AssetMap` is a reserved data-only ID map. Asset primitives return `UNSUPPORTED_ASSET_GEOMETRY` until an ingestion contract is registered. No local/remote asset bytes are read or fetched, and map contents cannot override unsupported asset geometry. Native CAD/STEP conversion, generic closure solving, collision/contact solving, simulation/model execution, SVG/mesh adapters and rendering are outside this module.

Run focused checks with `node --test tests/fidelity/frames.test.mjs tests/fidelity/assembly.test.mjs`; run the complete package suite with `npm --prefix fidelity test`.
