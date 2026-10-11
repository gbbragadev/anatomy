import type { MachineSpec, Pose, Vec3, Part, LocalFrame, Joint, Constraint, Port, Connection, Material, Asset, Result, Diagnostic, Coverage, Verdict } from "../contracts/types.d.ts";

export type AssetMap = Record<string, unknown>;
export type CanonicalPrimitive =
  | { kind: "box"; dimensions: Vec3; unit: "m" }
  | { kind: "cylinder"; radius: number; length: number; unit: "m" }
  | { kind: "prism"; vertices: [number, number][]; height: number; unit: "m" };
export interface Bounds {
  min: Vec3;
  max: Vec3;
}
export interface RestGeometryFragment {
  id: string;
  partId: string;
  definitionId: string | null;
  instanceId: string | null;
  componentIds: string[];
  role: "render" | "audit" | "contact";
  materialId: string;
  sourceIds: string[];
  localPose: Pose;
  geometry: CanonicalPrimitive;
}
export interface GeometryFragment extends RestGeometryFragment {
  pose: Pose;
  bounds: Bounds;
}
export interface CapabilityOutcome {
  capability: "canonical-geometry" | "audit-geometry" | "contact-geometry" | "concave-prism" | "constraint-solver" | "analytic-ratio";
  partIds: string[];
  coverage: Coverage;
  verdict: Verdict;
  code: string | null;
}
export interface ConstraintResidual {
  constraintId: string;
  residual: number | null;
  tolerance: number | null;
  unit: "m" | "rad";
  coverage: Coverage;
  verdict: Verdict;
}
export interface InterfaceAlignment {
  connectionId: string;
  fromPortId: string;
  toPortId: string;
  partIds: [string, string];
  kind: "mechanical" | "material";
  intendedContact: boolean;
  residual: { position_m: number; angle_rad: number };
  tolerance: { position_m: number; angle_rad: number };
  coverage: Coverage;
  verdict: Verdict;
  sourceIds: string[];
}
export interface IntendedContact {
  connectionId: string;
  partIds: [string, string];
  sourceIds: string[];
}
export interface CompiledAssembly {
  schemaVersion: "0.1.0";
  machineId: string;
  canonicalHash: string;
  frame: { handedness: "right"; up: "Z"; unit: "m" };
  metersPerLegacyUnit: number;
  parts: Part[];
  materials: Material[];
  assets: Asset[];
  frames: LocalFrame[];
  joints: Joint[];
  constraints: Constraint[];
  ports: Port[];
  connections: Connection[];
  sourcePaths: Record<"parts" | "definitions" | "instances" | "frames" | "joints" | "constraints" | "ports" | "connections", Record<string, string>>;
  transformParents: { partId: string; parentId: string | null; jointId: string | null }[];
  restGeometry: { fragments: RestGeometryFragment[]; auditFragments: RestGeometryFragment[]; contactFragments: RestGeometryFragment[] };
  restPosesByPartId: Record<string, Pose>;
  partToFragmentIds: Record<string, string[]>;
  fragmentToPartId: Record<string, string>;
  bounds: Bounds;
  boundsByPartId: Record<string, Bounds>;
  approximationErrorsByPartId: Record<string, { render_m: number; audit_m: number | null; contact_m: number | null }>;
  interfaces: InterfaceAlignment[];
  intendedContacts: IntendedContact[];
  requiredCapabilities: CapabilityOutcome[];
  constraintResiduals: ConstraintResidual[];
  geometryIdentity: string;
}
export interface GeometrySnapshot {
  coverage: Coverage;
  verdict: Verdict;
  unit: "m";
  fragments: GeometryFragment[];
  auditFragments: GeometryFragment[];
  contactFragments: GeometryFragment[];
  bounds: Bounds | null;
  boundsByPartId: Record<string, Bounds>;
  interfaces: InterfaceAlignment[];
  intendedContacts: IntendedContact[];
  requiredCapabilities: CapabilityOutcome[];
  diagnostics: Diagnostic[];
}
export declare function compileAssembly(spec: MachineSpec, assets?: AssetMap): Result<CompiledAssembly>;
export declare function resolvePoses(compiled: CompiledAssembly, q?: Record<string, number>): Result<Record<string, Pose>>;
export declare function evaluateGeometry(compiled: CompiledAssembly, poses: Record<string, Pose>): GeometrySnapshot;
export declare function verifyGeometryIdentity(compiled: CompiledAssembly, fragments: RestGeometryFragment[]): Result<{ coverage: "executed"; verdict: "passed"; geometryIdentity: string }>;
