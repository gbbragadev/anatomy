import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import test from "node:test";
import * as G from "../kit/lathe.mjs";
import { turning } from "../kit/turn-build.mjs";
import { TURN } from "../kit/turn.mjs";
import { identity } from "./turn-fidelity.mjs";
const execute = promisify(execFile);
async function run(kind, split = false, open = false, corrupt = null, { axis = "upright", longitudinal = false, angles = "0,45,90,180" } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "anatomy-fidelity-cut-"));
  try {
    const file = join(directory, "fixture.mjs");
    const module = pathToFileURL(resolve("kit/turn-build.mjs")).href;
    const frameModule = pathToFileURL(resolve("kit/lathe.mjs")).href;
    const runtime = pathToFileURL(resolve("kit/turn.mjs")).href;
    await writeFile(file, `import {turning} from ${JSON.stringify(module)};
import * as G from ${JSON.stringify(frameModule)};
export const P={origin:[0,0],scale:1,azimuth:45,elevation:30};
export const T=turning(P);
T.layer('parts');
const group=T.group('assembly',{turn:{pivot:[5,2]}});
const F=G.frameAlong(${axis === "upright" ? "[0,0,0],[0,0,1]" : axis === "view" ? "[3,-4,2],G.viewOf(P)" : "[3,-4,2],[1,2,3]"});
const base={name:'body',group,F,s0:0,s1:10};
const part=${kind === "prism" ? "T.prism({...base,polygon:[[-2,-2],[2,-2],[2,2],[-2,2]]})" : `T.round({...base,r:2,fixed:false,ends:${open ? "['open','flat']" : "['flat','flat']"}})`};
${split ? `const n=${longitudinal ? "F.u" : "G.mul3(F.a,-1)"};T.split(part,{n,d:G.dot3(n,G.add3(F.o,G.mul3(F.a,5)))});` : ""}
T.build();
${corrupt ? `const {TURN}=await import(${JSON.stringify(runtime)});
const emit=TURN.emit;
TURN.emit=(run,cam,frame)=>{
  const f=emit(run,cam,frame);
  for(const role of ${corrupt === "tone" ? "Object.keys(run.role).filter(name=>/^f\\d+$/.test(name))" : JSON.stringify(["missing-edge", "partial-edge", "edge"].includes(corrupt) ? ["edge"] : ["fill", "missing-fill"].includes(corrupt) ? ["fill"] : ["fill", "edge"])}) {
    const slot=run.role[role];
    if(slot===undefined)continue;
    ${corrupt === "tone" ? "f.q[slot]=10*TURN.q;" : ["missing-edge", "missing-fill"].includes(corrupt) ? 'f.d[slot]="";' : corrupt === "partial-edge" ? 'f.d[slot]=f.d[slot].replace(/L/, "M");' : 'f.d[slot]=f.d[slot].replace(/-?\\d+(?:\\.\\d+)?/g,n=>String(Number(n)+20));'}
  }
  return f;
};` : ""}`);
    return await execute(process.execPath, ["scripts/turn-check.mjs", file, "--fidelity", "--angles", angles], { timeout: 30000 });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
function compared(stdout, kind) {
  if (kind === "prism") assert.ok(Number(stdout.match(/over (\d+) faces/)[1]) > 0);
  else {
    assert.ok(Number(stdout.match(/rounds: (\d+) frames/)[1]) > 0);
    assert.ok(Number(stdout.match(/of (\d+) interior cells/)[1]) > 0);
  }
}
for (const kind of ["prism", "round"]) test(`actual fidelity CLI accepts split ${kind} with intentionally unstroked cuts`, async () => {
  const result = await run(kind, true);
  assert.match(result.stdout, /fidelity passed/);
  compared(result.stdout, kind);
  if (kind === "prism") assert.match(result.stdout, /control .*fails as it should/);
});
test("actual fidelity CLI honors an unsplit open round end", async () => {
  const result = await run("round", false, true);
  assert.match(result.stdout, /fidelity passed/);
  compared(result.stdout, "round");
});
for (const kind of ["prism", "round"]) test(`actual fidelity CLI preserves an unsplit closed ${kind} control`, async () => {
  const result = await run(kind);
  assert.match(result.stdout, /fidelity passed/);
  compared(result.stdout, kind);
  if (kind === "prism") assert.match(result.stdout, /control .*fails as it should/);
});
for (const kind of ["prism", "round"]) for (const split of [false, true]) for (const fault of (split ? ["edge", "geometry", "fill", "missing-fill", "missing-edge", "partial-edge"] : ["edge", "geometry", "missing-edge", ...(kind === "round" ? ["fill", "missing-fill"] : [])]))
  test(`actual fidelity CLI detects ${fault} corruption of ${split ? "split" : "unsplit"} ${kind}`, async () => {
    await assert.rejects(run(kind, split, false, fault), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /(?:prisms|rounds) FAILED/);
      assert.match(error.stdout, /fidelity failed/);
      assert.doesNotMatch(error.stderr, /TypeError|RangeError/);
      if (split && ["missing-edge", "partial-edge"].includes(fault)) {
        assert.match(error.stdout, /edge coverage missing/);
        compared(error.stdout, kind);
      }
      return true;
    });
  });
for (const kind of ["prism", "round"]) {
  for (const longitudinal of (kind === "prism" ? [false, true] : [false])) {
    test(`actual fidelity CLI accepts tilted split ${kind} with ${longitudinal ? "longitudinal" : "axial"} cuts`, async () => {
      const result = await run(kind, true, false, null, { axis: "tilted", longitudinal });
      assert.match(result.stdout, /fidelity passed/);
      compared(result.stdout, kind);
    });
    test(`actual fidelity CLI rejects a missing tilted ${kind} edge with ${longitudinal ? "longitudinal" : "axial"} cuts`, async () => {
      await assert.rejects(run(kind, true, false, "missing-edge", { axis: "tilted", longitudinal }), (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /(?:prisms|rounds) FAILED/);
        assert.match(error.stdout, /edge coverage missing/);
        compared(error.stdout, kind);
        assert.doesNotMatch(error.stderr, /TypeError|RangeError/);
        return true;
      });
    });
  }
  test(`actual fidelity CLI accepts a fully unstroked cut-facing ${kind} contour`, async () => {
    const result = await run(kind, true, false, null, { axis: "view", angles: "0" });
    assert.match(result.stdout, /fidelity passed/);
    if (kind === "prism") compared(result.stdout, kind);
  });
  test(`actual fidelity CLI still requires the uncut near ${kind} contour when viewed along its axis`, async () => {
    await assert.rejects(run(kind, true, false, "missing-edge", { axis: "view", angles: "0" }), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /(?:prisms|rounds) FAILED/);
      assert.match(error.stdout, /edge coverage missing/);
      assert.doesNotMatch(error.stderr, /TypeError|RangeError/);
      return true;
    });
  });
}
test("actual fidelity CLI rejects axial prism tone corruption after serialization", async () => {
  await assert.rejects(run("prism", true, false, "tone", { axis: "view", angles: "0" }), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stdout, /prisms FAILED/);
    assert.match(error.stdout, /[1-9]\d* with no kit face of that tone/);
    assert.doesNotMatch(error.stderr, /TypeError|RangeError/);
    return true;
  });
});
function cutPrismFixture() {
  const P = { origin: [0, 0], scale: 1, azimuth: 45, elevation: 30 };
  const T = turning(P);
  T.layer("parts");
  const group = T.group("assembly", { turn: { pivot: [5, 2] } });
  const F = G.frameAlong([0, 0, 0], [1, 0, 0]);
  const part = T.prism({ name: "body", group, F, s0: 0, s1: 10, polygon: [[-2, -2], [0, -2], [2, -2], [2, 2], [-2, 2]] });
  T.split(part, { n: [1, 0, 0], d: 5 });
  T.build();
  return { T, P };
}
test("cut prism rejects a serialized interior vertex change even when its fill hull is unchanged", () => {
  const { T, P } = cutPrismFixture();
  assert.equal(identity(T, P, [0, 90]).pass, true);
  const spec = T.data.parts[0].spec;
  const outline = () => G.prismOf(spec.F, Array.from({ length: spec.ring.length / 2 }, (_, i) => spec.ring.slice(2 * i, 2 * i + 2)), spec.s0, spec.s1, P).fill;
  const originalHull = outline();
  spec.ring[2] = 1;
  assert.equal(outline(), originalHull);
  const result = identity(T, P, [0, 90]);
  assert.equal(result.pass, false);
  assert.match(result.text, /serialized geometry mismatch/);
});
test("cut prism reports outline and edge coverage at their own angles", (t) => {
  const { T, P } = cutPrismFixture();
  const emit = TURN.emit;
  t.mock.method(TURN, "emit", (run, cam, frame) => {
    const result = emit(run, cam, frame);
    if (cam.turn === 0) {
      for (const role of ["fill", "edge"]) result.d[run.role[role]] = result.d[run.role[role]].replace(/-?\d+(?:\.\d+)?/g, (n) => String(Number(n) + 20));
    } else result.d[run.role.edge] = "";
    return result;
  });
  const result = identity(T, P, [0, 45]);
  assert.equal(result.pass, false);
  assert.ok(result.worst.some((line) => /outline [\d.]+ at 0°.*edge coverage missing at 45°/.test(line)));
});
