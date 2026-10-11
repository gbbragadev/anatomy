export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Quaternion = [number, number, number, number];
export type Aspect = "construction" | "kinematic" | "process" | "appearance";
export type Coverage = "executed" | "skipped" | "partial";
export type Verdict = "passed" | "failed" | "not-evaluated";
export type FidelityLevel = "F0" | "F1" | "F2" | "F3";
export type Dimension = "length" | "angle" | "mass" | "time" | "speed" | "acceleration" | "angular-speed" | "mass-flow" | "density" | "volume" | "dimensionless";
export type LengthUnit = "m" | "mm" | "cm" | "km";
export type SIUnit = "m" | "rad" | "kg" | "s" | "m/s" | "m/s2" | "rad/s" | "kg/s" | "kg/m3" | "m3" | "1";
export type Unit = "m" | "mm" | "cm" | "km" | "rad" | "deg" | "kg" | "g" | "s" | "ms" | "m/s" | "mm/s" | "m/s2" | "mm/s2" | "rad/s" | "deg/s" | "kg/s" | "g/s" | "kg/m3" | "m3" | "L" | "1";
export interface Diagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  path: string;
  partId?: string;
  claimId?: string;
  tick?: number;
  sourceIds: string[];
  message: string;
}
export type Result<T> = { ok: true; value: T; diagnostics: Diagnostic[] } | { ok: false; diagnostics: Diagnostic[] };
export interface AcceptanceFields {
  uncertainty: number | null;
  manufacturingTolerance: number | null;
  proposedTolerance: number | null;
  numericAcceptance: number | null;
}
export interface Quantity extends AcceptanceFields {
  value: number | null;
  unit: Unit;
  sourceIds: string[];
}
export interface SIQuantity extends Quantity {
  unit: SIUnit;
  dimension: Dimension;
  original: Quantity;
}
export interface FrameConvention {
  handedness: "right";
  up: "Z" | "Y";
  unit: LengthUnit;
}
export interface Pose {
  position: Vec3;
  rotation_xyzw: Quaternion;
  original?: { position: Vec3; rotation_xyzw: Quaternion; unit: LengthUnit };
}
export interface Source {
  id: string;
  kind: "assumption" | "measurement" | "drawing" | "manual" | "cad" | "photograph" | "video";
  locator: string;
  revision: string;
  hash: string | null;
  confidence: "unverified" | "verified";
  uncertainty: number | null;
}
export interface SourceRef {
  sourceId: string;
  locator: string;
  revision: string;
}
export interface Claim extends AcceptanceFields {
  unit: Unit | null;
  originalAcceptance?: AcceptanceFields & { unit: Unit };
  id: string;
  subjectIds: string[];
  aspect: Aspect;
  kind: "illustrative" | "dimensional" | "kinematic" | "capacity" | "safety" | "wear" | "operational" | "appearance";
  statement: string;
  sourceRefs: SourceRef[];
  extractionMethod: string;
  conditions: string[];
  requestedLevel: FidelityLevel;
  status: "proposed" | "verified" | "unresolved" | "contradicted";
  checkIds: string[];
  dependsOnClaimIds: string[];
  review?: { reviewerId: string; role: "human"; locator: string } | null;
}
export interface TextLocation {
  kind: "caption" | "tooltip" | "static-alternative" | "report" | "readout" | "label";
  locator: string;
}
export interface VisibleText {
  id: string;
  location: TextLocation;
  text: string;
  claimIds: string[];
  sourceRefs: SourceRef[];
  mode: "assertion" | "illustrative";
}
export type RawGeometry =
  | { kind: "box"; dimensions: Vec3; unit: LengthUnit }
  | { kind: "cylinder"; radius: number; length: number; unit: LengthUnit }
  | { kind: "prism"; vertices: Vec2[]; height: number; unit: LengthUnit }
  | { kind: "compound"; components: { id: string; pose: Pose; geometry: RawGeometry }[] }
  | { kind: "asset"; assetId: string };
export type Geometry =
  | { kind: "box"; dimensions: Vec3; unit: "m"; original: RawGeometry }
  | { kind: "cylinder"; radius: number; length: number; unit: "m"; original: RawGeometry }
  | { kind: "prism"; vertices: Vec2[]; height: number; unit: "m"; original: RawGeometry }
  | { kind: "compound"; components: { id: string; pose: Pose; geometry: Geometry }[]; original: RawGeometry }
  | { kind: "asset"; assetId: string; original: RawGeometry };
export interface Definition<G = Geometry> {
  id: string;
  geometry: G;
  materialId: string;
  sourceIds: string[];
}
export interface Instance {
  id: string;
  definitionId: string;
  partId: string;
}
export interface Part<G = Geometry, Q = SIQuantity> {
  id: string;
  definitionId: string | null;
  instanceId: string | null;
  parentId: string | null;
  localRest: Pose;
  scale: Vec3;
  geometry: G | null;
  materialId: string;
  sourceIds: string[];
  mass: Q | null;
  auditGeometry: G | null;
  contactGeometry: G | null;
  approximationError: Q | null;
}
export interface LocalFrame {
  id: string;
  partId: string;
  pose: Pose;
  sourceIds: string[];
}
export interface Joint {
  id: string;
  kind: "fixed" | "revolute" | "prismatic";
  parent: string;
  child: string;
  parentFrame: Pose;
  childFrame: string;
  axisIn: "joint";
  axis: Vec3 | null;
  originalAxis?: Vec3;
  limits: { min: number; max: number } | null;
  sourceIds: string[];
}
export type Constraint =
  | { id: string; kind: "ratio"; jointIds: [string, string]; ratio: number; offset: number; sourceIds: string[] }
  | { id: string; kind: "closure"; partIds: string[]; jointIds: string[]; tolerance: number; sourceIds: string[] };
export interface Port {
  id: string;
  partId: string;
  frameId: string;
  kind: "shaft" | "mount" | "flow";
  direction: "input" | "output" | "bidirectional";
  sourceIds: string[];
}
export interface Connection {
  id: string;
  fromPortId: string;
  toPortId: string;
  kind: "mechanical" | "material";
  intendedContact: boolean;
  sourceIds: string[];
}
export interface Material<Q = SIQuantity> {
  id: string;
  preset: "paint" | "steel" | "rubber" | "neutral";
  surfaceEvidenceIds: string[];
  physicalProperties: { density: Q | null; sourceIds: string[] } | null;
}
export interface Asset {
  id: string;
  uri: string;
  hash: string;
  format: "glb" | "gltf";
  sourceIds: string[];
  sourceFrame: FrameConvention;
  license: string | null;
  author: string | null;
  attribution: string | null;
  redistribution: boolean | null;
  usableForRedistribution?: boolean;
}
export interface BeltBucketParameters<Q = SIQuantity> {
  headRadius: Q;
  beltNeutralRadius: Q;
  attachmentOffset: Q;
  bucketPitch: Q;
  beltLength: Q;
  centerDistance: Q;
  bucketCount: Q;
  speed: Q;
  acceleration: Q;
  deceleration: Q;
  bucketCapacity: Q;
  feedRate: Q;
  allowReverse: boolean;
}
export interface ModelState {
  tick: number;
  time_s: number;
  beltTravel_m: number;
  speed_mps: number;
  drivePhase_rad: number;
  inventory_kg: Record<string, number>;
  appliedCommandIds: string[];
}
export interface Criterion {
  id: string;
  aspect: Aspect;
  kind: "geometry" | "kinematic" | "mass" | "appearance" | "interaction" | "evidence";
  partIds: string[];
  claimIds: string[];
  sourceIds: string[];
  expected: number | null;
  unit: Unit;
  tolerance: { manufacturing: number | null; project: number | null; numeric: number | null };
  critical: boolean;
  original?: { expected: number | null; unit: Unit; tolerance: { manufacturing: number | null; project: number | null; numeric: number | null } };
}
export interface Dependency {
  id: string;
  sourceIds: string[];
  claimIds: string[];
  partIds: string[];
  checkIds: string[];
}
export interface Command {
  id: string;
  type: "start" | "stop" | "set-speed" | "set-feed";
  tick: number;
  value?: number;
  unit?: Unit;
  original?: { value: number; unit: Unit };
}
export interface MachineContract<G, Q> {
  schemaVersion: "0.1.0";
  machineId: string;
  frame: FrameConvention;
  metersPerLegacyUnit: number;
  sources: Source[];
  claims: Claim[];
  visibleText: VisibleText[];
  definitions: Definition<G>[];
  instances: Instance[];
  parts: Part<G, Q>[];
  frames: LocalFrame[];
  joints: Joint[];
  constraints: Constraint[];
  ports: Port[];
  connections: Connection[];
  materials: Material<Q>[];
  assets: Asset[];
  model: { domain: "belt-bucket"; recipe: "belt-bucket/kinematic-mass-v1"; version: "0.1.0"; assumptions: string[] };
  parameters: { beltBucket: BeltBucketParameters<Q> };
  initialState: ModelState;
  criteria: Criterion[];
  dependencies: Dependency[];
  commands: Command[];
}
export type RawMachineSpec = MachineContract<RawGeometry, Quantity>;
export interface MachineSpec extends MachineContract<Geometry, SIQuantity> {
  frame: { handedness: "right"; up: "Z"; unit: "m" };
  originalFrame: FrameConvention;
  canonicalHash: string;
}
export interface CheckResult {
  id: string;
  coverage: Coverage;
  verdict: Verdict;
  aspect: Aspect;
  claimIds: string[];
  sourceIds: string[];
  expected?: unknown;
  observed?: unknown;
  unit?: Unit;
  tolerance?: number | null;
  partIds?: string[];
  tickRange?: [number, number];
  evidencePath?: string;
  scope?: string;
  diagnostics?: Diagnostic[];
}
export interface ClaimVerdict {
  claimId: string;
  aspect: Aspect;
  verdict: Verdict;
  level: FidelityLevel;
  diagnostics: Diagnostic[];
}
export interface VisibleTextVerdict {
  textId: string;
  location: TextLocation;
  claimIds: string[];
  sourceRefs: SourceRef[];
  verdict: "passed" | "failed";
  diagnostics: Diagnostic[];
}
export declare function validateMachine(raw: unknown): Result<MachineSpec>;
export declare function normalizeQuantity(quantity: Quantity, dimension: string): Result<SIQuantity>;
export declare function canonicalHash(value: unknown): string;
export declare function evaluateClaims(spec: RawMachineSpec | MachineSpec, results?: CheckResult[]): ClaimVerdict[];
export declare function invalidateClaims(spec: RawMachineSpec | MachineSpec, changedSourceIds: string[]): { claimIds: string[]; partIds: string[]; checkIds: string[] };
export declare function auditVisibleText(spec: RawMachineSpec | MachineSpec, results?: CheckResult[]): VisibleTextVerdict[];
import type { AssetMap, CompiledAssembly, GeometrySnapshot, RestGeometryFragment } from "../assembly/types.d.ts";
export type { AssetMap, CanonicalPrimitive, Bounds, RestGeometryFragment, GeometryFragment, CapabilityOutcome, ConstraintResidual, InterfaceAlignment, IntendedContact, CompiledAssembly, GeometrySnapshot } from "../assembly/types.d.ts";
export declare function compileAssembly(spec: MachineSpec, assets?: AssetMap): Result<CompiledAssembly>;
export declare function resolvePoses(compiled: CompiledAssembly, q?: Record<string, number>): Result<Record<string, Pose>>;
export declare function evaluateGeometry(compiled: CompiledAssembly, poses: Record<string, Pose>): GeometrySnapshot;
export declare function verifyGeometryIdentity(compiled: CompiledAssembly, fragments: RestGeometryFragment[]): Result<{ coverage: "executed"; verdict: "passed"; geometryIdentity: string }>;
